const CACHE_NAME = 'neon-arcade-v2';
const BASE = self.location.pathname.replace('/service-worker.js', '');

const STATIC_ASSETS = [
  './',
  './index.html',
  './tetris.html',
  './2048.html',
  './schulte.html',
  './sudoku.html',
  './minesweeper.html',
  './snake.html',
  './style.css',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Orbitron:wght@400;700;900&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  const isGoogleFonts = event.request.url.startsWith('https://fonts.googleapis.com') ||
                        event.request.url.startsWith('https://fonts.gstatic.com');

  if (!isSameOrigin && !isGoogleFonts) return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          event.waitUntil(
            fetch(event.request)
              .then((response) => {
                if (response.ok) {
                  caches.open(CACHE_NAME)
                    .then((cache) => cache.put(event.request, response));
                }
              })
              .catch(() => {})
          );
          return cachedResponse;
        }

        return fetch(event.request)
          .then((response) => {
            if (response.ok && isSameOrigin) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '来一局游戏吧！',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'play', title: '开始游戏' },
      { action: 'close', title: '关闭' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('霓虹街机', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'play') {
    event.waitUntil(
      clients.openWindow('./index.html')
    );
  }
});
