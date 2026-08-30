(function bootstrapTasfiyaOneSignal(windowObj) {
    'use strict';

    const ONE_SIGNAL_APP_ID = '1b7778f5-0f25-4df8-a281-611b682a964c';
    const SERVICE_WORKER_PATH = '/service-worker.js';
    const SERVICE_WORKER_SCOPE = '/';
    const LEGACY_CACHE_NAMES = new Set([
        'tasfiya-pro-v2',
        'tasfiya-pro-v2.6'
    ]);
    const NATIVE_BOOTSTRAP_COOLDOWN_MS = 15000;

    let serviceWorkerRegistrationPromise = null;
    let oneSignalAppIdPromise = null;

    async function getOneSignalAppId() {
        if (!oneSignalAppIdPromise) {
            oneSignalAppIdPromise = (async () => {
                try {
                    const response = await windowObj.fetch('/api/client-config', {
                        cache: 'no-store',
                        credentials: 'same-origin'
                    });
                    const result = await response.json();
                    const configuredAppId = result && result.success
                        ? String(result.oneSignalAppId || '').trim()
                        : '';
                    return configuredAppId || ONE_SIGNAL_APP_ID;
                } catch (error) {
                    // Keep the known app id as a safe fallback while the server
                    // is unavailable. The server remains the source of truth.
                    return ONE_SIGNAL_APP_ID;
                }
            })();
        }

        return oneSignalAppIdPromise;
    }

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
        // Keep a stable identity for every administrator across browsers/devices.
        // OneSignal v16 recommends login() for identified users; tags alone do
        // not reliably unify subscriptions after a browser or domain migration.
        const externalId = user && user.id ? `tasfiya-admin-${userId}` : '';

        windowObj.OneSignalDeferred = windowObj.OneSignalDeferred || [];
        windowObj.OneSignalDeferred.push(async function initializeOneSignal(OneSignal) {
            // Both the dashboard boot sequence and the manual test can request
            // setup at nearly the same time. Reserve initialization before any
            // async work so OneSignal.init() is never called twice.
            if (windowObj.__tasfiyaOneSignalInitialized || windowObj.__tasfiyaOneSignalInitializing) {
                return;
            }

            windowObj.__tasfiyaOneSignalInitializing = true;

            try {
                const registration = await registerServiceWorker();
                if (!registration) {
                    console.warn('[Tasfiya OneSignal] Skipping initialization because Service Worker is unavailable.');
                    return;
                }

                const appId = await getOneSignalAppId();
                await OneSignal.init({
                    appId,
                    allowLocalhostAsSecureOrigin: true,
                    serviceWorkerPath: SERVICE_WORKER_PATH,
                    serviceWorkerParam: {
                        scope: SERVICE_WORKER_SCOPE
                    }
                });

                windowObj.__tasfiyaOneSignalInitialized = true;

                if (externalId) {
                    await OneSignal.login(externalId);
                }

                await OneSignal.User.addTags({
                    role,
                    userId,
                    product: 'tasfiya-pro'
                });

                if (requestPermission && OneSignal.Notifications.permission === 'default') {
                    await OneSignal.Notifications.requestPermission();
                }

                const optedIn = Boolean(
                    OneSignal.User
                    && OneSignal.User.PushSubscription
                    && OneSignal.User.PushSubscription.optedIn
                );

                console.info(
                    `[Tasfiya OneSignal] Ready: permission=${OneSignal.Notifications.permission}; subscribed=${optedIn}`
                );
            } catch (error) {
                console.error('[Tasfiya OneSignal] Initialization failed:', error);
            } finally {
                windowObj.__tasfiyaOneSignalInitializing = false;
            }
        });
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
            queueOneSignalInit(user, options);
        }
    };
})(window);
