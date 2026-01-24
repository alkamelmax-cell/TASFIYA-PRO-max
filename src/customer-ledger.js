// ===================================================
// 📘 Unified Customer Ledger - merged from variants
// - Preserves: reconciled transactions, manual transactions, printing, modal handling
// - Uses safe IPC channels already present in the app: 'db-query', 'add-manual-transaction', 'add-statement-transaction', 'get-print-manager'
// - Keeps UI hooks identical (onclick exposure, element ids)
// ===================================================

console.log('✅ [CUSTOMER-LEDGER] تم تحميل ملف customer-ledger.js بنجاح');

const ledgerIpc = require('electron').ipcRenderer;
const modalHandler = require('./modal-handler');
const { translateReason } = require('./reason-translator');

// Print manager instance (requested from main)
let printManager = null;

// Initialize print manager when app starts (best-effort)
document.addEventListener('DOMContentLoaded', async function () {
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
  window.editCustomerData = editCustomerData;
})();

async function editCustomerData(customerName) {
  try {
    // جلب معرف العميل
    // جلب بيانات العميل مع آخر فرع تعامل معه
    const sql = `
      SELECT DISTINCT customer_name
      FROM (
        SELECT customer_name FROM customer_receipts WHERE customer_name = ?
        UNION
        SELECT customer_name FROM postpaid_sales WHERE customer_name = ?
      ) t
      LIMIT 1
    `;
    const customer = await ledgerIpc.invoke('db-query', sql, [customerName, customerName]);

    if (!customer || customer.length === 0) {
      showTransactionAlert('لم يتم العثور على بيانات العميل', 'danger');
      return;
    }

    // إنشاء نافذة تعديل البيانات
    const modalContent = `
      <div class="modal fade" id="editCustomerModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">تعديل بيانات العميل</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="editCustomerForm">
                <div class="mb-3">
                  <label class="form-label">اسم العميل</label>
                  <input type="text" class="form-control" id="editCustomerName" value="${escapeHtml(customer[0].customer_name)}" required>
                </div>
                <div id="editCustomerAlert" class="alert" style="display: none;"></div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
              <button type="button" class="btn btn-primary" onclick="updateCustomerData('${escapeAttr(customerName)}')"><i class="fas fa-save"></i> حفظ التغييرات</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // إضافة النافذة للصفحة
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalContent;
    document.body.appendChild(modalDiv);

    // عرض النافذة
    const modal = new bootstrap.Modal(document.getElementById('editCustomerModal'));
    modal.show();

    // إزالة النافذة عند الإغلاق
    document.getElementById('editCustomerModal').addEventListener('hidden.bs.modal', function () {
      this.remove();
    });

  } catch (error) {
    console.error('Error loading customer data:', error);
    showTransactionAlert('حدث خطأ أثناء تحميل بيانات العميل', 'danger');
  }
}

async function updateCustomerData(oldCustomerName) {
  try {
    const editBtn = document.querySelector('#editCustomerModal .btn-primary');
    if (editBtn) {
      editBtn.disabled = true;
      editBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> جاري الحفظ...';
    }

    const newName = document.getElementById('editCustomerName').value.trim();

    if (!newName) {
      showEditCustomerAlert('الرجاء إدخال اسم العميل', 'danger');
      if (editBtn) {
        editBtn.disabled = false;
        editBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التغييرات';
      }
      return;
    }

    console.log('💾 [تحديث] جاري تحديث بيانات العميل:', {
      oldCustomerName,
      newName
    });

    // تحديث بيانات العميل
    const result = await ledgerIpc.invoke('update-customer-data', {
      oldCustomerName,
      newName
    });

    console.log('💾 [تحديث] نتيجة التحديث:', result);

    if (result && result.success) {
      showEditCustomerAlert('تم تحديث بيانات العميل بنجاح', 'success');

      // إعادة تحميل جدول العملاء فوراً
      await loadCustomerLedger();

      // إغلاق النافذة بعد التحديث
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('editCustomerModal'));
        if (modal) modal.hide();
      }, 1000);
    } else {
      showEditCustomerAlert('فشل تحديث بيانات العميل: ' + (result?.error || 'خطأ غير معروف'), 'danger');
      if (editBtn) {
        editBtn.disabled = false;
        editBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التغييرات';
      }
    }
  } catch (error) {
    console.error('Error updating customer data:', error);
    showEditCustomerAlert('حدث خطأ أثناء تحديث بيانات العميل: ' + error.message, 'danger');
  }
}

function showEditCustomerAlert(message, type = 'info') {
  const alertEl = document.getElementById('editCustomerAlert');
  if (alertEl) {
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
  }
}

function attachLedgerEventListeners() {
  const searchBtn = document.getElementById('ledgerSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', handleLedgerSearch);

  const clearBtn = document.getElementById('ledgerClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', handleLedgerClear);

  const onlyBalance = document.getElementById('ledgerOnlyWithBalance');
  if (onlyBalance) onlyBalance.addEventListener('change', handleLedgerSearch);
}

async function loadCustomerLedgerFilters() {
  const nameInput = document.getElementById('ledgerSearchName');
  const dateFrom = document.getElementById('ledgerDateFrom');
  const dateTo = document.getElementById('ledgerDateTo');
  const onlyBalance = document.getElementById('ledgerOnlyWithBalance');
  const branchFilter = document.getElementById('ledgerBranchFilter');

  if (nameInput && nameInput.value == null) nameInput.value = '';
  if (dateFrom && dateFrom.value == null) dateFrom.value = '';
  if (dateTo && dateTo.value == null) dateTo.value = '';
  if (onlyBalance && onlyBalance.checked == null) onlyBalance.checked = false;

  // Load branches for filter
  if (branchFilter) {
    try {
      const branches = await ledgerIpc.invoke('db-query',
        'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
      );

      // Keep the first option (placeholder)
      const placeholder = branchFilter.querySelector('option[value=""]');
      branchFilter.innerHTML = '';
      if (placeholder) {
        branchFilter.appendChild(placeholder);
      }

      // Add branches to dropdown
      branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.branch_name;
        branchFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading branches for ledger filter:', error);
    }
  }
}

function getLedgerFilters() {
  return {
    branchId: (document.getElementById('ledgerBranchFilter')?.value || '').trim(),
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

  let branchFilter = '';
  const branchParams = [];
  if (filters.branchId) { branchFilter = ' AND c.branch_id = ?'; branchParams.push(filters.branchId); }

  const sub1 = `
    SELECT ps.customer_name AS t_cust,
           ps.amount AS t_amount,
           'postpaid' AS t_type,
           r.reconciliation_date AS t_date,
           ps.created_at AS t_created,
           c.branch_id AS t_branch_id,
           b.branch_name AS t_branch_name
    FROM postpaid_sales ps
    LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
    JOIN cashiers c ON r.cashier_id = c.id
    JOIN branches b ON c.branch_id = b.id
    WHERE 1=1 ${dateFilter} ${branchFilter}
  `;

  const sub1Manual = `
    SELECT customer_name AS t_cust,
           amount AS t_amount,
           'postpaid' AS t_type,
           created_at AS t_date,
           created_at AS t_created,
           (SELECT branch_id FROM cashiers WHERE id = 1) AS t_branch_id,
           (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)) AS t_branch_name
    FROM manual_postpaid_sales
    WHERE 1=1 ${dateFilter.replace(/r\.reconciliation_date/g, 'created_at')}
  `;

  const sub2 = `
    SELECT cr.customer_name AS t_cust,
           cr.amount AS t_amount,
           'receipt' AS t_type,
           r.reconciliation_date AS t_date,
           cr.created_at AS t_created,
           c.branch_id AS t_branch_id,
           b.branch_name AS t_branch_name
    FROM customer_receipts cr
    LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
    JOIN cashiers c ON r.cashier_id = c.id
    JOIN branches b ON c.branch_id = b.id
    WHERE 1=1 ${dateFilter} ${branchFilter}
  `;

  const sub2Manual = `
    SELECT customer_name AS t_cust,
           amount AS t_amount,
           'receipt' AS t_type,
           created_at AS t_date,
           created_at AS t_created,
           (SELECT branch_id FROM cashiers WHERE id = 1) AS t_branch_id,
           (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)) AS t_branch_name
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
      t_branch_id AS branch_id,
      t_branch_name AS branch_name,
      COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount END), 0) AS total_postpaid,
      COALESCE(SUM(CASE WHEN t_type = 'receipt' THEN t_amount END), 0) AS total_receipts,
      COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount ELSE -t_amount END), 0) AS balance,
      COUNT(*) AS movements_count,
      MAX(t_date) AS last_tx_date
    FROM (
      ${unioned}
    ) t
    GROUP BY t_cust, t_branch_id, t_branch_name
    ${filters.onlyWithBalance ? "HAVING COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount ELSE -t_amount END), 0) > 0" : ''}
    ORDER BY branch_name ASC, balance DESC, customer_name ASC
  `;

  const params = [
    ...dateParams, // for sub1
    ...branchParams, // for sub1
    ...dateParams, // for sub1Manual
    ...dateParams, // for sub2
    ...branchParams, // for sub2
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
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">لا توجد بيانات مطابقة</td></tr>`;
    return;
  }

  const fmt = getCurrencyFormatter();
  tbody.innerHTML = rows.map(r => {
    const lastDate = r.last_tx_date ? escapeHtml(r.last_tx_date) : '-';
    return `
      <tr>
        <td>${escapeHtml(r.customer_name || '')}</td>
        <td>${escapeHtml(r.branch_name || '')}</td>
        <td class="text-currency">${fmt(r.total_postpaid || 0)}</td>
        <td class="text-currency">${fmt(r.total_receipts || 0)}</td>
        <td class="text-currency fw-bold ${Number(r.balance) > 0 ? 'text-deficit' : (Number(r.balance) < 0 ? 'text-success' : '')}">
          ${fmt(r.balance || 0)}
        </td>
        <td>${lastDate}</td>
        <td>${r.movements_count || 0}</td>
        <td>
          <button class="btn btn-sm btn-primary mx-1" onclick="showCustomerStatement('${escapeAttr(r.customer_name || '')}')">كشف حساب</button>
          <button class="btn btn-sm btn-secondary mx-1" onclick="editCustomerData('${escapeAttr(r.customer_name || '')}')">تعديل</button>
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
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
             c.name as cashier_name
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason,
             c.name as cashier_name
      FROM customer_receipts cr
      LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE cr.customer_name = ?
      ${dateFilter.sql}
    `;

    // Manual transactions
    // Manual transactions
    const sqlManualPost = `
      SELECT id, amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name, 'manual' as source
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const sqlManualRec = `
      SELECT id, amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name, 'manual' as source
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

      const isManual = t.source === 'manual';
      let actions = '';
      if (isManual) {
        actions = `<button class="btn btn-sm btn-outline-primary" onclick="editManualTransaction(${t.id}, '${t.type}', '${escapeAttr(name)}')"><i class="bi bi-pencil"></i></button>`;
      } else {
        actions = '<span class="text-muted">-</span>';
      }

      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)} ${t.cashier_name ? `- ${escapeHtml(t.cashier_name)}` : ''}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
          <td>${actions}</td>
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
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="7" class="text-center">لا توجد حركات</td></tr>`;

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
  console.log('🔧 [LEDGER] إعداد حدث الكشف للعميل:', customerName);

  // Store customer name for use in filter functions
  window.currentStatementCustomer = customerName;

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

  // إعداد أزرار الفلتر بالتاريخ
  const applyFilterBtn = document.getElementById('applyStatementDateFilter');
  if (applyFilterBtn) {
    applyFilterBtn.replaceWith(applyFilterBtn.cloneNode(true));
    const newApplyFilterBtn = document.getElementById('applyStatementDateFilter');
    newApplyFilterBtn.addEventListener('click', () => applyStatementDateFilter(customerName));
  }

  const clearFilterBtn = document.getElementById('clearStatementDateFilter');
  if (clearFilterBtn) {
    clearFilterBtn.replaceWith(clearFilterBtn.cloneNode(true));
    const newClearFilterBtn = document.getElementById('clearStatementDateFilter');
    newClearFilterBtn.addEventListener('click', () => clearStatementDateFilter(customerName));
  }

  // إعداد حدث الطباعة الحرارية - مع delayed binding
  setTimeout(() => {
    const printThermalBtn = document.getElementById('printStatementThermalBtn');
    console.log('🔍 [LEDGER] البحث عن زر الطباعة الحرارية...');

    if (printThermalBtn) {
      console.log('✅ [LEDGER] تم العثور على زر الطباعة الحرارية، إضافة event listener...');

      // إزالة أي مستمعين سابقين
      const clonedBtn = printThermalBtn.cloneNode(true);
      printThermalBtn.parentNode.replaceChild(clonedBtn, printThermalBtn);

      const newPrintThermalBtn = document.getElementById('printStatementThermalBtn');

      // إضافة event listener
      newPrintThermalBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖨️ [LEDGER] تم النقر على زر الطباعة الحرارية للعميل:', customerName);
        await printCustomerStatementThermal(customerName);
      });

      console.log('✅ [LEDGER] تم إضافة event listener للزر الحراري بنجاح');
    } else {
      console.warn('❌ [LEDGER] لم يتم العثور على زر الطباعة الحرارية في DOM');
      // قائمة جميع الأزرار الموجودة
      const allButtons = document.querySelectorAll('button');
      console.log('📋 [LEDGER] عدد الأزرار في الصفحة:', allButtons.length);
      allButtons.forEach((btn, idx) => {
        if (btn.id) console.log(`  - زر ${idx}:`, btn.id);
      });
    }
  }, 100);
}

// ==================================================
// دوال فلتر التاريخ لنافذة كشف الحساب
// ==================================================

async function applyStatementDateFilter(customerName) {
  try {
    console.log('📅 [LEDGER] تطبيق فلتر التاريخ لـ:', customerName);

    const dateFromEl = document.getElementById('statementDateFrom');
    const dateToEl = document.getElementById('statementDateTo');

    const dateFrom = dateFromEl?.value;
    const dateTo = dateToEl?.value;

    if (!dateFrom && !dateTo) {
      showTransactionAlert('يرجى تحديد تاريخ واحد على الأقل', 'warning');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      showTransactionAlert('تاريخ البداية لا يمكن أن يكون أكبر من تاريخ النهاية', 'warning');
      return;
    }

    // حفظ الفلترات في متغير عام
    window.statementDateFilter = { dateFrom, dateTo };

    console.log('📅 [LEDGER] الفلتر المحفوظ:', window.statementDateFilter);

    // إعادة تحميل الكشف بالفلتر المطبق
    await refreshStatementWithFilter(customerName, dateFrom, dateTo);

  } catch (error) {
    console.error('Error applying date filter:', error);
    showTransactionAlert('حدث خطأ أثناء تطبيق الفلتر: ' + error.message, 'danger');
  }
}

function clearStatementDateFilter(customerName) {
  try {
    console.log('🗑️ [LEDGER] مسح فلتر التاريخ');

    // مسح قيم الفلترات
    const dateFromEl = document.getElementById('statementDateFrom');
    const dateToEl = document.getElementById('statementDateTo');

    if (dateFromEl) dateFromEl.value = '';
    if (dateToEl) dateToEl.value = '';

    // مسح الفلتر المحفوظ
    window.statementDateFilter = null;

    // إعادة تحميل الكشف بدون فلتر
    showCustomerStatement(customerName);

  } catch (error) {
    console.error('Error clearing date filter:', error);
    showTransactionAlert('حدث خطأ أثناء مسح الفلتر: ' + error.message, 'danger');
  }
}

async function refreshStatementWithFilter(customerName, dateFrom, dateTo) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    // Reconciled transactions with date filter
    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
             c.name as cashier_name
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE ps.customer_name = ?
      ${dateFrom ? ' AND r.reconciliation_date >= ?' : ''}
      ${dateTo ? ' AND r.reconciliation_date <= ?' : ''}
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason,
             c.name as cashier_name
      FROM customer_receipts cr
      LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE cr.customer_name = ?
      ${dateFrom ? ' AND r.reconciliation_date >= ?' : ''}
      ${dateTo ? ' AND r.reconciliation_date <= ?' : ''}
    `;

    // Manual transactions with date filter
    const sqlManualPost = `
      SELECT id, amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name, 'manual' as source
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFrom ? ' AND created_at >= ?' : ''}
      ${dateTo ? ' AND created_at <= ?' : ''}
    `;

    const sqlManualRec = `
      SELECT id, amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name, 'manual' as source
      FROM manual_customer_receipts
      WHERE customer_name = ?
      ${dateFrom ? ' AND created_at >= ?' : ''}
      ${dateTo ? ' AND created_at <= ?' : ''}
    `;

    // Build params arrays
    const dateParams = [];
    if (dateFrom) dateParams.push(dateFrom);
    if (dateTo) dateParams.push(dateTo);

    const params = [name, ...dateParams];
    const paramsManual = [name, ...dateParams];

    const postTx = await ledgerIpc.invoke('db-query', sqlPost, params) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, params) || [];
    const manualPostTx = await ledgerIpc.invoke('db-query', sqlManualPost, paramsManual) || [];
    const manualRecTx = await ledgerIpc.invoke('db-query', sqlManualRec, paramsManual) || [];

    const allTx = [...postTx, ...recTx, ...manualPostTx, ...manualRecTx].sort((a, b) => {
      const ad = new Date(a.tx_date || a.created_at || '');
      const bd = new Date(b.tx_date || b.created_at || '');
      if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
      const as = (a.tx_date || a.created_at || '').toString();
      const bs = (b.tx_date || b.created_at || '').toString();
      const c = as.localeCompare(bs);
      if (c !== 0) return c;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // حساب الأرصدة والإجماليات
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

      const isManual = t.source === 'manual';
      let actions = '';
      if (isManual) {
        actions = `<button class="btn btn-sm btn-outline-primary" onclick="editManualTransaction(${t.id}, '${t.type}', '${escapeAttr(name)}')"><i class="bi bi-pencil"></i></button>`;
      } else {
        actions = '<span class="text-muted">-</span>';
      }

      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)} ${t.cashier_name ? `- ${escapeHtml(t.cashier_name)}` : ''}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    const balance = totalPost - totalRec;

    // تحديث الملخص
    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(totalPost);
    if (sRec) sRec.textContent = fmt(totalRec);
    if (sBal) sBal.textContent = fmt(balance);

    // تحديث الجدول
    const tbody = document.getElementById('customerStatementTable');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="7" class="text-center">لا توجد حركات في الفترة المحددة</td></tr>`;

    showTransactionAlert(`✅ تم تطبيق الفلتر - عدد الحركات: ${allTx.length}`, 'success');

  } catch (error) {
    console.error('Error refreshing statement with filter:', error);
    showTransactionAlert('حدث خطأ أثناء تطبيق الفلتر: ' + error.message, 'danger');
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
      // Refresh statement data only WITHOUT re-showing modal (to preserve sidebar state)
      refreshStatementData(customerName);

      // Clear form fields after successful add
      if (typeEl) typeEl.value = 'receipt';
      if (amountEl) amountEl.value = '';
      if (reasonEl) reasonEl.value = '';

      showTransactionAlert('تمت إضافة الحركة بنجاح', 'success');
      // NOTE: Modal stays open so user can add more transactions without disruption
    } else {
      showTransactionAlert('فشلت عملية إضافة الحركة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
    }
  } catch (error) {
    console.error('Error adding transaction:', error);
    showTransactionAlert('حدث خطأ أثناء إضافة الحركة: ' + (error && error.message ? error.message : error));
  }
}

// تحديث بيانات الكشف فقط دون إعادة إظهار المودال
async function refreshStatementData(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);

    // Reconciled transactions
    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
             c.name as cashier_name
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason,
             c.name as cashier_name
      FROM customer_receipts cr
      LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE cr.customer_name = ?
      ${dateFilter.sql}
    `;

    // Manual transactions
    const sqlManualPost = `
      SELECT amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const sqlManualRec = `
      SELECT amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
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
          <td>${escapeHtml(recNo)} ${t.cashier_name ? `- ${escapeHtml(t.cashier_name)}` : ''}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
        </tr>
      `;
    }).join('');

    const balance = totalPost - totalRec;

    // Update totals
    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(totalPost);
    if (sRec) sRec.textContent = fmt(totalRec);
    if (sBal) sBal.textContent = fmt(balance);

    // Update table content only (no modal re-show)
    const tbody = document.getElementById('customerStatementTable');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>`;
  } catch (error) {
    console.error('Error refreshing statement data:', error);
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

    // جلب معلومات الفرع المرتبط بالعميل من آخر حركة
    const branchInfo = await ledgerIpc.invoke('db-query', `
      SELECT DISTINCT b.* 
      FROM branches b
      JOIN cashiers c ON c.branch_id = b.id
      JOIN reconciliations r ON r.cashier_id = c.id
      LEFT JOIN postpaid_sales ps ON ps.reconciliation_id = r.id
      LEFT JOIN customer_receipts cr ON cr.reconciliation_id = r.id
      WHERE (ps.customer_name = ? OR cr.customer_name = ?)
      ORDER BY r.reconciliation_date DESC
      LIMIT 1
    `, [name, name]);

    const branch = branchInfo && branchInfo[0] ? branchInfo[0] : {
      branch_name: 'غير محدد',
      phone: '',
      address: ''
    };

    // استخدام فلتر نافذة كشف الحساب إن وجد، وإلا استخدام فلترات الصفحة الرئيسية
    let dateFilter;
    if (window.statementDateFilter && (window.statementDateFilter.dateFrom || window.statementDateFilter.dateTo)) {
      // بناء WHERE clause من فلتر نافذة كشف الحساب
      let sql = '';
      const params = [];
      if (window.statementDateFilter.dateFrom) {
        sql += ' AND r.reconciliation_date >= ?';
        params.push(window.statementDateFilter.dateFrom);
      }
      if (window.statementDateFilter.dateTo) {
        sql += ' AND r.reconciliation_date <= ?';
        params.push(window.statementDateFilter.dateTo);
      }
      dateFilter = { sql, params };
      console.log('📅 [LEDGER] استخدام فلتر نافذة كشف الحساب:', window.statementDateFilter);
    } else {
      const filters = getLedgerFilters();
      dateFilter = buildDateFilter(filters);
      console.log('📅 [LEDGER] استخدام فلترات الصفحة الرئيسية');
    }

    // Build date filter parts for each query type
    let dateFilterForReconciled = '';
    let dateFilterForManual = '';
    let reconciledParams = [];
    let manualParams = [];

    if (window.statementDateFilter && (window.statementDateFilter.dateFrom || window.statementDateFilter.dateTo)) {
      console.log('📅 [PRINT] استخدام فلتر نافذة كشف الحساب:', window.statementDateFilter);
      if (window.statementDateFilter.dateFrom) {
        dateFilterForReconciled += ' AND r.reconciliation_date >= ?';
        dateFilterForManual += ' AND created_at >= ?';
        reconciledParams.push(window.statementDateFilter.dateFrom);
        manualParams.push(window.statementDateFilter.dateFrom);
      }
      if (window.statementDateFilter.dateTo) {
        dateFilterForReconciled += ' AND r.reconciliation_date <= ?';
        dateFilterForManual += ' AND created_at <= ?';
        reconciledParams.push(window.statementDateFilter.dateTo);
        manualParams.push(window.statementDateFilter.dateTo);
      }
    } else {
      console.log('📅 [PRINT] استخدام فلترات الصفحة الرئيسية');
      const filters = getLedgerFilters();
      const buildFilters = buildDateFilter(filters);
      dateFilterForReconciled = buildFilters.sql;
      dateFilterForManual = buildFilters.sql.replace(/r\.reconciliation_date/g, 'created_at');
      reconciledParams = [...buildFilters.params];
      manualParams = [...buildFilters.params];
    }

    // Use the same sql used in showCustomerStatement but without manual notes change
    const sql = `
      SELECT * FROM (
        SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
               ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
               c.name as cashier_name
        FROM postpaid_sales ps
        LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
        LEFT JOIN cashiers c ON r.cashier_id = c.id
        WHERE ps.customer_name = ?
        ${dateFilterForReconciled}

        UNION ALL

        SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
               cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason,
               c.name as cashier_name
        FROM customer_receipts cr
        LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
        LEFT JOIN cashiers c ON r.cashier_id = c.id
        WHERE cr.customer_name = ?
        ${dateFilterForReconciled}

        UNION ALL

        SELECT amount, 'postpaid' as type, created_at as tx_date,
               created_at, NULL as rec_no, reason,
               'إدخال يدوي' as cashier_name
        FROM manual_postpaid_sales
        WHERE customer_name = ?
        ${dateFilterForManual}

        UNION ALL

        SELECT amount, 'receipt' as type, created_at as tx_date,
               created_at, 'يدوي' as rec_no, reason,
               'إدخال يدوي' as cashier_name
        FROM manual_customer_receipts
        WHERE customer_name = ?
        ${dateFilterForManual}
      ) all_tx
      ORDER BY tx_date ASC, created_at ASC
    `;

    const params = [
      name, ...reconciledParams,
      name, ...reconciledParams,
      name, ...manualParams,
      name, ...manualParams
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
      const cashierName = t.cashier_name || 'إدخال يدوي';
      const d = t.tx_date || t.created_at || '';
      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)} - ${escapeHtml(cashierName)}</td>
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
            @page { size: A4; margin: 15mm 20mm }
            body { 
                font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                font-size: 12px; 
                line-height: 1.3; 
                color: #000;
                max-width: 190mm;
                margin: 0 auto;
                padding: 0;
            }
            .header { 
                margin-bottom: 10mm; 
                padding: 6mm; 
                border: 1px solid #000; 
                border-radius: 3mm;
                background-color: #fff;
                width: 85%;
                max-width: 160mm;
                margin-left: auto;
                margin-right: auto
            }
            .statement-title { 
                text-align: center; 
                margin-bottom: 6mm 
            }
            .statement-title h2 { 
                font-size: 16px; 
                font-weight: bold; 
                margin: 0; 
                padding: 0; 
                color: #000 
            }
            .header-content { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start; 
                margin-top: 4mm;
                padding: 0 2mm
            }
            .header-right, .header-left { flex: 1 }
            .header-right { 
                padding-left: 5mm; 
                border-left: 1px solid #ddd 
            }
            .company-name { 
                font-size: 14px; 
                font-weight: bold; 
                margin-bottom: 2mm; 
                color: #000 
            }
            .branch-name { 
                font-size: 13px; 
                margin-bottom: 2mm; 
                color: #333 
            }
            .branch-info { 
                font-size: 12px; 
                line-height: 1.4; 
                color: #555 
            }
            .branch-info > div { margin-bottom: 1mm }
            .header-left { 
                text-align: left; 
                padding-right: 5mm 
            }
            .customer-info, .print-date { 
                margin-top: 2mm; 
                font-size: 12px 
            }
            .detail-label { 
                font-weight: 500; 
                color: #555; 
                margin-left: 2mm 
            }
            .summary { 
                display: flex; 
                justify-content: space-between; 
                gap: 4mm; 
                margin: 0 auto 6mm auto;
                padding: 4mm; 
                background-color: #f8f9fa; 
                border-radius: 2mm;
                width: 85%;
                max-width: 160mm
            }
            .summary-item { 
                flex: 1; 
                background-color: #fff; 
                padding: 2.5mm 3mm; 
                border-radius: 2mm; 
                border: 1px solid #ddd;
                text-align: center
            }
            .summary-item .label { 
                font-weight: bold; 
                color: #333; 
                font-size: 12px; 
                margin-bottom: 1mm 
            }
            .summary-item .value { 
                font-size: 13px; 
                font-weight: bold 
            }
            table { 
                width: 95%; 
                border-collapse: collapse;
                margin: 0 auto 6mm auto;
                max-width: 180mm
            }
            th, td { 
                border: 1px solid #000; 
                padding: 2mm; 
                text-align: right;
                font-size: 11px 
            }
            th { 
                background: #fff; 
                font-weight: bold;
                font-size: 11px 
            }
            .text-currency { 
                font-family: monospace; 
                color: #000;
                font-size: 11px 
            }
            .text-deficit { color: #000 }
            .text-success { color: #000 }
            .page-number { 
                text-align: center;
                font-size: 10px;
                color: #666;
                margin-top: 4mm;
                margin-bottom: 4mm
            }
            .page-number:before { 
                content: counter(page) " من " counter(pages);
            }
            .footer { 
                margin-top: 8mm; 
                text-align: center; 
                font-size: 10px; 
                color: #666
            }
            @media print { 
                body { margin: 0; padding: 0 } 
                .no-print { display: none }
                @page { 
                    counter-increment: page;
                    @top-center {
                        content: "العميل: ${customerName}";
                        font-size: 11px;
                        color: #666;
                        display: none;
                    }
                    @bottom-center {
                        content: counter(page) " من " counter(pages)
                    }
                }
                @page:nth-of-type(1n + 2) {
                    @top-center {
                        display: block;
                    }
                }
                .footer { 
                    display: none;
                    page-break-before: avoid;
                    page-break-inside: avoid
                }
                .footer:last-of-type {
                    display: block;
                    margin-top: auto
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="statement-title">
                <h2>كشف حساب</h2>
            </div>
            <div class="header-content">
                <div class="header-right">
                    <div class="company-name">${await getCompanyName()}</div>
                    <div class="branch-name">${branch.branch_name}</div>
                    <div class="branch-info">
                        ${branch.phone ? `<div>هاتف: ${branch.phone}</div>` : ''}
                        ${branch.address ? `<div>عنوان: ${branch.address}</div>` : ''}
                    </div>
                </div>
                <div class="header-left">
                    <div class="details-section">
                        <div class="customer-info"><span class="detail-label">العميل</span> ${customerName}</div>
                        <div class="print-date"><span class="detail-label">التاريخ</span> ${formatDateTime(new Date())}</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="summary">
          <div class="summary-item"><div class="label">إجمالي المبيعات الآجلة</div><div class="value text-currency text-deficit">${fmt(totalPost)}</div></div>
          <div class="summary-item"><div class="label">إجمالي المقبوضات</div><div class="value text-currency text-success">${fmt(totalRec)}</div></div>
          <div class="summary-item"><div class="label">الرصيد</div><div class="value text-currency ${balance > 0 ? 'text-deficit' : balance < 0 ? 'text-success' : ''}">${fmt(balance)}</div></div>
        </div>
        <table>
                    <thead><tr><th>التاريخ</th><th>النوع</th><th>السبب</th><th>رقم التصفية - الكاشير</th><th>المبلغ</th><th>الرصيد التراكمي</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>'}</tbody>
        </table>
            <div class="page-number"></div>
            <div class="footer">
                تم تطوير هذا النظام بواسطة محمد أمين الكامل - جميع الحقوق محفوظة © تصفية برو - Tasfiya Pro
            </div>
    </body>
    </html>
    `;

    if (printManager && typeof printManager.printWithPreview === 'function') {
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
  return function (amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    try { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount)); }
    catch { return Number(amount).toFixed(2); }
  };
}

async function getCompanyName() {
  try {
    const result = await ledgerIpc.invoke('db-query',
      'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?',
      ['company', 'name']
    );
    return result && result[0] ? result[0].setting_value : 'شركة المثال التجارية';
  } catch (error) {
    console.error('Error getting company name:', error);
    return 'شركة المثال التجارية';
  }
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
  return String(str || '').replace(/['"\\]/g, s => ({ "'": '&#39;', '"': '&quot;', '\\': '\\\\' }[s]));
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

async function printCustomerStatementThermal(customerName) {
  try {
    console.log('🖨️ [LEDGER] بدء طباعة كشف الحساب الحرارية للعميل:', customerName);

    // جلب بيانات الفرع المرتبط بالعميل
    let customerBranch = { branch_name: '', branch_phone: '', branch_address: '' };
    try {
      const branchQuery = `
        SELECT DISTINCT b.id, b.branch_name, b.branch_phone, b.branch_address
        FROM branches b
        INNER JOIN cashiers c ON c.branch_id = b.id
        INNER JOIN reconciliations r ON r.cashier_id = c.id
        INNER JOIN postpaid_sales ps ON ps.reconciliation_id = r.id
        WHERE ps.customer_name = ?
        LIMIT 1
      `;
      const branchData = await ledgerIpc.invoke('db-query', branchQuery, [customerName]);
      if (branchData && branchData.length > 0) {
        customerBranch = branchData[0];
        console.log('🏢 [THERMAL] تم الحصول على بيانات الفرع:', customerBranch);
      }
    } catch (branchErr) {
      console.warn('⚠️ [THERMAL] تحذير في جلب بيانات الفرع:', branchErr);
    }

    // استخدام فلتر نافذة كشف الحساب إن وجد، وإلا استخدام فلترات الصفحة الرئيسية
    let dateFilterParts;
    if (window.statementDateFilter && (window.statementDateFilter.dateFrom || window.statementDateFilter.dateTo)) {
      // بناء WHERE clause من فلتر نافذة كشف الحساب
      let sql = '';
      const params = [];
      if (window.statementDateFilter.dateFrom) {
        sql += ' AND r.reconciliation_date >= ?';
        params.push(window.statementDateFilter.dateFrom);
      }
      if (window.statementDateFilter.dateTo) {
        sql += ' AND r.reconciliation_date <= ?';
        params.push(window.statementDateFilter.dateTo);
      }
      dateFilterParts = { sql, params };
      console.log('📅 [THERMAL] استخدام فلتر نافذة كشف الحساب:', window.statementDateFilter);
    } else {
      const filters = getLedgerFilters();
      dateFilterParts = buildDateFilter(filters);
      console.log('📅 [THERMAL] استخدام فلترات الصفحة الرئيسية');
    }
    const paramsPost = [...dateFilterParts.params, customerName];
    const paramsRec = [...dateFilterParts.params, customerName];

    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason,
             COALESCE(c.name, 'نظام') AS cashier_name
      FROM postpaid_sales ps
      JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE r.status='completed' ${dateFilterParts.sql} AND ps.customer_name = ?
      
      UNION ALL
      
      SELECT amount AS amount, 'postpaid' AS type, created_at AS tx_date,
             created_at AS created_at, 'يدوي' AS rec_no, '' AS reason,
             'يدوي' AS cashier_name
      FROM manual_postpaid_sales
      WHERE customer_name = ?
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason,
             COALESCE(c.name, 'نظام') AS cashier_name
      FROM customer_receipts cr
      JOIN reconciliations r ON r.id = cr.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE r.status='completed' ${dateFilterParts.sql} AND cr.customer_name = ?
      
      UNION ALL
      
      SELECT amount AS amount, 'receipt' AS type, created_at AS tx_date,
             created_at AS created_at, 'يدوي' AS rec_no, '' AS reason,
             'يدوي' AS cashier_name
      FROM manual_customer_receipts
      WHERE customer_name = ?
    `;

    // إظهار رسالة التحميل
    showTransactionAlert('جاري تحضير البيانات للطباعة...', 'info');

    const postTx = await ledgerIpc.invoke('db-query', sqlPost, [...paramsPost, customerName]) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, [...paramsRec, customerName]) || [];

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

    // بيانات الجدول في صيغة منظمة
    const tableData = [];
    allTx.forEach(t => {
      if (t.type === 'postpaid') {
        running += Number(t.amount || 0);
        totalPost += Number(t.amount || 0);
      } else {
        running -= Number(t.amount || 0);
        totalRec += Number(t.amount || 0);
      }
      const kind = t.type === 'postpaid' ? 'آجل' : 'مقبوض';
      const date = (t.tx_date || '').substring(0, 10);
      const amt = Number(t.amount || 0);
      const bal = running;
      const cashier = t.cashier_name || 'يدوي';

      tableData.push({
        date,
        type: kind,
        amount: amt,
        balance: bal,
        recNo: t.rec_no || '-',
        cashier
      });
    });

    // الملخص النهائي
    const totalPostStr = fmt(totalPost);
    const totalRecStr = fmt(totalRec);
    const balanceStr = fmt(totalPost - totalRec);

    // إنشاء بيانات متوافقة مع ThermalPrinter80mm
    const textReceipt = JSON.stringify({
      isStructuredStatement: true,
      customerName,
      printDate: formatDateTime(new Date()),
      tableData,
      summary: {
        totalPostpaid: totalPost,
        totalReceipts: totalRec,
        balance: totalPost - totalRec,
        totalPostpaidStr: totalPostStr,
        totalReceiptsStr: totalRecStr,
        balanceStr: balanceStr
      }
    });

    console.log('📄 [LEDGER] تم تحضير النص للطباعة، الحجم:', textReceipt.length, 'بايت');

    // استدعاء IPC handler للطباعة الحرارية
    const result = await ledgerIpc.invoke('print-thermal-statement', {
      customerName,
      textReceipt,
      totalPost,
      totalRec,
      balance: totalPost - totalRec,
      branch: customerBranch
    });

    console.log('📤 [LEDGER] نتيجة الطباعة:', result);

    if (result && result.success) {
      showTransactionAlert('✅ تمت طباعة كشف الحساب على الطابعة الحرارية بنجاح', 'success');
    } else {
      const errorMsg = result?.error || 'خطأ غير معروف';
      console.error('❌ [LEDGER] خطأ في الطباعة:', errorMsg);
      showTransactionAlert('❌ فشلت عملية الطباعة الحرارية: ' + errorMsg, 'danger');
    }
  } catch (error) {
    console.error('❌ [LEDGER] خطأ في الطباعة الحرارية لكشف الحساب:', error);
    showTransactionAlert('❌ حدث خطأ أثناء الطباعة الحرارية: ' + error.message, 'danger');
  }
}

// ==================================================
// تعديل الحركات اليدوية
// ==================================================

async function editManualTransaction(id, type, customerName) {
  try {
    console.log(`✏️ [EDIT] تحرير حركة يدوية: ID=${id}, Type=${type}, Customer=${customerName}`);

    // تحديد الجدول بناءً على النوع
    const table = type === 'postpaid' ? 'manual_postpaid_sales' : 'manual_customer_receipts';

    // جلب بيانات الحركة الحالية
    const sql = `SELECT * FROM ${table} WHERE id = ?`;
    const rows = await ledgerIpc.invoke('db-query', sql, [id]);

    if (!rows || rows.length === 0) {
      showTransactionAlert('لم يتم العثور على الحركة المطلوبة', 'danger');
      return;
    }

    const tx = rows[0];
    const currentAmount = tx.amount;
    const currentReason = tx.reason || '';
    const currentCreatedAt = tx.created_at;

    // Convert SQL date to input datetime-local format (YYYY-MM-DDTHH:MM)
    let dateValue = '';
    if (currentCreatedAt) {
      const dateObj = new Date(currentCreatedAt);
      if (!isNaN(dateObj.getTime())) {
        // Adjust to local time string for input
        const yyyy = dateObj.getFullYear();
        const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const mm = String(dateObj.getMinutes()).padStart(2, '0');
        dateValue = `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
      }
    }

    // إنشاء نافذة التعديل
    const modalId = 'editManualTxModal';
    // إزالة النافذة القديمة إن وجدت
    const oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    const reasonsOptions = `
      <option value="">-- اختر سبب --</option>
      <option value="opening_balance" ${currentReason === 'opening_balance' ? 'selected' : ''}>رصيد افتتاحي</option>
      <option value="reconciliation" ${currentReason === 'reconciliation' ? 'selected' : ''}>تسوية رصيد</option>
      <option value="account_adjustment" ${currentReason === 'account_adjustment' ? 'selected' : ''}>تصفية حساب</option>
      <option value="other" ${currentReason === 'other' || (currentReason && !['opening_balance', 'reconciliation', 'account_adjustment'].includes(currentReason)) ? 'selected' : ''}>أخرى</option>
    `;

    const modalContent = `
      <div class="modal fade" id="${modalId}" tabindex="-1" style="z-index: 1060;">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-warning">
              <h5 class="modal-title">تعديل حركة يدوية</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="editManualTxForm">
                <input type="hidden" id="editTxOldType" value="${type}">
                
                <div class="mb-3">
                  <label class="form-label">نوع الحركة</label>
                  <select class="form-select" id="editTxType">
                    <option value="postpaid" ${type === 'postpaid' ? 'selected' : ''}>مبيعات آجلة</option>
                    <option value="receipt" ${type === 'receipt' ? 'selected' : ''}>مقبوض عميل</option>
                  </select>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">تاريخ الحركة</label>
                  <input type="datetime-local" class="form-control" id="editTxDate" value="${dateValue}" required>
                </div>

                <div class="mb-3">
                  <label class="form-label">المبلغ</label>
                  <input type="number" class="form-control" id="editTxAmount" value="${currentAmount}" step="0.01" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">السبب</label>
                  <select class="form-select" id="editTxReason">
                    ${reasonsOptions}
                  </select>
                </div>
                <div class="mb-3" id="editTxOtherReasonDiv" style="display: ${currentReason && !['opening_balance', 'reconciliation', 'account_adjustment'].includes(currentReason) ? 'block' : 'none'}">
                    <label class="form-label">تفاصيل السبب</label>
                    <input type="text" class="form-control" id="editTxOtherReason" value="${currentReason && !['opening_balance', 'reconciliation', 'account_adjustment'].includes(currentReason) ? escapeHtml(currentReason) : ''}">
                </div>
                <div id="editTxAlert" class="alert" style="display: none;"></div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
              <button type="button" class="btn btn-primary" onclick="updateManualTransaction(${id}, '${type}', '${escapeAttr(customerName)}')">
                <i class="fas fa-save"></i> حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // إضافة النافذة
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalContent;
    document.body.appendChild(modalDiv);

    // إضافة مستمع لتغيير السبب لإظهار حقل "أخرى"
    setTimeout(() => {
      const reasonSelect = document.getElementById('editTxReason');
      const otherDiv = document.getElementById('editTxOtherReasonDiv');
      if (reasonSelect && otherDiv) {
        reasonSelect.addEventListener('change', function () {
          otherDiv.style.display = this.value === 'other' ? 'block' : 'none';
        });
      }
    }, 100);

    // عرض النافذة
    const modalElement = document.getElementById(modalId);
    if (window.bootstrap && window.bootstrap.Modal) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }

    // تنظيف عند الإغلاق
    modalElement.addEventListener('hidden.bs.modal', function () {
      this.remove();
    });

  } catch (error) {
    console.error('Error editing manual transaction:', error);
    showTransactionAlert('حدث خطأ أثناء فتح نافذة التعديل', 'danger');
  }
}

async function updateManualTransaction(id, initialType, customerName) {
  try {
    const saveBtn = document.querySelector('#editManualTxModal .btn-primary');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري الحفظ...';
    }

    const amount = document.getElementById('editTxAmount').value;
    const newType = document.getElementById('editTxType').value;
    const oldType = document.getElementById('editTxOldType').value;
    const dateInput = document.getElementById('editTxDate').value;

    const reasonSelect = document.getElementById('editTxReason').value;
    let finalReason = reasonSelect;

    if (reasonSelect === 'other') {
      finalReason = document.getElementById('editTxOtherReason').value.trim();
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      showEditTxAlert('الرجاء إدخال مبلغ صحيح', 'danger');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات'; }
      return;
    }

    if (!dateInput) {
      showEditTxAlert('الرجاء إدخال التاريخ', 'danger');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات'; }
      return;
    }

    // Convert input date (YYYY-MM-DDTHH:MM) to DB format (YYYY-MM-DD HH:MM:SS) if possible
    // Adding :00 for seconds to be consistent
    const finalDate = dateInput.replace('T', ' ') + ':00';

    // التحقق مما إذا كان النوع قد تغير
    if (newType === oldType) {
      // تحديث عادي في نفس الجدول
      const table = newType === 'postpaid' ? 'manual_postpaid_sales' : 'manual_customer_receipts';
      const sql = `UPDATE ${table} SET amount = ?, reason = ?, created_at = ? WHERE id = ?`;
      await ledgerIpc.invoke('db-run', sql, [amount, finalReason, finalDate, id]);

    } else {
      // تغيير النوع يتطلب النقل من جدول لآخر
      console.log(`🔄 [UPDATE] تغيير نوع الحركة من ${oldType} إلى ${newType}`);

      const oldTable = oldType === 'postpaid' ? 'manual_postpaid_sales' : 'manual_customer_receipts';
      const newTable = newType === 'postpaid' ? 'manual_postpaid_sales' : 'manual_customer_receipts';

      // 1. إضافة سجل جديد في الجدول الجديد (مع استخدام التاريخ الجديد)
      const insertSql = `INSERT INTO ${newTable} (customer_name, amount, reason, created_at) VALUES (?, ?, ?, ?)`;
      await ledgerIpc.invoke('db-run', insertSql, [customerName, amount, finalReason, finalDate]);

      // 2. حذف السجل من الجدول القديم
      const deleteSql = `DELETE FROM ${oldTable} WHERE id = ?`;
      await ledgerIpc.invoke('db-run', deleteSql, [id]);
    }

    // إغلاق النافذة وتحديث الكشف
    const modalEl = document.getElementById('editManualTxModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    showTransactionAlert('تم تعديل الحركة بنجاح', 'success');

    // إعادة تحميل الكشف
    const dateFilter = window.statementDateFilter;
    if (dateFilter && (dateFilter.dateFrom || dateFilter.dateTo)) {
      await refreshStatementWithFilter(customerName, dateFilter.dateFrom, dateFilter.dateTo);
    } else {
      await showCustomerStatement(customerName);
    }

  } catch (error) {
    console.error('Error updating manual transaction:', error);
    showEditTxAlert('حدث خطأ أثناء حفظ التعديلات: ' + error.message, 'danger');
    const saveBtn = document.querySelector('#editManualTxModal .btn-primary');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
    }
  }
}

function showEditTxAlert(message, type) {
  const el = document.getElementById('editTxAlert');
  if (el) {
    el.className = `alert alert-${type}`;
    el.textContent = message;
    el.style.display = 'block';
  }
}

// Expose to window
window.editManualTransaction = editManualTransaction;
window.updateManualTransaction = updateManualTransaction;
