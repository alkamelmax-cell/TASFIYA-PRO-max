// ===================================================
// 📘 واجهة دفتر العملاء - Customer Ledger Module
// يعتمد فقط على استدعاءات قاعدة البيانات الموجودة دون التأثير على الطباعة أو تسجيل الدخول
// ===================================================

const ledgerIpc = require('electron').ipcRenderer;
const { translateReason } = require('./reason-translator');

// Print manager instance
let printManager = null;

// Initialize print manager when app starts
document.addEventListener('DOMContentLoaded', async function() {
  try {
    printManager = await ledgerIpc.invoke('get-print-manager');
    console.log('✅ [PRINT-MANAGER] Print manager initialized');
  } catch (error) {
    console.error('❌ [PRINT-MANAGER] Failed to initialize print manager:', error);
  }
});

(function initCustomerLedger() {
  // إرفاق المستمعات عند توفر العناصر في DOM
  attachLedgerEventListeners();

  // تحميل الدفتر عند الانتقال للقائمة من الشريط الجانبي
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

  // إتاحة الدوال على النطاق العام عند الحاجة لاستخدام onclick
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
  // لا نضع تواريخ افتراضية لإظهار جميع الحركات، يمكن للمستخدم تصفيتها
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

function handleLedgerSearch() {
  loadCustomerLedger();
}

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
  // نبني فلاتر التاريخ والاسم لتطبق على كلا الجدولين داخل UNION ALL
  let dateFilter = '';
  const dateParams = [];
  if (filters.dateFrom) {
    dateFilter += ' AND r.reconciliation_date >= ?';
    dateParams.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    dateFilter += ' AND r.reconciliation_date <= ?';
    dateParams.push(filters.dateTo);
  }

  let nameFilter = '';
  const nameParams = [];
  if (filters.name) {
    nameFilter = ' AND t_cust LIKE ?';
    nameParams.push(`%${filters.name}%`);
  }

  // نستخدم أسماء أعمدة موحدة (t_cust, t_amount, t_type, t_date, t_created)
  const sub1 = `
    SELECT ps.customer_name AS t_cust,
           ps.amount AS t_amount,
           'postpaid' AS t_type,
           r.reconciliation_date AS t_date,
           ps.created_at AS t_created
    FROM postpaid_sales ps
    JOIN reconciliations r ON r.id = ps.reconciliation_id
    WHERE r.status = 'completed' ${dateFilter}
  `;

  const sub2 = `
    SELECT cr.customer_name AS t_cust,
           cr.amount AS t_amount,
           'receipt' AS t_type,
           r.reconciliation_date AS t_date,
           cr.created_at AS t_created
    FROM customer_receipts cr
    JOIN reconciliations r ON r.id = cr.reconciliation_id
    WHERE r.status = 'completed' ${dateFilter}
  `;

  const unioned = `
    SELECT * FROM (
      ${sub1}
      UNION ALL
      ${sub2}
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

  // ترتيب المعاملات: تاريخ sub1, تاريخ sub2, اسم sub-union
  const params = [
    ...dateParams, // sub1
    ...dateParams, // sub2
    ...nameParams  // union name filter
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

async function showCustomerStatement(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    // جلب فلاتر التاريخ من أعلى دفتر العملاء
    const filters = getLedgerFilters();

    const dateFilter = buildDateFilter(filters);
    const paramsPost = [...dateFilter.params, name];
    const paramsRec = [...dateFilter.params, name];

    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM postpaid_sales ps
      JOIN reconciliations r ON r.id = ps.reconciliation_id
      WHERE r.status='completed' ${dateFilter.sql} AND ps.customer_name = ?
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM customer_receipts cr
      JOIN reconciliations r ON r.id = cr.reconciliation_id
      WHERE r.status='completed' ${dateFilter.sql} AND cr.customer_name = ?
    `;

    const postTx = await ledgerIpc.invoke('db-query', sqlPost, paramsPost) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, paramsRec) || [];

    const allTx = [...postTx, ...recTx].sort((a, b) => {
      const ad = (a.tx_date || '').localeCompare(b.tx_date || '');
      if (ad !== 0) return ad;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // حساب الرصيد التراكمي: المبيعات الآجلة تزيد الرصيد، المقبوضات تنقص الرصيد
    let running = 0;
    let totalPost = 0;
    let totalRec = 0;
    const fmt = getCurrencyFormatter();

    const rowsHtml = allTx.map(t => {
      if (t.type === 'postpaid') {
        running += Number(t.amount || 0);
        totalPost += Number(t.amount || 0);
      } else {
        running -= Number(t.amount || 0);
        totalRec += Number(t.amount || 0);
      }
      const kind = t.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
      const reasonText = t.reason || '-';
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const d = t.tx_date || '';
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

    // تعبئة الملخص والجداول داخل المودال
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

    // إعداد أحداث الإضافة والطباعة
    setupStatementEvents(name);

    // عرض المودال
    const modalEl = document.getElementById('customerStatementModal');
    if (modalEl && window.bootstrap?.Modal) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  } catch (error) {
    console.error('Error showing customer statement:', error);
  }
}

function setupStatementEvents(customerName) {
  // إعداد حدث إضافة حركة جديدة
  const addBtn = document.getElementById('addTransactionBtn');
  if (addBtn) {
    // إزالة أي مستمعين سابقين
    addBtn.replaceWith(addBtn.cloneNode(true));
    const newAddBtn = document.getElementById('addTransactionBtn');
    newAddBtn.addEventListener('click', () => addNewTransaction(customerName));
  }

  // إعداد حدث الطباعة
  const printBtn = document.getElementById('printStatementBtn');
  if (printBtn) {
    // إزالة أي مستمعين سابقين
    printBtn.replaceWith(printBtn.cloneNode(true));
    const newPrintBtn = document.getElementById('printStatementBtn');
    newPrintBtn.addEventListener('click', () => printCustomerStatement(customerName));
  }
}

async function addNewTransaction(customerName) {
  try {
    const type = document.getElementById('newTransactionType').value;
    const amount = parseFloat(document.getElementById('newTransactionAmount').value) || 0;
    const reason = document.getElementById('newTransactionReason').value;

    if (!customerName || !type || amount <= 0) {
      showTransactionAlert('الرجاء ملء الحقول المطلوبة بشكل صحيح', 'danger');
      return;
    }

    // تحديث قاعدة البيانات
    const result = await ledgerIpc.invoke('add-statement-transaction', {
      customerName,
      type,
      amount,
      reason
    });

    if (result && result.success) {
      // إعادة تحميل كشف الحساب
      showCustomerStatement(customerName);
      showTransactionAlert('تمت إضافة الحركة بنجاح', 'success');
    } else {
      showTransactionAlert('فشلت عملية إضافة الحركة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
    }
  } catch (error) {
    console.error('Error adding transaction:', error);
    showTransactionAlert('حدث خطأ أثناء إضافة الحركة: ' + error.message, 'danger');
  }
}

function showTransactionAlert(message, type) {
  const alertEl = document.getElementById('transactionAlert');
  if (alertEl) {
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';

    // إخفاء الرسالة بعد 5 ثوانٍ
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 5000);
  }
}

async function printCustomerStatement(customerName) {
  try {
    // الحصول على بيانات كشف الحساب الحالية
    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);
    const paramsPost = [...dateFilter.params, customerName];
    const paramsRec = [...dateFilter.params, customerName];

    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM postpaid_sales ps
      JOIN reconciliations r ON r.id = ps.reconciliation_id
      WHERE r.status='completed' ${dateFilter.sql} AND ps.customer_name = ?
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM customer_receipts cr
      JOIN reconciliations r ON r.id = cr.reconciliation_id
      WHERE r.status='completed' ${dateFilter.sql} AND cr.customer_name = ?
    `;

    const postTx = await ledgerIpc.invoke('db-query', sqlPost, paramsPost) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, paramsRec) || [];

    const allTx = [...postTx, ...recTx].sort((a, b) => {
      const ad = (a.tx_date || '').localeCompare(b.tx_date || '');
      if (ad !== 0) return ad;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // حساب الرصيد التراكمي
    let running = 0;
    let totalPost = 0;
    let totalRec = 0;
    const fmt = getCurrencyFormatter();

    const rowsHtml = allTx.map(t => {
      if (t.type === 'postpaid') {
        running += Number(t.amount || 0);
        totalPost += Number(t.amount || 0);
      } else {
        running -= Number(t.amount || 0);
        totalRec += Number(t.amount || 0);
      }
      const kind = t.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
      const reasonText = t.reason || '-';
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const d = t.tx_date || '';
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

    // إنشاء HTML للطباعة
    const printHTML = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>كشف حساب - ${customerName}</title>
        <style>
            body {
                font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                line-height: 1.5;
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header h2 {
                margin: 0;
                font-size: 18px;
            }
            .summary {
                display: flex;
                justify-content: space-between;
                margin-bottom: 20px;
                border-bottom: 1px solid #ddd;
                padding-bottom: 10px;
            }
            .summary-item {
                text-align: center;
            }
            .summary-item .label {
                font-size: 12px;
                color: #666;
            }
            .summary-item .value {
                font-weight: bold;
                font-size: 16px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: right;
            }
            th {
                background-color: #f2f2f2;
            }
            .text-currency {
                font-family: monospace;
            }
            .text-deficit {
                color: #dc3545;
            }
            .text-success {
                color: #28a745;
            }
            .footer {
                margin-top: 20px;
                text-align: center;
                font-size: 12px;
                color: #666;
            }
            @media print {
                body { margin: 0; padding: 0; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>كشف حساب - ${customerName}</h2>
            <p>تاريخ الطباعة: ${formatDateTime(new Date())}</p>
        </div>

        <div class="summary">
            <div class="summary-item">
                <div class="label">إجمالي المبيعات الآجلة</div>
                <div class="value text-currency text-deficit">${fmt(totalPost)}</div>
            </div>
            <div class="summary-item">
                <div class="label">إجمالي المقبوضات</div>
                <div class="value text-currency text-success">${fmt(totalRec)}</div>
            </div>
            <div class="summary-item">
                <div class="label">الرصيد</div>
                <div class="value text-currency ${balance > 0 ? 'text-deficit' : balance < 0 ? 'text-success' : ''}">${fmt(balance)}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>السبب</th>
                    <th>رقم التصفية</th>
                    <th>المبلغ</th>
                    <th>الرصيد التراكمي</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml || '<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>'}
            </tbody>
        </table>

        <div class="footer">
            تطبيق تصفية برو - جميع الحقوق محفوظة © 2025
        </div>
    </body>
    </html>
    `;

    // استخدام PrintManager للطباعة
    if (printManager) {
      const result = await printManager.printWithPreview(printHTML);
      if (result && result.success) {
        showTransactionAlert('تمت طباعة كشف الحساب بنجاح', 'success');
      } else {
        showTransactionAlert('فشلت عملية الطباعة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
      }
    } else {
      // بديل مباشر إذا لم يتوفر PrintManager
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printHTML);
        printWindow.document.close();
        printWindow.print();
      } else {
        showTransactionAlert('فشل فتح نافذة للطباعة (محمول أو محجوب).', 'danger');
      }
    }
  } catch (error) {
    console.error('Error printing customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء طباعة كشف الحساب: ' + error.message, 'danger');
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
  // استخدام formatCurrency إن كانت معرفة عالمياً وإلا fallback
  if (typeof window.formatCurrency === 'function') return window.formatCurrency;
  return function(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    try {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
    } catch {
      return Number(amount).toFixed(2);
    }
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  // Escape characters used in HTML attributes: single quote, double quote and backslash
  return String(str || '').replace(/['"\\]/g, s => ({"'":'&#39;','"':'&quot;','\\':'\\\\'}[s]));
}

function formatDateTime(dateTimeString) {
  if (!dateTimeString) return 'غير محدد';

  try {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return 'غير محدد';

    // Format as DD/MM/YYYY HH:MM using English numbers
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