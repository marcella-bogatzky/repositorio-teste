// ATUALIZADO: Mudamos o nome do cache para v2
const CACHE_NAME = 'despensa-cache-v2';

// Lista de arquivos essenciais
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Evento 'install': Salva os arquivos no novo cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache v2 aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': Responde com o cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o item está no cache, retorna ele
        if (response) {
          return response;
        }
        // Se não, busca na rede
        return fetch(event.request);
      }
    )
  );
});

// NOVO: Evento 'activate': Limpa os caches antigos
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // Mantém apenas o cache v2
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Se o cache não for o v2, delete-o
            console.log('Limpando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});