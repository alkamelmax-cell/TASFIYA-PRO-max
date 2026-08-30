// Service Worker for Tasfiya Pro PWA
// Version: 3.3 - The PWA worker deliberately does not load the OneSignal SDK.
// OneSignal has its own worker under /push/onesignal/ so browser push
// subscriptions stay valid and do not conflict with this application's PWA.

const CACHE_NAME = 'tasfiya-pro-v3.3-onesignal-readiness';
const STATIC_ASSETS = [
    '/login.html',
    '/css/custom.css',
    '/assets/logo-tasfia-pro.png?v=brandmark-20260829-v2',
    '/assets/favicon.png?v=appicon-20260829-v3',
    '/assets/apple-touch-icon.png?v=appicon-20260829-v3',
    '/assets/icon-192.png?v=appicon-20260829-v3',
    '/assets/icon-512.png?v=appicon-20260829-v3',
    '/assets/icon-192-maskable.png?v=appicon-20260829-v3',
    '/assets/icon-512-maskable.png?v=appicon-20260829-v3'
];

function isHtmlNavigationRequest(request) {
    if (!request) {
        return false;
    }

    if (request.mode === 'navigate' || request.destination === 'document') {
        return true;
    }

    const acceptHeader = request.headers && typeof request.headers.get === 'function'
        ? String(request.headers.get('accept') || '').toLowerCase()
        : '';

    return acceptHeader.includes('text/html');
}

function isCacheableStaticRequest(request) {
    if (!request || String(request.method || 'GET').toUpperCase() !== 'GET') {
        return false;
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) {
        return false;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
        return false;
    }

    return !isHtmlNavigationRequest(request);
}

// These files control authentication, push registration and the installed PWA.
// Serving an old cached copy can leave clients calling removed API routes or
// running an outdated OneSignal integration after a server deployment.
const NETWORK_FIRST_RUNTIME_PATHS = new Set([
    '/js/session-bootstrap.js',
    '/js/onesignal-bootstrap.js',
    '/manifest.json',
    '/OneSignalSDKWorker.js'
]);

function isNetworkFirstRuntimeRequest(request) {
    if (!request || String(request.method || 'GET').toUpperCase() !== 'GET') {
        return false;
    }

    const requestUrl = new URL(request.url);
    return requestUrl.origin === self.location.origin
        && NETWORK_FIRST_RUNTIME_PATHS.has(requestUrl.pathname);
}

async function fetchRuntimeNetworkFirst(request) {
    try {
        const response = await fetch(request);

        if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }

        return response;
    } catch (networkError) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw networkError;
    }
}

async function fetchHtmlNetworkFirst(request) {
    try {
        return await fetch(request);
    } catch (networkError) {
        console.warn('⚠️ [SW] HTML request failed, trying cached fallback:', request.url);

        const cachedPage = await caches.match(request);
        if (cachedPage) {
            return cachedPage;
        }

        const cachedLogin = await caches.match('/login.html');
        if (cachedLogin) {
            return cachedLogin;
        }

        throw networkError;
    }
}

function shouldTryLocalApiFallback(url) {
    try {
        const host = String(url.hostname || '').toLowerCase();
        return host !== 'localhost' && host !== '127.0.0.1';
    } catch (_) {
        return false;
    }
}

async function buildFallbackRequest(baseRequest, targetBaseUrl) {
    const sourceUrl = new URL(baseRequest.url);
    const fallbackUrl = `${targetBaseUrl}${sourceUrl.pathname}${sourceUrl.search}`;

    const cloned = baseRequest.clone();
    const method = String(cloned.method || 'GET').toUpperCase();
    const headers = new Headers(cloned.headers || {});
    const init = {
        method,
        headers,
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow'
    };

    if (method !== 'GET' && method !== 'HEAD') {
        init.body = await cloned.arrayBuffer();
    }

    return new Request(fallbackUrl, init);
}

async function fetchApiWithFallback(eventRequest) {
    const primaryRequest = eventRequest.clone();
    const fallbackRequest = eventRequest.clone();
    const requestUrl = new URL(eventRequest.url);

    let primaryResponse;
    try {
        primaryResponse = await fetch(primaryRequest);
    } catch (primaryError) {
        console.warn('⚠️ [SW] Primary API request failed, trying local fallback:', requestUrl.pathname);
        primaryResponse = null;
    }

    const canTryFallback = shouldTryLocalApiFallback(requestUrl);
    const shouldFallbackByStatus = primaryResponse && (primaryResponse.status === 404 || primaryResponse.status === 405);

    if (!canTryFallback) {
        if (primaryResponse) return primaryResponse;
        throw new Error('Primary request failed and fallback is not allowed for localhost origins.');
    }

    if (primaryResponse && !shouldFallbackByStatus) {
        return primaryResponse;
    }

    const localApiBases = [
        'http://127.0.0.1:4000',
        'http://localhost:4000'
    ];

    for (const base of localApiBases) {
        try {
            const localRequest = await buildFallbackRequest(fallbackRequest, base);
            const localResponse = await fetch(localRequest);
            if (localResponse) {
                console.log('✅ [SW] API fallback success via:', base);
                return localResponse;
            }
        } catch (fallbackError) {
            console.warn(`⚠️ [SW] API fallback failed via ${base}:`, fallbackError);
        }
    }

    if (primaryResponse) {
        return primaryResponse;
    }

    throw new Error('Primary and local fallback API requests failed.');
}

// Install event - cache only static assets
self.addEventListener('install', (event) => {
    console.log('🔧 [SW] Installing Service Worker v3.1');
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
    console.log('🔄 [SW] Activating Service Worker v3.1');
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
            fetchApiWithFallback(event.request)
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

    if (isHtmlNavigationRequest(event.request)) {
        console.log('🌐 [SW] HTML Request - Network First:', url.pathname);
        event.respondWith(
            fetchHtmlNetworkFirst(event.request)
                .catch(() => caches.match('/login.html'))
        );
        return;
    }

    // Authentication and push bootstrap files must not become stale after a
    // deployment. Network first still keeps the latest successful copy as an
    // offline fallback without allowing it to override a live server response.
    if (isNetworkFirstRuntimeRequest(event.request)) {
        console.log('🌐 [SW] Runtime request - Network First:', url.pathname);
        event.respondWith(fetchRuntimeNetworkFirst(event.request));
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
                    // Only cache successful same-origin static asset responses.
                    if (
                        response
                        && response.status === 200
                        && response.type === 'basic'
                        && isCacheableStaticRequest(event.request)
                    ) {
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
                return caches.match('/login.html');
            })
    );
});
