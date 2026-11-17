const services = new Map();
const requestDrivenServices = new Set();
const deadlines = new Map();
const RECHECK_AFTER_MS = 14 * 60 * 1000;
const WAKE_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 65_000;
const SCANNER_WAKE_INTERVAL_MS = 10 * 60 * 1000;
const messages = {
  offline: 'You’re offline. Reconnect and try again.',
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the service. Try again.',
  invalid: 'The service rejected this request.',
  busy: 'The service is busy. Try again shortly.',
  server: 'The service returned an error. Try again.',
};

export class ServiceRequestError extends Error {
  constructor(kind, { status, retryAfter, detail } = {}) {
    super(kind === 'busy' && retryAfter != null
      ? `The service is busy. Try again in ${retryAfter} seconds.`
      : detail || messages[kind]);
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class ServiceUnavailableError extends ServiceRequestError {
  constructor() { super(online() ? 'unreachable' : 'offline'); }
}

export class ServiceRequestInterruptedError extends ServiceRequestError {}

const online = () => globalThis.navigator?.onLine !== false;

function delay(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export function configureRequestDrivenService(url) {
  requestDrivenServices.add(url);
}

export function configureServiceDeadline(url, milliseconds) {
  if (Number.isSafeInteger(milliseconds) && milliseconds > 0 && milliseconds <= 120_000) {
    deadlines.set(url, milliseconds);
  }
}

function withSignal(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const finish = callback => value => {
      signal.removeEventListener('abort', cancel);
      callback(value);
    };
    promise.then(finish(resolve), finish(reject));
  });
}

export function wakeScanner(url) {
  if (!online()) return;
  const key = `chesstrace-scan-wake:${url}`;
  try {
    const now = Date.now();
    const previous = sessionStorage.getItem(key);
    if (previous !== null && now - Number(previous) < SCANNER_WAKE_INTERVAL_MS) return;
    sessionStorage.setItem(key, String(now));
  } catch {
    // The scan request itself can wake the service if storage is unavailable.
    return;
  }
  fetch(url + '/health', { cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).catch(() => {});
}

export function serviceHealth(url) {
  if (!services.has(url)) {
    let status = requestDrivenServices.has(url) ? 'awake' : 'checking';
    let lastContact = 0;
    let failureVersion = 0;
    let pending;
    const listeners = new Set();
    const update = next => {
      if (next === status) return;
      status = next;
      listeners.forEach(listener => listener());
    };
    const contact = (version = failureVersion) => {
      if (version !== failureVersion) return;
      lastContact = Date.now();
      update('awake');
    };
    const fail = () => {
      failureVersion++;
      lastContact = 0;
      update('error');
    };

    function check(force = false, observeOnly = false) {
      if (requestDrivenServices.has(url) && !force) return Promise.resolve();
      if (pending) return pending;
      if (!force && status === 'awake' && Date.now() - lastContact < RECHECK_AFTER_MS) return Promise.resolve();
      const version = failureVersion;
      if (status !== 'error') update('checking');
      pending = (async () => {
        const deadline = Date.now() + WAKE_TIMEOUT_MS;
        do {
          if (!online()) break;
          try {
            const response = await fetch(url + '/health', {
              cache: 'no-store',
              signal: AbortSignal.timeout(Math.min(PROBE_TIMEOUT_MS, Math.max(1, deadline - Date.now()))),
            });
            if (response.ok && (await response.json()).status === 'ok') {
              if (!observeOnly) contact(version);
              return;
            }
          } catch {
            // A failed probe is evidence only that the service did not respond.
          }
          if (!force && Date.now() < deadline) await delay(Math.min(2500, deadline - Date.now()));
        } while (!force && Date.now() < deadline);
        if (version === failureVersion) fail();
        throw new ServiceUnavailableError();
      })().finally(() => { pending = undefined; });
      return pending;
    }

    services.set(url, {
      check, contact, fail, version: () => failureVersion, snapshot: () => status,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
  }
  return services.get(url);
}

function retryAfterSeconds(header) {
  if (header == null) return undefined;
  if (/^\d+$/.test(header)) return Number(header);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function send(url, path, options, signal, accepted) {
  if (!online()) throw new ServiceRequestError('offline');
  const response = await fetch(url + path, { ...options, signal });
  if (response.status === 429) {
    throw new ServiceRequestError('busy', { status: 429, retryAfter: retryAfterSeconds(response.headers.get('retry-after')) });
  }
  if (response.status >= 500 || response.headers.get('content-type')?.includes('text/html')) {
    throw new ServiceRequestError('server', { status: response.status });
  }
  if (!response.ok && !accepted.includes(response.status)) {
    const body = await response.json().catch(() => ({}));
    const detail = body?.error ?? body?.detail;
    throw new ServiceRequestError('invalid', { status: response.status, detail: typeof detail === 'string' ? detail : undefined });
  }
  // Buffer the small API read before the deadline expires. Consumers keep using .json().
  if (response.body) {
    const bytes = await response.arrayBuffer();
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  return response;
}

export async function fetchService(url, path, options, {
  timeoutMs = deadlines.get(url) ?? 15_000, skipHealth = false, accepted = [],
} = {}) {
  const health = serviceHealth(url);
  options?.signal?.throwIfAborted();
  if (!online()) {
    if (!skipHealth) health.fail();
    throw new ServiceRequestError('offline');
  }
  const deadline = Date.now() + timeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const canRetry = ['GET', 'HEAD'].includes(options?.method?.toUpperCase() ?? 'GET');
  for (let attempt = 0; ; attempt++) {
    try {
      signal.throwIfAborted();
      if (!attempt && !skipHealth && !requestDrivenServices.has(url)) {
        await withSignal(health.check(), signal);
      }
      const version = health.version();
      const response = await send(url, path, options, signal, accepted);
      if (!skipHealth) health.contact(version);
      return response;
    } catch (error) {
      if (options?.signal?.aborted) throw options.signal.reason;
      const failure = timeout.aborted ? new ServiceRequestError('timeout')
        : error instanceof ServiceRequestError ? error : new ServiceRequestError(online() ? 'unreachable' : 'offline');
      if (!skipHealth && ['offline', 'timeout', 'unreachable', 'server'].includes(failure.kind)) health.fail();
      const backoff = 250 * 2 ** attempt + Math.random() * 100;
      const wait = Math.max(backoff, (failure.retryAfter ?? 0) * 1000);
      if (canRetry && attempt < 2 && ['unreachable', 'server', 'busy'].includes(failure.kind) && Date.now() + wait < deadline) {
        try { await delay(wait, signal); }
        catch {
          if (options?.signal?.aborted) throw options.signal.reason;
          throw new ServiceRequestError('timeout');
        }
        continue;
      }
      if (!canRetry && ['timeout', 'unreachable', 'server'].includes(failure.kind)) {
        if (!skipHealth && !requestDrivenServices.has(url)) health.check(true, true).catch(() => {});
        throw new ServiceRequestInterruptedError(failure.kind, { status: failure.status });
      }
      throw failure;
    }
  }
}
