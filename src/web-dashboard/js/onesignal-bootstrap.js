(function bootstrapTasfiyaOneSignal(windowObj) {
    'use strict';

    const ONE_SIGNAL_APP_ID = '1b7778f5-0f25-4df8-a281-611b682a964c';
    const PWA_SERVICE_WORKER_PATH = '/service-worker.js';
    const PWA_SERVICE_WORKER_SCOPE = '/';
    const ONE_SIGNAL_SERVICE_WORKER_PATH = 'push/onesignal/OneSignalSDKWorker.js';
    const ONE_SIGNAL_SERVICE_WORKER_SCOPE = '/push/onesignal/';
    const LEGACY_CACHE_NAMES = new Set([
        'tasfiya-pro-v2',
        'tasfiya-pro-v2.6'
    ]);
    const NATIVE_BOOTSTRAP_COOLDOWN_MS = 15000;
    const CONTROLLER_WAIT_TIMEOUT_MS = 4000;

    let serviceWorkerRegistrationPromise = null;
    let browserInitializationPromise = null;
    let localhostCleanupPromise = null;

    function isNativeAppEnvironment() {
        const userAgent = String(windowObj.navigator.userAgent || '').toLowerCase();
        return Boolean(windowObj.gonative) || userAgent.includes('gonative') || userAgent.includes('median');
    }

    function safeSessionStorageGet(key) {
        try {
            return windowObj.sessionStorage ? windowObj.sessionStorage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function safeSessionStorageSet(key, value) {
        try {
            if (windowObj.sessionStorage) {
                windowObj.sessionStorage.setItem(key, value);
            }
        } catch (error) {
            // Ignore storage failures in restricted contexts.
        }
    }

    function dispatchNativeOneSignalUrl(url) {
        try {
            windowObj.location.href = url;
            return true;
        } catch (error) {
            console.warn('[Tasfiya OneSignal] Native URL dispatch failed:', url, error);
            return false;
        }
    }

    function applyNativeTags(tags) {
        if (
            windowObj.gonative
            && windowObj.gonative.onesignal
            && windowObj.gonative.onesignal.tags
            && typeof windowObj.gonative.onesignal.tags.setTags === 'function'
        ) {
            try {
                windowObj.gonative.onesignal.tags.setTags(tags);
            } catch (error) {
                console.warn('[Tasfiya OneSignal] Native tag assignment failed:', error);
            }
        }

        dispatchNativeOneSignalUrl(
            `gonative://onesignal/tags/setTags?tags=${encodeURIComponent(JSON.stringify(tags))}`
        );
    }

    function applyNativeExternalId(externalId) {
        if (!externalId) {
            return;
        }

        dispatchNativeOneSignalUrl(
            `gonative://onesignal/user/setExternalId?externalId=${encodeURIComponent(externalId)}`
        );
    }

    function queueNativeBootstrap(user, options) {
        if (!isNativeAppEnvironment()) {
            return false;
        }

        const now = Date.now();
        const lastBootstrapAt = Number(safeSessionStorageGet('tasfiya-native-onesignal-last-bootstrap') || '0');
        if (lastBootstrapAt && (now - lastBootstrapAt) < NATIVE_BOOTSTRAP_COOLDOWN_MS) {
            return true;
        }

        safeSessionStorageSet('tasfiya-native-onesignal-last-bootstrap', String(now));

        const config = options || {};
        const role = config.role || 'admin';
        const userId = user && user.id ? String(user.id) : 'unknown';
        const externalId = user && user.id ? String(user.id) : '';
        const tags = Object.assign({
            role,
            userId
        }, config.additionalTags || {});

        dispatchNativeOneSignalUrl('gonative://onesignal/register');
        applyNativeTags(tags);

        windowObj.setTimeout(() => {
            applyNativeExternalId(externalId);
        }, 800);

        // Retry after startup to survive slow WebView/plugin initialization.
        windowObj.setTimeout(() => {
            dispatchNativeOneSignalUrl('gonative://onesignal/register');
        }, 2200);

        windowObj.setTimeout(() => {
            applyNativeTags(tags);
        }, 3000);

        windowObj.setTimeout(() => {
            applyNativeExternalId(externalId);
        }, 3800);

        return true;
    }

    function isLocalhostLike() {
        const hostname = String(windowObj.location.hostname || '').trim().toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    }

    function isUnsupportedOriginError(error) {
        const message = String(
            (error && (error.message || error.reason || error.stack))
            || error
            || ''
        ).toLowerCase();

        return (
            message.includes('can only use domain')
            || message.includes('origin')
            || message.includes('hostname')
        );
    }

    function canUseServiceWorkers() {
        return (
            'serviceWorker' in windowObj.navigator
            && ('isSecureContext' in windowObj ? (windowObj.isSecureContext || isLocalhostLike()) : true)
        );
    }

    function delay(ms) {
        return new Promise((resolve) => {
            windowObj.setTimeout(resolve, ms);
        });
    }

    function waitForWindowLoad() {
        if (windowObj.document.readyState === 'complete') {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            windowObj.addEventListener('load', resolve, { once: true });
        });
    }

    function waitForServiceWorkerActivation(registration) {
        const worker = registration && (registration.active || registration.waiting || registration.installing);
        if (!worker || worker.state === 'activated') {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const handleStateChange = () => {
                if (worker.state === 'activated') {
                    worker.removeEventListener('statechange', handleStateChange);
                    resolve();
                }
            };

            worker.addEventListener('statechange', handleStateChange);
        });
    }

    function waitForController(timeoutMs = CONTROLLER_WAIT_TIMEOUT_MS) {
        if (!canUseServiceWorkers() || windowObj.navigator.serviceWorker.controller) {
            return Promise.resolve(Boolean(windowObj.navigator.serviceWorker && windowObj.navigator.serviceWorker.controller));
        }

        return new Promise((resolve) => {
            let settled = false;

            const finish = (value) => {
                if (settled) {
                    return;
                }

                settled = true;
                windowObj.navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
                clearTimeout(timeoutId);
                resolve(value);
            };

            const handleControllerChange = () => {
                finish(Boolean(windowObj.navigator.serviceWorker.controller));
            };

            const timeoutId = windowObj.setTimeout(() => {
                finish(Boolean(windowObj.navigator.serviceWorker.controller));
            }, timeoutMs);

            windowObj.navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
        });
    }

    function isTasfiyaCacheName(cacheKey) {
        return typeof cacheKey === 'string' && cacheKey.startsWith('tasfiya-pro-');
    }

    async function disableServiceWorkerOnLocalhost() {
        if (!canUseServiceWorkers()) {
            return;
        }

        if (!localhostCleanupPromise) {
            localhostCleanupPromise = (async () => {
                try {
                    const registrations = await windowObj.navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                        await registration.unregister();
                    }
                } catch (error) {
                    console.warn('[Tasfiya PWA] Failed to unregister Service Workers on localhost:', error);
                }

                if (!('caches' in windowObj)) {
                    return;
                }

                try {
                    const cacheKeys = await windowObj.caches.keys();
                    for (const cacheKey of cacheKeys) {
                        if (LEGACY_CACHE_NAMES.has(cacheKey) || isTasfiyaCacheName(cacheKey)) {
                            await windowObj.caches.delete(cacheKey);
                        }
                    }
                } catch (error) {
                    console.warn('[Tasfiya PWA] Failed cleaning caches on localhost:', error);
                }
            })();
        }

        return localhostCleanupPromise;
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

        if (isLocalhostLike()) {
            await disableServiceWorkerOnLocalhost();
            return null;
        }

        if (!serviceWorkerRegistrationPromise) {
            serviceWorkerRegistrationPromise = (async () => {
                await cleanLegacyCaches();

                const registrations = await windowObj.navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.update();
                }

                const registration = await windowObj.navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH, {
                    scope: PWA_SERVICE_WORKER_SCOPE,
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
        if (isLocalhostLike()) {
            console.info('[Tasfiya OneSignal] Skipping browser initialization on localhost.');
            return Promise.resolve(false);
        }

        if (windowObj.__tasfiyaOneSignalInitialized) {
            return Promise.resolve(true);
        }

        if (browserInitializationPromise) {
            return browserInitializationPromise;
        }

        const config = options || {};
        const role = config.role || 'admin';
        const requestPermission = config.requestPermission !== false;
        const userId = user && user.id ? String(user.id) : 'unknown';

        browserInitializationPromise = new Promise((resolve) => {
            windowObj.OneSignalDeferred = windowObj.OneSignalDeferred || [];
            windowObj.OneSignalDeferred.push(async function initializeOneSignal(OneSignal) {
                if (windowObj.__tasfiyaOneSignalInitialized) {
                    resolve(true);
                    return true;
                }

                try {
                    await waitForWindowLoad();

                    const registration = await registerServiceWorker();
                    if (!registration) {
                        console.warn('[Tasfiya OneSignal] Skipping initialization because Service Worker is unavailable.');
                        browserInitializationPromise = null;
                        resolve(false);
                        return false;
                    }

                    await waitForServiceWorkerActivation(registration);
                    await waitForController();
                    await delay(250);

                    await OneSignal.init({
                        appId: ONE_SIGNAL_APP_ID,
                        allowLocalhostAsSecureOrigin: true,
                        serviceWorkerPath: ONE_SIGNAL_SERVICE_WORKER_PATH,
                        serviceWorkerParam: {
                            scope: ONE_SIGNAL_SERVICE_WORKER_SCOPE
                        }
                    });

                    windowObj.__tasfiyaOneSignalInitialized = true;

                    await OneSignal.User.addTag('role', role);
                    await OneSignal.User.addTag('userId', userId);

                    if (requestPermission && OneSignal.Notifications.permission === 'default') {
                        await OneSignal.Notifications.requestPermission();
                    }

                    resolve(true);
                    return true;
                } catch (error) {
                    if (isUnsupportedOriginError(error)) {
                        console.warn(
                            '[Tasfiya OneSignal] Browser notifications are disabled for this origin until it is allowed in OneSignal:',
                            windowObj.location.origin
                        );
                        resolve(false);
                        return false;
                    }

                    browserInitializationPromise = null;
                    console.error('[Tasfiya OneSignal] Initialization failed:', error);
                    resolve(false);
                    return false;
                }
            });
        });

        return browserInitializationPromise;
    }

    windowObj.TasfiyaPwa = {
        registerServiceWorker
    };

    windowObj.TasfiyaOneSignal = {
        isNativeEnvironment() {
            return isNativeAppEnvironment();
        },
        initNativeUser(user, options) {
            return queueNativeBootstrap(user, options);
        },
        initBrowserUser(user, options) {
            return queueOneSignalInit(user, options);
        }
    };
})(window);
