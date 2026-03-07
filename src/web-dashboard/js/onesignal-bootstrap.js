(function bootstrapTasfiyaOneSignal(windowObj) {
    'use strict';

    const ONE_SIGNAL_APP_ID = '1b7778f5-0f25-4df8-a281-611b682a964c';
    const SERVICE_WORKER_PATH = '/service-worker.js';
    const SERVICE_WORKER_SCOPE = '/';
    const LEGACY_CACHE_NAMES = new Set(['tasfiya-pro-v2']);

    let serviceWorkerRegistrationPromise = null;

    function isLocalhostLike() {
        const hostname = String(windowObj.location.hostname || '').trim().toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    }

    function canUseServiceWorkers() {
        return (
            'serviceWorker' in windowObj.navigator
            && ('isSecureContext' in windowObj ? (windowObj.isSecureContext || isLocalhostLike()) : true)
        );
    }

    async function cleanLegacyCaches() {
        if (!('caches' in windowObj)) {
            return;
        }

        try {
            const cacheKeys = await windowObj.caches.keys();
            for (const cacheKey of cacheKeys) {
                if (cacheKey.includes('v1') || LEGACY_CACHE_NAMES.has(cacheKey)) {
                    await windowObj.caches.delete(cacheKey);
                }
            }
        } catch (error) {
            console.warn('[Tasfiya PWA] Failed cleaning legacy caches:', error);
        }
    }

    async function registerServiceWorker() {
        if (!canUseServiceWorkers()) {
            return null;
        }

        if (!serviceWorkerRegistrationPromise) {
            serviceWorkerRegistrationPromise = (async () => {
                await cleanLegacyCaches();

                const registrations = await windowObj.navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.update();
                }

                const registration = await windowObj.navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
                    scope: SERVICE_WORKER_SCOPE,
                    updateViaCache: 'none'
                });

                await registration.update();
                await windowObj.navigator.serviceWorker.ready;
                return registration;
            })().catch((error) => {
                console.error('[Tasfiya PWA] Service Worker registration failed:', error);
                serviceWorkerRegistrationPromise = null;
                throw error;
            });
        }

        return serviceWorkerRegistrationPromise;
    }

    function queueOneSignalInit(user, options) {
        const config = options || {};
        const role = config.role || 'admin';
        const requestPermission = config.requestPermission !== false;
        const userId = user && user.id ? String(user.id) : 'unknown';

        windowObj.OneSignalDeferred = windowObj.OneSignalDeferred || [];
        windowObj.OneSignalDeferred.push(async function initializeOneSignal(OneSignal) {
            if (windowObj.__tasfiyaOneSignalInitialized) {
                return;
            }

            try {
                const registration = await registerServiceWorker();
                if (!registration) {
                    console.warn('[Tasfiya OneSignal] Skipping initialization because Service Worker is unavailable.');
                    return;
                }

                await OneSignal.init({
                    appId: ONE_SIGNAL_APP_ID,
                    allowLocalhostAsSecureOrigin: true,
                    serviceWorkerPath: SERVICE_WORKER_PATH,
                    serviceWorkerParam: {
                        scope: SERVICE_WORKER_SCOPE
                    }
                });

                windowObj.__tasfiyaOneSignalInitialized = true;

                await OneSignal.User.addTag('role', role);
                await OneSignal.User.addTag('userId', userId);

                if (requestPermission && OneSignal.Notifications.permission === 'default') {
                    await OneSignal.Notifications.requestPermission();
                }
            } catch (error) {
                console.error('[Tasfiya OneSignal] Initialization failed:', error);
            }
        });
    }

    windowObj.TasfiyaPwa = {
        registerServiceWorker
    };

    windowObj.TasfiyaOneSignal = {
        initBrowserUser(user, options) {
            queueOneSignalInit(user, options);
        }
    };
})(window);
