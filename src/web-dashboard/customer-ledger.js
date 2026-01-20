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
            <td class="d-none d-md-table-cell text-center" style="text-align: center !important;">${row.last_transaction ? new Date(row.last_transaction).toLocaleDateString('en-GB') : '-'}</td>
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

function renderLedgerTable(data) {
    const tbody = document.getElementById('ledgerTableBody');
    tbody.innerHTML = '';
    document.getElementById('recordCount').textContent = `${data.length} حركة`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5"><div class="text-muted opacity-50"><i class="fas fa-inbox fa-3x mb-3"></i><br>لا توجد حركات للعرض</div></td></tr>`;
        return;
    }

    // 1. Calculate running balance first (on chronological order)
    let runningBalance = 0;
    data.forEach(row => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);
        runningBalance += debit - credit;
        row.currentBalance = runningBalance;
    });

    // 2. Reverse data to show newest first
    const reversedData = [...data].reverse();

    reversedData.forEach((row, index) => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);

        const cashierDisplay = row.cashier_name
            ? `#${row.reconciliation_number || '?'} - ${row.cashier_name}`
            : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-white text-center" style="text-align: center !important;">${data.length - index}</td>
            <td class="text-center" style="text-align: center !important;">${new Date(row.created_at).toLocaleDateString('en-GB')}</td>
            <td class="text-center" style="text-align: center !important;">
                <span class="badge ${debit > 0 ? 'bg-danger' : 'bg-success'}">${row.type}</span>
                <div class="small text-secondary mt-1 text-nowrap" style="font-size: 0.65rem; opacity: 0.8;">${cashierDisplay}</div>
            </td>
            <td>${row.description || '-'}</td>
            <td class="text-danger font-monospace text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${debit > 0 ? formatCurrency(debit) : '-'}</span></div>
            </td>
            <td class="text-success font-monospace text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${credit > 0 ? formatCurrency(credit) : '-'}</span></div>
            </td>
            <td class="text-info font-monospace fw-bold text-center" style="text-align: center !important;">
                <div class="d-flex justify-content-center align-items-center"><span dir="ltr">${formatCurrency(row.currentBalance)}</span></div>
            </td>
        `;
        tbody.appendChild(tr);
    });
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

function showLoading(show) {
    const el = document.getElementById('loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}
