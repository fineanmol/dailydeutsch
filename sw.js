const CACHE_NAME = 'daily-deutsch-v1.2.20';
const ASSETS = [
  './',
  './index.html',
  './css/style.css?v=1.2.20',
  './js/analytics.js?v=1.2.20',
  './js/motion.js?v=1.2.20',
  './js/auth.js?v=1.2.20',
  './js/db.js?v=1.2.20',
  './js/categories.js?v=1.2.20',
  './js/wordbank.js?v=1.2.20',
  './js/cefr.js?v=1.2.20',
  './js/translator.js?v=1.2.20',
  './js/exercises.js?v=1.2.20',
  './js/leaderboard.js?v=1.2.20',
  './js/insights.js?v=1.2.20',
  './js/profile.js?v=1.2.20',
  './js/language.js?v=1.2.20',
  './js/gemini.js?v=1.2.20',
  './js/ui.js?v=1.2.20',
  './js/app.js?v=1.2.20',
  './icon.png?v=1.2.20',
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
