/* Keep cached game files scoped to this installation's URL path. */
const CACHE_PREFIX = `starwing-${encodeURIComponent(new URL(self.registration.scope).pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v1.2.0`;
const CORE_FILES = [
  './', './index.html', './style.css?v=1.2.0', './game.js?v=1.2.0', './space-bg.png',
  './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
        return (await caches.match('./index.html')) || response;
      } catch (_) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => (await caches.match(request)) || fetch(request))());
});
