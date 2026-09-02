/*
 * Tasfiya Pro shared navigation shell.
 *
 * Every dashboard page used to keep its own copy of the navigation markup.
 * That made links silently disappear when moving between modules.  This small
 * client-side shell provides one menu definition while keeping the existing
 * page-level authorization checks as the final access control.
 */
(function () {
    'use strict';

    const NAVIGATION_ITEMS = [
        { href: 'index.html', label: 'الرئيسية', icon: 'fa-home' },
        { href: 'request-reconciliation.html', label: 'طلب تصفية', icon: 'fa-circle-plus' },
        { href: 'reconciliation-requests.html', label: 'الطلبات المعلقة', icon: 'fa-inbox', permission: 'reconciliation-requests.html' },
        { href: 'atm-reports.html', label: 'تقرير الصراف', icon: 'fa-credit-card', permission: 'atm-reports.html' },
        { href: 'cashbox-reports.html', label: 'تقارير الصناديق', icon: 'fa-vault', permission: 'cashbox-reports.html' },
        { href: 'customer-ledger.html', label: 'دفتر العملاء', icon: 'fa-book', permission: 'customer-ledger.html' },
        { href: 'users-management.html', label: 'إدارة المستخدمين', icon: 'fa-users-gear', permission: 'users-management.html', id: 'navUsersMgmt' },
        { href: 'cashiers-management.html', label: 'إدارة الكاشير', icon: 'fa-cash-register', permission: 'cashiers-management.html' }
    ];

    function readStoredUser() {
        try {
            if (window.TasfiyaSession && typeof window.TasfiyaSession.readStoredUser === 'function') {
                return window.TasfiyaSession.readStoredUser() || {};
            }

            return JSON.parse(localStorage.getItem('user') || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function isAllowed(item, user) {
        if (user && user.role === 'cashier') {
            return item.href === 'request-reconciliation.html';
        }

        // Existing legacy administrators may not have a role stored. Keep
        // their current behaviour and do not remove menu access from them.
        if (!item.permission || !user || !user.role || user.role === 'admin') {
            return true;
        }

        const permissions = Array.isArray(user.permissions) ? user.permissions : [];
        return permissions.includes(item.permission);
    }

    function currentPage() {
        const current = window.location.pathname.split('/').pop();
        return current || 'index.html';
    }

    function renderNavigation() {
        const menu = document.querySelector('.navbar-links-section');
        if (!menu || menu.dataset.navigationShellReady === 'true') {
            return;
        }

        const user = readStoredUser();
        const page = currentPage();
        const links = NAVIGATION_ITEMS
            .filter((item) => isAllowed(item, user))
            .map((item) => {
                const active = item.href === page;
                const id = item.id ? ` id="${item.id}"` : '';
                const activeClass = active ? 'btn-primary shadow-sm' : 'btn-outline-secondary border-0 hover-bg-primary';
                const current = active ? ' aria-current="page"' : '';

                return `<a${id} href="${item.href}" class="btn btn-sm ${activeClass} fw-bold text-white px-3 py-2 rounded-pill"${current}>
                    <i class="fas ${item.icon} me-1"></i><span>${item.label}</span>
                </a>`;
            })
            .join('');

        menu.innerHTML = links;
        menu.dataset.navigationShellReady = 'true';
    }

    renderNavigation();
}());
