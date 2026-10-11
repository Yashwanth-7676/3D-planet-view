const CACHE_NAME = 'yash-cosmos-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/assets/yash-logo.svg',
  '/data/planets.json',
  '/assets/planets/mercury.jpg',
  '/assets/planets/venus.jpg',
  '/assets/planets/earth.jpg',
  '/assets/planets/mars.jpg',
  '/assets/planets/jupiter.jpg',
  '/assets/planets/saturn.jpg',
  '/assets/planets/uranus.jpg',
  '/assets/planets/neptune.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

// Network-First for HTML documents (always get fresh code), Cache-First for static assets
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // If navigating or requesting HTML, ALWAYS fetch fresh from network
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200 && (url.pathname.startsWith('/assets') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.json'))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
