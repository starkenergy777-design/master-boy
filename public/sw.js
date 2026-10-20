// MASTER_BOY Service Worker v2.1.0
const CACHE_NAME = 'master-boy-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.jpg',
  '/icons/icon-512.jpg',
  '/icons/icon-maskable.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW pre-caching non-fatal warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Let API requests go directly to network
  if (url.includes('/api/')) {
    return;
  }

  // Network-First for navigation (HTML pages) to ensure live server wake-up
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallbackIndex = await caches.match('/');
          if (fallbackIndex) return fallbackIndex;
          throw new Error('Offline and no cached index available');
        })
    );
    return;
  }

  // Cache-First for static images, icons, and fonts
  if (url.includes('/icons/') || url.match(/\.(png|jpg|jpeg|svg|webp|woff2?)$/i)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
