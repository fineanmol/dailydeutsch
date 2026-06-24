const CACHE_NAME = 'daily-deutsch-v1.0.8';
const ASSETS = [
  './',
  './index.html',
  './css/style.css?v=1.0.8',
  './js/motion.js?v=1.0.8',
  './js/auth.js?v=1.0.8',
  './js/db.js?v=1.0.8',
  './js/categories.js?v=1.0.8',
  './js/wordbank.js?v=1.0.8',
  './js/cefr.js?v=1.0.8',
  './js/translator.js?v=1.0.8',
  './js/exercises.js?v=1.0.8',
  './js/insights.js?v=1.0.8',
  './js/app.js?v=1.0.8',
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching offline assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache:', key);
          return caches.delete(key);
        }
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Do not intercept external API endpoints
  if (
    e.request.url.includes('firebase') ||
    e.request.url.includes('googleapis') ||
    e.request.url.includes('mymemory.translated.net')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then(response => {
        if (
          response &&
          response.status === 200 &&
          e.request.method === 'GET' &&
          e.request.url.startsWith(self.location.origin)
        ) {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, cacheCopy));
        }
        return response;
      });
    }).catch(() => {
      // Fallback for offline loading of main page if match fails
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
