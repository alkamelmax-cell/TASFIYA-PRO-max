// Service Worker for Tasfiya Pro PWA
// Version: 2.1 - Clean & Professional + OneSignal Support
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');

const CACHE_NAME = 'tasfiya-pro-v2.1';
const STATIC_ASSETS = [
    '/index.html',
    '/login.html',
    '/css/custom.css',
    '/assets/logo.png',
    '/assets/favicon.png',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

// Install event - cache only static assets
self.addEventListener('install', (event) => {
    console.log('🔧 [SW] Installing Service Worker v2.0');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ [SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .catch((error) => {
                console.error('❌ [SW] Cache install failed:', error);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🔄 [SW] Activating Service Worker v2.0');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ [SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - NEVER cache API requests
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Strategy 1: API Requests - ALWAYS fetch from network, NEVER cache
    if (url.pathname.startsWith('/api/')) {
        console.log('🌐 [SW] API Request - Network Only:', url.pathname);
        event.respondWith(
            fetch(event.request)
                .catch((error) => {
                    console.error('❌ [SW] API Request failed:', error);
                    return new Response(
                        JSON.stringify({ success: false, error: 'Network error' }),
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
        return;
    }

    // Strategy 2: Static Assets - Cache first, fallback to network
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('📦 [SW] Serving from cache:', url.pathname);
                    return cachedResponse;
                }

                console.log('🌐 [SW] Fetching from network:', url.pathname);
                return fetch(event.request).then((response) => {
                    // Only cache successful responses for static assets
                    if (response && response.status === 200 && response.type === 'basic') {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                });
            })
            .catch(() => {
                console.log('🔌 [SW] Offline - serving fallback');
                return caches.match('/index.html');
            })
    );
});
