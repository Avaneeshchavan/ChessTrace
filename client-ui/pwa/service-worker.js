/* global config, clients */
const cachePrefix = 'chesstrace-app-';
const cacheName = cachePrefix + config.version;
const enginePrefix = 'chesstrace-engine-';
const engineCache = enginePrefix + config.engineVersion;
const shellPaths = new Set(config.shell);
const enginePaths = new Set(config.engine);
const appRoutes = new Set([
  '/', '/auth', '/dashboard', '/lens', '/sandbox', '/turning-points', '/vault', '/vault/review', '/settings', '/offline',
]);
const pendingShares = new Map();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(config.shell.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep one older shell for tabs still running its lazy route bundles.
    const keys = await caches.keys();
    const old = keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName);
    const obsoleteEngines = keys.filter(key => key.startsWith(enginePrefix) && key !== engineCache);
    await Promise.all([...old.slice(0, -1), ...obsoleteEngines].map(key => caches.delete(key)));
    await clients.claim();
  })());
});

async function loadAsset(request, isEngine) {
  const cache = await caches.open(isEngine ? engineCache : cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const type = response.headers.get('Content-Type') || '';
  if (isEngine && response.status === 200 && !response.redirected &&
    (request.url.endsWith('.wasm') ? type.includes('application/wasm') : type.includes('javascript'))) {
    try {
      await cache.put(request, response.clone());
    } catch {
      // Analysis can still run online if storage is full.
    }
  }
  return response;
}

function receiveShare(event) {
  let release;
  const finished = new Promise(resolve => { release = resolve; });
  event.waitUntil(finished);
  event.respondWith((async () => {
    const lens = new URL('/lens', self.location.origin);
    try {
      const files = (await event.request.formData()).getAll('image');
      const file = files[0];
      if (files.length !== 1 || !(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Invalid image');
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pendingShares.delete(id);
        release();
      }, 90_000);
      pendingShares.set(id, { file, timer, release });
      lens.searchParams.set('share', id);
    } catch {
      lens.searchParams.set('share', 'invalid');
      release();
    }
    return Response.redirect(lens.href, 303);
  })());
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const { origin, pathname, search } = new URL(request.url);
  if (origin !== self.location.origin) return;
  if (request.method === 'POST' && pathname === '/share-image' && request.mode === 'navigate') {
    receiveShare(event);
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate' && appRoutes.has(pathname.replace(/\/$/, '') || '/')) {
    event.respondWith(caches.open(cacheName).then(async cache =>
      await cache.match('/index.html') || fetch(request)));
  } else if (!search && (shellPaths.has(pathname) || enginePaths.has(pathname))) {
    event.respondWith(loadAsset(request, enginePaths.has(pathname)));
  } else if (!search && pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data?.type === 'TAKE_SHARED_IMAGE' && event.ports[0] && event.source?.url) {
    const { pathname } = new URL(event.source.url);
    if (pathname !== '/lens' && pathname !== '/lens/') return;
    const share = pendingShares.get(event.data.id);
    if (share) {
      pendingShares.delete(event.data.id);
      clearTimeout(share.timer);
    }
    event.ports[0].postMessage(share?.file ?? null);
    share?.release();
  }
});
