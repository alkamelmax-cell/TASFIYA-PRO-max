// ===================================================
// 📘 Unified Customer Ledger - merged from variants
// - Preserves: reconciled transactions, manual transactions, printing, modal handling
// - Uses safe IPC channels already present in the app: 'db-query', 'add-manual-transaction', 'add-statement-transaction', 'get-print-manager'
// - Keeps UI hooks identical (onclick exposure, element ids)
// ===================================================

const ledgerIpc = require('electron').ipcRenderer;
const modalHandler = require('./modal-handler');
const { translateReason } = require('./reason-translator');

// Print manager instance (requested from main)
let printManager = null;

// Initialize print manager when app starts (best-effort)
document.addEventListener('DOMContentLoaded', async function() {
  try {
    printManager = await ledgerIpc.invoke('get-print-manager');
    console.log('✅ [PRINT-MANAGER] Print manager initialized');
    // also expose to window for older callers
    window.printManager = printManager;
  } catch (error) {
    console.warn('[get-print-manager] not available or failed:', error && error.message ? error.message : error);
  }
});

(function initCustomerLedger() {
  attachLedgerEventListeners();

  // Load when side menu clicked
  const ledgerMenu = document.querySelector('a[data-section="customer-ledger"]');
  if (ledgerMenu) {
    ledgerMenu.addEventListener('click', () => {
      try {
        loadCustomerLedgerFilters();
        loadCustomerLedger();
      } catch (e) {
        console.error('Ledger init on nav error:', e);
      }
    });
  }

  // Expose for inline onclick usage
  window.showCustomerStatement = showCustomerStatement;
})();

function attachLedgerEventListeners() {
  const searchBtn = document.getElementById('ledgerSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', handleLedgerSearch);

  const clearBtn = document.getElementById('ledgerClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', handleLedgerClear);

  const onlyBalance = document.getElementById('ledgerOnlyWithBalance');
  if (onlyBalance) onlyBalance.addEventListener('change', handleLedgerSearch);
}

function loadCustomerLedgerFilters() {
  const nameInput = document.getElementById('ledgerSearchName');
  const dateFrom = document.getElementById('ledgerDateFrom');
  const dateTo = document.getElementById('ledgerDateTo');
  const onlyBalance = document.getElementById('ledgerOnlyWithBalance');

  if (nameInput && nameInput.value == null) nameInput.value = '';
  if (dateFrom && dateFrom.value == null) dateFrom.value = '';
  if (dateTo && dateTo.value == null) dateTo.value = '';
  if (onlyBalance && onlyBalance.checked == null) onlyBalance.checked = false;
}

function getLedgerFilters() {
  return {
    name: (document.getElementById('ledgerSearchName')?.value || '').trim(),
    dateFrom: (document.getElementById('ledgerDateFrom')?.value || '').trim(),
    dateTo: (document.getElementById('ledgerDateTo')?.value || '').trim(),
    onlyWithBalance: !!document.getElementById('ledgerOnlyWithBalance')?.checked
  };
}

function handleLedgerSearch() { loadCustomerLedger(); }
function handleLedgerClear() {
  const nameInput = document.getElementById('ledgerSearchName');
  const dateFrom = document.getElementById('ledgerDateFrom');
  const dateTo = document.getElementById('ledgerDateTo');
  const onlyBalance = document.getElementById('ledgerOnlyWithBalance');

  if (nameInput) nameInput.value = '';
  if (dateFrom) dateFrom.value = '';
  if (dateTo) dateTo.value = '';
  if (onlyBalance) onlyBalance.checked = false;

  loadCustomerLedger();
}

function buildLedgerQuery(filters) {
  // Build a UNION of reconciled and manual transactions, then aggregate per customer.
  let dateFilter = '';
  const dateParams = [];
  if (filters.dateFrom) { dateFilter += ' AND (r.reconciliation_date >= ? OR created_at >= ?)'; dateParams.push(filters.dateFrom, filters.dateFrom); }
  if (filters.dateTo) { dateFilter += ' AND (r.reconciliation_date <= ? OR created_at <= ?)'; dateParams.push(filters.dateTo, filters.dateTo); }

  let nameFilter = '';
  const nameParams = [];
  if (filters.name) { nameFilter = ' AND t_cust LIKE ?'; nameParams.push(`%${filters.name}%`); }

  const sub1 = `
    SELECT ps.customer_name AS t_cust,
           ps.amount AS t_amount,
           'postpaid' AS t_type,
           r.reconciliation_date AS t_date,
           ps.created_at AS t_created
    FROM postpaid_sales ps
    LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
    WHERE 1=1 ${dateFilter}
  `;

  const sub1Manual = `
    SELECT customer_name AS t_cust,
           amount AS t_amount,
           'postpaid' AS t_type,
           created_at AS t_date,
           created_at AS t_created
    FROM manual_postpaid_sales
    WHERE 1=1 ${dateFilter.replace(/r\.reconciliation_date/g, 'created_at')}
  `;

  const sub2 = `
    SELECT cr.customer_name AS t_cust,
           cr.amount AS t_amount,
           'receipt' AS t_type,
           r.reconciliation_date AS t_date,
           cr.created_at AS t_created
    FROM customer_receipts cr
    LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
    WHERE 1=1 ${dateFilter}
  `;

  const sub2Manual = `
    SELECT customer_name AS t_cust,
           amount AS t_amount,
           'receipt' AS t_type,
           created_at AS t_date,
           created_at AS t_created
    FROM manual_customer_receipts
    WHERE 1=1 ${dateFilter.replace(/r\.reconciliation_date/g, 'created_at')}
  `;

  const unioned = `
    SELECT * FROM (
      ${sub1}
      UNION ALL
      ${sub1Manual}
      UNION ALL
      ${sub2}
      UNION ALL
      ${sub2Manual}
    ) all_tx
    WHERE 1=1 ${nameFilter}
  `;

  const sql = `
    SELECT
      t_cust AS customer_name,
      COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount END), 0) AS total_postpaid,
      COALESCE(SUM(CASE WHEN t_type = 'receipt' THEN t_amount END), 0) AS total_receipts,
      COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount ELSE -t_amount END), 0) AS balance,
      COUNT(*) AS movements_count,
      MAX(t_date) AS last_tx_date
    FROM (
      ${unioned}
    ) t
    GROUP BY t_cust
    ${filters.onlyWithBalance ? "HAVING COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount ELSE -t_amount END), 0) > 0" : ''}
    ORDER BY balance DESC, customer_name ASC
  `;

  const params = [
    ...dateParams, // for sub1
    ...dateParams, // for sub1Manual
    ...dateParams, // for sub2
    ...dateParams, // for sub2Manual
    ...nameParams
  ];

  return { sql, params };
}

async function loadCustomerLedger() {
  try {
    const tbody = document.getElementById('customerLedgerTable');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">جاري التحميل...</td></tr>`;

    const filters = getLedgerFilters();
    const { sql, params } = buildLedgerQuery(filters);

    const rows = await ledgerIpc.invoke('db-query', sql, params);
    renderLedgerTable(rows || []);
  } catch (error) {
    console.error('Error loading customer ledger:', error);
    const tbody = document.getElementById('customerLedgerTable');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">حدث خطأ أثناء تحميل البيانات</td></tr>`;
  }
}

function renderLedgerTable(rows) {
  const tbody = document.getElementById('customerLedgerTable');
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">لا توجد بيانات مطابقة</td></tr>`;
    return;
  }

  const fmt = getCurrencyFormatter();
  tbody.innerHTML = rows.map(r => {
    const lastDate = r.last_tx_date ? escapeHtml(r.last_tx_date) : '-';
    return `
      <tr>
        <td>${escapeHtml(r.customer_name || '')}</td>
        <td class="text-currency">${fmt(r.total_postpaid || 0)}</td>
        <td class="text-currency">${fmt(r.total_receipts || 0)}</td>
        <td class="text-currency fw-bold ${Number(r.balance) > 0 ? 'text-deficit' : (Number(r.balance) < 0 ? 'text-success' : '')}">
          ${fmt(r.balance || 0)}
        </td>
        <td>${lastDate}</td>
        <td>${r.movements_count || 0}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="showCustomerStatement('${escapeAttr(r.customer_name || '')}')">كشف حساب</button>
        </td>
      </tr>
    `;
  }).join('');
}

// --------- Statement (single customer) ---------
async function showCustomerStatement(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);

    // Reconciled transactions
    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason
      FROM customer_receipts cr
      LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
      WHERE cr.customer_name = ?
      ${dateFilter.sql}
    `;

    // Manual transactions
    const sqlManualPost = `
      SELECT amount, 'postpaid' as type, created_at as tx_date,
             created_at, 'يدوي' as rec_no, reason
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const sqlManualRec = `
      SELECT amount, 'receipt' as type, created_at as tx_date,
             created_at, 'يدوي' as rec_no, reason
      FROM manual_customer_receipts
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const params = [...dateFilter.params, name];
    const paramsRec = [...dateFilter.params, name];

    const postTx = await ledgerIpc.invoke('db-query', sqlPost, params) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, paramsRec) || [];
    const manualPostTx = await ledgerIpc.invoke('db-query', sqlManualPost, paramsRec) || [];
    const manualRecTx = await ledgerIpc.invoke('db-query', sqlManualRec, paramsRec) || [];

    const allTx = [...postTx, ...recTx, ...manualPostTx, ...manualRecTx].sort((a, b) => {
      // Normalize to comparable strings/dates
      const ad = new Date(a.tx_date || a.created_at || '');
      const bd = new Date(b.tx_date || b.created_at || '');
      if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
      const as = (a.tx_date || a.created_at || '').toString();
      const bs = (b.tx_date || b.created_at || '').toString();
      const c = as.localeCompare(bs);
      if (c !== 0) return c;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // Compute running balance and totals
    let running = 0;
    let totalPost = 0;
    let totalRec = 0;
    const fmt = getCurrencyFormatter();

    const rowsHtml = allTx.map(t => {
      if (t.type === 'postpaid') { running += Number(t.amount || 0); totalPost += Number(t.amount || 0); }
      else { running -= Number(t.amount || 0); totalRec += Number(t.amount || 0); }

      const kind = t.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
      const reasonText = translateReason(t.reason || '-');
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const d = t.tx_date || t.created_at || '';
      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
        </tr>
      `;
    }).join('');

    const balance = totalPost - totalRec;

    const mTitle = document.getElementById('customerStatementTitle');
    if (mTitle) mTitle.textContent = `كشف حساب - ${name}`;

    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(totalPost);
    if (sRec) sRec.textContent = fmt(totalRec);
    if (sBal) sBal.textContent = fmt(balance);

    const tbody = document.getElementById('customerStatementTable');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>`;

    setupStatementEvents(name);
    // show modal via modalHandler if present, else try bootstrap modal
    if (modalHandler && typeof modalHandler.setupStatementModal === 'function') {
      modalHandler.setupStatementModal(customerName);
    } else {
      const modalEl = document.getElementById('customerStatementModal');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      }
    }
  } catch (error) {
    console.error('Error showing customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء عرض كشف الحساب: ' + (error && error.message ? error.message : error));
  }
}

function setupStatementEvents(customerName) {
  const addBtn = document.getElementById('addTransactionBtn');
  if (addBtn) {
    addBtn.replaceWith(addBtn.cloneNode(true));
    const newAddBtn = document.getElementById('addTransactionBtn');
    newAddBtn.addEventListener('click', () => addNewTransaction(customerName));
  }

  const printBtn = document.getElementById('printStatementBtn');
  if (printBtn) {
    printBtn.replaceWith(printBtn.cloneNode(true));
    const newPrintBtn = document.getElementById('printStatementBtn');
    newPrintBtn.addEventListener('click', () => printCustomerStatement(customerName));
  }
}

async function addNewTransaction(customerName) {
  try {
    const typeEl = document.getElementById('newTransactionType');
    const amountEl = document.getElementById('newTransactionAmount');
    const reasonEl = document.getElementById('newTransactionReason');
    const type = typeEl?.value;
    const amount = parseFloat(amountEl?.value) || 0;
    const reason = reasonEl?.value || '';

    if (!customerName || !type || amount <= 0) {
      showTransactionAlert('الرجاء ملء الحقول المطلوبة بشكل صحيح', 'danger');
      return;
    }

    // For statement modal we only add manual transactions (no reconciliations)
    // This ensures adding a new tx from the statement does NOT create a reconciliation.
    const payload = { customerName, type, amount, reason, date: new Date().toISOString() };
    let result = null;
    try {
      result = await ledgerIpc.invoke('add-manual-transaction', payload);
    } catch (e) {
      console.error('add-manual-transaction IPC failed, error:', e);
      result = { success: false, error: e && e.message ? e.message : String(e) };
    }

    if (result && result.success) {
      // Reload statement to reflect new tx (keep modal open so user can add more if needed)
      showCustomerStatement(customerName);
      showTransactionAlert('تمت إضافة الحركة بنجاح', 'success');
      // NOTE: we intentionally DO NOT close the statement modal here to avoid unexpected exits
    } else {
      showTransactionAlert('فشلت عملية إضافة الحركة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
    }
  } catch (error) {
    console.error('Error adding transaction:', error);
    showTransactionAlert('حدث خطأ أثناء إضافة الحركة: ' + (error && error.message ? error.message : error));
  }
}

function showTransactionAlert(message, type = 'info') {
  const alertEl = document.getElementById('transactionAlert');
  if (alertEl) {
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
    setTimeout(() => { alertEl.style.display = 'none'; }, 5000);
  } else {
    console.log('ALERT:', message);
  }
}

async function printCustomerStatement(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);

    // Use the same sql used in showCustomerStatement but without manual notes change
    const sql = `
      SELECT * FROM (
        SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
               ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason
        FROM postpaid_sales ps
        LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
        WHERE ps.customer_name = ?
        ${dateFilter.sql}

        UNION ALL

        SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
               cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason
        FROM customer_receipts cr
        LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
        WHERE cr.customer_name = ?
        ${dateFilter.sql}

        UNION ALL

        SELECT amount, 'postpaid' as type, created_at as tx_date,
               created_at, 'يدوي' as rec_no, reason
        FROM manual_postpaid_sales
        WHERE customer_name = ?
        ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}

        UNION ALL

        SELECT amount, 'receipt' as type, created_at as tx_date,
               created_at, 'يدوي' as rec_no, reason
        FROM manual_customer_receipts
        WHERE customer_name = ?
        ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
      ) all_tx
      ORDER BY tx_date ASC, created_at ASC
    `;

    const params = [
      ...dateFilter.params, name,
      ...dateFilter.params, name,
      ...dateFilter.params, name,
      ...dateFilter.params, name
    ];

    const allTx = await ledgerIpc.invoke('db-query', sql, params) || [];

    let running = 0; let totalPost = 0; let totalRec = 0; const fmt = getCurrencyFormatter();
    const rowsHtml = allTx.map(t => {
      if (t.type === 'postpaid') { running += Number(t.amount || 0); totalPost += Number(t.amount || 0); }
      else { running -= Number(t.amount || 0); totalRec += Number(t.amount || 0); }
      const kind = t.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
      const reasonText = translateReason(t.reason || '-');
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const d = t.tx_date || t.created_at || '';
      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
        </tr>
      `;
    }).join('');

    const balance = totalPost - totalRec;

    const printHTML = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>كشف حساب - ${customerName}</title>
        <style>
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size:14px; line-height:1.5 }
            .header { text-align:center; margin-bottom:20px }
            .summary { display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #ddd; padding-bottom:10px }
            table { width:100%; border-collapse:collapse }
            th, td { border:1px solid #ddd; padding:8px; text-align:right }
            th { background:#f2f2f2 }
            .text-currency { font-family: monospace }
            .text-deficit { color:#dc3545 }
            .text-success { color:#28a745 }
            .footer { margin-top:20px; text-align:center; font-size:12px; color:#666 }
            @media print { body { margin:0; padding:0 } .no-print{display:none} }
        </style>
    </head>
    <body>
        <div class="header"><h2>كشف حساب - ${customerName}</h2><p>تاريخ الطباعة: ${formatDateTime(new Date())}</p></div>
        <div class="summary">
          <div class="summary-item"><div class="label">إجمالي المبيعات الآجلة</div><div class="value text-currency text-deficit">${fmt(totalPost)}</div></div>
          <div class="summary-item"><div class="label">إجمالي المقبوضات</div><div class="value text-currency text-success">${fmt(totalRec)}</div></div>
          <div class="summary-item"><div class="label">الرصيد</div><div class="value text-currency ${balance > 0 ? 'text-deficit' : balance < 0 ? 'text-success' : ''}">${fmt(balance)}</div></div>
        </div>
        <table>
          <thead><tr><th>التاريخ</th><th>النوع</th><th>السبب</th><th>رقم التصفية</th><th>المبلغ</th><th>الرصيد التراكمي</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>'}</tbody>
        </table>
        <div class="footer">تطبيق تصفية برو - جميع الحقوق محفوظة © 2025</div>
    </body>
    </html>
    `;

    if (printManager) {
      try {
        const result = await printManager.printWithPreview(printHTML);
        if (result && result.success) showTransactionAlert('تمت طباعة كشف الحساب بنجاح', 'success');
        else showTransactionAlert('فشلت عملية الطباعة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
        return;
      } catch (err) {
        console.warn('printManager error:', err);
      }
    }

    // fallback to window printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      printWindow.print();
    } else {
      showTransactionAlert('فشل فتح نافذة الطباعة. تأكد من إعدادات المتصفح/المستعرض.', 'danger');
    }
  } catch (error) {
    console.error('Error printing customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء الطباعة: ' + (error && error.message ? error.message : error), 'danger');
  }
}

function buildDateFilter(filters) {
  let sql = '';
  const params = [];
  if (filters.dateFrom) { sql += ' AND r.reconciliation_date >= ?'; params.push(filters.dateFrom); }
  if (filters.dateTo) { sql += ' AND r.reconciliation_date <= ?'; params.push(filters.dateTo); }
  return { sql, params };
}

function getCurrencyFormatter() {
  if (typeof window.formatCurrency === 'function') return window.formatCurrency;
  return function(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    try { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount)); }
    catch { return Number(amount).toFixed(2); }
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return String(str || '').replace(/['"\\]/g, s => ({"'":'&#39;','"':'&quot;','\\':'\\\\'}[s]));
}

function formatDateTime(dateTimeString) {
  if (!dateTimeString) return 'غير محدد';
  try {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return 'غير محدد';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return 'غير محدد';
  }
}
