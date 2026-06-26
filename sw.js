const CACHE_NAME = 'daily-deutsch-v1.2.39';
const ASSETS = [
  './',
  './index.html',
  './css/style.css?v=1.2.39',
  './js/analytics.js?v=1.2.39',
  './js/motion.js?v=1.2.39',
  './js/auth.js?v=1.2.39',
  './js/db.js?v=1.2.39',
  './js/categories.js?v=1.2.39',
  './js/wordbank.js?v=1.2.39',
  './js/cefr.js?v=1.2.39',
  './js/translator.js?v=1.2.39',
  './js/exercises.js?v=1.2.39',
  './js/leaderboard.js?v=1.2.39',
  './js/insights.js?v=1.2.39',
  './js/profile.js?v=1.2.39',
  './js/language.js?v=1.2.39',
  './js/gemini.js?v=1.2.39',
  './js/ui.js?v=1.2.39',
  './js/core/store.js?v=1.2.39',
  './js/core/tpl.js?v=1.2.39',
  './js/core/router.js?v=1.2.39',
  './js/features/exercises.js?v=1.2.39',
  './js/features/ai.js?v=1.2.39',
  './js/features/translate.js?v=1.2.39',
  './js/features/settings.js?v=1.2.39',
  './js/features/auth-ui.js?v=1.2.39',
  './js/app.js?v=1.2.39',
  './icon.png?v=1.2.39',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
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
  const url = e.request.url;

  // Never intercept external endpoints (live data / Firebase / Google SDKs).
  if (
    url.includes('firebase') ||
    url.includes('firestore') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('mymemory.translated.net')
  ) {
    return;
  }

  // Network-first for navigations (the HTML shell) so a freshly deployed
  // version is picked up immediately instead of being pinned to a stale
  // cached page. Falls back to the cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for everything else (assets are versioned via ?v= query).
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(e.request).then(response => {
        if (
          response &&
          response.status === 200 &&
          e.request.method === 'GET' &&
          url.startsWith(self.location.origin)
        ) {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, cacheCopy));
        }
        return response;
      });
    }).catch(() => {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
    })
  );
});
