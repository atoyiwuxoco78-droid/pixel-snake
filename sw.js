/* Pixel Snake — offline shell service worker */
const CACHE_NAME = 'pixel-snake-v9';

function assetUrls() {
  const base = self.registration.scope;
  return [
    './',
    './index.html',
    './style.css',
    './game.js',
    './auth.js',
    './multiplayer.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
  ].map((path) => new URL(path, base).href);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(assetUrls())).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);

      if (event.request.mode === 'navigate') {
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return (
            cached ||
            (await caches.match(new URL('./index.html', self.registration.scope).href))
          );
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
    })()
  );
});
