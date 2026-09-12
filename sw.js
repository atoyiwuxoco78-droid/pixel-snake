/* Pixel Snake — network-first shell so updates show up */
const CACHE_NAME = 'pixel-snake-v16';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './auth.js',
  './multiplayer.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

function assetUrls() {
  const base = self.registration.scope;
  return SHELL.map((path) => new URL(path, base).href);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(assetUrls())).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always try network first for HTML/JS/CSS so GitHub Pages updates appear
  const path = url.pathname;
  const networkFirst =
    event.request.mode === 'navigate' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('/') ||
    path.endsWith('sw.js');

  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (networkFirst) {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return cached || (await caches.match(new URL('./index.html', self.registration.scope).href));
      }
    }
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached;
    }
  })());
});
