// @ts-nocheck
// Reconciliation Requests Manager for Desktop App
// Handles viewing and approving cashier reconciliation requests

(function () {
    'use strict';

    let requestsData = [];
    let currentRequestId = null;
    let currentFilter = 'pending'; // 'pending' or 'completed'
    let currentPage = 1;
    let paginationInfo = { total: 0, totalPages: 0, page: 1, limit: 20 };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Wait a bit for app.js to fully load and expose appAPI
        setTimeout(init, 1000);
    }

    function init() {
        createRequestsSection();
        attachMenuListener();
        console.log('✅ Reconciliation Requests Manager initialized');
    }

    function createRequestsSection() {
        const mainContent = document.getElementById('mainContent') || document.querySelector('.main-content');
        if (!mainContent || document.getElementById('reconciliation-requests-section')) {
            return;
        }

        const section = document.createElement('div');
        section.id = 'reconciliation-requests-section';
        section.className = 'content-section';
        section.style.display = 'none';

        // Enhanced CSS matching app theme
        const style = document.createElement('style');
        style.textContent = `
            #reconciliation-requests-section {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 0;
            }
            
            .req-header-wrapper {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                padding: 20px 30px;
                border-bottom: 3px solid rgba(102, 126, 234, 0.3);
                box-shadow: 0 2px 15px rgba(0,0,0,0.08);
            }
            
            .req-main-title {
                font-size: 28px;
                font-weight: 700;
                color: #2d3748;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .req-subtitle {
                color: #718096;
                font-size: 14px;
                margin: 5px 0 0 0;
            }
            
            .req-tab-container {
                background: white;
                border-radius: 12px;
                padding: 6px;
                display: inline-flex;
                gap: 6px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .req-tab-btn {
                border: none;
                background: transparent;
                padding: 10px 24px;
                font-weight: 600;
                font-size: 14px;
                color: #64748b;
                border-radius: 8px;
                transition: all 0.3s ease;
                cursor: pointer;
                position: relative;
            }
            
            .req-tab-btn:hover {
                background: rgba(102, 126, 234, 0.1);
                color: #667eea;
                transform: translateY(-1px);
            }
            
            .req-tab-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .req-refresh-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                padding: 10px 24px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            
            .req-refresh-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            
            .req-card {
                background: white;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                margin: 20px 30px;
            }
            
            .req-table-header {
                background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                color: white;
                font-weight: 600;
                text-transform: uppercase;
                font-size: 12px;
                letter-spacing: 1px;
            }
            
            .req-table-header th {
                padding: 18px 16px !important;
                border: none !important;
            }
            
            .req-row {
                transition: all 0.2s ease;
                border-bottom: 1px solid #f1f5f9;
            }
            
            .req-row:hover {
                background: linear-gradient(90deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
                transform: translateX(4px);
            }
            
            .req-row td {
                padding: 20px 16px !important;
                vertical-align: middle !important;
            }
            
            .req-id-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 6px 14px;
                border-radius: 20px;
                font-weight: 700;
                font-size: 13px;
                display: inline-block;
                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            }
            
            .req-cashier-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 16px;
                margin-right: 12px;
                box-shadow: 0 3px 10px rgba(102, 126, 234, 0.3);
            }
            
            .req-amount-badge {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 700;
                font-family: 'Courier New', monospace;
                font-size: 15px;
                display: inline-block;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
            }
            
            .req-diff-positive {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 700;
                box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
            }
            
            .req-diff-negative {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 700;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
            }
            
            .req-diff-zero {
                background: linear-gradient(135deg, #64748b 0%, #475569 100%);
                color: white;
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 700;
            }
            
            .req-action-btn {
                padding: 10px 20px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 13px;
                border: none;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .req-action-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            
            .req-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .req-btn-success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
            }
            
            .req-btn-danger {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
            }
            
            .req-status-badge {
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 13px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            
            .req-completed-badge {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%);
                color: #059669;
                border: 2px solid #10b981;
            }
            
            .req-empty-state {
                text-align: center;
                padding: 80px 20px;
                color: #94a3b8;
            }
            
            .req-empty-icon {
                font-size: 64px;
                margin-bottom: 16px;
                opacity: 0.5;
            }
            
            .req-pagination {
                padding: 24px 30px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 2px solid #f1f5f9;
                background: #f8f9fa;
            }
            
            .req-page-btn {
                padding: 8px 16px;
                border: none;
                background: white;
                color: #64748b;
                font-weight: 600;
                font-size: 14px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                margin: 0 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .req-page-btn:hover:not(:disabled) {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            
            .req-page-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .req-page-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            
            .req-pagination-info {
                color: #64748b;
                font-size: 14px;
                font-weight: 500;
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

    function attachMenuListener() {
        const menuItem = document.querySelector('[data-section="reconciliation-requests"]');
        if (menuItem) {
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                showRequestsSection();
            });
        }
    }

    function showRequestsSection() {
        // 1. Remove active class from all menu items
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));

        // 2. Hide all content sections by removing active class AND clearing inline display styles
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
            section.style.display = ''; // Clear any inline styles causing the lock
        });

        // 3. Show this section
        const section = document.getElementById('reconciliation-requests-section');
        if (section) {
            section.classList.add('active');

            // Add active class to menu item
            const menuItem = document.querySelector('[data-section="reconciliation-requests"]');
            if (menuItem) menuItem.classList.add('active');

            // Load requests using current filter
            loadRequests(currentFilter);
        }
    }

    async function loadRequests(status = 'pending', page = 1) {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="text-center"><i class="icon">⏳</i> جاري التحميل...</td></tr>';

        try {
            const response = await fetch(`http://localhost:4000/api/reconciliation-requests?status=${status}&page=${page}&limit=20`);
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                requestsData = result.data;
                paginationInfo = result.pagination || { total: 0, totalPages: 0, page: 1, limit: 20 };
                currentPage = page;

                renderRequests(result.data);
                renderPagination();
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="req-empty-state"><div class="req-empty-icon">📭</div><div style="font-size: 16px; font-weight: 600;">لا توجد طلبات لهذا التصنيف</div></td></tr>';
                document.getElementById('reqPagination').style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading requests:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">خطأ في الاتصال: ${error.message}</td></tr>`;
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
        console.log('📂 [RENDER] Loaded reviewed IDs:', reviewedIdsStr);

        requests.forEach(req => {
            const reqIdStr = String(req.id);
            const isReviewed = reviewedIdsStr.includes(reqIdStr);

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
            } else if (isReviewed) {
                actionsContent = `
                    <div class="d-flex gap-2 justify-content-center align-items-center">
                        <span style="color: #94a3b8; font-size: 12px;">👁️ تمت المشاهدة</span>
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
                    <div style="font-weight: 600; color: #2d3748; font-size: 14px;">${formattedDate}</div>
                    <div style="color: #94a3b8; font-size: 12px; font-family: monospace;">${formattedTime}</div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="req-cashier-avatar">
                            ${req.cashier_name ? req.cashier_name.charAt(0) : '؟'}
                        </div>
                        <div>
                            <div style="font-weight: 600; color: #2d3748;">${req.cashier_name || 'غير معروف'}</div>
                            <div style="font-size: 12px; color: #94a3b8;">${req.branch_name || 'غير محدد'}</div>
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

        // Add CSS ... (omitted, existing styles remain)
        if (!document.getElementById('request-styles')) {
            const style = document.createElement('style');
            style.id = 'request-styles';
            style.textContent = `
                .avatar-circle {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 14px;
                }
                .request-row {
                    transition: all 0.2s ease;
                }
                .request-row:hover {
                    background-color: rgba(13, 110, 253, 0.05) !important;
                    transform: translateX(-2px);
                }
            `;
            document.head.appendChild(style);
        }
    }



    async function openRequestAsReconciliation(requestId) {
        const request = requestsData.find(r => r.id === requestId);
        if (!request) {
            alert('الطلب غير موجود');
            return;
        }

        if (!window.appAPI) {
            alert('خطأ: التطبيق غير جاهز بعد. حاول ثانية.');
            return;
        }

        currentRequestId = requestId;

        // Parse details
        let details = {};
        try {
            details = JSON.parse(request.details_json);
        } catch (e) {
            console.error('Failed to parse details:', e);
        }

        // 1. Prepare Data for "Start Reconciliation" Phase
        // Store details in a global variable to be picked up by handleNewReconciliation
        window.pendingReconciliationData = {
            requestId: request.id, // Track the origin request ID
            systemSales: request.system_sales || 0,
            details: details,
            notes: `📥 طلب من Web: ${request.cashier_name} (${new Date(request.created_at).toLocaleString('en-GB')})\n${request.notes || ''}`,
            cashierName: request.cashier_name,
            cashierId: request.cashier_id, // Ensure ID is passed
            branchId: request.branch_id // Use branch_id instead of branch_name
        };

        // 2. Pre-fill Header Form (The visible "Start New Reconciliation" card)
        window.appAPI.navigateToNewReconciliation();

        setTimeout(() => {
            // 1. Set Date
            const dateInput = document.getElementById('reconciliationDate');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

            // 2. Set Notes
            const notesInput = document.getElementById('filterNotes');
            if (notesInput) notesInput.value = window.pendingReconciliationData.notes;

            // 3. Set Branch FIRST (To filter cashiers properly)
            const branchSelect = document.getElementById('branchSelect');

            // NEW APPROACH: Use branch_id directly instead of matching by name
            if (branchSelect && window.pendingReconciliationData.branchId) {
                const branchId = window.pendingReconciliationData.branchId;
                console.log('🏢 [REVIEW] Setting branch by ID:', branchId);

                // DEBUG: Log all available branch options
                console.log('🏢 [DEBUG] Available branches in dropdown:');
                for (let i = 0; i < branchSelect.options.length; i++) {
                    console.log(`  [${i}] value="${branchSelect.options[i].value}" text="${branchSelect.options[i].text}"`);
                }

                // Direct assignment by value (ID)
                const optionExists = Array.from(branchSelect.options).some(opt => opt.value == branchId);
                if (optionExists) {
                    branchSelect.value = branchId;
                    console.log('✅ [REVIEW] Branch selected by ID:', branchId);
                    branchSelect.dispatchEvent(new Event('change'));
                } else {
                    console.warn('⚠️ [REVIEW] Branch ID', branchId, 'not found in dropdown. Available values:',
                        Array.from(branchSelect.options).map(o => o.value));
                    // Still trigger change to load cashiers
                    branchSelect.dispatchEvent(new Event('change'));
                }
            } else {
                console.log('🏢 [REVIEW] No branch ID provided or branchSelect not found');
                // If no branch specified, ensure we trigger change to load all cashiers
                if (branchSelect) branchSelect.dispatchEvent(new Event('change'));
            }

            // 4. Set Cashier (Wait for branch change to propagate and populate list)
            setTimeout(() => {
                const cashierSelect = document.getElementById('cashierSelect');
                if (cashierSelect) {
                    let found = false;

                    // Try finding by ID first (Most accurate)
                    if (window.pendingReconciliationData.cashierId) {
                        const option = Array.from(cashierSelect.options).find(o => o.value == window.pendingReconciliationData.cashierId);
                        if (option) {
                            cashierSelect.value = window.pendingReconciliationData.cashierId;
                            found = true;
                            console.log('✅ [REVIEW] Cashier matched by ID:', window.pendingReconciliationData.cashierId);
                        }
                    }

                    // Fallback to Name
                    if (!found && window.pendingReconciliationData.cashierName) {
                        const nameToFind = window.pendingReconciliationData.cashierName;
                        console.log('⚠️ [REVIEW] Cashier ID match failed, verifying by name:', nameToFind);

                        for (let i = 0; i < cashierSelect.options.length; i++) {
                            const option = cashierSelect.options[i];
                            if (option.text.includes(nameToFind)) {
                                cashierSelect.value = option.value;
                                found = true;
                                console.log('✅ [REVIEW] Cashier matched by Name:', option.text);
                                break;
                            }
                        }
                    }

                    if (found) {
                        cashierSelect.dispatchEvent(new Event('change'));
                    } else {
                        console.warn('❌ [REVIEW] Cashier could not be auto-selected. List size:', cashierSelect.options.length);
                    }
                }
            }, 800); // Increased delay to ensure branch change fully propagates and cashiers are loaded

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Notify User
            Swal.fire({
                title: 'جاهز للمراجعة',
                text: 'تم تعبئة بيانات الطلب وتحديد الكاشير. راجع البيانات ثم اضغط "ابدأ التصفية" لتحميل التفاصيل المالية.',
                icon: 'info',
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#0d6efd'
            });
        }, 500);
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
        fetch(`http://localhost:4000/api/reconciliation-requests/${requestId}/complete`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ [SERVER] Request marked as completed on server');
                } else {
                    console.error('❌ [SERVER] Failed to mark request as complete:', data.error);
                }
            })
            .catch(err => console.error('❌ [SERVER] Network Error:', err));
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
            const response = await fetch(`http://localhost:4000/api/reconciliation-requests/${requestId}`, {
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
                loadRequests();
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
            const response = await fetch('http://localhost:4000/api/reconciliation-requests', {
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
                loadRequests(currentFilter);
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
