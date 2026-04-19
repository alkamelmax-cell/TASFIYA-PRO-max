// @ts-nocheck
// Reconciliation Requests Manager for Desktop App
// Handles viewing and approving cashier reconciliation requests

(function () {
    'use strict';

    const requestsIpc = typeof window !== 'undefined' && window.RendererIPC
        ? window.RendererIPC
        : require('./renderer-ipc');
    const { getReconciliationRequestsUrl } = require('./app/sync-endpoints');

    let requestsData = [];
    let currentRequestId = null;
    let currentFilter = 'pending'; // 'pending' or 'completed'
    let currentPage = 1;
    let paginationInfo = { total: 0, totalPages: 0, page: 1, limit: 20 };
    let requestOpenFlowToken = 0;
    let requestLoadToken = 0;
    const REQUESTS_PAGE_SIZE = 20;

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        createRequestsSection();
        updateSectionTitle();
    }

    function createRequestsSection() {
        const mainContent = document.getElementById('mainContent') || document.querySelector('.main-content');
        if (!mainContent || document.getElementById('reconciliation-requests-section')) {
            return;
        }

        const section = document.createElement('div');
        section.id = 'reconciliation-requests-section';
        section.className = 'content-section';

        // Enhanced CSS matching app theme
        const style = document.createElement('style');
        style.textContent = `
            #reconciliation-requests-section {
                min-height: calc(100vh - 84px);
                padding: 18px 16px;
                background: transparent;
            }

            .req-header-wrapper {
                background: rgba(255, 255, 255, 0.9);
                border: 1px solid rgba(12, 44, 62, 0.16);
                border-radius: 16px;
                padding: 18px 22px;
                margin-bottom: 14px;
                box-shadow: 0 10px 24px rgba(10, 35, 50, 0.12);
            }

            body.theme-dark .req-header-wrapper {
                background: rgba(22, 31, 40, 0.88);
                border-color: rgba(111, 169, 197, 0.26);
            }

            .req-main-title {
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 31px;
                font-weight: 700;
                color: #163447;
            }

            body.theme-dark .req-main-title {
                color: #e4f0f7;
            }

            .req-subtitle {
                margin: 3px 0 0;
                color: #6b7f8e;
                font-size: 13px;
                font-weight: 600;
            }

            .req-tab-container {
                display: inline-flex;
                gap: 6px;
                padding: 6px;
                border-radius: 12px;
                background: rgba(15, 110, 143, 0.08);
                border: 1px solid rgba(12, 44, 62, 0.14);
            }

            .req-tab-btn {
                border: 0;
                border-radius: 10px;
                padding: 9px 17px;
                font-size: 13px;
                font-weight: 700;
                color: #355264;
                background: transparent;
                transition: all 0.2s ease;
                cursor: pointer;
            }

            .req-tab-btn:hover {
                color: #0f6e8f;
                background: rgba(15, 110, 143, 0.12);
            }

            .req-tab-btn.active {
                color: #fff;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
                box-shadow: 0 6px 14px rgba(15, 110, 143, 0.28);
            }

            .req-refresh-btn {
                border: 0;
                border-radius: 11px;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 700;
                color: #fff;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
                box-shadow: 0 8px 18px rgba(15, 110, 143, 0.25);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                cursor: pointer;
            }

            .req-refresh-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 10px 22px rgba(15, 110, 143, 0.32);
            }

            .req-card {
                background: rgba(255, 255, 255, 0.92);
                border: 1px solid rgba(12, 44, 62, 0.14);
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 14px 34px rgba(10, 35, 50, 0.14);
            }

            body.theme-dark .req-card {
                background: rgba(22, 31, 40, 0.86);
                border-color: rgba(111, 169, 197, 0.24);
            }

            .req-table-header {
                background: linear-gradient(135deg, #1b465e 0%, #163a4f 100%);
                color: #fff;
            }

            .req-table-header th {
                border: none !important;
                padding: 14px 13px !important;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.2px;
            }

            .req-row {
                border-bottom: 1px solid rgba(12, 44, 62, 0.08);
                transition: background-color 0.16s ease;
            }

            .req-row:hover {
                background-color: rgba(15, 110, 143, 0.07);
            }

            body.theme-dark .req-row {
                border-bottom-color: rgba(111, 169, 197, 0.2);
            }

            body.theme-dark .req-row:hover {
                background-color: rgba(56, 144, 183, 0.16);
            }

            .req-row td {
                padding: 14px 13px !important;
                vertical-align: middle !important;
            }

            .req-id-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 58px;
                padding: 6px 10px;
                border-radius: 999px;
                color: #fff;
                font-size: 12px;
                font-weight: 700;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
                box-shadow: 0 4px 10px rgba(15, 110, 143, 0.22);
            }

            .req-cashier-avatar {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                margin-right: 10px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 700;
                color: #fff;
                background: linear-gradient(135deg, #3b7ea1 0%, #234d65 100%);
                box-shadow: 0 4px 10px rgba(24, 74, 99, 0.22);
            }

            .req-date-main,
            .req-cashier-name {
                font-size: 13px;
                font-weight: 700;
                color: #1f3f52;
            }

            .req-date-sub,
            .req-cashier-branch,
            .req-reviewed-label {
                font-size: 11px;
                font-weight: 600;
                color: #6b7f8e;
            }

            .req-date-sub {
                font-family: monospace;
            }

            body.theme-dark .req-date-main,
            body.theme-dark .req-cashier-name {
                color: #dceaf3;
            }

            body.theme-dark .req-date-sub,
            body.theme-dark .req-cashier-branch,
            body.theme-dark .req-reviewed-label {
                color: #a9c0cd;
            }

            .req-amount-badge {
                display: inline-block;
                padding: 7px 13px;
                border-radius: 9px;
                color: #fff;
                font-size: 13px;
                font-weight: 700;
                background: linear-gradient(135deg, #12b981 0%, #0b9a6d 100%);
                box-shadow: 0 3px 8px rgba(18, 185, 129, 0.24);
            }

            .req-diff-positive,
            .req-diff-negative,
            .req-diff-zero {
                display: inline-block;
                padding: 7px 12px;
                border-radius: 9px;
                color: #fff;
                font-size: 13px;
                font-weight: 700;
            }

            .req-diff-positive {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            }

            .req-diff-negative {
                background: linear-gradient(135deg, #12b981 0%, #0b9a6d 100%);
            }

            .req-diff-zero {
                background: linear-gradient(135deg, #64748b 0%, #475569 100%);
            }

            .req-action-btn {
                border: 0;
                border-radius: 9px;
                min-height: 36px;
                padding: 8px 13px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: transform 0.16s ease, box-shadow 0.16s ease;
            }

            .req-action-btn:hover {
                transform: translateY(-1px);
            }

            .req-btn-primary {
                color: #fff;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
                box-shadow: 0 6px 14px rgba(15, 110, 143, 0.24);
            }

            .req-btn-success {
                color: #fff;
                background: linear-gradient(135deg, #12b981 0%, #0b9a6d 100%);
                box-shadow: 0 6px 14px rgba(18, 185, 129, 0.24);
            }

            .req-btn-danger {
                color: #fff;
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                box-shadow: 0 6px 14px rgba(239, 68, 68, 0.22);
            }

            .req-status-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 7px 12px;
                border-radius: 9px;
                font-size: 12px;
                font-weight: 700;
            }

            .req-completed-badge {
                color: #0c8b62;
                background: rgba(18, 185, 129, 0.12);
                border: 1px solid rgba(18, 185, 129, 0.4);
            }

            .req-restored-badge {
                color: #b45309;
                background: rgba(245, 158, 11, 0.14);
                border: 1px solid rgba(245, 158, 11, 0.42);
            }

            body.theme-dark .req-restored-badge {
                color: #fbbf24;
                background: rgba(245, 158, 11, 0.18);
                border-color: rgba(245, 158, 11, 0.5);
            }

            .req-empty-state {
                text-align: center;
                color: #6b7f8e;
                padding: 60px 16px;
            }

            body.theme-dark .req-empty-state {
                color: #9ab3c2;
            }

            .req-empty-icon {
                font-size: 44px;
                opacity: 0.65;
                margin-bottom: 10px;
            }

            .req-pagination {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                border-top: 1px solid rgba(12, 44, 62, 0.12);
                background: rgba(15, 110, 143, 0.04);
            }

            body.theme-dark .req-pagination {
                border-top-color: rgba(111, 169, 197, 0.24);
                background: rgba(56, 144, 183, 0.08);
            }

            .req-page-btn {
                border: 1px solid rgba(12, 44, 62, 0.16);
                background: #fff;
                color: #355264;
                border-radius: 8px;
                padding: 7px 12px;
                margin: 0 2px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.16s ease;
            }

            .req-page-btn:hover:not(:disabled) {
                color: #fff;
                border-color: transparent;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
            }

            .req-page-btn.active {
                color: #fff;
                border-color: transparent;
                background: linear-gradient(135deg, #0f6e8f 0%, #0d4f67 100%);
                box-shadow: 0 6px 14px rgba(15, 110, 143, 0.24);
            }

            .req-page-btn:disabled {
                opacity: 0.48;
                cursor: not-allowed;
            }

            .req-pagination-info {
                color: #4d6472;
                font-size: 12px;
                font-weight: 700;
            }

            body.theme-dark .req-pagination-info {
                color: #aac0cd;
            }

            @media (max-width: 900px) {
                #reconciliation-requests-section {
                    padding: 12px 10px;
                }

                .req-header-wrapper {
                    padding: 13px 12px;
                }

                .req-main-title {
                    font-size: 24px;
                }
            }
        `;
        document.head.appendChild(style);

        section.innerHTML = `
            <div class="req-header-wrapper">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h2 class="req-main-title">
                            <span style="font-size: 32px;">📋</span>
                            <span id="reqSectionTitle">طلبات التصفية</span>
                        </h2>
                        <p class="req-subtitle">إدارة ومراجعة طلبات التصفية الواردة من نقاط البيع</p>
                    </div>
                    <div class="d-flex gap-3 align-items-center">
                        <div class="req-tab-container">
                            <button class="req-tab-btn active" onclick="reconciliationRequests.setFilter('pending')" id="tab-pending">
                                🟡 المعلقة
                            </button>
                            <button class="req-tab-btn" onclick="reconciliationRequests.setFilter('completed')" id="tab-completed">
                                ✅ الأرشيف
                            </button>
                        </div>
                        <button class="req-refresh-btn" onclick="reconciliationRequests.loadRequests()">
                            🔄 تحديث
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="req-card">
                <div class="table-responsive">
                    <table class="table mb-0">
                        <thead class="req-table-header">
                            <tr>
                                <th class="text-center" style="width: 90px;">المعرف</th>
                                <th style="width: 220px;">التاريخ والوقت</th>
                                <th>الكاشير</th>
                                <th class="text-end" style="width: 160px;">مبيعات النظام</th>
                                <th class="text-end" style="width: 160px;">الموجود الفعلي</th>
                                <th class="text-end" style="width: 150px;">الفارق</th>
                                <th class="text-center" style="width: 280px;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody id="requestsTableBody">
                            <tr>
                                <td colspan="7" class="req-empty-state">
                                    <div class="req-empty-icon">⏳</div>
                                    <div style="font-size: 16px; font-weight: 600;">جاري تحميل البيانات...</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <!-- Pagination Controls -->
                <div class="req-pagination" id="reqPagination" style="display: none;">
                    <div class="req-pagination-info" id="reqPaginationInfo">
                        عرض 1-20 من 100
                    </div>
                    <div id="reqPaginationButtons">
                        <!-- Buttons will be generated dynamically -->
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(section);
    }

    function updateSectionTitle() {
        const titleEl = document.getElementById('reqSectionTitle');
        if (titleEl) {
            titleEl.textContent = currentFilter === 'pending' ? 'طلبات التصفية المعلقة' : 'أرشيف الطلبات المكتملة';
        }
    }

    function hasDesktopDbBridge() {
        return Boolean(requestsIpc && typeof requestsIpc.invoke === 'function');
    }

    function showRequestsSection() {
        const menuItem = document.querySelector('[data-section="reconciliation-requests"]');
        if (menuItem && typeof menuItem.click === 'function') {
            menuItem.click();
            return;
        }

        const section = document.getElementById('reconciliation-requests-section');
        if (section) {
            section.style.display = '';
            section.classList.add('active');
            loadRequests(currentFilter);
        }
    }

    function buildRequestsWhereClause(status) {
        if (!status || status === 'all') {
            return { sql: '', params: [] };
        }

        return {
            sql: 'WHERE r.status = ?',
            params: [status]
        };
    }

    function normalizeRequestRow(request) {
        let details = {};
        if (request && request.details && typeof request.details === 'object') {
            details = request.details;
        } else if (request && typeof request.details_json === 'string' && request.details_json.trim()) {
            try {
                details = JSON.parse(request.details_json);
            } catch (_error) {
                details = {};
            }
        }

        return {
            ...request,
            cashier_name: request && request.cashier_name ? request.cashier_name : 'غير معروف',
            branch_id: request && request.branch_id ? request.branch_id : null,
            details
        };
    }

    async function loadRequestsFromLocalDb(status, page, limit) {
        const { sql: whereSql, params: whereParams } = buildRequestsWhereClause(status);
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.max(1, parseInt(limit, 10) || REQUESTS_PAGE_SIZE);
        const offset = (safePage - 1) * safeLimit;

        const countRows = await requestsIpc.invoke(
            'db-query',
            `SELECT COUNT(*) AS total
             FROM reconciliation_requests r
             ${whereSql}`,
            whereParams
        );
        const total = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        const rows = await requestsIpc.invoke(
            'db-query',
            `SELECT r.*, c.name AS cashier_name, c.branch_id
             FROM reconciliation_requests r
             LEFT JOIN cashiers c ON r.cashier_id = c.id
             ${whereSql}
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?`,
            [...whereParams, safeLimit, offset]
        );

        return {
            success: true,
            data: Array.isArray(rows) ? rows.map(normalizeRequestRow) : [],
            pagination: {
                total,
                totalPages,
                page: safePage,
                limit: safeLimit
            }
        };
    }

    async function loadRequestsFromServer(status, page, limit) {
        const params = new URLSearchParams({
            status: status || 'pending',
            page: String(page || 1),
            limit: String(limit || REQUESTS_PAGE_SIZE),
            include_details: 'raw'
        });
        const url = getReconciliationRequestsUrl({ preferLocal: false }, `?${params.toString()}`);
        const response = await fetch(url);

        let result = {};
        try {
            result = await response.json();
        } catch (_error) {
            result = {};
        }

        if (!response.ok) {
            const error = new Error(result.error || `HTTP ${response.status}`);
            error.statusCode = response.status;
            throw error;
        }

        return result;
    }

    async function loadRequests(status = currentFilter, page = 1) {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;

        currentFilter = status || 'pending';
        currentPage = Math.max(1, parseInt(page, 10) || 1);
        updateActiveTab(currentFilter);
        updateSectionTitle();

        const loadToken = ++requestLoadToken;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center"><i class="icon">⏳</i> جاري التحميل...</td></tr>';

        try {
            const result = hasDesktopDbBridge()
                ? await loadRequestsFromLocalDb(currentFilter, currentPage, REQUESTS_PAGE_SIZE)
                : await loadRequestsFromServer(currentFilter, currentPage, REQUESTS_PAGE_SIZE);

            if (loadToken !== requestLoadToken) {
                return;
            }

            if (result.success && result.data && result.data.length > 0) {
                requestsData = result.data;
                paginationInfo = result.pagination || { total: 0, totalPages: 0, page: currentPage, limit: REQUESTS_PAGE_SIZE };

                renderRequests(result.data);
                renderPagination();
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="req-empty-state"><div class="req-empty-icon">📭</div><div style="font-size: 16px; font-weight: 600;">لا توجد طلبات لهذا التصنيف</div></td></tr>';
                document.getElementById('reqPagination').style.display = 'none';
            }
        } catch (error) {
            if (loadToken !== requestLoadToken) {
                return;
            }

            if (Number(error && error.statusCode) === 401) {
                tbody.innerHTML = '<tr><td colspan="7" class="req-empty-state"><div class="req-empty-icon">🔒</div><div style="font-size: 16px; font-weight: 600;">يجب تسجيل الدخول في واجهة الويب لعرض هذه الطلبات من الخادم</div></td></tr>';
            } else {
                console.error('Error loading requests:', error);
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">خطأ في الاتصال: ${error.message}</td></tr>`;
            }
            document.getElementById('reqPagination').style.display = 'none';
        }
    }


    function renderRequests(requests) {
        const tbody = document.getElementById('requestsTableBody');
        tbody.innerHTML = '';

        // Get locally reviewed requests (Ensure we handle parsing errors)
        const reviewedStr = localStorage.getItem('reviewed_requests');
        let reviewedIds = [];
        try {
            reviewedIds = reviewedStr ? JSON.parse(reviewedStr) : [];
        } catch (e) {
            console.error('Error parsing reviewed_requests from local storage:', e);
            reviewedIds = [];
        }

        // Normalize to strings for comparison
        const reviewedIdsStr = reviewedIds.map(id => String(id));
        requests.forEach(req => {
            const reqIdStr = String(req.id);
            const isRestored = req.status === 'pending' && !!req.restored_at;
            const isReviewed = !isRestored && reviewedIdsStr.includes(reqIdStr);

            const totalFound = Number(req.total_cash) + Number(req.total_bank);
            const diff = totalFound - Number(req.system_sales);

            const requestDate = new Date(req.created_at);
            const formattedDate = requestDate.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            const formattedTime = requestDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            const tr = document.createElement('tr');
            tr.className = 'req-row';

            let actionsContent = '';

            if (req.status === 'completed') {
                actionsContent = `
                    <div class="d-flex gap-2 justify-content-center align-items-center">
                        <span class="req-status-badge req-completed-badge">
                            ✅ تم الاعتماد
                        </span>
                        <button class="req-action-btn req-btn-danger" onclick="reconciliationRequests.deleteRequest(${req.id})" title="حذف من الأرشيف">
                            🗑️
                        </button>
                    </div>
                 `;
            } else if (isRestored) {
                actionsContent = `
                    <div class="d-flex gap-2 justify-content-center align-items-center flex-wrap">
                        <span class="req-status-badge req-restored-badge" title="تمت إعادة الطلب إلى المعلقات للمراجعة مرة أخرى">
                            ↩️ مسترجعة
                        </span>
                        <button class="req-action-btn req-btn-primary" onclick="reconciliationRequests.openRequestAsReconciliation(${req.id})" title="فتح ومراجعة الطلب المسترجع">
                            فتح ومراجعة
                        </button>
                        <button class="req-action-btn req-btn-danger" onclick="reconciliationRequests.deleteRequest(${req.id})" title="حذف">
                            🗑️
                        </button>
                    </div>
                `;
            } else if (isReviewed) {
                actionsContent = `
                    <div class="d-flex gap-2 justify-content-center align-items-center">
                        <span class="req-reviewed-label">👁️ تمت المشاهدة</span>
                        <button class="req-action-btn req-btn-success" onclick="reconciliationRequests.openRequestAsReconciliation(${req.id})" title="اعتماد الآن">
                            اعتماد
                        </button>
                        <button class="req-action-btn req-btn-danger" onclick="reconciliationRequests.deleteRequest(${req.id})" title="حذف">
                            🗑️
                        </button>
                    </div>
                `;
            } else {
                actionsContent = `
                    <div class="d-flex gap-2 justify-content-center">
                        <button class="req-action-btn req-btn-primary" onclick="reconciliationRequests.openRequestAsReconciliation(${req.id})" title="فتح ومراجعة الطلب">
                            فتح ومراجعة
                        </button>
                        <button class="req-action-btn req-btn-danger" onclick="reconciliationRequests.deleteRequest(${req.id})" title="حذف الطلب">
                            🗑️
                        </button>
                    </div>
                `;
            }

            let diffClass = 'req-diff-zero';
            let diffIcon = '➖';
            if (diff < 0) {
                diffClass = 'req-diff-positive'; // العجز (أحمر)
                diffIcon = '⬇️';
            } else if (diff > 0) {
                diffClass = 'req-diff-negative'; // الزيادة (أخضر)
                diffIcon = '⬆️';
            }

            tr.innerHTML = `
                <td class="text-center">
                    <span class="req-id-badge">#${req.id}</span>
                </td>
                <td>
                    <div class="req-date-main">${formattedDate}</div>
                    <div class="req-date-sub">${formattedTime}</div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="req-cashier-avatar">
                            ${req.cashier_name ? req.cashier_name.charAt(0) : '؟'}
                        </div>
                        <div>
                            <div class="req-cashier-name">${req.cashier_name || 'غير معروف'}</div>
                            <div class="req-cashier-branch">${req.branch_name || 'غير محدد'}</div>
                        </div>
                    </div>
                </td>
                <td class="text-end">
                    <span class="req-amount-badge">
                        ${Number(req.system_sales).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td class="text-end">
                    <span class="req-amount-badge">
                        ${totalFound.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td class="text-end">
                    <span class="${diffClass}">
                        ${diffIcon} ${Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td class="text-center">
                    ${actionsContent}
                </td>
            `;
            tbody.appendChild(tr);
        });

    }



    function parseRequestDetailsSafely(request) {
        if (request && request.details && typeof request.details === 'object') {
            return request.details;
        }

        if (!request || typeof request.details_json !== 'string' || !request.details_json.trim()) {
            return {};
        }

        try {
            const parsed = JSON.parse(request.details_json);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.error('Failed to parse details_json:', error);
            return {};
        }
    }

    function hasMeaningfulRequestDetailsValue(rawValue) {
        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
            return Object.keys(rawValue).length > 0;
        }

        if (typeof rawValue !== 'string') {
            return false;
        }

        const normalized = rawValue.trim();
        return Boolean(normalized) && !['{}', '[]', 'null'].includes(normalized);
    }

    function hasRequestDetails(request) {
        return hasMeaningfulRequestDetailsValue(request?.details)
            || hasMeaningfulRequestDetailsValue(request?.details_json);
    }

    async function fetchRequestDetailsFromLocalDb(requestId) {
        const rows = await requestsIpc.invoke(
            'db-query',
            `SELECT r.*, c.name AS cashier_name, c.branch_id
             FROM reconciliation_requests r
             LEFT JOIN cashiers c ON r.cashier_id = c.id
             WHERE r.id = ?
             LIMIT 1`,
            [requestId]
        );

        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!row) {
            const error = new Error('الطلب غير موجود محلياً');
            error.statusCode = 404;
            throw error;
        }

        return normalizeRequestRow(row);
    }

    async function fetchRequestDetailsFromServer(requestId) {
        const url = getReconciliationRequestsUrl(
            { preferLocal: false },
            `/${requestId}?include_details=raw`
        );
        const response = await fetch(url);

        let result = {};
        try {
            result = await response.json();
        } catch (_error) {
            result = {};
        }

        if (!response.ok || !result.success || !result.data) {
            const error = new Error(result.error || `HTTP ${response.status}`);
            error.statusCode = response.status;
            throw error;
        }

        return normalizeRequestRow(result.data);
    }

    async function fetchRequestDetails(requestId) {
        let localError = null;

        if (hasDesktopDbBridge()) {
            try {
                const localRequest = await fetchRequestDetailsFromLocalDb(requestId);
                if (hasRequestDetails(localRequest)) {
                    return localRequest;
                }
            } catch (error) {
                localError = error;
                console.warn('⚠️ [REVIEW] Failed to load request details from local DB:', error);
            }
        }

        try {
            return await fetchRequestDetailsFromServer(requestId);
        } catch (serverError) {
            if (localError) {
                serverError.localError = localError;
            }
            throw serverError;
        }
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function waitForElementById(id, timeoutMs = 5000, intervalMs = 50) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const element = document.getElementById(id);
            if (element) {
                return element;
            }
            await delay(intervalMs);
        }
        return null;
    }

    async function waitForSelectOptions(selectElement, timeoutMs = 3000, intervalMs = 50) {
        if (!selectElement) {
            return false;
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (selectElement.options && selectElement.options.length > 0) {
                return true;
            }
            await delay(intervalMs);
        }

        return false;
    }

    async function openRequestAsReconciliation(requestId) {
        const existingRequest = requestsData.find(r => r.id === requestId);
        if (!existingRequest) {
            alert('الطلب غير موجود');
            return;
        }

        if (!window.appAPI) {
            alert('خطأ: التطبيق غير جاهز بعد. حاول ثانية.');
            return;
        }

        currentRequestId = requestId;
        const openFlowToken = ++requestOpenFlowToken;
        let request = existingRequest;
        const hasInlineDetails = Boolean(request && hasRequestDetails(request));

        if (!hasInlineDetails) {
            try {
                request = await fetchRequestDetails(requestId);
                requestsData = requestsData.map((item) => (item.id === requestId ? request : item));
            } catch (error) {
                console.error('Failed to fetch full reconciliation request details:', error);
            }
        }

        const details = parseRequestDetailsSafely(request);

        // 1. Prepare Data for "Start Reconciliation" Phase
        // Store details in a global variable to be picked up by handleNewReconciliation
        const pendingData = {
            requestId: request.id, // Track the origin request ID
            systemSales: request.system_sales || 0,
            details: details,
            notes: `📥 طلب من Web: ${request.cashier_name} (${new Date(request.created_at).toLocaleString('en-GB')})\n${request.notes || ''}`,
            cashierName: request.cashier_name,
            cashierId: request.cashier_id, // Ensure ID is passed
            branchId: request.branch_id // Use branch_id instead of branch_name
        };
        window.pendingReconciliationData = pendingData;

        // 2. Pre-fill Header Form (The visible "Start New Reconciliation" card)
        window.appAPI.navigateToNewReconciliation();
        const isFlowActive = () =>
            openFlowToken === requestOpenFlowToken && window.pendingReconciliationData === pendingData;

        try {
            const dateInput = await waitForElementById('reconciliationDate');
            const notesInput = await waitForElementById('filterNotes');
            const branchSelect = await waitForElementById('branchSelect');
            const cashierSelect = await waitForElementById('cashierSelect');

            if (!isFlowActive()) {
                return;
            }

            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }

            if (notesInput) {
                notesInput.value = pendingData.notes;
            }

            // Set branch if available and trigger native listeners.
            if (branchSelect) {
                if (pendingData.branchId) {
                    const branchId = String(pendingData.branchId);
                    const optionExists = Array.from(branchSelect.options).some(opt => opt.value === branchId);

                    if (optionExists) {
                        branchSelect.value = branchId;
                        console.log('✅ [REVIEW] Branch selected by ID:', branchId);
                    } else {
                        console.warn(
                            '⚠️ [REVIEW] Branch ID not found in dropdown:',
                            branchId,
                            'Available:',
                            Array.from(branchSelect.options).map(o => o.value)
                        );
                    }
                }

                branchSelect.dispatchEvent(new Event('change'));
                await delay(120);
            }

            if (!isFlowActive()) {
                return;
            }

            if (cashierSelect) {
                await waitForSelectOptions(cashierSelect, 2500, 60);

                let cashierFound = false;
                if (pendingData.cashierId) {
                    const cashierId = String(pendingData.cashierId);
                    const option = Array.from(cashierSelect.options).find(o => o.value === cashierId);
                    if (option) {
                        cashierSelect.value = cashierId;
                        cashierFound = true;
                        console.log('✅ [REVIEW] Cashier matched by ID:', cashierId);
                    }
                }

                if (!cashierFound && pendingData.cashierName) {
                    const nameToFind = String(pendingData.cashierName).trim();
                    const option = Array.from(cashierSelect.options).find(o =>
                        String(o.text || '').includes(nameToFind)
                    );

                    if (option) {
                        cashierSelect.value = option.value;
                        cashierFound = true;
                        console.log('✅ [REVIEW] Cashier matched by Name:', option.text);
                    }
                }

                if (cashierFound) {
                    cashierSelect.dispatchEvent(new Event('change'));
                } else {
                    console.warn('⚠️ [REVIEW] Cashier could not be auto-selected. Options:', cashierSelect.options.length);
                }
            }

            if (!isFlowActive()) {
                return;
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });

            Swal.fire({
                title: 'جاهز للمراجعة',
                text: 'تم تعبئة بيانات الطلب وتحديد الكاشير. راجع البيانات ثم اضغط "ابدأ التصفية" لتحميل التفاصيل المالية.',
                icon: 'info',
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#0d6efd'
            });
        } catch (error) {
            console.error('❌ [REVIEW] Failed to prepare request for reconciliation:', error);
            Swal.fire({
                title: 'تعذر تجهيز الطلب',
                text: 'حدث خطأ أثناء تجهيز بيانات الطلب للمراجعة. حاول فتح الطلب مرة أخرى.',
                icon: 'error',
                confirmButtonText: 'حسناً'
            });
        }
    }


    // Listen for reconciliation save event from app.js
    window.addEventListener('reconciliation-saved', (event) => {
        console.log('🔔 [EVENT] Reconciliation Saved Event Received:', event.detail);
        const { originRequestId } = event.detail;
        if (originRequestId) {
            markRequestAsDone(originRequestId);
        } else {
            console.warn('⚠️ [EVENT] No originRequestId found in event detail');
        }
    });

    window.addEventListener('reconciliation-request-restored', (event) => {
        console.log('🔔 [EVENT] Reconciliation Request Restored:', event.detail);
        loadRequests(currentFilter, currentPage);
    });

    function markRequestAsDone(requestId) {
        console.log('🔍 [UI] Marking request as done:', requestId);
        const reqIdStr = String(requestId);

        // 1. Save to LocalStorage (Persistent State) - Force String
        const reviewedStr = localStorage.getItem('reviewed_requests');
        let reviewedIds = [];
        try {
            reviewedIds = reviewedStr ? JSON.parse(reviewedStr) : [];
        } catch (e) { reviewedIds = []; }

        // Convert existing to strings to be safe
        reviewedIds = reviewedIds.map(id => String(id));

        if (!reviewedIds.includes(reqIdStr)) {
            reviewedIds.push(reqIdStr);
            localStorage.setItem('reviewed_requests', JSON.stringify(reviewedIds));
            console.log('💾 [STORAGE] Saved reviewed status for ID:', reqIdStr, 'Current List:', reviewedIds);
        } else {
            console.log('ℹ️ [STORAGE] ID already marked as reviewed:', reqIdStr);
        }

        // 2. Update UI (Immediate Feedback)
        // Find the row
        const rows = document.querySelectorAll('#requestsTableBody tr');
        let targetRow = null;

        rows.forEach(row => {
            const idCell = row.cells[0]; // Assuming first cell is ID
            if (idCell) {
                const cellText = idCell.textContent.trim();
                // Check if cell text contains the ID
                if (cellText === `#${reqIdStr}` || cellText === reqIdStr || cellText.includes(reqIdStr)) {
                    targetRow = row;
                }
            }
        });

        if (targetRow) {
            targetRow.classList.add('table-success', 'opacity-75'); // Add green tint
            const actionsCell = targetRow.cells[targetRow.cells.length - 1];
            if (actionsCell) {
                console.log('✏️ [UI] Updating actions cell...');
                actionsCell.innerHTML = `
                    <div class="d-flex gap-2 justify-content-center align-items-center">
                        <span class="req-status-badge req-completed-badge">
                            ✅ تم الاعتماد
                        </span>
                        <button class="req-action-btn req-btn-danger" onclick="reconciliationRequests.deleteRequest(${reqIdStr})" title="حذف من الأرشيف">
                            🗑️
                        </button>
                    </div>
                `;
            }
        }

        // 3. Update Status on Server (Crucial for Persistence so it moves to Archive)
        // Check if sync is enabled before contacting server
        requestsIpc.invoke('get-sync-status').then(syncStatus => {
            if (!syncStatus.success || !syncStatus.isEnabled) {
                console.log('⛔ [SERVER] Sync disabled - skipping server update for request completion');
                return;
            }

            // Sync is enabled, proceed with server update
            fetch(getReconciliationRequestsUrl({ preferLocal: false }, `/${requestId}/complete`), { method: 'POST' })
                .then(async (res) => {
                    const payload = await res.json().catch(() => ({}));
                    return { ok: res.ok, status: res.status, payload };
                })
                .then(data => {
                    if (data.ok && data.payload.success) {
                        console.log('✅ [SERVER] Request marked as completed on server');
                    } else if (data.status === 401) {
                        console.info('ℹ️ [SERVER] Skipping server completion update بسبب عدم وجود جلسة ويب');
                    } else {
                        console.error('❌ [SERVER] Failed to mark request as complete:', data.payload.error);
                    }
                })
                .catch(err => console.error('❌ [SERVER] Network Error:', err));
        }).catch(err => {
            console.error('❌ [SERVER] Failed to check sync status:', err);
            // If we can't check sync status, proceed anyway (fail open)
            fetch(getReconciliationRequestsUrl({ preferLocal: false }, `/${requestId}/complete`), { method: 'POST' })
                .then(async (res) => {
                    const payload = await res.json().catch(() => ({}));
                    return { ok: res.ok, status: res.status, payload };
                })
                .then(data => {
                    if (data.ok && data.payload.success) {
                        console.log('✅ [SERVER] Request marked as completed on server');
                    } else if (data.status === 401) {
                        console.info('ℹ️ [SERVER] Skipping server completion update بسبب عدم وجود جلسة ويب');
                    }
                })
                .catch(err => console.error('❌ [SERVER] Network Error:', err));
        });
    }

    async function deleteRequestLocally(requestId) {
        if (!hasDesktopDbBridge()) {
            return false;
        }

        const result = await requestsIpc.invoke(
            'db-run',
            'DELETE FROM reconciliation_requests WHERE id = ?',
            [requestId]
        );
        return Number(result?.changes || 0) > 0;
    }

    async function deleteAllRequestsLocally() {
        if (!hasDesktopDbBridge()) {
            return false;
        }

        const result = await requestsIpc.invoke(
            'db-run',
            'DELETE FROM reconciliation_requests',
            []
        );
        return Number(result?.changes || 0) >= 0;
    }

    async function deleteRequest(requestId) {
        const swalResult = await Swal.fire({
            title: 'هل أنت متأكد؟',
            text: "لن تتمكن من استرجاع هذا الطلب بعد الحذف!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'نعم، احذفه!',
            cancelButtonText: 'إلغاء'
        });

        if (!swalResult.isConfirmed) return;

        try {
            const deletedLocally = await deleteRequestLocally(requestId);

            // Check if sync is enabled before contacting server
            const syncStatus = await requestsIpc.invoke('get-sync-status');
            if (!syncStatus.success || !syncStatus.isEnabled) {
                console.log('⛔ [SERVER] Sync disabled - skipping server delete');
                Swal.fire({
                    title: 'تم الحذف محلياً',
                    text: 'تم حذف الطلب من النظام المحلي فقط (المزامنة متوقفة)',
                    icon: 'info',
                    timer: 2000,
                    showConfirmButton: false
                });
                if (!deletedLocally) {
                    console.warn('⚠️ [LOCAL] Failed to delete request locally:', requestId);
                }
                loadRequests(currentFilter, currentPage);
                return;
            }

            const response = await fetch(getReconciliationRequestsUrl({ preferLocal: false }, `/${requestId}`), {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                Swal.fire({
                    title: 'تم الحذف!',
                    text: 'تم حذف الطلب بنجاح.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
                loadRequests(currentFilter, currentPage);
            } else if (response.status === 401) {
                Swal.fire({
                    title: 'تم الحذف محلياً',
                    text: 'تم حذف الطلب محلياً، لكن لم يتم حذف النسخة البعيدة لعدم وجود جلسة ويب',
                    icon: 'info',
                    timer: 2000,
                    showConfirmButton: false
                });
                loadRequests(currentFilter, currentPage);
            } else {
                Swal.fire('خطأ', result.error, 'error');
            }
        } catch (error) {
            Swal.fire('خطأ', 'فشل الاتصال بالخادم', 'error');
            console.error(error);
        }
    }

    async function deleteAllRequests() {
        if (!confirm('⚠️ تحذير: هل أنت متأكد من حذف جميع طلبات التصفية (المعلقة والمكتملة)؟\nلا يمكن التراجع عن هذا الإجراء.')) {
            return;
        }

        try {
            await deleteAllRequestsLocally();

            // Check if sync is enabled before contacting server
            const syncStatus = await requestsIpc.invoke('get-sync-status');
            if (!syncStatus.success || !syncStatus.isEnabled) {
                console.log('⛔ [SERVER] Sync disabled - skipping bulk delete on server');
                if (typeof Swal !== 'undefined') {
                    Swal.fire('تم الحذف محلياً', 'تم تنظيف الطلبات محلياً فقط (المزامنة متوقفة)', 'info');
                } else {
                    alert('تم حذف جميع الطلبات محلياً فقط (المزامنة متوقفة)');
                }
                loadRequests(currentFilter, 1);
                return;
            }

            const response = await fetch(getReconciliationRequestsUrl({ preferLocal: false }), {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                // Show simple alert or Swal based on availability
                if (typeof Swal !== 'undefined') {
                    Swal.fire('تم الحذف', 'تم تنظيف كافة الطلبات بنجاح', 'success');
                } else {
                    alert('تم حذف جميع الطلبات بنجاح');
                }
                loadRequests(currentFilter, 1);
            } else if (response.status === 401) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire('تم الحذف محلياً', 'تم تنظيف الطلبات محلياً، لكن لم يتم تنظيف النسخة البعيدة لعدم وجود جلسة ويب', 'info');
                } else {
                    alert('تم حذف جميع الطلبات محلياً فقط لأن جلسة الويب غير متاحة');
                }
                loadRequests(currentFilter, 1);
            } else {
                alert('فشل الحذف: ' + (result.error || 'خطأ غير معروف'));
            }
        } catch (error) {
            console.error('Error deleting all requests:', error);
            alert('خطأ في الاتصال بالسيرفر');
        }
    }

    function renderPagination() {
        const { page, total, totalPages, limit } = paginationInfo;

        const paginationEl = document.getElementById('reqPagination');
        const infoEl = document.getElementById('reqPaginationInfo');
        const buttonsEl = document.getElementById('reqPaginationButtons');

        if (totalPages <= 1) {
            paginationEl.style.display = 'none';
            return;
        }

        paginationEl.style.display = 'flex';

        // Update info text
        const start = (page - 1) * limit + 1;
        const end = Math.min(page * limit, total);
        infoEl.textContent = `عرض ${start}-${end} من ${total}`;

        // Generate page buttons
        let buttonsHTML = '';

        // Previous button
        buttonsHTML += `
            <button class="req-page-btn" onclick="reconciliationRequests.changePage(${page - 1})" ${page === 1 ? 'disabled' : ''}>
                ❮ السابق
            </button>
        `;

        // Page numbers (smart display)
        const maxVisible = 5;
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        // First page
        if (startPage > 1) {
            buttonsHTML += `
                <button class="req-page-btn" onclick="reconciliationRequests.changePage(1)">1</button>
            `;
            if (startPage > 2) {
                buttonsHTML += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
            }
        }

        // Page range
        for (let i = startPage; i <= endPage; i++) {
            buttonsHTML += `
                <button class="req-page-btn ${i === page ? 'active' : ''}" onclick="reconciliationRequests.changePage(${i})">
                    ${i}
                </button>
            `;
        }

        // Last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                buttonsHTML += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
            }
            buttonsHTML += `
                <button class="req-page-btn" onclick="reconciliationRequests.changePage(${totalPages})">${totalPages}</button>
            `;
        }

        // Next button
        buttonsHTML += `
            <button class="req-page-btn" onclick="reconciliationRequests.changePage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>
                التالي ❯
            </button>
        `;

        buttonsEl.innerHTML = buttonsHTML;
    }

    function changePage(newPage) {
        if (newPage < 1 || newPage > paginationInfo.totalPages) return;
        loadRequests(currentFilter, newPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateActiveTab(filter) {
        document.querySelectorAll('.req-tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`tab-${filter}`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    // Export public API
    window.reconciliationRequests = {
        ensureSection: () => {
            createRequestsSection();
            updateSectionTitle();
        },
        loadRequests: (status) => loadRequests(status || currentFilter, currentPage),
        setFilter: (filter) => {
            currentFilter = filter;
            currentPage = 1; // Reset to first page when changing filter
            updateActiveTab(filter);
            loadRequests(filter, 1);
        },
        changePage: changePage,
        openRequestAsReconciliation,
        deleteRequest,
        deleteAllRequests,
        showRequestsSection
    };

})();
