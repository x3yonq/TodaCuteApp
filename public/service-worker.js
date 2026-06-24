const CACHE_NAME = 'dog-hotel-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// On install, cache the core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// On activation, clean up old caches if the version changes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests to provide offline capability
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // We only handle standard HTTP/HTTPS requests (avoid chrome-extension:// or other schemas)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Use a Stale-While-Revalidate caching strategy for app assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Fetch from network to update the cache
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Check if response is valid before caching
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.log('[Service Worker] Fetch failed, client might be offline:', err);
          // Return cached response if offline (handled below)
        });

        // Return cached response immediately if we have it, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
