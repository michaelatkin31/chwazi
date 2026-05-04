// Service worker: network-first for HTML/JS/manifest (always tries fresh
// content, falls back to cache offline), cache-first for icons.
const VERSION = 'v1';
const RUNTIME = `runtime-${VERSION}`;
const STATIC = `static-${VERSION}`;
const STATIC_ASSETS = ['./icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== RUNTIME && k !== STATIC).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (/\.(png|ico|svg|jpg|jpeg|webp)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(STATIC);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
