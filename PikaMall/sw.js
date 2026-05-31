const CACHE_NAME = 'pikamall-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
    'https://unpkg.com/html5-qrcode'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache local files reliably, external CDN files best-effort
            const localAssets = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];
            return cache.addAll(localAssets);
        }).then(() => self.skipWaiting())
    );
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for Firebase/API, Cache-first for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Always go network for Firebase (auth, firestore)
    if (
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebasestorage') ||
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit')
    ) {
        return; // Let browser handle directly
    }

    // Cache-first for static assets (CSS, JS, fonts, icons)
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    // Cache valid GET responses
                    if (
                        event.request.method === 'GET' &&
                        response &&
                        response.status === 200
                    ) {
                        const cloned = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline fallback: return cached index.html for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});
