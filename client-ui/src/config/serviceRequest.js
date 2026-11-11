const services = new Map();
const requestDrivenServices = new Set();
const RECHECK_AFTER_MS = 14 * 60 * 1000;
const WAKE_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 65_000;
const unavailable = new Set([502, 503, 504]);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class ServiceUnavailableError extends Error {
  constructor() {
    super('ChessTrace couldn’t connect to the server. Try again in a moment.');
  }
}

export class ServiceRequestInterruptedError extends Error {
  constructor() {
    super('The server interrupted this request. Check the result before trying again.');
  }
}

export function configureRequestDrivenService(url) {
  requestDrivenServices.add(url);
}

export function serviceHealth(url) {
  if (!services.has(url)) {
    let status = requestDrivenServices.has(url) ? 'awake' : 'checking';
    let lastContact = 0;
    let pending;
    const listeners = new Set();
    const update = next => {
      if (next === status) return;
      status = next;
      listeners.forEach(listener => listener());
    };
    const contact = () => {
      lastContact = Date.now();
      update('awake');
    };

    function check(force = false) {
      if (requestDrivenServices.has(url)) return Promise.resolve();
      if (pending) return pending;
      if (!force && status === 'awake' && Date.now() - lastContact < RECHECK_AFTER_MS) {
        return Promise.resolve();
      }
      update(status === 'checking' ? 'checking' : 'waking');
      pending = (async () => {
        const deadline = Date.now() + WAKE_TIMEOUT_MS;
        while (Date.now() < deadline && globalThis.navigator?.onLine !== false) {
          try {
            const response = await fetch(`${url}/health`, {
              cache: 'no-store',
              signal: AbortSignal.timeout(Math.min(PROBE_TIMEOUT_MS, Math.max(1, deadline - Date.now()))),
            });
            if (response.ok && (await response.json()).status === 'ok') {
              contact();
              return;
            }
          } catch {
            // A sleeping host can time out or return a proxy page.
          }
          update('waking');
          if (Date.now() < deadline) await sleep(Math.min(2500, deadline - Date.now()));
        }
        update('error');
        throw new ServiceUnavailableError();
      })().finally(() => { pending = undefined; });
      return pending;
    }

    services.set(url, {
      check, contact, snapshot: () => status,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
  }
  return services.get(url);
}

export async function fetchService(url, path, options, { timeoutMs } = {}) {
  const health = serviceHealth(url);
  await health.check();
  const send = async () => {
    options?.signal?.throwIfAborted();
    const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
    const signal = timeout && options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout ?? options?.signal;
    const response = await fetch(url + path, { ...options, signal });
    if (unavailable.has(response.status) || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('The server interrupted this request. Please try again.');
    }
    health.contact();
    return response;
  };

  try {
    return await send();
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    const waking = health.check(true);
    const method = options?.method?.toUpperCase() ?? 'GET';
    if (method === 'GET' || method === 'HEAD') {
      await waking;
      return send();
    }
    waking.catch(() => {});
    throw new ServiceRequestInterruptedError();
  }
}
