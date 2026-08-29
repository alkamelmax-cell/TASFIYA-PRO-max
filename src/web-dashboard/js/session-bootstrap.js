(function bootstrapTasfiyaSession(windowObj) {
    'use strict';

    const LOGIN_REDIRECT_GUARD_KEY = 'tasfiya-login-auto-redirect-at';
    const LOGIN_REDIRECT_GUARD_WINDOW_MS = 4000;

    function getStorage(name) {
        try {
            return windowObj[name] || null;
        } catch (error) {
            return null;
        }
    }

    const localStorageRef = getStorage('localStorage');
    const sessionStorageRef = getStorage('sessionStorage');

    function clearStoredUser() {
        try {
            if (localStorageRef) {
                localStorageRef.removeItem('user');
            }
        } catch (error) {
            // Ignore storage failures in restricted contexts.
        }
    }

    function readStoredUser() {
        try {
            if (!localStorageRef) {
                return null;
            }

            const raw = localStorageRef.getItem('user');
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            clearStoredUser();
            return null;
        }
    }

    function persistUser(user) {
        try {
            if (!localStorageRef || !user) {
                return false;
            }

            localStorageRef.setItem('user', JSON.stringify(user));
            return true;
        } catch (error) {
            return false;
        }
    }

    function clearLoginAutoRedirect() {
        try {
            if (sessionStorageRef) {
                sessionStorageRef.removeItem(LOGIN_REDIRECT_GUARD_KEY);
            }
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function markLoginAutoRedirect() {
        try {
            if (sessionStorageRef) {
                sessionStorageRef.setItem(LOGIN_REDIRECT_GUARD_KEY, String(Date.now()));
            }
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function hasRecentLoginAutoRedirect() {
        try {
            if (!sessionStorageRef) {
                return false;
            }

            const raw = sessionStorageRef.getItem(LOGIN_REDIRECT_GUARD_KEY);
            const timestamp = Number(raw || '0');
            if (!timestamp) {
                return false;
            }

            return (Date.now() - timestamp) < LOGIN_REDIRECT_GUARD_WINDOW_MS;
        } catch (error) {
            return false;
        }
    }

    function redirectToLogin() {
        clearLoginAutoRedirect();
        clearStoredUser();
        windowObj.location.replace('/login.html');
    }

    async function requireActiveSession(options = {}) {
        const redirectOnFailure = options.redirectOnFailure !== false;

        try {
            const response = await windowObj.fetch('/api/session', {
                cache: 'no-store',
                credentials: 'same-origin'
            });

            if (!response.ok) {
                if (redirectOnFailure) {
                    redirectToLogin();
                } else {
                    clearStoredUser();
                }
                return null;
            }

            const result = await response.json();
            if (!result.success || !result.user) {
                if (redirectOnFailure) {
                    redirectToLogin();
                } else {
                    clearStoredUser();
                }
                return null;
            }

            persistUser(result.user);
            clearLoginAutoRedirect();
            return result.user;
        } catch (error) {
            if (redirectOnFailure) {
                redirectToLogin();
            } else {
                clearStoredUser();
            }
            return null;
        }
    }

    function redirectToHomeForUser(user, options = {}) {
        const target = options.redirectUrl || (user && user.role === 'cashier'
            ? '/request-reconciliation.html'
            : '/');

        persistUser(user);
        markLoginAutoRedirect();
        windowObj.location.replace(target);
    }

    windowObj.TasfiyaSession = {
        clearLoginAutoRedirect,
        clearStoredUser,
        hasRecentLoginAutoRedirect,
        markLoginAutoRedirect,
        persistUser,
        readStoredUser,
        redirectToHomeForUser,
        redirectToLogin,
        requireActiveSession
    };
})(window);
