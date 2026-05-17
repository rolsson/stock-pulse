const CACHE = 'stock-pulse-v3';

const SHELL = [
  '/',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,600&display=swap',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;

  // Never cache API calls
  if (url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (response) {
        if (!response || response.status !== 200 || e.request.method !== 'GET') return response;
        var clone = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(e.request, clone); });
        return response;
      }).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('/');
      });
    })
  );
});
