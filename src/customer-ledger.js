// ===================================================
// 📘 Unified Customer Ledger - merged from variants
// - Preserves: reconciled transactions, manual transactions, printing, modal handling
// - Uses safe IPC channels already present in the app: 'db-query', 'add-manual-transaction', 'add-statement-transaction', 'get-print-manager'
// - Keeps UI hooks identical (onclick exposure, element ids)
// ===================================================

console.log('✅ [CUSTOMER-LEDGER] تم تحميل ملف customer-ledger.js بنجاح');

const ledgerIpc = typeof window !== 'undefined' && window.RendererIPC
  ? window.RendererIPC
  : require('./renderer-ipc');
const modalHandler = require('./modal-handler');
const { translateReason } = require('./reason-translator');

// Print manager instance (requested from main)
let printManager = null;
let ledgerLoadPromise = null;
let ledgerLoadSequence = 0;
let lastLedgerFiltersSignature = '';
let ledgerBranchesLoaded = false;
let customerLedgerRowsCache = [];
let selectedCustomerMergeKeys = new Set();
let manualCustomersDefaultBranchIdCache = null;
let customerLedgerMergeHistoryReady = false;
let latestUndoableCustomerMerge = null;
let currentCustomerStatementContext = {
  customerName: '',
  forcedBranchId: ''
};

function mapCustomerLedgerDbError(error, fallback = 'خطأ غير معروف') {
  const message = String(error && error.message ? error.message : error || '').trim();
  if (!message) {
    return fallback;
  }

  if (message.includes('manual_postpaid_sales_invalid_data')) {
    return 'بيانات الحركة اليدوية (آجل) غير صالحة. تأكد من الاسم والمبلغ.';
  }
  if (message.includes('manual_customer_receipts_invalid_data')) {
    return 'بيانات الحركة اليدوية (مقبوض) غير صالحة. تأكد من الاسم والمبلغ.';
  }
  if (message.includes('postpaid_sales_invalid_data') || message.includes('customer_receipts_invalid_data')) {
    return 'بيانات العميل غير صالحة. تأكد من الاسم والمبلغ ونوع الدفع.';
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return 'تعذر تنفيذ العملية بسبب مرجع غير صالح (فرع/تصفية).';
  }
  if (message.includes('SQLITE_CONSTRAINT')) {
    return 'فشلت العملية بسبب قيد سلامة البيانات.';
  }

  return message;
}

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

  // Expose for inline onclick usage
  window.showCustomerStatement = showCustomerStatement;
  window.openCustomerReconciliationFromStatement = openCustomerReconciliationFromStatement;
  window.editCustomerData = editCustomerData;
  window.renameCustomerNameInLedger = renameCustomerNameInLedger;
  window.mergeSelectedCustomersInLedger = mergeSelectedCustomersInLedger;
  window.undoLastCustomerMergeInLedger = undoLastCustomerMergeInLedger;
  // Expose for cross-module hooks (e.g. modal-handler refresh on close)
  window.loadCustomerLedger = loadCustomerLedger;
  window.loadCustomerLedgerFilters = loadCustomerLedgerFilters;
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
    showEditCustomerAlert('حدث خطأ أثناء تحديث بيانات العميل: ' + mapCustomerLedgerDbError(error), 'danger');
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

  const branchFilter = document.getElementById('ledgerBranchFilter');
  if (branchFilter) branchFilter.addEventListener('change', handleLedgerSearch);

  const mergeSelectedBtn = document.getElementById('customerLedgerMergeSelectedBtn');
  if (mergeSelectedBtn) {
    mergeSelectedBtn.addEventListener('click', () => mergeSelectedCustomersInLedger());
  }

  const undoMergeBtn = document.getElementById('customerLedgerUndoMergeBtn');
  if (undoMergeBtn) {
    undoMergeBtn.addEventListener('click', () => undoLastCustomerMergeInLedger());
  }

  const clearSelectionBtn = document.getElementById('customerLedgerClearSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => clearCustomerLedgerSelection());
  }

  const selectAll = document.getElementById('customerLedgerSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', (event) => {
      toggleCustomerLedgerSelectAll(!!event?.target?.checked);
    });
  }

  const tableBody = document.getElementById('customerLedgerTable');
  if (tableBody) {
    tableBody.addEventListener('change', (event) => {
      const target = event?.target;
      if (!target || !target.classList?.contains('customer-ledger-select-checkbox')) return;

      const selectionKey = String(target.dataset.selectionKey || '');
      if (!selectionKey) return;

      if (target.checked) selectedCustomerMergeKeys.add(selectionKey);
      else selectedCustomerMergeKeys.delete(selectionKey);

      updateCustomerLedgerSelectionUi();
    });
  }

  updateCustomerLedgerSelectionUi();
}

async function loadCustomerLedgerFilters(options = {}) {
  const forceReload = !!options.forceReload;
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
      const selectedValue = branchFilter.value || '';
      if (!forceReload && ledgerBranchesLoaded && branchFilter.options.length > 1) {
        if (selectedValue) {
          branchFilter.value = selectedValue;
        }
        return;
      }

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

      if (selectedValue && Array.from(branchFilter.options).some(opt => opt.value === selectedValue)) {
        branchFilter.value = selectedValue;
      }

      ledgerBranchesLoaded = true;
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
  selectedCustomerMergeKeys.clear();
  updateCustomerLedgerSelectionUi();

  loadCustomerLedger();
}

function buildLedgerPeriodLabel(filters) {
  const from = filters?.dateFrom || '';
  const to = filters?.dateTo || '';
  if (from && to) return `الفترة: من ${from} إلى ${to}`;
  if (from) return `الفترة: من ${from}`;
  if (to) return `الفترة: حتى ${to}`;
  return 'الفترة: كل الفترات';
}

function updateLedgerSummaryCards(rows, filters) {
  const totalPostpaidEl = document.getElementById('ledgerTotalPostpaidPeriod');
  const totalReceiptsEl = document.getElementById('ledgerTotalReceiptsPeriod');
  const netBalanceEl = document.getElementById('ledgerNetBalancePeriod');
  const periodEl = document.getElementById('ledgerSummaryPeriod');

  if (!totalPostpaidEl || !totalReceiptsEl || !netBalanceEl) {
    return;
  }

  const fmt = getCurrencyFormatter();
  const safeRows = Array.isArray(rows) ? rows : [];

  const totals = safeRows.reduce((acc, row) => {
    acc.postpaid += Number(row?.total_postpaid || 0);
    acc.receipts += Number(row?.total_receipts || 0);
    acc.net += Number(row?.balance || 0);
    return acc;
  }, { postpaid: 0, receipts: 0, net: 0 });

  totalPostpaidEl.textContent = fmt(totals.postpaid);
  totalReceiptsEl.textContent = fmt(totals.receipts);
  netBalanceEl.textContent = fmt(totals.net);

  netBalanceEl.classList.remove('text-success', 'text-deficit');
  if (totals.net > 0) {
    netBalanceEl.classList.add('text-deficit');
  } else if (totals.net < 0) {
    netBalanceEl.classList.add('text-success');
  }

  if (periodEl) {
    periodEl.textContent = buildLedgerPeriodLabel(filters || getLedgerFilters());
  }
}

function buildLedgerQuery(filters) {
  // Build a UNION of reconciled and manual transactions, then aggregate per customer.
  let dateFilterPostpaid = '';
  let dateFilterReceipts = '';
  let dateFilterManual = '';
  const dateParamsReconciled = [];
  const dateParamsManual = [];
  if (filters.dateFrom) {
    dateFilterPostpaid += ' AND (r.reconciliation_date >= ? OR ps.created_at >= ?)';
    dateFilterReceipts += ' AND (r.reconciliation_date >= ? OR cr.created_at >= ?)';
    dateFilterManual += ' AND created_at >= ?';
    dateParamsReconciled.push(filters.dateFrom, filters.dateFrom);
    dateParamsManual.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    dateFilterPostpaid += ' AND (r.reconciliation_date <= ? OR ps.created_at <= ?)';
    dateFilterReceipts += ' AND (r.reconciliation_date <= ? OR cr.created_at <= ?)';
    dateFilterManual += ' AND created_at <= ?';
    dateParamsReconciled.push(filters.dateTo, filters.dateTo);
    dateParamsManual.push(filters.dateTo);
  }

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
    WHERE 1=1 ${dateFilterPostpaid} ${branchFilter}
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
    WHERE 1=1 ${dateFilterManual}
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
    WHERE 1=1 ${dateFilterReceipts} ${branchFilter}
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
    WHERE 1=1 ${dateFilterManual}
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
    ...dateParamsReconciled, // for sub1
    ...branchParams, // for sub1
    ...dateParamsManual, // for sub1Manual
    ...dateParamsReconciled, // for sub2
    ...branchParams, // for sub2
    ...dateParamsManual, // for sub2Manual
    ...nameParams
  ];

  return { sql, params };
}

async function loadCustomerLedger() {
  const tbody = document.getElementById('customerLedgerTable');
  if (!tbody) return [];

  const filters = getLedgerFilters();
  const currentSignature = JSON.stringify(filters);

  // Avoid duplicate heavy queries when the same load is triggered multiple times quickly.
  if (ledgerLoadPromise && currentSignature === lastLedgerFiltersSignature) {
    return ledgerLoadPromise;
  }

  lastLedgerFiltersSignature = currentSignature;
  const requestId = ++ledgerLoadSequence;
  customerLedgerRowsCache = [];
  tbody.innerHTML = `<tr><td colspan="9" class="text-center">جاري التحميل...</td></tr>`;
  updateCustomerLedgerSelectionUi();

  ledgerLoadPromise = (async () => {
    try {
      const { sql, params } = buildLedgerQuery(filters);
      const rows = await ledgerIpc.invoke('db-query', sql, params);

      if (requestId !== ledgerLoadSequence) {
        return rows || [];
      }

      const safeRows = rows || [];
      customerLedgerRowsCache = safeRows;
      syncCustomerLedgerSelectionWithRows();
      renderLedgerTable(safeRows);
      updateLedgerSummaryCards(safeRows, filters);
      updateCustomerLedgerSelectionUi();
      await refreshCustomerUndoMergeState();
      return safeRows;
    } catch (error) {
      if (requestId !== ledgerLoadSequence) {
        return [];
      }

      console.error('Error loading customer ledger:', error);
      customerLedgerRowsCache = [];
      syncCustomerLedgerSelectionWithRows();
      tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">حدث خطأ أثناء تحميل البيانات</td></tr>`;
      updateLedgerSummaryCards([], filters);
      updateCustomerLedgerSelectionUi();
      await refreshCustomerUndoMergeState();
      return [];
    } finally {
      if (requestId === ledgerLoadSequence) {
        ledgerLoadPromise = null;
      }
    }
  })();

  return ledgerLoadPromise;
}

function renderLedgerTable(rows) {
  const tbody = document.getElementById('customerLedgerTable');
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">لا توجد بيانات مطابقة</td></tr>`;
    return;
  }

  const fmt = getCurrencyFormatter();
  tbody.innerHTML = rows.map(r => {
    const lastDate = r.last_tx_date ? escapeHtml(r.last_tx_date) : '-';
    const customerName = r.customer_name || '';
    const branchId = r.branch_id != null ? String(r.branch_id) : '';
    const selectionKey = buildCustomerSelectionKey(customerName, branchId);
    const checked = selectedCustomerMergeKeys.has(selectionKey) ? 'checked' : '';
    return `
      <tr>
        <td>
          <input
            type="checkbox"
            class="form-check-input customer-ledger-select-checkbox"
            data-selection-key="${escapeAttr(selectionKey)}"
            ${checked}
            aria-label="تحديد العميل ${escapeAttr(customerName)}">
        </td>
        <td>${escapeHtml(customerName)}</td>
        <td>${escapeHtml(r.branch_name || '')}</td>
        <td class="text-currency">${fmt(r.total_postpaid || 0)}</td>
        <td class="text-currency">${fmt(r.total_receipts || 0)}</td>
        <td class="text-currency fw-bold ${Number(r.balance) > 0 ? 'text-deficit' : (Number(r.balance) < 0 ? 'text-success' : '')}">
          ${fmt(r.balance || 0)}
        </td>
        <td>${lastDate}</td>
        <td>${r.movements_count || 0}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="showCustomerStatement('${escapeAttr(customerName)}', '${escapeAttr(branchId)}')">كشف حساب</button>
          <button class="btn btn-sm btn-outline-warning ms-1" onclick="renameCustomerNameInLedger('${escapeAttr(customerName)}', '${escapeAttr(branchId)}')">
            <i class="bi bi-pencil-square"></i> تعديل الاسم
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function normalizeBranchId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || raw === '0') return '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
}

function buildCustomerSelectionKey(customerName, branchId) {
  const safeName = String(customerName == null ? '' : customerName);
  const safeBranchId = normalizeBranchId(branchId) || '0';
  return JSON.stringify({ name: safeName, branchId: safeBranchId });
}

function syncCustomerLedgerSelectionWithRows() {
  const availableKeys = new Set(
    (customerLedgerRowsCache || []).map((row) => buildCustomerSelectionKey(row?.customer_name, row?.branch_id))
  );

  selectedCustomerMergeKeys.forEach((key) => {
    if (!availableKeys.has(key)) selectedCustomerMergeKeys.delete(key);
  });
}

function getSelectedCustomerRows() {
  if (!Array.isArray(customerLedgerRowsCache) || customerLedgerRowsCache.length === 0) {
    return [];
  }

  return customerLedgerRowsCache.filter((row) => {
    const key = buildCustomerSelectionKey(row?.customer_name, row?.branch_id);
    return selectedCustomerMergeKeys.has(key);
  });
}

function clearCustomerLedgerSelection() {
  selectedCustomerMergeKeys.clear();
  const rowChecks = document.querySelectorAll('.customer-ledger-select-checkbox');
  rowChecks.forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateCustomerLedgerSelectionUi();
}

function toggleCustomerLedgerSelectAll(isChecked) {
  const visibleRows = Array.isArray(customerLedgerRowsCache) ? customerLedgerRowsCache : [];
  visibleRows.forEach((row) => {
    const key = buildCustomerSelectionKey(row?.customer_name, row?.branch_id);
    if (isChecked) selectedCustomerMergeKeys.add(key);
    else selectedCustomerMergeKeys.delete(key);
  });

  const rowChecks = document.querySelectorAll('.customer-ledger-select-checkbox');
  rowChecks.forEach((checkbox) => {
    checkbox.checked = isChecked;
  });

  updateCustomerLedgerSelectionUi();
}

function updateCustomerLedgerSelectionUi() {
  const summaryEl = document.getElementById('customerLedgerSelectionSummary');
  const mergeBtn = document.getElementById('customerLedgerMergeSelectedBtn');
  const undoBtn = document.getElementById('customerLedgerUndoMergeBtn');
  const clearBtn = document.getElementById('customerLedgerClearSelectionBtn');
  const selectAll = document.getElementById('customerLedgerSelectAll');

  const selectedRows = getSelectedCustomerRows();
  const totalRows = Array.isArray(customerLedgerRowsCache) ? customerLedgerRowsCache.length : 0;
  const selectedCount = selectedRows.length;
  const selectedBranchSet = new Set(
    selectedRows.map((row) => normalizeBranchId(row?.branch_id) || '0')
  );
  const hasMixedBranches = selectedBranchSet.size > 1;
  const canMerge = selectedCount >= 2 && !hasMixedBranches;

  if (summaryEl) {
    if (selectedCount === 0) {
      summaryEl.textContent = 'لم يتم تحديد أي عميل';
    } else if (hasMixedBranches) {
      summaryEl.textContent = `تم تحديد ${selectedCount} عميل (من أكثر من فرع - الدمج غير مسموح)`;
    } else {
      const branchLabel = selectedRows[0]?.branch_name || 'غير محدد';
      summaryEl.textContent = `تم تحديد ${selectedCount} عميل للدمج - الفرع: ${branchLabel}`;
    }
  }

  if (mergeBtn) mergeBtn.disabled = !canMerge;
  if (undoBtn) {
    undoBtn.disabled = !latestUndoableCustomerMerge;
    const createdAtText = latestUndoableCustomerMerge?.created_at
      ? formatMergeDateTime(latestUndoableCustomerMerge.created_at)
      : '';
    undoBtn.title = latestUndoableCustomerMerge
      ? `فك آخر دمج (${createdAtText || 'بدون تاريخ'})`
      : 'لا يوجد دمج متاح للفك';
  }
  if (clearBtn) clearBtn.disabled = selectedCount === 0;

  if (selectAll) {
    if (totalRows === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
    } else {
      const allSelected = selectedCount > 0 && selectedCount === totalRows;
      const someSelected = selectedCount > 0 && selectedCount < totalRows;
      selectAll.disabled = false;
      selectAll.checked = allSelected;
      selectAll.indeterminate = someSelected;
    }
  }
}

async function mergeSelectedCustomersInLedger() {
  const selectedRows = getSelectedCustomerRows();
  if (selectedRows.length < 2) {
    showTransactionAlert('حدد عميلين على الأقل لتنفيذ الدمج', 'danger');
    return;
  }

  const branchIds = Array.from(new Set(
    selectedRows.map((row) => normalizeBranchId(row?.branch_id) || '0')
  ));
  if (branchIds.length !== 1) {
    showTransactionAlert('لا يمكن دمج عملاء من أكثر من فرع. اختر عملاء من نفس الفرع فقط', 'danger');
    return;
  }

  const uniqueNames = Array.from(new Set(
    selectedRows
      .map((row) => String(row?.customer_name == null ? '' : row.customer_name))
      .filter((name) => name.trim().length > 0)
  ));
  if (uniqueNames.length < 2) {
    showTransactionAlert('حدد عميلين مختلفين على الأقل لتنفيذ الدمج', 'danger');
    return;
  }

  const targetName = await promptMergeTargetCustomerName(uniqueNames);
  if (!targetName) return;

  const sourceNames = uniqueNames.filter((name) => name !== targetName);
  if (sourceNames.length === 0) {
    showTransactionAlert('اختر عميلاً هدفاً مختلفاً عن العملاء المراد دمجهم', 'danger');
    return;
  }

  const normalizedBranchId = normalizeBranchId(branchIds[0]);
  const branchLabel = selectedRows[0]?.branch_name || 'غير محدد';
  const preview = await buildCustomerMergePreview(sourceNames, targetName, normalizedBranchId);
  const confirmed = await confirmCustomerMergeExecution({
    sourceNames,
    targetName,
    branchLabel,
    preview
  });
  if (!confirmed) return;

  try {
    const mergeResult = await executeCustomerMergeTransaction(sourceNames, targetName, normalizedBranchId);
    selectedCustomerMergeKeys.clear();
    await loadCustomerLedger();

    const currentName = String(currentCustomerStatementContext?.customerName || '');
    const currentBranch = normalizeBranchId(currentCustomerStatementContext?.forcedBranchId || '');
    const shouldRefreshStatement = currentBranch === normalizedBranchId
      && (sourceNames.includes(currentName) || currentName === targetName);
    if (shouldRefreshStatement) {
      await showCustomerStatement(targetName, normalizedBranchId);
    }

    const changed = Number(mergeResult?.totalChanges || 0);
    showTransactionAlert(`تم دمج العملاء المحددين بنجاح (${changed} حركة محدثة)`, 'success');
  } catch (error) {
    console.error('Error merging selected customers:', error);
    showTransactionAlert(`تعذر دمج العملاء: ${mapCustomerLedgerDbError(error)}`, 'danger');
  }
}

async function promptMergeTargetCustomerName(candidateNames) {
  const names = Array.isArray(candidateNames)
    ? candidateNames.filter((name) => String(name == null ? '' : name).trim().length > 0)
    : [];
  if (names.length < 2) return null;

  if (window.Swal) {
    const inputOptions = {};
    names.forEach((name, index) => {
      inputOptions[String(index)] = `${index + 1}) ${formatCustomerNameForSelection(name)}`;
    });

    const result = await window.Swal.fire({
      title: 'اختيار العميل الهدف',
      text: 'العميل الهدف هو الاسم الذي سيبقى بعد الدمج',
      input: 'select',
      inputOptions,
      inputPlaceholder: 'اختر العميل الهدف',
      showCancelButton: true,
      confirmButtonText: 'متابعة',
      cancelButtonText: 'إلغاء',
      inputValidator: (value) => {
        if (value == null || value === '') return 'اختر العميل الهدف';
        return null;
      }
    });

    if (!result.isConfirmed) return null;

    const selectedIndex = Number.parseInt(String(result.value), 10);
    if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= names.length) return null;
    return names[selectedIndex];
  }

  const optionsText = names
    .map((name, index) => `${index + 1}) ${formatCustomerNameForSelection(name)}`)
    .join('\n');
  const raw = window.prompt(`اختر رقم الاسم النهائي (العميل الهدف):\n${optionsText}`, '1');
  if (raw == null) return null;
  const selectedIndex = Number.parseInt(String(raw || '').trim(), 10) - 1;
  if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= names.length) {
    showTransactionAlert('الاختيار غير صالح', 'danger');
    return null;
  }
  return names[selectedIndex];
}

function formatCustomerNameForSelection(name) {
  const raw = String(name == null ? '' : name);
  const visible = raw.trim() || raw || '(فارغ)';
  const hasLeading = /^\s+/.test(raw);
  const hasTrailing = /\s+$/.test(raw);
  const hasInternalMultiSpaces = /\s{2,}/.test(raw.trim());
  const notes = [];

  if (hasLeading) notes.push('مسافة بالبداية');
  if (hasTrailing) notes.push('مسافة بالنهاية');
  if (hasInternalMultiSpaces) notes.push('مسافات داخلية متعددة');

  if (notes.length === 0) return visible;
  return `${visible} (${notes.join('، ')})`;
}

async function getManualCustomersDefaultBranchId() {
  if (manualCustomersDefaultBranchIdCache !== null) {
    return manualCustomersDefaultBranchIdCache;
  }

  try {
    const rows = await ledgerIpc.invoke(
      'db-query',
      'SELECT COALESCE((SELECT branch_id FROM cashiers WHERE id = 1), 0) AS branch_id'
    );
    const branchId = Number(rows?.[0]?.branch_id || 0);
    manualCustomersDefaultBranchIdCache = Number.isFinite(branchId) ? branchId : 0;
  } catch (_error) {
    manualCustomersDefaultBranchIdCache = 0;
  }

  return manualCustomersDefaultBranchIdCache;
}

async function shouldApplyManualCustomersForBranch(branchId) {
  const normalizedBranchId = normalizeBranchId(branchId);
  const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
  const manualBranchId = await getManualCustomersDefaultBranchId();
  return numericBranchId === Number(manualBranchId || 0);
}

async function buildCustomerMergePreview(sourceNames, targetName, branchId) {
  const [sourceTotals, targetTotals] = await Promise.all([
    fetchCustomerAggregateForNames(sourceNames, branchId),
    fetchCustomerAggregateForNames([targetName], branchId)
  ]);

  return {
    source: sourceTotals,
    target: targetTotals,
    after: {
      movementsCount: Number(sourceTotals.movementsCount || 0) + Number(targetTotals.movementsCount || 0),
      totalPostpaid: Number(sourceTotals.totalPostpaid || 0) + Number(targetTotals.totalPostpaid || 0),
      totalReceipts: Number(sourceTotals.totalReceipts || 0) + Number(targetTotals.totalReceipts || 0)
    }
  };
}

async function fetchCustomerAggregateForNames(names, branchId) {
  const safeNames = Array.from(new Set(
    (Array.isArray(names) ? names : [])
      .map((name) => String(name == null ? '' : name))
      .filter((name) => name.trim().length > 0)
  ));

  if (safeNames.length === 0) {
    return {
      movementsCount: 0,
      totalPostpaid: 0,
      totalReceipts: 0,
      balance: 0
    };
  }

  const normalizedBranchId = normalizeBranchId(branchId);
  const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
  const placeholders = safeNames.map(() => '?').join(', ');
  const includeManual = await shouldApplyManualCustomersForBranch(normalizedBranchId);

  const unionParts = [
    `SELECT ps.amount AS amount, 'postpaid' AS tx_type
     FROM postpaid_sales ps
     LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
     LEFT JOIN cashiers c ON c.id = r.cashier_id
     WHERE ps.customer_name IN (${placeholders})
       AND COALESCE(c.branch_id, 0) = ?`,
    `SELECT cr.amount AS amount, 'receipt' AS tx_type
     FROM customer_receipts cr
     LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
     LEFT JOIN cashiers c ON c.id = r.cashier_id
     WHERE cr.customer_name IN (${placeholders})
       AND COALESCE(c.branch_id, 0) = ?`
  ];

  const params = [
    ...safeNames,
    numericBranchId,
    ...safeNames,
    numericBranchId
  ];

  if (includeManual) {
    unionParts.push(
      `SELECT mp.amount AS amount, 'postpaid' AS tx_type
       FROM manual_postpaid_sales mp
       WHERE mp.customer_name IN (${placeholders})`
    );
    unionParts.push(
      `SELECT mr.amount AS amount, 'receipt' AS tx_type
       FROM manual_customer_receipts mr
       WHERE mr.customer_name IN (${placeholders})`
    );
    params.push(...safeNames, ...safeNames);
  }

  const sql = `
    SELECT
      COUNT(*) AS movements_count,
      COALESCE(SUM(CASE WHEN tx_type = 'postpaid' THEN amount ELSE 0 END), 0) AS total_postpaid,
      COALESCE(SUM(CASE WHEN tx_type = 'receipt' THEN amount ELSE 0 END), 0) AS total_receipts
    FROM (
      ${unionParts.join('\nUNION ALL\n')}
    ) tx
  `;

  const rows = await ledgerIpc.invoke('db-query', sql, params);
  const row = Array.isArray(rows) ? rows[0] : null;
  const totalPostpaid = Number(row?.total_postpaid || 0);
  const totalReceipts = Number(row?.total_receipts || 0);
  return {
    movementsCount: Number(row?.movements_count || 0),
    totalPostpaid,
    totalReceipts,
    balance: totalPostpaid - totalReceipts
  };
}

async function confirmCustomerMergeExecution({ sourceNames, targetName, branchLabel, preview }) {
  const fmt = getCurrencyFormatter();
  const mergedNamesLabel = Array.isArray(sourceNames) ? sourceNames.join(' + ') : '';
  const movedCount = Number(preview?.source?.movementsCount || 0);
  const finalCount = Number(preview?.after?.movementsCount || 0);
  const finalPostpaid = Number(preview?.after?.totalPostpaid || 0);
  const finalReceipts = Number(preview?.after?.totalReceipts || 0);
  const finalBalance = finalPostpaid - finalReceipts;

  if (window.Swal) {
    const result = await window.Swal.fire({
      icon: 'warning',
      title: 'تأكيد دمج العملاء',
      html: `
        <div style="text-align:right;line-height:1.8">
          <div><strong>الفرع:</strong> ${escapeHtml(branchLabel || 'غير محدد')}</div>
          <div><strong>سيتم دمج:</strong> ${escapeHtml(mergedNamesLabel || '-')}</div>
          <div><strong>في العميل:</strong> ${escapeHtml(targetName || '-')}</div>
          <hr style="margin:8px 0;">
          <div><strong>الحركات المنقولة:</strong> ${escapeHtml(String(movedCount))}</div>
          <div><strong>عدد الحركات بعد الدمج:</strong> ${escapeHtml(String(finalCount))}</div>
          <div><strong>إجمالي الأجل بعد الدمج:</strong> ${escapeHtml(fmt(finalPostpaid))}</div>
          <div><strong>إجمالي المقبوضات بعد الدمج:</strong> ${escapeHtml(fmt(finalReceipts))}</div>
          <div><strong>الرصيد بعد الدمج:</strong> ${escapeHtml(fmt(finalBalance))}</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'تنفيذ الدمج',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#d33'
    });
    return !!result.isConfirmed;
  }

  return window.confirm(
    `سيتم دمج العملاء (${mergedNamesLabel}) في (${targetName}) ضمن فرع (${branchLabel}). هل تريد المتابعة؟`
  );
}

async function ensureLedgerMergeHistoryTable() {
  if (customerLedgerMergeHistoryReady) {
    return;
  }

  await ledgerIpc.invoke(
    'db-run',
    `CREATE TABLE IF NOT EXISTS ledger_merge_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      branch_id INTEGER DEFAULT 0,
      target_name TEXT NOT NULL,
      source_names_json TEXT NOT NULL,
      affected_rows_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      undone_at DATETIME,
      undo_details_json TEXT
    )`
  );
  await ledgerIpc.invoke(
    'db-run',
    'CREATE INDEX IF NOT EXISTS idx_ledger_merge_history_entity_open ON ledger_merge_history(entity_type, undone_at, id DESC)'
  );

  customerLedgerMergeHistoryReady = true;
}

function safeParseJson(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizeMergeRowEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((row) => {
      const id = Number(row?.id);
      const oldNameSource = row?.old_name == null ? row?.oldName : row.old_name;
      const oldName = String(oldNameSource == null ? '' : oldNameSource);
      if (!Number.isFinite(id) || id <= 0) {
        return null;
      }
      return {
        id,
        old_name: oldName
      };
    })
    .filter((row) => !!row);
}

function normalizeCustomerMergeAffectedRows(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  return {
    postpaid_sales: normalizeMergeRowEntries(raw.postpaid_sales),
    customer_receipts: normalizeMergeRowEntries(raw.customer_receipts),
    manual_postpaid_sales: normalizeMergeRowEntries(raw.manual_postpaid_sales),
    manual_customer_receipts: normalizeMergeRowEntries(raw.manual_customer_receipts)
  };
}

function countCustomerMergeAffectedRows(affectedRows) {
  const normalized = normalizeCustomerMergeAffectedRows(affectedRows);
  return (
    normalized.postpaid_sales.length +
    normalized.customer_receipts.length +
    normalized.manual_postpaid_sales.length +
    normalized.manual_customer_receipts.length
  );
}

async function fetchLatestUndoableCustomerMerge() {
  await ensureLedgerMergeHistoryTable();
  const rows = await ledgerIpc.invoke(
    'db-query',
    `SELECT h.id, h.branch_id, h.target_name, h.source_names_json, h.affected_rows_json, h.created_at,
            COALESCE(b.branch_name, 'غير محدد') AS branch_name
     FROM ledger_merge_history h
     LEFT JOIN branches b ON b.id = h.branch_id
     WHERE h.entity_type = 'customer' AND h.undone_at IS NULL
     ORDER BY h.id DESC
     LIMIT 1`
  );

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return null;
  }

  const sourceNames = Array.from(new Set(
    (safeParseJson(row.source_names_json, []) || [])
      .map((name) => String(name == null ? '' : name))
      .filter((name) => name.trim().length > 0)
  ));

  const affectedRows = normalizeCustomerMergeAffectedRows(
    safeParseJson(row.affected_rows_json, {})
  );

  return {
    id: Number(row.id || 0),
    branch_id: normalizeBranchId(row.branch_id) || '0',
    branch_name: String(row.branch_name == null ? '' : row.branch_name),
    target_name: String(row.target_name == null ? '' : row.target_name),
    source_names: sourceNames,
    affected_rows: affectedRows,
    created_at: row.created_at || ''
  };
}

async function refreshCustomerUndoMergeState() {
  try {
    latestUndoableCustomerMerge = await fetchLatestUndoableCustomerMerge();
  } catch (error) {
    console.error('Error loading latest customer merge history:', error);
    latestUndoableCustomerMerge = null;
  }
  updateCustomerLedgerSelectionUi();
}

async function fetchCustomerMergeAffectedRows({ safeSourceNames, numericBranchId, includeManual, placeholders }) {
  const postpaidRows = await ledgerIpc.invoke(
    'db-query',
    `SELECT ps.id AS id, ps.customer_name AS old_name
     FROM postpaid_sales ps
     WHERE ps.customer_name IN (${placeholders})
       AND ps.reconciliation_id IN (
         SELECT r.id
         FROM reconciliations r
         LEFT JOIN cashiers c ON c.id = r.cashier_id
         WHERE COALESCE(c.branch_id, 0) = ?
       )`,
    [...safeSourceNames, numericBranchId]
  );

  const receiptRows = await ledgerIpc.invoke(
    'db-query',
    `SELECT cr.id AS id, cr.customer_name AS old_name
     FROM customer_receipts cr
     WHERE cr.customer_name IN (${placeholders})
       AND cr.reconciliation_id IN (
         SELECT r.id
         FROM reconciliations r
         LEFT JOIN cashiers c ON c.id = r.cashier_id
         WHERE COALESCE(c.branch_id, 0) = ?
       )`,
    [...safeSourceNames, numericBranchId]
  );

  let manualPostpaidRows = [];
  let manualReceiptRows = [];
  if (includeManual) {
    manualPostpaidRows = await ledgerIpc.invoke(
      'db-query',
      `SELECT id, customer_name AS old_name
       FROM manual_postpaid_sales
       WHERE customer_name IN (${placeholders})`,
      [...safeSourceNames]
    );
    manualReceiptRows = await ledgerIpc.invoke(
      'db-query',
      `SELECT id, customer_name AS old_name
       FROM manual_customer_receipts
       WHERE customer_name IN (${placeholders})`,
      [...safeSourceNames]
    );
  }

  return normalizeCustomerMergeAffectedRows({
    postpaid_sales: postpaidRows || [],
    customer_receipts: receiptRows || [],
    manual_postpaid_sales: manualPostpaidRows || [],
    manual_customer_receipts: manualReceiptRows || []
  });
}

async function recordCustomerMergeHistory({ numericBranchId, safeTargetName, safeSourceNames, affectedRows }) {
  await ensureLedgerMergeHistoryTable();
  const result = await ledgerIpc.invoke(
    'db-run',
    `INSERT INTO ledger_merge_history
      (entity_type, branch_id, target_name, source_names_json, affected_rows_json)
     VALUES ('customer', ?, ?, ?, ?)`,
    [
      numericBranchId,
      safeTargetName,
      JSON.stringify(safeSourceNames),
      JSON.stringify(affectedRows)
    ]
  );
  return Number(result?.lastInsertRowid || 0);
}

async function executeCustomerMergeTransaction(sourceNames, targetName, branchId) {
  const safeTargetName = String(targetName == null ? '' : targetName);
  const safeSourceNames = Array.from(new Set(
    (Array.isArray(sourceNames) ? sourceNames : [])
      .map((name) => String(name == null ? '' : name))
      .filter((name) => name.trim().length > 0 && name !== safeTargetName)
  ));
  if (safeSourceNames.length === 0) {
    return { postpaidChanges: 0, receiptChanges: 0, manualChanges: 0, totalChanges: 0 };
  }

  const normalizedBranchId = normalizeBranchId(branchId);
  const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
  const placeholders = safeSourceNames.map(() => '?').join(', ');
  const includeManual = await shouldApplyManualCustomersForBranch(normalizedBranchId);
  await ensureLedgerMergeHistoryTable();

  await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
  let committed = false;
  try {
    const affectedRows = await fetchCustomerMergeAffectedRows({
      safeSourceNames,
      numericBranchId,
      includeManual,
      placeholders
    });
    const affectedRowsCount = countCustomerMergeAffectedRows(affectedRows);
    if (affectedRowsCount <= 0) {
      throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من الفرع/الاسم المختار.');
    }

    const postpaidResult = await ledgerIpc.invoke(
      'db-run',
      `UPDATE postpaid_sales
       SET customer_name = ?
       WHERE customer_name IN (${placeholders})
         AND reconciliation_id IN (
           SELECT r.id
           FROM reconciliations r
           LEFT JOIN cashiers c ON c.id = r.cashier_id
           WHERE COALESCE(c.branch_id, 0) = ?
         )`,
      [safeTargetName, ...safeSourceNames, numericBranchId]
    );

    const receiptResult = await ledgerIpc.invoke(
      'db-run',
      `UPDATE customer_receipts
       SET customer_name = ?
       WHERE customer_name IN (${placeholders})
         AND reconciliation_id IN (
           SELECT r.id
           FROM reconciliations r
           LEFT JOIN cashiers c ON c.id = r.cashier_id
           WHERE COALESCE(c.branch_id, 0) = ?
         )`,
      [safeTargetName, ...safeSourceNames, numericBranchId]
    );

    let manualChanges = 0;
    if (includeManual) {
      const manualPostpaidResult = await ledgerIpc.invoke(
        'db-run',
        `UPDATE manual_postpaid_sales
         SET customer_name = ?
         WHERE customer_name IN (${placeholders})`,
        [safeTargetName, ...safeSourceNames]
      );

      const manualReceiptResult = await ledgerIpc.invoke(
        'db-run',
        `UPDATE manual_customer_receipts
         SET customer_name = ?
         WHERE customer_name IN (${placeholders})`,
        [safeTargetName, ...safeSourceNames]
      );

      manualChanges =
        Number(manualPostpaidResult?.changes || 0) +
        Number(manualReceiptResult?.changes || 0);
    }

    const postpaidChanges = Number(postpaidResult?.changes || 0);
    const receiptChanges = Number(receiptResult?.changes || 0);
    const totalChanges = postpaidChanges + receiptChanges + manualChanges;
    if (totalChanges <= 0) {
      throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من الفرع/الاسم المختار.');
    }

    const mergeHistoryId = await recordCustomerMergeHistory({
      numericBranchId,
      safeTargetName,
      safeSourceNames,
      affectedRows
    });

    await ledgerIpc.invoke('db-run', 'COMMIT');
    committed = true;
    await refreshCustomerUndoMergeState();
    return {
      postpaidChanges,
      receiptChanges,
      manualChanges,
      totalChanges,
      mergeHistoryId
    };
  } catch (error) {
    if (!committed) {
      try {
        await ledgerIpc.invoke('db-run', 'ROLLBACK');
      } catch (rollbackError) {
        console.error('Customer merge rollback failed:', rollbackError);
      }
    }
    throw error;
  }
}

async function revertCustomerNamesByRowId(tableName, columnName, entries, targetName) {
  const safeEntries = normalizeMergeRowEntries(entries);
  if (safeEntries.length === 0) {
    return 0;
  }

  let changed = 0;
  for (const entry of safeEntries) {
    const result = await ledgerIpc.invoke(
      'db-run',
      `UPDATE ${tableName}
       SET ${columnName} = ?
       WHERE id = ?
         AND ${columnName} = ?`,
      [entry.old_name, entry.id, targetName]
    );
    changed += Number(result?.changes || 0);
  }
  return changed;
}

async function rollbackCustomerMergeRecord(mergeRecord) {
  const recordId = Number(mergeRecord?.id || 0);
  if (!Number.isFinite(recordId) || recordId <= 0) {
    throw new Error('سجل الدمج غير صالح');
  }

  const safeTargetName = String(mergeRecord?.target_name == null ? '' : mergeRecord.target_name);
  const affectedRows = normalizeCustomerMergeAffectedRows(mergeRecord?.affected_rows);
  const expectedRows = countCustomerMergeAffectedRows(affectedRows);
  if (expectedRows <= 0) {
    throw new Error('لا توجد قيود محفوظة لفك هذا الدمج');
  }
  await ensureLedgerMergeHistoryTable();

  await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
  let committed = false;
  try {
    const postpaidRestored = await revertCustomerNamesByRowId(
      'postpaid_sales',
      'customer_name',
      affectedRows.postpaid_sales,
      safeTargetName
    );
    const receiptsRestored = await revertCustomerNamesByRowId(
      'customer_receipts',
      'customer_name',
      affectedRows.customer_receipts,
      safeTargetName
    );
    const manualPostpaidRestored = await revertCustomerNamesByRowId(
      'manual_postpaid_sales',
      'customer_name',
      affectedRows.manual_postpaid_sales,
      safeTargetName
    );
    const manualReceiptsRestored = await revertCustomerNamesByRowId(
      'manual_customer_receipts',
      'customer_name',
      affectedRows.manual_customer_receipts,
      safeTargetName
    );

    const restoredTotal = postpaidRestored + receiptsRestored + manualPostpaidRestored + manualReceiptsRestored;
    if (restoredTotal <= 0) {
      throw new Error('لا يمكن فك الدمج: لم يتم العثور على قيود مطابقة للحالة الحالية.');
    }

    const skippedRows = Math.max(0, expectedRows - restoredTotal);
    const undoDetails = {
      restored: {
        postpaid_sales: postpaidRestored,
        customer_receipts: receiptsRestored,
        manual_postpaid_sales: manualPostpaidRestored,
        manual_customer_receipts: manualReceiptsRestored
      },
      expected_rows: expectedRows,
      skipped_rows: skippedRows
    };

    const markResult = await ledgerIpc.invoke(
      'db-run',
      `UPDATE ledger_merge_history
       SET undone_at = CURRENT_TIMESTAMP,
           undo_details_json = ?
       WHERE id = ?
         AND undone_at IS NULL`,
      [JSON.stringify(undoDetails), recordId]
    );
    if (Number(markResult?.changes || 0) <= 0) {
      throw new Error('تعذر تحديث حالة سجل الدمج');
    }

    await ledgerIpc.invoke('db-run', 'COMMIT');
    committed = true;
    await refreshCustomerUndoMergeState();
    return {
      restoredTotal,
      expectedRows,
      skippedRows
    };
  } catch (error) {
    if (!committed) {
      try {
        await ledgerIpc.invoke('db-run', 'ROLLBACK');
      } catch (rollbackError) {
        console.error('Customer merge undo rollback failed:', rollbackError);
      }
    }
    throw error;
  }
}

async function confirmCustomerMergeUndoExecution(mergeRecord) {
  const sourceNames = Array.isArray(mergeRecord?.source_names) ? mergeRecord.source_names : [];
  const sourceLabel = sourceNames.length > 0 ? sourceNames.join(' + ') : '-';
  const affectedCount = countCustomerMergeAffectedRows(mergeRecord?.affected_rows);
  const branchLabel = mergeRecord?.branch_name || mergeRecord?.branch_id || 'غير محدد';
  const createdAt = formatMergeDateTime(mergeRecord?.created_at);

  if (window.Swal) {
    const result = await window.Swal.fire({
      icon: 'warning',
      title: 'تأكيد فك آخر دمج (العملاء)',
      html: `
        <div style="text-align:right;line-height:1.8">
          <div><strong>تاريخ الدمج:</strong> ${escapeHtml(createdAt || '-')}</div>
          <div><strong>الفرع:</strong> ${escapeHtml(String(branchLabel))}</div>
          <div><strong>الاسم الهدف:</strong> ${escapeHtml(mergeRecord?.target_name || '-')}</div>
          <div><strong>الأسماء المدمجة:</strong> ${escapeHtml(sourceLabel)}</div>
          <div><strong>عدد القيود المتوقع استرجاعها:</strong> ${escapeHtml(String(affectedCount))}</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'فك الدمج',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#d33'
    });
    return !!result.isConfirmed;
  }

  return window.confirm(
    `سيتم فك آخر دمج للعملاء (${sourceLabel}) من (${mergeRecord?.target_name || '-'}) بعدد قيود متوقع ${affectedCount}. هل تريد المتابعة؟`
  );
}

async function undoLastCustomerMergeInLedger() {
  try {
    const mergeRecord = latestUndoableCustomerMerge || await fetchLatestUndoableCustomerMerge();
    if (!mergeRecord) {
      showTransactionAlert('لا يوجد دمج محفوظ يمكن فكه حاليًا', 'info');
      await refreshCustomerUndoMergeState();
      return;
    }

    const confirmed = await confirmCustomerMergeUndoExecution(mergeRecord);
    if (!confirmed) {
      return;
    }

    const undoResult = await rollbackCustomerMergeRecord(mergeRecord);
    selectedCustomerMergeKeys.clear();
    await loadCustomerLedger();

    const currentName = String(currentCustomerStatementContext?.customerName || '');
    const currentBranch = normalizeBranchId(currentCustomerStatementContext?.forcedBranchId || '');
    const mergeBranch = normalizeBranchId(mergeRecord.branch_id);
    const impactedNames = new Set([mergeRecord.target_name, ...(mergeRecord.source_names || [])]);
    if (currentBranch === mergeBranch && impactedNames.has(currentName)) {
      await showCustomerStatement(currentName, mergeBranch);
    }

    const skippedText = undoResult.skippedRows > 0
      ? `، مع ${undoResult.skippedRows} قيد لم يتغير لأنه عُدّل بعد الدمج`
      : '';
    showTransactionAlert(
      `تم فك آخر دمج للعملاء بنجاح (${undoResult.restoredTotal} قيد مسترجع${skippedText})`,
      'success'
    );
  } catch (error) {
    console.error('Error undoing customer merge:', error);
    showTransactionAlert(`تعذر فك الدمج: ${mapCustomerLedgerDbError(error)}`, 'danger');
  }
}

async function renameCustomerNameInLedger(customerName, branchId = '') {
  const oldName = String(customerName == null ? '' : customerName);
  if (!oldName.trim()) return;

  try {
    const normalizedBranchId = normalizeBranchId(branchId);
    const nextName = await promptForCustomerRename(oldName);
    if (nextName === null) return;
    if (nextName === oldName) {
      showTransactionAlert('لم يتم تغيير الاسم', 'info');
      return;
    }

    const existsInBranch = await doesCustomerNameExistInBranch(nextName, normalizedBranchId);
    if (existsInBranch) {
      const confirmed = await confirmCustomerRenameMerge(nextName);
      if (!confirmed) return;
    }

    const renameResult = await executeCustomerMergeTransaction([oldName], nextName, normalizedBranchId);
    await loadCustomerLedger();

    const currentName = String(currentCustomerStatementContext?.customerName || '');
    const currentBranch = normalizeBranchId(currentCustomerStatementContext?.forcedBranchId || '');
    const shouldRefreshStatement = currentBranch === normalizedBranchId && currentName === oldName;
    if (shouldRefreshStatement) {
      await showCustomerStatement(nextName, normalizedBranchId);
    }

    const changed = Number(renameResult?.totalChanges || 0);
    showTransactionAlert(`تم تعديل اسم العميل بنجاح (${changed} حركة محدثة)`, 'success');
  } catch (error) {
    console.error('Error renaming customer name in ledger:', error);
    showTransactionAlert(`تعذر تعديل اسم العميل: ${mapCustomerLedgerDbError(error)}`, 'danger');
  }
}

async function doesCustomerNameExistInBranch(name, branchId) {
  const targetName = String(name == null ? '' : name);
  if (!targetName.trim()) return false;

  const normalizedBranchId = normalizeBranchId(branchId);
  const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
  const includeManual = await shouldApplyManualCustomersForBranch(normalizedBranchId);

  const reconciledRows = await ledgerIpc.invoke(
    'db-query',
    `SELECT
       (CASE WHEN EXISTS (
         SELECT 1
         FROM postpaid_sales ps
         LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
         LEFT JOIN cashiers c ON c.id = r.cashier_id
         WHERE ps.customer_name = ?
           AND COALESCE(c.branch_id, 0) = ?
       ) THEN 1 ELSE 0 END)
       +
       (CASE WHEN EXISTS (
         SELECT 1
         FROM customer_receipts cr
         LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
         LEFT JOIN cashiers c ON c.id = r.cashier_id
         WHERE cr.customer_name = ?
           AND COALESCE(c.branch_id, 0) = ?
       ) THEN 1 ELSE 0 END) AS total`,
    [targetName, numericBranchId, targetName, numericBranchId]
  );
  const reconciledTotal = Number(reconciledRows?.[0]?.total || 0);
  if (reconciledTotal > 0) return true;

  if (!includeManual) return false;

  const manualRows = await ledgerIpc.invoke(
    'db-query',
    `SELECT
       (CASE WHEN EXISTS (
         SELECT 1 FROM manual_postpaid_sales WHERE customer_name = ?
       ) THEN 1 ELSE 0 END)
       +
       (CASE WHEN EXISTS (
         SELECT 1 FROM manual_customer_receipts WHERE customer_name = ?
       ) THEN 1 ELSE 0 END) AS total`,
    [targetName, targetName]
  );
  return Number(manualRows?.[0]?.total || 0) > 0;
}

async function promptForCustomerRename(currentName) {
  if (window.Swal) {
    const result = await window.Swal.fire({
      title: 'تعديل اسم العميل',
      input: 'text',
      inputLabel: 'الاسم الجديد',
      inputValue: currentName,
      inputPlaceholder: 'اكتب اسم العميل الجديد',
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      inputValidator: (value) => {
        const next = String(value || '').trim();
        if (!next) return 'اسم العميل مطلوب';
        if (next.length > 120) return 'اسم العميل طويل جداً';
        return null;
      }
    });
    if (!result.isConfirmed) return null;
    return String(result.value || '').trim();
  }

  const value = window.prompt('أدخل الاسم الجديد للعميل:', currentName);
  if (value == null) return null;
  const next = String(value).trim();
  if (!next) {
    showTransactionAlert('اسم العميل مطلوب', 'danger');
    return null;
  }
  if (next.length > 120) {
    showTransactionAlert('اسم العميل طويل جداً', 'danger');
    return null;
  }
  return next;
}

async function confirmCustomerRenameMerge(nextName) {
  if (window.Swal) {
    const result = await window.Swal.fire({
      icon: 'warning',
      title: 'الاسم موجود مسبقاً',
      text: `الاسم "${nextName}" موجود بالفعل في نفس الفرع. المتابعة ستدمج الحركات تحت نفس الاسم.`,
      showCancelButton: true,
      confirmButtonText: 'متابعة الدمج',
      cancelButtonText: 'إلغاء'
    });
    return !!result.isConfirmed;
  }
  return window.confirm('الاسم موجود مسبقاً في نفس الفرع. المتابعة ستدمج الحركات. هل تريد الاستمرار؟');
}

// --------- Statement (single customer) ---------
async function showCustomerStatement(customerName, forcedBranchId = '') {
  try {
    const name = String(customerName == null ? '' : customerName);
    if (!name.trim()) return;
    const normalizedForcedBranchId = normalizeBranchId(forcedBranchId);
    currentCustomerStatementContext = {
      customerName: name,
      forcedBranchId: normalizedForcedBranchId
    };

    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);

    const fmt = getCurrencyFormatter();
    const mTitle = document.getElementById('customerStatementTitle');
    if (mTitle) mTitle.textContent = `كشف حساب - ${name}`;

    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(0);
    if (sRec) sRec.textContent = fmt(0);
    if (sBal) sBal.textContent = fmt(0);

    const tbody = document.getElementById('customerStatementTable');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">جاري تحميل الحركات...</td></tr>`;
    }

    setupStatementEvents(name);
    // Open modal immediately to avoid perceived UI freeze while data loads.
    if (modalHandler && typeof modalHandler.setupStatementModal === 'function') {
      modalHandler.setupStatementModal(name);
    } else {
      const modalEl = document.getElementById('customerStatementModal');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      }
    }

    // Reconciled transactions
    const sqlPost = `
      SELECT ps.id AS row_id, ps.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
             c.name as cashier_name
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    const sqlRec = `
      SELECT cr.id AS row_id, cr.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
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
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
             amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const sqlManualRec = `
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
             amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_customer_receipts
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    // SQL starts with customer_name = ?, then date placeholders.
    const params = [name, ...dateFilter.params];
    const paramsRec = [name, ...dateFilter.params];

    const [postTx, recTx, manualPostTx, manualRecTx] = await Promise.all([
      ledgerIpc.invoke('db-query', sqlPost, params),
      ledgerIpc.invoke('db-query', sqlRec, paramsRec),
      ledgerIpc.invoke('db-query', sqlManualPost, paramsRec),
      ledgerIpc.invoke('db-query', sqlManualRec, paramsRec)
    ]);

    const allTx = sortTransactionsForStatement([
      ...(postTx || []),
      ...(recTx || []),
      ...(manualPostTx || []),
      ...(manualRecTx || [])
    ]);
    renderCustomerStatementRows(name, allTx, 'لا توجد حركات');
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
    const name = String(customerName == null ? '' : customerName);
    if (!name.trim()) return;

    // Reconciled transactions with date filter
    const sqlPost = `
      SELECT ps.id AS row_id, ps.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
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
      SELECT cr.id AS row_id, cr.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
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
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
             amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFrom ? ' AND created_at >= ?' : ''}
      ${dateTo ? ' AND created_at <= ?' : ''}
    `;

    const sqlManualRec = `
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
             amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
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

    const [postTx, recTx, manualPostTx, manualRecTx] = await Promise.all([
      ledgerIpc.invoke('db-query', sqlPost, params),
      ledgerIpc.invoke('db-query', sqlRec, params),
      ledgerIpc.invoke('db-query', sqlManualPost, paramsManual),
      ledgerIpc.invoke('db-query', sqlManualRec, paramsManual)
    ]);

    const allTx = sortTransactionsForStatement([
      ...(postTx || []),
      ...(recTx || []),
      ...(manualPostTx || []),
      ...(manualRecTx || [])
    ]);
    renderCustomerStatementRows(name, allTx, 'لا توجد حركات في الفترة المحددة');

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
      showTransactionAlert(
        'فشلت عملية إضافة الحركة: ' + mapCustomerLedgerDbError(result?.error || 'خطأ غير معروف'),
        'danger'
      );
    }
  } catch (error) {
    console.error('Error adding transaction:', error);
    showTransactionAlert('حدث خطأ أثناء إضافة الحركة: ' + mapCustomerLedgerDbError(error), 'danger');
  }
}

// تحديث بيانات الكشف فقط دون إعادة إظهار المودال
async function refreshStatementData(customerName) {
  try {
    const name = String(customerName == null ? '' : customerName);
    if (!name.trim()) return;

    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);

    // Reconciled transactions
    const sqlPost = `
      SELECT ps.id AS row_id, ps.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
             c.name as cashier_name
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      LEFT JOIN cashiers c ON r.cashier_id = c.id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    const sqlRec = `
      SELECT cr.id AS row_id, cr.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
             cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
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
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' AS source,
             amount, 'postpaid' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_postpaid_sales
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    const sqlManualRec = `
      SELECT id AS row_id, NULL AS reconciliation_id, 'manual' AS source,
             amount, 'receipt' as type, created_at as tx_date,
             created_at, null as rec_no, reason,
             'إدخال يدوي' as cashier_name
      FROM manual_customer_receipts
      WHERE customer_name = ?
      ${dateFilter.sql.replace(/r\.reconciliation_date/g, 'created_at')}
    `;

    // SQL starts with customer_name = ?, then date placeholders.
    const params = [name, ...dateFilter.params];
    const paramsRec = [name, ...dateFilter.params];

    const [postTx, recTx, manualPostTx, manualRecTx] = await Promise.all([
      ledgerIpc.invoke('db-query', sqlPost, params),
      ledgerIpc.invoke('db-query', sqlRec, paramsRec),
      ledgerIpc.invoke('db-query', sqlManualPost, paramsRec),
      ledgerIpc.invoke('db-query', sqlManualRec, paramsRec)
    ]);

    const allTx = sortTransactionsForStatement([
      ...(postTx || []),
      ...(recTx || []),
      ...(manualPostTx || []),
      ...(manualRecTx || [])
    ]);
    renderCustomerStatementRows(name, allTx, 'لا توجد حركات');
  } catch (error) {
    console.error('Error refreshing statement data:', error);
  }
}

function closeCustomerStatementModal() {
  const modalEl = document.getElementById('customerStatementModal');
  if (!modalEl) return;

  if (window.bootstrap?.Modal) {
    const modal = window.bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
      return;
    }
  }

  modalEl.classList.remove('show');
  modalEl.style.display = 'none';
  modalEl.setAttribute('aria-hidden', 'true');
}

function activateReconciliationSectionFromLedger() {
  const reconciliationMenu = document.querySelector('a[data-section="reconciliation"]');
  if (reconciliationMenu && typeof reconciliationMenu.click === 'function') {
    reconciliationMenu.click();
    return;
  }

  const targetSection = document.getElementById('reconciliation-section');
  if (targetSection) {
    document.querySelectorAll('.content-section').forEach((section) => {
      section.classList.remove('active');
    });
    targetSection.classList.add('active');
  }
}

async function openCustomerReconciliationFromStatement(reconciliationId) {
  const numericId = Number.parseInt(reconciliationId, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    showTransactionAlert('هذه الحركة غير مرتبطة بتصفية صالحة', 'warning');
    return;
  }

  try {
    if (typeof window.recallReconciliationFromId === 'function') {
      const recalled = await window.recallReconciliationFromId(numericId);
      if (!recalled) {
        return;
      }
      closeCustomerStatementModal();
      activateReconciliationSectionFromLedger();
      return;
    }

    if (typeof window.editReconciliationNew === 'function') {
      closeCustomerStatementModal();
      await window.editReconciliationNew(numericId);
      return;
    }

    showTransactionAlert('تعذر فتح التصفية المرتبطة من هذه الشاشة', 'danger');
  } catch (error) {
    console.error('Error opening reconciliation from customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء فتح التصفية المرتبطة', 'danger');
  }
}

function buildCustomerStatementReconciliationCell(tx) {
  const reconciliationId = Number(tx?.reconciliation_id || 0);
  const recLabel = tx?.rec_no != null ? `#${tx.rec_no}` : (reconciliationId > 0 ? `#${reconciliationId}` : '-');
  const cashierLabel = tx?.cashier_name ? ` - ${escapeHtml(tx.cashier_name)}` : '';

  if (reconciliationId > 0 && tx?.source !== 'manual') {
    return `
      <button
        type="button"
        class="btn btn-link btn-sm p-0 align-baseline"
        onclick="window.openCustomerReconciliationFromStatement(${reconciliationId})"
        title="فتح التصفية المرتبطة">
        ${escapeHtml(recLabel)}
      </button>${cashierLabel}
    `;
  }

  return `${escapeHtml(recLabel)}${cashierLabel}`;
}

function buildCustomerStatementActions(tx, customerName) {
  if (tx?.source === 'manual') {
    const rowId = Number(tx?.row_id || tx?.id || 0);
    return `<button class="btn btn-sm btn-outline-primary" onclick="editManualTransaction(${rowId}, '${tx.type}', '${escapeAttr(customerName)}')"><i class="bi bi-pencil"></i></button>`;
  }

  const reconciliationId = Number(tx?.reconciliation_id || 0);
  if (reconciliationId > 0) {
    return `
      <button
        type="button"
        class="btn btn-sm btn-outline-info"
        onclick="window.openCustomerReconciliationFromStatement(${reconciliationId})"
        title="فتح التصفية المرتبطة">
        <i class="bi bi-box-arrow-up-right"></i> فتح التصفية
      </button>
    `;
  }

  return '<span class="text-muted">-</span>';
}

function renderCustomerStatementRows(customerName, transactions, emptyMessage = 'لا توجد حركات') {
  const tbody = document.getElementById('customerStatementTable');
  const sPost = document.getElementById('statementTotalPostpaid');
  const sRec = document.getElementById('statementTotalReceipts');
  const sBal = document.getElementById('statementBalance');
  const allTx = Array.isArray(transactions) ? transactions : [];
  const fmt = getCurrencyFormatter();

  let totalPost = 0;
  let totalRec = 0;
  allTx.forEach((tx) => {
    const amount = Number(tx.amount || 0);
    if (tx.type === 'postpaid') totalPost += amount;
    else totalRec += amount;
  });

  let running = totalPost - totalRec;
  const rowsHtml = allTx.map((tx) => {
    const amount = Number(tx.amount || 0);
    const kind = tx.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
    const reasonText = translateReason(tx.reason || '-');
    const amountText = fmt(amount);
    const balanceText = fmt(running);
    const txDate = tx.tx_date || tx.created_at || '';

    if (tx.type === 'postpaid') running -= amount;
    else running += amount;

    return `
      <tr>
        <td>${escapeHtml(txDate)}</td>
        <td>${escapeHtml(kind)}</td>
        <td>${escapeHtml(reasonText)}</td>
        <td>${buildCustomerStatementReconciliationCell(tx)}</td>
        <td class="text-currency ${tx.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amountText}</td>
        <td class="text-currency fw-bold">${balanceText}</td>
        <td>${buildCustomerStatementActions(tx, customerName)}</td>
      </tr>
    `;
  }).join('');

  const balance = totalPost - totalRec;
  if (sPost) sPost.textContent = fmt(totalPost);
  if (sRec) sRec.textContent = fmt(totalRec);
  if (sBal) sBal.textContent = fmt(balance);

  if (tbody) {
    tbody.innerHTML = rowsHtml || `<tr><td colspan="7" class="text-center">${escapeHtml(emptyMessage)}</td></tr>`;
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
    const name = String(customerName == null ? '' : customerName);
    if (!name.trim()) return;

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
      ORDER BY tx_date DESC, created_at DESC
    `;

    const params = [
      name, ...reconciledParams,
      name, ...reconciledParams,
      name, ...manualParams,
      name, ...manualParams
    ];

    const allTx = await ledgerIpc.invoke('db-query', sql, params) || [];

    let totalPost = 0;
    let totalRec = 0;
    allTx.forEach((t) => {
      const amount = Number(t.amount || 0);
      if (t.type === 'postpaid') totalPost += amount;
      else totalRec += amount;
    });

    const fmt = getCurrencyFormatter();
    const openingBalance = 0;
    const balance = totalPost - totalRec;

    const sortedTx = [...allTx].sort((left, right) => {
      const leftDate = String(left?.tx_date || left?.created_at || '');
      const rightDate = String(right?.tx_date || right?.created_at || '');
      const dateCompare = leftDate.localeCompare(rightDate);
      if (dateCompare !== 0) return dateCompare;
      return String(left?.created_at || '').localeCompare(String(right?.created_at || ''));
    });

    let running = openingBalance;
    const rowsHtml = sortedTx.map((t) => {
      const amount = Math.abs(Number(t.amount || 0));
      const isPostpaid = t.type === 'postpaid';
      const debit = isPostpaid ? amount : 0;
      const credit = isPostpaid ? 0 : amount;
      running += (debit - credit);

      const reasonText = translateReason(t.reason || '-');
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const cashierName = String(t.cashier_name || 'إدخال يدوي').trim();
      const sourceLabel = t.rec_no != null && t.rec_no !== 'يدوي'
        ? `تصفية ${recNo}`
        : 'قيد يدوي';
      const statementMain = isPostpaid
        ? `تحميل مديونية على ح/ ${customerName}`
        : `تحصيل نقدي من ح/ ${customerName}`;
      const statementDetails = [
        reasonText && reasonText !== '-' ? `السبب: ${reasonText}` : '',
        `المصدر: ${sourceLabel}`,
        cashierName ? `المستخدم: ${cashierName}` : ''
      ].filter(Boolean).join(' - ');

      return `
        <tr>
          <td>${escapeHtml(formatDateTime(t.tx_date || t.created_at || ''))}</td>
          <td>${escapeHtml(isPostpaid ? 'مبيعات آجلة' : 'مقبوضات عملاء')}</td>
          <td>${escapeHtml(recNo)}</td>
          <td class="statement-cell">
            <div class="statement-main">${escapeHtml(statementMain)}</div>
            ${statementDetails ? `<div class="statement-detail">${escapeHtml(statementDetails)}</div>` : ''}
          </td>
          <td class="text-currency">${debit > 0 ? fmt(debit) : ''}</td>
          <td class="text-currency">${credit > 0 ? fmt(credit) : ''}</td>
          <td class="text-currency fw-bold">${fmt(running)}</td>
        </tr>
      `;
    }).join('');

    const openingDebit = openingBalance >= 0 ? openingBalance : 0;
    const openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;
    const closingDebit = balance >= 0 ? balance : 0;
    const closingCredit = balance < 0 ? Math.abs(balance) : 0;
    const openingDebitText = (openingDebit > 0 || (openingDebit === 0 && openingCredit === 0)) ? fmt(openingDebit) : '';

    const printHTML = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>كشف حساب - ${customerName}</title>
        <style>
            @page { size: A4; margin: 12mm 14mm }
            body { 
                font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                font-size: 12px;
                line-height: 1.5;
                color: #0b1f35;
                margin: 0 auto;
                padding: 0;
            }
            .header { 
                margin-bottom: 6mm;
                padding: 4mm 5mm;
                border: 1px solid #738aa3;
                border-radius: 2.5mm;
                background-color: #fff;
            }
            .statement-title { 
                text-align: center; 
                margin-bottom: 3mm 
            }
            .statement-title h2 { 
                font-size: 18px; 
                font-weight: bold; 
                margin: 0; 
                padding: 0;
                color: #0b1f35;
            }
            .header-content { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start; 
                gap: 6mm;
            }
            .header-right, .header-left { flex: 1 }
            .header-right { 
                padding-left: 4mm;
                border-left: 1px solid #d1d9e0;
            }
            .company-name { 
                font-size: 15px; 
                font-weight: bold; 
                margin-bottom: 2mm;
                color: #0b1f35;
            }
            .branch-name { 
                font-size: 13px; 
                margin-bottom: 2mm; 
                color: #334155;
            }
            .branch-info { 
                font-size: 11px;
                line-height: 1.4; 
                color: #475569;
            }
            .branch-info > div { margin-bottom: 1mm }
            .header-left { 
                text-align: left; 
                padding-right: 4mm;
            }
            .customer-info, .print-date { 
                margin-top: 1.5mm;
                font-size: 12px;
            }
            .detail-label { 
                font-weight: 500; 
                color: #475569;
                margin-left: 2mm;
            }
            .summary { 
                display: flex; 
                justify-content: space-between; 
                gap: 3mm;
                margin: 0 0 5mm 0;
                padding: 3mm;
                background-color: #f8fafc;
                border-radius: 2mm;
                border: 1px solid #d1d9e0;
            }
            .summary-item { 
                flex: 1; 
                background-color: #fff; 
                padding: 2mm 2.5mm;
                border-radius: 2mm; 
                border: 1px solid #d1d9e0;
                text-align: center
            }
            .summary-item .label { 
                font-weight: bold; 
                color: #334155;
                font-size: 11px;
                margin-bottom: 1mm 
            }
            .summary-item .value { 
                font-size: 13px;
                font-weight: bold 
            }
            table { 
                width: 100%;
                border-collapse: collapse;
                margin: 0 0 6mm 0;
                border: 1px solid #738aa3;
            }
            th, td { 
                border: 1px solid #738aa3;
                padding: 2.2mm;
                text-align: right;
                font-size: 11px 
            }
            th { 
                background: #b6cfe8;
                font-weight: bold;
                font-size: 11px 
            }
            td, th {
                vertical-align: top;
                text-align: center;
            }
            .statement-cell {
                text-align: right;
                line-height: 1.55;
            }
            .statement-main {
                font-weight: 700;
                color: #102a43;
            }
            .statement-detail {
                margin-top: 1px;
                color: #475569;
                font-size: 10.5px;
            }
            .opening-row td {
                color: #b42318;
                font-weight: 700;
            }
            .totals-row td,
            .closing-row td {
                background: #f1f5f9;
                font-weight: 700;
            }
            .text-currency { 
                font-family: 'Consolas', 'Cascadia Mono', monospace;
                color: #0f172a;
                font-size: 11px 
            }
            .footer { 
                margin-top: 6mm;
                text-align: center; 
                font-size: 10px;
                color: #64748b
            }
            @media print { 
                body { margin: 0; padding: 0 }
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
          <div class="summary-item"><div class="label">إجمالي المدين</div><div class="value text-currency">${fmt(totalPost)}</div></div>
          <div class="summary-item"><div class="label">إجمالي الدائن</div><div class="value text-currency">${fmt(totalRec)}</div></div>
          <div class="summary-item"><div class="label">الرصيد النهائي</div><div class="value text-currency">${fmt(balance)}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th rowspan="2">التاريخ</th>
              <th rowspan="2">نوع الحركة</th>
              <th rowspan="2">رقم المرجع</th>
              <th rowspan="2">البيان</th>
              <th colspan="2">المبلغ</th>
              <th rowspan="2">الرصيد</th>
            </tr>
            <tr>
              <th>مدين</th>
              <th>دائن</th>
            </tr>
          </thead>
          <tbody>
            <tr class="opening-row">
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td class="statement-cell">
                <div class="statement-main">قيد افتتاحي: رصيد أول المدة لحساب العميل</div>
                <div class="statement-detail">ح/ ${escapeHtml(customerName)}</div>
              </td>
              <td class="text-currency">${openingDebitText}</td>
              <td class="text-currency">${openingCredit > 0 ? fmt(openingCredit) : ''}</td>
              <td class="text-currency fw-bold">${fmt(openingBalance)}</td>
            </tr>
            ${rowsHtml || '<tr><td colspan="7" class="text-center">لا توجد حركات</td></tr>'}
            <tr class="totals-row">
              <td colspan="4">إجمالي الحركات</td>
              <td class="text-currency">${fmt(totalPost)}</td>
              <td class="text-currency">${fmt(totalRec)}</td>
              <td class="text-currency fw-bold">${fmt(balance)}</td>
            </tr>
            <tr class="closing-row">
              <td colspan="4">الرصيد الختامي</td>
              <td class="text-currency">${closingDebit > 0 || (closingDebit === 0 && closingCredit === 0) ? fmt(closingDebit) : ''}</td>
              <td class="text-currency">${closingCredit > 0 ? fmt(closingCredit) : ''}</td>
              <td class="text-currency fw-bold">${fmt(balance)}</td>
            </tr>
          </tbody>
        </table>
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

function sortTransactionsForStatement(transactions) {
  return transactions.sort((a, b) => {
    const leftDate = String(a.tx_date || a.created_at || '');
    const rightDate = String(b.tx_date || b.created_at || '');
    const dateCompare = rightDate.localeCompare(leftDate);
    if (dateCompare !== 0) return dateCompare;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
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
    const cachedCompanyName = String(window.currentCompanyName || '').trim();
    const result = await ledgerIpc.invoke('db-query', `
      SELECT category, setting_key, setting_value, id
      FROM system_settings
      WHERE category IN ('general', 'company')
        AND setting_key IN ('company_name', 'name')
      ORDER BY id DESC
    `);

    const rows = Array.isArray(result) ? result : [];
    const latestByKey = new Map();
    rows.forEach((row) => {
      const category = String(row?.category || '').trim().toLowerCase();
      const settingKey = String(row?.setting_key || '').trim().toLowerCase();
      const settingValue = String(row?.setting_value || '').trim();
      if (!category || !settingKey || !settingValue) return;

      const compositeKey = `${category}:${settingKey}`;
      if (!latestByKey.has(compositeKey)) {
        latestByKey.set(compositeKey, settingValue);
      }
    });

    const preferredKeys = [
      'general:company_name',
      'general:name',
      'company:name',
      'company:company_name'
    ];

    for (const key of preferredKeys) {
      const value = latestByKey.get(key);
      if (value) {
        return value;
      }
    }

    if (cachedCompanyName) {
      return cachedCompanyName;
    }

    return 'شركة المثال التجارية';
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

function formatMergeDateTime(dateTimeString) {
  const formatted = formatDateTime(dateTimeString);
  return formatted === 'غير محدد' ? '' : formatted;
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

    const [postTx, recTx] = await Promise.all([
      ledgerIpc.invoke('db-query', sqlPost, [...paramsPost, customerName]),
      ledgerIpc.invoke('db-query', sqlRec, [...paramsRec, customerName])
    ]);

    const allTx = sortTransactionsForStatement([
      ...(postTx || []),
      ...(recTx || [])
    ]);

    // حساب الإجماليات أولاً ثم الرصيد التراكمي للأحدث -> الأقدم
    let totalPost = 0;
    let totalRec = 0;
    allTx.forEach(t => {
      const amount = Number(t.amount || 0);
      if (t.type === 'postpaid') totalPost += amount;
      else totalRec += amount;
    });
    let running = totalPost - totalRec;
    const fmt = getCurrencyFormatter();

    // بيانات الجدول في صيغة منظمة
    const tableData = [];
    allTx.forEach(t => {
      const amount = Number(t.amount || 0);
      const kind = t.type === 'postpaid' ? 'آجل' : 'مقبوض';
      const date = (t.tx_date || '').substring(0, 10);
      const amt = amount;
      const bal = running;
      const cashier = t.cashier_name || 'يدوي';

      if (t.type === 'postpaid') running -= amount;
      else running += amount;

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
    showEditTxAlert('حدث خطأ أثناء حفظ التعديلات: ' + mapCustomerLedgerDbError(error), 'danger');
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
