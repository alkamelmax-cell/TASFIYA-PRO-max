(function bootstrapTasfiyaOneSignal(windowObj) {
    'use strict';

    // Keep OneSignal's push worker separate from the PWA worker. A push
    // subscription is bound to its service worker; sharing the root PWA
    // worker previously left some browsers looking subscribed locally while
    // no valid OneSignal subscription existed on the provider.
    const PUSH_WORKER_PATH = '/push/onesignal/OneSignalSDKWorker.js';
    const PUSH_WORKER_SCOPE = '/push/onesignal/';
    const PWA_WORKER_PATH = '/service-worker.js';
    const PWA_WORKER_SCOPE = '/';
    const LEGACY_CACHE_NAMES = new Set([
        'tasfiya-pro-v2',
        'tasfiya-pro-v2.6'
    ]);
    const NATIVE_BOOTSTRAP_COOLDOWN_MS = 15000;

    let serviceWorkerRegistrationPromise = null;
    let oneSignalAppIdPromise = null;
    let oneSignalInitializationPromise = null;
    let oneSignalInstance = null;
    let browserNotificationUser = null;
    let browserNotificationRole = 'admin';
    let browserNotificationAppId = '';

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
                    // The server is the single source of truth. Never fall
                    // back to a historic App ID: that silently registers the
                    // browser in a different OneSignal app, making a later
                    // delivery test report zero recipients.
                    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredAppId)) {
                        throw new Error('OneSignal App ID is not configured by the server.');
                    }
                    return configuredAppId;
                } catch (error) {
                    console.error('[Tasfiya OneSignal] Unable to load the server App ID:', error);
                    throw error;
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

                const registration = await windowObj.navigator.serviceWorker.register(PWA_WORKER_PATH, {
                    scope: PWA_WORKER_SCOPE,
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

    async function registerCurrentBrowserSubscription(OneSignal) {
        if (
            !OneSignal
            || !OneSignal.User
            || !OneSignal.User.PushSubscription
            || !browserNotificationUser
            || !browserNotificationUser.id
        ) {
            return false;
        }

        const pushSubscription = OneSignal.User.PushSubscription;
        const subscriptionId = String(pushSubscription.id || '').trim();
        if (!pushSubscription.optedIn || !subscriptionId) {
            return false;
        }

        try {
            const userId = String(browserNotificationUser.id);
            const response = await windowObj.fetch('/api/notifications/register', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscriptionId,
                    externalId: `tasfiya-admin-${userId}`,
                    appId: browserNotificationAppId,
                    role: browserNotificationRole,
                    optedIn: true,
                    permission: OneSignal.Notifications.permission
                })
            });

            if (!response.ok) {
                console.warn('[Tasfiya OneSignal] Server rejected notification registration:', response.status);
                return false;
            }
            return true;
        } catch (error) {
            console.warn('[Tasfiya OneSignal] Unable to register browser subscription with server:', error);
            return false;
        }
    }

    function queueOneSignalInit(user, options) {
        const config = options || {};
        const role = config.role || 'admin';
        const userId = user && user.id ? String(user.id) : 'unknown';
        // Keep a stable identity for every administrator across browsers/devices.
        // OneSignal v16 recommends login() for identified users; tags alone do
        // not reliably unify subscriptions after a browser or domain migration.
        const externalId = user && user.id ? `tasfiya-admin-${userId}` : '';

        // A browser must never read or opt into PushSubscription while the
        // OneSignal SDK/service worker is still initializing. Keep one shared
        // readiness promise so startup and the test button always use the same
        // fully initialized subscription.
        browserNotificationUser = user || null;
        browserNotificationRole = role;

        if (oneSignalInitializationPromise) {
            return oneSignalInitializationPromise;
        }

        oneSignalInitializationPromise = new Promise((resolve) => {
            windowObj.OneSignalDeferred = windowObj.OneSignalDeferred || [];
            windowObj.OneSignalDeferred.push(async function initializeOneSignal(OneSignal) {
                windowObj.__tasfiyaOneSignalInitializing = true;

                try {
                    const registration = await registerServiceWorker();
                    if (!registration) {
                        console.warn('[Tasfiya OneSignal] Skipping initialization because Service Worker is unavailable.');
                        resolve(null);
                        return;
                    }

                    const appId = await getOneSignalAppId();
                    browserNotificationAppId = appId;
                    await OneSignal.init({
                        appId,
                        allowLocalhostAsSecureOrigin: true,
                        serviceWorkerPath: PUSH_WORKER_PATH,
                        serviceWorkerParam: {
                            scope: PUSH_WORKER_SCOPE
                        }
                    });

                    windowObj.__tasfiyaOneSignalInitialized = true;
                    oneSignalInstance = OneSignal;

                    if (externalId) {
                        await OneSignal.login(externalId);
                    }

                    await OneSignal.User.addTags({
                        role,
                        userId,
                        product: 'tasfiya-pro'
                    });

                    const optedIn = Boolean(
                        OneSignal.User
                        && OneSignal.User.PushSubscription
                        && OneSignal.User.PushSubscription.optedIn
                    );

                    console.info(
                        `[Tasfiya OneSignal] Ready: permission=${OneSignal.Notifications.permission}; subscribed=${optedIn}`
                    );
                    if (optedIn) {
                        await registerCurrentBrowserSubscription(OneSignal);
                    }
                    resolve(OneSignal);
                } catch (error) {
                    oneSignalInitializationPromise = null;
                    console.error('[Tasfiya OneSignal] Initialization failed:', error);
                    resolve(null);
                } finally {
                    windowObj.__tasfiyaOneSignalInitializing = false;
                }
            });
        });

        return oneSignalInitializationPromise;
    }

    async function getBrowserPushSubscriptionId(options) {
        const requestOptIn = Boolean(options && options.requestOptIn);
        const OneSignal = oneSignalInstance || await oneSignalInitializationPromise;
        if (!OneSignal || !OneSignal.User || !OneSignal.User.PushSubscription) {
            return '';
        }

        const pushSubscription = OneSignal.User.PushSubscription;
        try {
            // OneSignal v16 exposes permission as a boolean, not the legacy
            // "default" string. Calling optIn() from the test button's user
            // gesture creates/restores a real browser subscription and opens
            // the native Allow prompt if needed.
            if (requestOptIn && !pushSubscription.optedIn) {
                await pushSubscription.optIn();
            }
        } catch (error) {
            console.warn('[Tasfiya OneSignal] Unable to opt in this browser:', error);
            return '';
        }

        // A successful opt-in can take a short moment before OneSignal assigns
        // its server-side Subscription ID. Never send the test using a stale
        // or pre-initialization identifier.
        for (let attempt = 0; attempt < 10; attempt += 1) {
            if (pushSubscription.optedIn) {
                const subscriptionId = String(pushSubscription.id || '').trim();
                if (subscriptionId) {
                    await registerCurrentBrowserSubscription(OneSignal);
                    return subscriptionId;
                }
            }
            await new Promise((resolve) => windowObj.setTimeout(resolve, 300));
        }

        return '';
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
        },
        getBrowserPushSubscriptionId(options) {
            return getBrowserPushSubscriptionId(options);
        }
    };
})(window);
