(function bootstrapTasfiyaPageAccess(windowObj) {
    'use strict';

    const PROTECTED_PAGES = [
        'atm-reports.html',
        'cashbox-reports.html',
        'customer-ledger.html',
        'users-management.html',
        'cashiers-management.html',
        'reconciliation-requests.html',
        'request-reconciliation.html'
    ];

    function normalizePermissions(user) {
        const rawPermissions = user && user.permissions;
        if (Array.isArray(rawPermissions)) {
            return rawPermissions
                .map((value) => String(value || '').trim())
                .filter(Boolean);
        }

        if (typeof rawPermissions === 'string') {
            try {
                const parsed = JSON.parse(rawPermissions);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((value) => String(value || '').trim())
                        .filter(Boolean);
                }
            } catch (_) {
                // Ignore invalid JSON permissions and fallback to empty list.
            }
        }

        return [];
    }

    function isAdminUser(user) {
        return String(user && user.role || '').trim().toLowerCase() === 'admin';
    }

    function canAccessPage(user, pageName) {
        const normalizedPage = String(pageName || '').trim();
        if (!normalizedPage) {
            return true;
        }

        if (!PROTECTED_PAGES.includes(normalizedPage)) {
            return true;
        }

        if (isAdminUser(user)) {
            return true;
        }

        const permissions = normalizePermissions(user);
        return permissions.includes(normalizedPage);
    }

    function applyProtectedPageVisibility(documentObj, user, pages = PROTECTED_PAGES) {
        if (!documentObj || typeof documentObj.querySelector !== 'function') {
            return;
        }

        const protectedPages = Array.isArray(pages) && pages.length > 0
            ? pages
            : PROTECTED_PAGES;

        protectedPages.forEach((page) => {
            const element = documentObj.querySelector(`a[href="${page}"]`);
            if (element) {
                element.classList.remove('d-none');
            }
        });

        if (isAdminUser(user)) {
            return;
        }

        const permissions = normalizePermissions(user);
        if (permissions.length === 0) {
            protectedPages.forEach((page) => {
                const element = documentObj.querySelector(`a[href="${page}"]`);
                if (element) {
                    element.classList.add('d-none');
                }
            });
            return;
        }

        protectedPages.forEach((page) => {
            if (permissions.includes(page)) {
                return;
            }

            const element = documentObj.querySelector(`a[href="${page}"]`);
            if (element) {
                element.classList.add('d-none');
            }
        });
    }

    windowObj.TasfiyaAccess = {
        PROTECTED_PAGES,
        normalizePermissions,
        canAccessPage,
        applyProtectedPageVisibility
    };
})(window);
