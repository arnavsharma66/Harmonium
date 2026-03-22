const CACHE_NAME = 'harmonium-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/index.css',
    '/app.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', event => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;
    // Don't intercept API calls
    if (event.request.url.includes('/api/') || event.request.url.includes('/auth/')) return;
    
    let req = event.request;
    if (req.url.endsWith('/')) req = new Request('/index.html');

    event.respondWith(
        caches.match(req)
        .then(response => {
            return response || fetch(event.request);
        })
    );
});
