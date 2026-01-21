// Reconciliation Requests Manager for Desktop App
// Handles viewing and approving cashier reconciliation requests

(function () {
    'use strict';

    let requestsData = [];
    let currentRequestId = null;

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

        section.innerHTML = `
            <div class="container-fluid">
                <h2 class="section-title">
                    <i class="icon">📋</i> طلبات التصفية المعلقة
                </h2>
                
                <div class="card shadow-sm">
                    <div class="card-header bg-gradient-primary text-white d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-0">
                                <i class="icon">📥</i> الطلبات الواردة من الكاشيرين
                            </h5>
                            <small class="opacity-75">قم بمراجعة واعتماد الطلبات المعلقة</small>
                        </div>
                        <button class="btn btn-light btn-sm" onclick="reconciliationRequests.loadRequests()" title="تحديث القائمة">
                            <i class="icon">🔄</i> تحديث
                        </button>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover table-striped mb-0 align-middle">
                                <thead class="table-dark">
                                    <tr>
                                        <th class="text-center" style="width: 60px;">#</th>
                                        <th style="width: 180px;">
                                            <i class="icon">📅</i> التاريخ
                                        </th>
                                        <th>
                                            <i class="icon">👤</i> الكاشير
                                        </th>
                                        <th class="text-end" style="width: 140px;">
                                            <i class="icon">💰</i> مبيعات النظام
                                        </th>
                                        <th class="text-end" style="width: 140px;">
                                            <i class="icon">💵</i> إجمالي الموجود
                                        </th>
                                        <th class="text-end" style="width: 120px;">
                                            <i class="icon">📊</i> الفارق
                                        </th>
                                        <th class="text-center" style="width: 240px;">
                                            <i class="icon">⚙️</i> الإجراءات
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="requestsTableBody">
                                    <tr>
                                        <td colspan="7" class="text-center py-5 text-muted">
                                            <div class="spinner-border spinner-border-sm me-2" role="status">
                                                <span class="visually-hidden">Loading...</span>
                                            </div>
                                            جاري التحميل...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(section);
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

            // Load requests
            loadRequests();
        }
    }

    async function loadRequests() {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="text-center"><i class="icon">⏳</i> جاري التحميل...</td></tr>';

        try {
            const response = await fetch('http://localhost:4000/api/reconciliation-requests');
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                requestsData = result.data;
                renderRequests(result.data);
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">لا توجد طلبات معلقة</td></tr>';
            }
        } catch (error) {
            console.error('Error loading requests:', error);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">فشل التحميل. تأكد من تشغيل الخادم.</td></tr>';
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

            let diffClass = 'text-secondary';
            let diffIcon = '➖';
            let diffBadge = 'bg-secondary';

            if (diff < 0) {
                diffClass = 'text-danger';
                diffIcon = '⬇️';
                diffBadge = 'bg-danger';
            } else if (diff > 0) {
                diffClass = 'text-success';
                diffIcon = '⬆️';
                diffBadge = 'bg-success';
            }

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
            tr.className = 'request-row';

            // Apply styling if reviewed
            if (isReviewed) {
                tr.classList.add('table-success', 'opacity-75'); // Visual dimming for reviewed
            }

            const actionsContent = isReviewed ? `
                <span class="badge bg-success fs-6 px-3 py-2">
                    <i class="icon">✅</i> تمت المراجعة
                </span>
            ` : `
                <div class="d-flex gap-2 justify-content-center w-100">
                    <button class="btn btn-primary btn-sm px-4 rounded-3 fw-bold shadow-sm" onclick="reconciliationRequests.openRequestAsReconciliation(${req.id})" title="فتح ومراجعة الطلب">
                        فتح ومراجعة
                    </button>
                    <button class="btn btn-danger btn-sm px-4 rounded-3 fw-bold shadow-sm" onclick="reconciliationRequests.deleteRequest(${req.id})" title="حذف الطلب">
                        حذف
                    </button>
                </div>
            `;

            tr.innerHTML = `
                <td class="text-center fw-bold text-primary">#${req.id}</td>
                <td>
                    <div class="d-flex flex-column">
                        <span class="fw-medium font-monospace">${formattedDate}</span>
                        <small class="text-muted opacity-75 font-monospace">${formattedTime}</small>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-circle bg-info text-white me-2">
                            ${req.cashier_name ? req.cashier_name.charAt(0) : '؟'}
                        </div>
                        <span class="fw-medium">${req.cashier_name || 'غير معروف'}</span>
                    </div>
                </td>
                <td class="text-end">
                    <span class="badge bg-primary fs-6 px-3 py-2 font-monospace">
                        ${Number(req.system_sales).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td class="text-end">
                    <span class="badge bg-info fs-6 px-3 py-2 font-monospace">
                        ${totalFound.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </td>
                <td class="text-end">
                    <span class="badge ${diffBadge} fs-6 px-3 py-2 font-monospace">
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
            branchName: request.branch_name
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
            if (branchSelect && window.pendingReconciliationData.branchName) {
                const branchToFind = window.pendingReconciliationData.branchName;
                console.log('🏢 [REVIEW] Trying to set branch:', branchToFind);

                for (let i = 0; i < branchSelect.options.length; i++) {
                    const option = branchSelect.options[i];
                    if (option.text.includes(branchToFind) || branchToFind.includes(option.text)) {
                        branchSelect.value = option.value;
                        console.log('✅ [REVIEW] Branch selected:', option.text);
                        branchSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }

            // 4. Set Cashier (Wait for branch change to propagate)
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
                        console.warn('❌ [REVIEW] Cashier could not be auto-selected');
                    }
                }
            }, 300); // Small delay to allow branch change to update cashier list

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
                <span class="badge bg-success fs-6 px-3 py-2">
                    <i class="icon">✅</i> تمت المراجعة
                </span>
            `;
            }
        }
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

    // Export public API
    window.reconciliationRequests = {
        loadRequests,
        openRequestAsReconciliation,
        deleteRequest,
        showRequestsSection
    };

})();
