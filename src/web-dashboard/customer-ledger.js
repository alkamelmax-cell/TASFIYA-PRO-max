const API_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = '/login.html';
    }
    const user = JSON.parse(userStr || '{}');
    if (document.getElementById('userNameDisplay'))
        document.getElementById('userNameDisplay').textContent = user.name || 'Admin';

    // Navbar Protection Logic
    const protectedPages = [
        'atm-reports.html',
        'customer-ledger.html',
        'users-management.html',
        'cashiers-management.html',
        'reconciliation-requests.html',
        'request-reconciliation.html'
    ];

    if (user.permissions && Array.isArray(user.permissions)) {
        protectedPages.forEach(page => {
            if (!user.permissions.includes(page)) {
                const el = document.querySelector(`a[href="${page}"]`);
                if (el) el.classList.add('d-none');
            }
        });
    } else if (user.role && user.role !== 'admin') {
        protectedPages.forEach(page => {
            const el = document.querySelector(`a[href="${page}"]`);
            if (el) el.classList.add('d-none');
        });
    }

    const isAllowed = (user.role === 'admin') || (user.permissions && user.permissions.includes('customer-ledger.html'));
    if (!isAllowed) {
        console.warn('⛔ وصول غير مصرح به. إعادة التوجيه للصفحة الرئيسية.');
        window.location.href = 'index.html';
        return; // Stop execution
    }

    // Initial Load
    await loadBranches();
    await loadCustomersSummary();
});

function logout() {
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

let allCustomersData = [];

// ================== LIST VIEW LOGIC ==================

async function loadBranches() {
    try {
        const res = await fetch(`${API_URL}/lookups`);
        const data = await res.json();
        if (data.success && data.branches) {
            const select = document.getElementById('filterBranchList');
            // Clear existing (except first) if reloaded, but here it runs once
            data.branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.name;
                opt.textContent = b.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading branches:', e); }
}

async function loadCustomersSummary() {
    showLoading(true);
    try {
        const res = await fetch(`${API_URL}/customers-summary`);
        const result = await res.json();

        if (result.success) {
            allCustomersData = result.data;
            renderCustomersTable(allCustomersData);
        } else {
            console.error(result.error);
        }
    } catch (e) {
        console.error('Error loading summary:', e);
    } finally {
        showLoading(false);
    }
}

function filterCustomersList() {
    const searchText = document.getElementById('searchCustomerInput').value.toLowerCase();
    const branchFilter = document.getElementById('filterBranchList').value;

    const filtered = allCustomersData.filter(row => {
        const nameMatch = row.customer_name.toLowerCase().includes(searchText);
        // Note: Currently backend doesn't return branch_name, so it uses the fallback in render
        // To make filter work effectively, we might need real branch data later.
        // For now, it filters based on what will be displayed.
        const rowBranch = row.branch_name || 'اسواق العواجي - الفرع الرئيسي';
        const branchMatch = branchFilter === 'all' || rowBranch === branchFilter;

        return nameMatch && branchMatch;
    });

    renderCustomersTable(filtered);
}

function renderCustomersTable(data) {
    const tbody = document.getElementById('customersSummaryTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5"><div class="text-muted opacity-50">لا توجد نتائج</div></td></tr>`;
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        // Using static branch name for now as requested by user image style, or backend data if available
        const branchName = row.branch_name || 'اسواق العواجي - الفرع الرئيسي';

        tr.innerHTML = `
            <td class="fw-bold text-white text-center" style="text-align: center !important;">${row.customer_name}</td>
            <td class="small text-secondary d-none d-md-table-cell text-center" style="text-align: center !important;">${branchName}</td>
            <td class="text-danger fw-bold d-none d-md-table-cell text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center"><span dir="ltr">${formatCurrency(row.total_debit)}</span></div>
            </td>
            <td class="text-success fw-bold d-none d-md-table-cell text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center"><span dir="ltr">${formatCurrency(row.total_credit)}</span></div>
            </td>
            <td class="text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center"><span dir="ltr">${formatCurrency(row.balance)}</span></div>
            </td>
            <td class="d-none d-md-table-cell text-center" style="text-align: center !important;">
                ${row.last_transaction && row.last_transaction !== "''" ? new Date(row.last_transaction).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
            </td>
            <td class="d-none d-md-table-cell text-center" style="text-align: center !important;">${row.transaction_count}</td>
            <td class="text-center" style="text-align: center !important;">
                <button class="btn btn-sm btn-primary btn-action-mobile" onclick="viewCustomerStatement('${row.customer_name}')">
                    <i class="fas fa-file-invoice me-1"></i> كشف
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ================== DETAILS VIEW LOGIC ==================

function viewCustomerStatement(customerName) {
    // Set customer name
    document.getElementById('currentCustomerName').value = customerName;
    document.getElementById('selectedCustomerTitle').textContent = `تفاصيل العميل: ${customerName}`;

    // Switch views
    document.getElementById('customersListSection').classList.add('d-none');
    document.getElementById('customerDetailsSection').classList.remove('d-none');

    // Clear filters
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';

    // Load Data
    loadCustomerLedger(customerName);
}

function showListView() {
    document.getElementById('customerDetailsSection').classList.add('d-none');
    document.getElementById('customersListSection').classList.remove('d-none');
    loadCustomersSummary(); // Refresh list
}

function refreshLedger() {
    const customerName = document.getElementById('currentCustomerName').value;
    if (customerName) loadCustomerLedger(customerName);
}

async function loadCustomerLedger(customerName) {
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    showLoading(true);
    try {
        const params = new URLSearchParams({ customerName: customerName });
        if (dateFrom) params.append('dateFrom', dateFrom);
        if (dateTo) params.append('dateTo', dateTo);

        const res = await fetch(`${API_URL}/customer-ledger?${params.toString()}`);
        const result = await res.json();

        if (result.success) {
            currentLedgerData = result.data; // Store globally
            renderLedgerTable(result.data);
            calculateStats(result.data);
        } else {
            alert('حدث خطأ: ' + result.error);
        }
    } catch (e) {
        console.error(e);
        alert('فشل الاتصال بالخادم');
    } finally {
        showLoading(false);
    }
}

let currentLedgerData = [];

function renderLedgerTable(data) {
    const isElectron = /Electron/i.test(navigator.userAgent);
    const tbody = document.getElementById('ledgerTableBody');
    const cardsContainer = document.getElementById('ledgerCardsContainer');

    tbody.innerHTML = '';
    if (cardsContainer) cardsContainer.innerHTML = '';

    document.getElementById('recordCount').textContent = `${data.length} حركة`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5"><div class="text-muted opacity-50"><i class="fas fa-inbox fa-3x mb-3"></i><br>لا توجد حركات للعرض</div></td></tr>`;
        if (cardsContainer) {
            cardsContainer.innerHTML = `<div class="text-center py-5 text-muted opacity-50"><i class="fas fa-inbox fa-3x mb-3"></i><br>لا توجد حركات للعرض</div>`;
        }
        return;
    }

    // 1. Calculate running balance
    let runningBalance = 0;
    data.forEach(row => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);
        runningBalance += debit - credit;
        row.currentBalance = runningBalance;
    });

    // 2. Reverse to show newest first
    const reversedData = [...data].reverse();

    // 3. Render DESKTOP Table
    reversedData.forEach((row, index) => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);
        const cashierDisplay = row.cashier_name ? `#${row.reconciliation_number || '?'} - ${row.cashier_name}` : '-';

        const isManual = row.type === 'مبيعات يدوية' || row.type === 'سند قبض يدوي';

        // Show edit button ONLY inside the Desktop App Window
        const editBtn = (isManual && isElectron) ?
            `<button class="btn btn-sm btn-link text-warning p-0 ms-2" onclick="openEditModal(${row.id}, '${row.type}', '${row.created_at}', ${debit > 0 ? debit : credit}, '${(row.description || '').replace(/'/g, "\\'")}')" title="تعديل"><i class="fas fa-edit"></i></button>`
            : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-white text-center d-none d-md-table-cell">${data.length - index}</td>
            <td class="text-center">${new Date(row.created_at).toLocaleDateString('en-GB')}</td>
            <td class="text-center">
                <span class="badge ${debit > 0 ? 'bg-danger' : 'bg-success'}" style="font-size: 0.65rem;">${row.type}</span>
                <div class="small text-secondary mt-1 text-nowrap d-block d-md-none" style="font-size: 0.6rem; opacity: 0.8;">${cashierDisplay}</div>
            </td>
            <td class="d-none d-md-table-cell">
                <span class="text-break">${row.description || '-'}</span>
                ${editBtn}
            </td>
            <td class="text-danger font-monospace text-center d-none d-md-table-cell">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${debit > 0 ? formatCurrency(debit) : '-'}</span></div>
            </td>
            <td class="text-success font-monospace text-center d-none d-md-table-cell">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${credit > 0 ? formatCurrency(credit) : '-'}</span></div>
            </td>
            <td class="text-info font-monospace fw-bold text-center d-none d-md-table-cell">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${formatCurrency(row.currentBalance)}</span></div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 4. Render MOBILE Cards
    if (cardsContainer) {
        reversedData.forEach((row, index) => {
            const debit = Number(row.debit || 0);
            const credit = Number(row.credit || 0);
            const amount = debit > 0 ? debit : credit;
            const amountType = debit > 0 ? 'debit' : 'credit';
            const cashierDisplay = row.cashier_name ? `#${row.reconciliation_number || '?'} - ${row.cashier_name}` : '';

            const isManual = row.type === 'مبيعات يدوية' || row.type === 'سند قبض يدوي';

            // Use parent scope isElectron
            const editBtnMobile = (isManual && isElectron) ?
                `<button class="btn btn-sm btn-ghost text-warning ms-1 p-0" style="width:24px;height:24px;" onclick="openEditModal(${row.id}, '${row.type}', '${row.created_at}', ${amount}, '${(row.description || '').replace(/'/g, "\\'")}')"><i class="fas fa-edit fa-xs"></i></button>`
                : '';

            const card = document.createElement('div');
            card.className = 'ledger-card';
            card.innerHTML = `
                <div class="ledger-card-header">
                    <span class="ledger-card-date"><i class="fas fa-calendar-alt me-1"></i>${new Date(row.created_at).toLocaleDateString('en-GB')}</span>
                    <div>
                        ${editBtnMobile}
                        <span class="badge ${debit > 0 ? 'bg-danger' : 'bg-success'}">${row.type}</span>
                    </div>
                </div>
                <div class="ledger-card-body">
                    <div class="ledger-card-amount ${amountType}">
                        <div class="amount-label">${debit > 0 ? 'مدين' : 'دائن'}</div>
                        <div class="amount-value" dir="ltr">${formatCurrency(amount)}</div>
                    </div>
                    ${cashierDisplay ? `<div class="ledger-card-cashier"><i class="fas fa-user me-1"></i>${cashierDisplay}</div>` : ''}
                    ${row.description ? `<div class="ledger-card-desc">${row.description}</div>` : ''}
                </div>
            `;
            cardsContainer.appendChild(card);
        });
    }
}

function calculateStats(data) {
    let totalDebit = 0;
    let totalCredit = 0;

    data.forEach(r => {
        totalDebit += Number(r.debit || 0);
        totalCredit += Number(r.credit || 0);
    });

    const balance = totalDebit - totalCredit;

    document.getElementById('statsTotalDebit').textContent = formatCurrency(totalDebit);
    document.getElementById('statsTotalCredit').textContent = formatCurrency(totalCredit);
    document.getElementById('statsBalance').textContent = formatCurrency(balance);
}

// Helpers
function formatCurrency(val) {
    return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ================== EDIT FUNCTIONS ==================

let editModalInstance = null;

function openEditModal(id, type, dateStr, amount, desc) {
    document.getElementById('editTransId').value = id;
    document.getElementById('editTransType').value = type;

    // Format date for input[type="date"] (YYYY-MM-DD)
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    // document.getElementById('editTransDate').value = `${yyyy}-${mm}-${dd}`;
    // Using simple split if string is already suitable, but Date object is safer.
    document.getElementById('editTransDate').value = d.toISOString().split('T')[0];

    document.getElementById('editTransAmount').value = amount;
    document.getElementById('editTransDesc').value = desc;

    if (!editModalInstance) {
        editModalInstance = new bootstrap.Modal(document.getElementById('editTransactionModal'));
    }
    editModalInstance.show();
}

async function saveTransactionUpdate() {
    const id = document.getElementById('editTransId').value;
    const type = document.getElementById('editTransType').value;
    const date = document.getElementById('editTransDate').value; // YYYY-MM-DD
    const amount = document.getElementById('editTransAmount').value;
    const desc = document.getElementById('editTransDesc').value;

    if (!date || !amount) {
        Swal.fire('تنبيه', 'يرجى ملء التاريخ والمبلغ', 'warning');
        return;
    }

    // Determine backend action type
    // type is 'مبيعات يدوية' (debit) or 'سند قبض يدوي' (credit)
    const mode = (type === 'مبيعات يدوية') ? 'debit' : 'credit';

    try {
        const res = await fetch(`${API_URL}/update-manual-transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                mode: mode, // 'debit' or 'credit'
                date: date,
                amount: amount,
                description: desc
            })
        });

        const result = await res.json();
        if (result.success) {
            editModalInstance.hide();
            Swal.fire({
                icon: 'success',
                title: 'تم الحفظ',
                text: 'تم تحديث الحركة بنجاح',
                timer: 1500,
                showConfirmButton: false
            });
            refreshLedger(); // Reload table
        } else {
            Swal.fire('خطأ', result.error, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

async function deleteTransaction() {
    const id = document.getElementById('editTransId').value;
    const type = document.getElementById('editTransType').value;
    const mode = (type === 'مبيعات يدوية') ? 'debit' : 'credit';

    const confirm = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "لا يمكن التراجع عن حذف هذه الحركة",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذفها',
        cancelButtonText: 'إلغاء'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_URL}/delete-manual-transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, mode })
            });
            const result = await res.json();

            if (result.success) {
                editModalInstance.hide();
                Swal.fire({
                    icon: 'success',
                    title: 'تم الحذف',
                    timer: 1500,
                    showConfirmButton: false
                });
                refreshLedger();
            } else {
                Swal.fire('خطأ', result.error, 'error');
            }
        } catch (e) {
            Swal.fire('خطأ', 'فشل الحذف', 'error');
        }
    }
}

function showLoading(show) {
    const el = document.getElementById('loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}
