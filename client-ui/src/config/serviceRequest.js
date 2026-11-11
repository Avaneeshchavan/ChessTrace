const services = new Map();
const RECHECK_AFTER_MS = 14 * 60 * 1000;
const WAKE_TIMEOUT_MS = 70_000;
const unavailable = new Set([502, 503, 504]);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function serviceHealth(url) {
  if (!services.has(url)) {
    let status = 'checking';
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
      if (pending) return pending;
      if (!force && status === 'awake' && Date.now() - lastContact < RECHECK_AFTER_MS) {
        return Promise.resolve();
      }
      update(status === 'checking' ? 'checking' : 'waking');
      pending = (async () => {
        const deadline = Date.now() + WAKE_TIMEOUT_MS;
        while (Date.now() < deadline) {
          try {
            const response = await fetch(`${url}/health`, {
              cache: 'no-store',
              signal: AbortSignal.timeout(Math.min(8000, Math.max(1, deadline - Date.now()))),
            });
            if (response.ok && (await response.json()).status === 'ok') {
              contact();
              return;
            }
          } catch {
            // A sleeping host can time out or return a proxy page.
          }
          update('waking');
          await sleep(3000);
        }
        update('error');
        throw new Error('The server is still unavailable. Use Retry to check again.');
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

export async function fetchService(url, path, options) {
  const health = serviceHealth(url);
  await health.check();
  const send = async () => {
    options?.signal?.throwIfAborted();
    const response = await fetch(url + path, options);
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
    throw new Error('The server interrupted this request. Check the result before trying again.');
  }
}
