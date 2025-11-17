const CACHE_NAME = 'despensa-cache-v1';
// Lista de arquivos essenciais para o app funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Evento 'install': Salva os arquivos no cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': Intercepta as requisições
self.addEventListener('fetch', event => {
  // Tenta responder primeiro com o cache.
  // Se falhar (ex: requisição de API), vai para a rede.
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