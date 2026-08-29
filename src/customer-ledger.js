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
const { createCustomerCodeHelpers } = require('./app/customer-code-helpers');
const {
  summarizeStatementTransactions,
  shouldShowOpeningBalanceRow
} = require('./app/customer-ledger-statement');

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
  forcedBranchId: '',
  customerCode: '',
  customerId: 0
};
let currentCustomerStatementRowsCache = [];
let selectedCustomerStatementKeys = new Set();
const customerLedgerCodeHelpers = createCustomerCodeHelpers({
  ipcRenderer: ledgerIpc,
  logger: console
});

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
  const normalizedCodeSql = (columnExpression) => (
    `NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(${columnExpression}, ''))), ''), '-'), '–'), '—')`
  );
  const customerBranchCompatibleSql = (branchExpression) => {
    const safeBranchExpression = String(branchExpression || '').trim();
    if (!safeBranchExpression) {
      return '1 = 1';
    }
    return `(
      COALESCE(cust.branch_id, 0) = 0
      OR COALESCE(${safeBranchExpression}, 0) = 0
      OR COALESCE(cust.branch_id, 0) = COALESCE(${safeBranchExpression}, 0)
    )`;
  };
  const customerJoinByCodeSql = (alias, branchExpression = '') => `
    (
      (
        cust.id = ${alias}.customer_id
        AND ${customerBranchCompatibleSql(branchExpression)}
      )
      OR (
        COALESCE(${alias}.customer_id, 0) = 0
        AND ${normalizedCodeSql(`${alias}.customer_code`)} IS NOT NULL
        AND ${normalizedCodeSql(`${alias}.customer_code`)} = ${normalizedCodeSql('cust.customer_code')}
        AND ${customerBranchCompatibleSql(branchExpression)}
        AND 1 = (
          SELECT COUNT(*)
          FROM customers code_owner
          WHERE ${normalizedCodeSql('code_owner.customer_code')} = ${normalizedCodeSql(`${alias}.customer_code`)}
            ${branchExpression ? `AND (
              COALESCE(code_owner.branch_id, 0) = 0
              OR COALESCE(code_owner.branch_id, 0) = COALESCE(${branchExpression}, 0)
            )` : ''}
        )
      )
    )
  `;

  let dateFilterPostpaid = '';
  let dateFilterReceipts = '';
  let dateFilterManualPostpaid = '';
  let dateFilterManualReceipts = '';
  const dateParamsPostpaid = [];
  const dateParamsReceipts = [];
  const dateParamsManualPostpaid = [];
  const dateParamsManualReceipts = [];

  if (filters.dateFrom) {
    dateFilterPostpaid += ' AND DATE(COALESCE(r.reconciliation_date, ps.created_at)) >= ?';
    dateFilterReceipts += ' AND DATE(COALESCE(r.reconciliation_date, cr.created_at)) >= ?';
    dateFilterManualPostpaid += ' AND DATE(mps.created_at) >= ?';
    dateFilterManualReceipts += ' AND DATE(mcr.created_at) >= ?';
    dateParamsPostpaid.push(filters.dateFrom);
    dateParamsReceipts.push(filters.dateFrom);
    dateParamsManualPostpaid.push(filters.dateFrom);
    dateParamsManualReceipts.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    dateFilterPostpaid += ' AND DATE(COALESCE(r.reconciliation_date, ps.created_at)) <= ?';
    dateFilterReceipts += ' AND DATE(COALESCE(r.reconciliation_date, cr.created_at)) <= ?';
    dateFilterManualPostpaid += ' AND DATE(mps.created_at) <= ?';
    dateFilterManualReceipts += ' AND DATE(mcr.created_at) <= ?';
    dateParamsPostpaid.push(filters.dateTo);
    dateParamsReceipts.push(filters.dateTo);
    dateParamsManualPostpaid.push(filters.dateTo);
    dateParamsManualReceipts.push(filters.dateTo);
  }

  let nameFilter = '';
  const nameParams = [];
  if (filters.name) {
    nameFilter = `
      AND (
        UPPER(TRIM(COALESCE(t_cust, ''))) LIKE ?
        OR UPPER(TRIM(COALESCE(t_customer_code, ''))) LIKE ?
      )
    `;
    const searchValue = `%${String(filters.name || '').trim().toUpperCase()}%`;
    nameParams.push(searchValue, searchValue);
  }

  let branchFilter = '';
  const branchParams = [];
  if (filters.branchId) {
    const rawBranchFilter = String(filters.branchId || '').trim();
    branchFilter = `
      AND (
        CAST(COALESCE(t_branch_id, 0) AS TEXT) = ?
        OR TRIM(COALESCE(t_branch_name, '')) = ?
      )
    `;
    branchParams.push(rawBranchFilter, rawBranchFilter);
  }

  const sub1 = `
    SELECT
      COALESCE(cust.id, 0) AS t_customer_id,
      COALESCE(${normalizedCodeSql('ps.customer_code')}, ${normalizedCodeSql('cust.customer_code')}) AS t_customer_code,
      COALESCE(NULLIF(TRIM(COALESCE(ps.customer_name, '')), ''), TRIM(COALESCE(cust.customer_name, '')), 'غير محدد') AS t_cust,
      ps.amount AS t_amount,
      'postpaid' AS t_type,
      COALESCE(r.reconciliation_date, ps.created_at) AS t_date,
      ps.created_at AS t_created,
      COALESCE(cust.branch_id, c.branch_id, 0) AS t_branch_id,
      COALESCE(cb.branch_name, b.branch_name, 'غير محدد') AS t_branch_name
    FROM postpaid_sales ps
    LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
    LEFT JOIN cashiers c ON c.id = r.cashier_id
    LEFT JOIN branches b ON b.id = c.branch_id
    LEFT JOIN customers cust ON ${customerJoinByCodeSql('ps', 'c.branch_id')}
    LEFT JOIN branches cb ON cb.id = cust.branch_id
    WHERE 1=1 ${dateFilterPostpaid}
  `;

  const sub1Manual = `
    SELECT
      COALESCE(mps.customer_id, cust.id, 0) AS t_customer_id,
      COALESCE(${normalizedCodeSql('mps.customer_code')}, ${normalizedCodeSql('cust.customer_code')}) AS t_customer_code,
      COALESCE(NULLIF(TRIM(COALESCE(mps.customer_name, '')), ''), TRIM(COALESCE(cust.customer_name, '')), 'غير محدد') AS t_cust,
      mps.amount AS t_amount,
      'postpaid' AS t_type,
      mps.created_at AS t_date,
      mps.created_at AS t_created,
      COALESCE(cust.branch_id, (SELECT branch_id FROM cashiers WHERE id = 1), 0) AS t_branch_id,
      COALESCE(
        (SELECT branch_name FROM branches WHERE id = cust.branch_id),
        (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)),
        'غير محدد'
      ) AS t_branch_name
    FROM manual_postpaid_sales mps
    LEFT JOIN customers cust ON cust.id = mps.customer_id
    WHERE 1=1 ${dateFilterManualPostpaid}
  `;

  const sub2 = `
    SELECT
      COALESCE(cust.id, 0) AS t_customer_id,
      COALESCE(${normalizedCodeSql('cr.customer_code')}, ${normalizedCodeSql('cust.customer_code')}) AS t_customer_code,
      COALESCE(NULLIF(TRIM(COALESCE(cr.customer_name, '')), ''), TRIM(COALESCE(cust.customer_name, '')), 'غير محدد') AS t_cust,
      cr.amount AS t_amount,
      'receipt' AS t_type,
      COALESCE(r.reconciliation_date, cr.created_at) AS t_date,
      cr.created_at AS t_created,
      COALESCE(cust.branch_id, c.branch_id, 0) AS t_branch_id,
      COALESCE(cb.branch_name, b.branch_name, 'غير محدد') AS t_branch_name
    FROM customer_receipts cr
    LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
    LEFT JOIN cashiers c ON c.id = r.cashier_id
    LEFT JOIN branches b ON b.id = c.branch_id
    LEFT JOIN customers cust ON ${customerJoinByCodeSql('cr', 'c.branch_id')}
    LEFT JOIN branches cb ON cb.id = cust.branch_id
    WHERE 1=1 ${dateFilterReceipts}
  `;

  const sub2Manual = `
    SELECT
      COALESCE(mcr.customer_id, cust.id, 0) AS t_customer_id,
      COALESCE(${normalizedCodeSql('mcr.customer_code')}, ${normalizedCodeSql('cust.customer_code')}) AS t_customer_code,
      COALESCE(NULLIF(TRIM(COALESCE(mcr.customer_name, '')), ''), TRIM(COALESCE(cust.customer_name, '')), 'غير محدد') AS t_cust,
      mcr.amount AS t_amount,
      'receipt' AS t_type,
      mcr.created_at AS t_date,
      mcr.created_at AS t_created,
      COALESCE(cust.branch_id, (SELECT branch_id FROM cashiers WHERE id = 1), 0) AS t_branch_id,
      COALESCE(
        (SELECT branch_name FROM branches WHERE id = cust.branch_id),
        (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)),
        'غير محدد'
      ) AS t_branch_name
    FROM manual_customer_receipts mcr
    LEFT JOIN customers cust ON cust.id = mcr.customer_id
    WHERE 1=1 ${dateFilterManualReceipts}
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
    WHERE 1=1 ${nameFilter} ${branchFilter}
  `;

  const sql = `
    SELECT
      CASE
        WHEN COALESCE(t_customer_id, 0) > 0 THEN 'CID:' || t_customer_id
        WHEN COALESCE(t_customer_code, '') <> '' THEN 'CODE:' || UPPER(TRIM(t_customer_code))
        ELSE 'LEGACY:' || UPPER(TRIM(t_cust)) || '|' || COALESCE(t_branch_id, 0)
      END AS customer_key,
      t_customer_id AS customer_id,
      t_customer_code AS customer_code,
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
    GROUP BY customer_key, customer_id, customer_code, customer_name, branch_id, branch_name
    ${filters.onlyWithBalance ? "HAVING COALESCE(SUM(CASE WHEN t_type = 'postpaid' THEN t_amount ELSE -t_amount END), 0) > 0" : ''}
    ORDER BY branch_name ASC, balance DESC, customer_name ASC, customer_code ASC
  `;

  const params = [
    ...dateParamsPostpaid,
    ...dateParamsManualPostpaid,
    ...dateParamsReceipts,
    ...dateParamsManualReceipts,
    ...nameParams,
    ...branchParams
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
  tbody.innerHTML = `<tr><td colspan="10" class="text-center">جاري التحميل...</td></tr>`;
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
      tbody.innerHTML = `<tr><td colspan="10" class="text-danger text-center">حدث خطأ أثناء تحميل البيانات</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="10" class="text-center">لا توجد بيانات مطابقة</td></tr>`;
    return;
  }

  const fmt = getCurrencyFormatter();
  tbody.innerHTML = rows.map(r => {
    const lastDate = r.last_tx_date ? escapeHtml(r.last_tx_date) : '-';
    const customerName = r.customer_name || '';
    const branchId = r.branch_id != null ? String(r.branch_id) : '';
    const customerCode = r.customer_code || '';
    const customerId = r.customer_id || 0;
    const selectionKey = buildCustomerSelectionKey(r);
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
        <td class="customer-code-cell">${escapeHtml(customerCode || '-')}</td>
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
          <button class="btn btn-sm btn-primary" onclick="showCustomerStatement('${escapeAttr(customerName)}', '${escapeAttr(branchId)}', '${escapeAttr(customerCode)}', '${escapeAttr(String(customerId))}')">كشف حساب</button>
          <button class="btn btn-sm btn-outline-warning ms-1" onclick="renameCustomerNameInLedger('${escapeAttr(customerName)}', '${escapeAttr(branchId)}', '${escapeAttr(customerCode)}', '${escapeAttr(String(customerId))}')">
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

function normalizeCustomerCode(value) {
  const normalizedCode = String(value == null ? '' : value).trim().toUpperCase();
  return ['', '-', '–', '—'].includes(normalizedCode) ? '' : normalizedCode;
}

function normalizeCustomerId(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function normalizeCustomerStatementRef(customerNameOrRef, forcedBranchId = '', customerCode = '', customerId = '') {
  const source = customerNameOrRef && typeof customerNameOrRef === 'object'
    ? customerNameOrRef
    : {
      customerName: customerNameOrRef,
      forcedBranchId,
      customerCode,
      customerId
    };

  return {
    customerName: String(
      source?.customerName != null
        ? source.customerName
        : (source?.customer_name != null ? source.customer_name : '')
    ).trim(),
    forcedBranchId: normalizeBranchId(source?.forcedBranchId || source?.branchId || source?.branch_id || ''),
    customerCode: normalizeCustomerCode(source?.customerCode || source?.customer_code || customerCode),
    customerId: normalizeCustomerId(source?.customerId || source?.customer_id || customerId)
  };
}

function buildCustomerSelectionKey(customerNameOrRef, branchId = '', customerCode = '', customerId = '') {
  const customerRef = normalizeCustomerStatementRef(customerNameOrRef, branchId, customerCode, customerId);
  if (customerRef.customerId > 0) {
    return JSON.stringify({ customerId: customerRef.customerId });
  }
  if (customerRef.customerCode) {
    return JSON.stringify({ customerCode: customerRef.customerCode });
  }
  return JSON.stringify({
    name: customerRef.customerName,
    branchId: customerRef.forcedBranchId || '0'
  });
}

function buildCustomerTableMatcher(alias, customerRefInput, options = {}) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const branchExpression = String(options.branchExpression || '').trim();
  const normalizedBranchId = normalizeBranchId(options.branchId || customerRef.forcedBranchId);

  if (customerRef.customerId > 0) {
    return {
      clause: `COALESCE(${alias}.customer_id, 0) = ?`,
      params: [customerRef.customerId]
    };
  }

  if (customerRef.customerCode) {
    let clause = `UPPER(TRIM(COALESCE(${alias}.customer_code, ''))) = ?`;
    const params = [customerRef.customerCode];
    if (branchExpression && normalizedBranchId) {
      clause += ` AND COALESCE(${branchExpression}, 0) = ?`;
      params.push(Number(normalizedBranchId));
    }
    return {
      clause,
      params
    };
  }

  const params = [customerRef.customerName];
  let clause = `TRIM(COALESCE(${alias}.customer_name, '')) = ?`;

  if (branchExpression && normalizedBranchId) {
    clause += ` AND COALESCE(${branchExpression}, 0) = ?`;
    params.push(Number(normalizedBranchId));
  }

  return { clause, params };
}

function buildCustomerMergeTableMatcher(alias, customerRefInput, options = {}) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const branchExpression = String(options.branchExpression || '').trim();
  const normalizedBranchId = normalizeBranchId(options.branchId || customerRef.forcedBranchId);
  const allowUnscopedFallback = options.allowUnscopedFallback !== false || !!branchExpression;
  const clauses = [];
  const params = [];

  if (customerRef.customerId > 0) {
    let idClause = `COALESCE(${alias}.customer_id, 0) = ?`;
    const idParams = [customerRef.customerId];
    if (branchExpression && normalizedBranchId) {
      idClause += ` AND COALESCE(${branchExpression}, 0) = ?`;
      idParams.push(Number(normalizedBranchId));
    }
    clauses.push(idClause);
    params.push(...idParams);
  }

  if (customerRef.customerCode && allowUnscopedFallback) {
    let codeClause = `UPPER(TRIM(COALESCE(${alias}.customer_code, ''))) = ?`;
    const codeParams = [customerRef.customerCode];

    if (customerRef.customerId > 0) {
      codeClause = `COALESCE(${alias}.customer_id, 0) = 0 AND ${codeClause}`;
    }

    if (branchExpression && normalizedBranchId) {
      codeClause += ` AND COALESCE(${branchExpression}, 0) = ?`;
      codeParams.push(Number(normalizedBranchId));
    }

    clauses.push(codeClause);
    params.push(...codeParams);
  }

  if (clauses.length === 0 && customerRef.customerName && allowUnscopedFallback) {
    let nameClause = `TRIM(COALESCE(${alias}.customer_name, '')) = ?`;
    const nameParams = [customerRef.customerName];

    if (branchExpression && normalizedBranchId) {
      nameClause += ` AND COALESCE(${branchExpression}, 0) = ?`;
      nameParams.push(Number(normalizedBranchId));
    }

    clauses.push(nameClause);
    params.push(...nameParams);
  }

  if (clauses.length === 0) {
    return { clause: '0 = 1', params: [] };
  }

  return {
    clause: clauses.map((clause) => `(${clause})`).join(' OR '),
    params
  };
}

function dedupeCustomerRefs(customerRefs) {
  const uniqueRefs = new Map();
  (Array.isArray(customerRefs) ? customerRefs : []).forEach((customerRefInput) => {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    if (!customerRef.customerName && !customerRef.customerCode && customerRef.customerId <= 0) {
      return;
    }
    const selectionKey = buildCustomerSelectionKey(customerRef);
    if (!uniqueRefs.has(selectionKey)) {
      uniqueRefs.set(selectionKey, customerRef);
    }
  });
  return Array.from(uniqueRefs.values());
}

function buildCustomerMergeRefsMatcher(alias, customerRefs, options = {}) {
  const matchers = dedupeCustomerRefs(customerRefs)
    .map((customerRef) => buildCustomerMergeTableMatcher(alias, customerRef, options))
    .filter((matcher) => matcher && matcher.clause && matcher.clause !== '0 = 1');

  if (matchers.length === 0) {
    return { clause: '0 = 1', params: [] };
  }

  return {
    clause: matchers.map((matcher) => `(${matcher.clause})`).join(' OR '),
    params: matchers.flatMap((matcher) => matcher.params)
  };
}

function formatCustomerRefForMergeSelection(customerRefInput) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const name = customerRef.customerName || 'غير محدد';
  return customerRef.customerCode ? `${customerRef.customerCode} - ${name}` : name;
}

function buildCustomerMergeCandidate(row) {
  const customerRef = normalizeCustomerStatementRef(row);
  return {
    ...customerRef,
    selectionKey: buildCustomerSelectionKey(customerRef),
    branchName: String(row?.branch_name == null ? '' : row.branch_name),
    label: formatCustomerRefForMergeSelection(customerRef)
  };
}

function buildStatementTransactionSelectionKey(tx) {
  const source = String(tx?.source || '').trim();
  const type = String(tx?.type || '').trim();
  const rowId = Number(tx?.row_id || tx?.id || 0);
  const reconciliationId = Number(tx?.reconciliation_id || 0);
  return JSON.stringify({ source, type, rowId, reconciliationId });
}

function syncCustomerStatementSelectionWithRows() {
  const availableKeys = new Set(
    (currentCustomerStatementRowsCache || []).map((row) => buildStatementTransactionSelectionKey(row))
  );

  selectedCustomerStatementKeys.forEach((key) => {
    if (!availableKeys.has(key)) {
      selectedCustomerStatementKeys.delete(key);
    }
  });
}

function getSelectedCustomerStatementRows() {
  if (!Array.isArray(currentCustomerStatementRowsCache) || currentCustomerStatementRowsCache.length === 0) {
    return [];
  }

  return currentCustomerStatementRowsCache.filter((row) => (
    selectedCustomerStatementKeys.has(buildStatementTransactionSelectionKey(row))
  ));
}

function clearCustomerStatementSelection() {
  selectedCustomerStatementKeys.clear();
  const rowChecks = document.querySelectorAll('.customer-statement-select-checkbox');
  rowChecks.forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateCustomerStatementSelectionUi();
}

function updateCustomerStatementSelectionUi() {
  const summaryEl = document.getElementById('statementSelectionSummary');
  const splitBtn = document.getElementById('splitStatementTransactionsBtn');
  const clearBtn = document.getElementById('clearStatementSelectionBtn');
  const selectAll = document.getElementById('statementSelectAllTransactions');
  const totalRows = Array.isArray(currentCustomerStatementRowsCache) ? currentCustomerStatementRowsCache.length : 0;
  const selectedCount = getSelectedCustomerStatementRows().length;

  if (summaryEl) {
    summaryEl.textContent = selectedCount > 0
      ? `تم تحديد ${selectedCount} حركة`
      : 'لم يتم تحديد أي حركة';
  }

  if (splitBtn) splitBtn.disabled = selectedCount === 0;
  if (clearBtn) clearBtn.disabled = selectedCount === 0;

  if (selectAll) {
    if (totalRows === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
      return;
    }

    const allSelected = selectedCount > 0 && selectedCount === totalRows;
    const someSelected = selectedCount > 0 && selectedCount < totalRows;
    selectAll.disabled = false;
    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected;
  }
}

function syncCustomerLedgerSelectionWithRows() {
  const availableKeys = new Set(
    (customerLedgerRowsCache || []).map((row) => buildCustomerSelectionKey(row))
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
    const key = buildCustomerSelectionKey(row);
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
    const key = buildCustomerSelectionKey(row);
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

  const selectedCandidates = Array.from(
    new Map(
      selectedRows
        .map((row) => buildCustomerMergeCandidate(row))
        .filter((candidate) => candidate.customerName || candidate.customerCode || candidate.customerId > 0)
        .map((candidate) => [candidate.selectionKey, candidate])
    ).values()
  );
  if (selectedCandidates.length < 2) {
    showTransactionAlert('حدد عميلين مختلفين على الأقل لتنفيذ الدمج', 'danger');
    return;
  }

  const branchIds = Array.from(new Set(
    selectedCandidates.map((row) => normalizeBranchId(row?.forcedBranchId) || '0')
  ));
  if (branchIds.length !== 1) {
    showTransactionAlert('لا يمكن دمج عملاء من أكثر من فرع. اختر عملاء من نفس الفرع فقط', 'danger');
    return;
  }

  const targetCustomerRef = await promptMergeTargetCustomerRef(selectedCandidates);
  if (!targetCustomerRef) return;

  const sourceRefs = selectedCandidates.filter((candidate) => candidate.selectionKey !== targetCustomerRef.selectionKey);
  if (sourceRefs.length === 0) {
    showTransactionAlert('اختر عميلاً هدفاً مختلفاً عن العملاء المراد دمجهم', 'danger');
    return;
  }

  const normalizedBranchId = normalizeBranchId(branchIds[0]);
  const branchLabel = selectedCandidates[0]?.branchName || 'غير محدد';
  const sourceLabels = sourceRefs.map((customerRef) => formatCustomerRefForMergeSelection(customerRef));
  const targetLabel = formatCustomerRefForMergeSelection(targetCustomerRef);
  const preview = await buildCustomerMergePreview(sourceRefs, targetCustomerRef, normalizedBranchId);
  const confirmed = await confirmCustomerMergeExecution({
    sourceNames: sourceLabels,
    targetName: targetLabel,
    branchLabel,
    preview
  });
  if (!confirmed) return;

  try {
    const mergeResult = await executeCustomerMergeTransaction(sourceRefs, targetCustomerRef, normalizedBranchId);
    selectedCustomerMergeKeys.clear();
    await loadCustomerLedger();

    const currentRef = getCurrentCustomerStatementRef();
    const currentBranch = normalizeBranchId(currentRef.forcedBranchId || '');
    const impactedKeys = new Set([
      targetCustomerRef.selectionKey,
      ...sourceRefs.map((customerRef) => customerRef.selectionKey)
    ]);
    const shouldRefreshStatement = currentBranch === normalizedBranchId
      && impactedKeys.has(buildCustomerSelectionKey(currentRef));
    if (shouldRefreshStatement) {
      await showCustomerStatement(
        mergeResult.targetIdentity.customer_name,
        normalizedBranchId,
        mergeResult.targetIdentity.customer_code,
        mergeResult.targetIdentity.customer_id
      );
    }

    const changed = Number(mergeResult?.totalChanges || 0);
    showTransactionAlert(`تم دمج العملاء المحددين بنجاح (${changed} حركة محدثة)`, 'success');
  } catch (error) {
    console.error('Error merging selected customers:', error);
    showTransactionAlert(`تعذر دمج العملاء: ${mapCustomerLedgerDbError(error)}`, 'danger');
  }
}

async function promptMergeTargetCustomerRef(candidates) {
  const customerCandidates = Array.isArray(candidates)
    ? candidates.filter((candidate) => candidate && candidate.selectionKey)
    : [];
  if (customerCandidates.length < 2) return null;

  if (window.Swal) {
    const inputOptions = {};
    customerCandidates.forEach((candidate, index) => {
      inputOptions[String(index)] = `${index + 1}) ${formatCustomerNameForSelection(candidate.label)}`;
    });

    const result = await window.Swal.fire({
      title: 'اختيار العميل الهدف',
      text: 'العميل الهدف هو العميل الذي ستنتقل إليه كل الحركات والأكواد',
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
    if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= customerCandidates.length) return null;
    return customerCandidates[selectedIndex];
  }

  const optionsText = customerCandidates
    .map((candidate, index) => `${index + 1}) ${formatCustomerNameForSelection(candidate.label)}`)
    .join('\n');
  const raw = window.prompt(`اختر رقم العميل الهدف:\n${optionsText}`, '1');
  if (raw == null) return null;
  const selectedIndex = Number.parseInt(String(raw || '').trim(), 10) - 1;
  if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= customerCandidates.length) {
    showTransactionAlert('الاختيار غير صالح', 'danger');
    return null;
  }
  return customerCandidates[selectedIndex];
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

async function buildCustomerMergePreview(sourceRefs, targetRef, branchId) {
  const [sourceTotals, targetTotals] = await Promise.all([
    fetchCustomerAggregateForRefs(sourceRefs, branchId),
    fetchCustomerAggregateForRefs([targetRef], branchId)
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

async function fetchCustomerAggregateForRefs(customerRefs, branchId) {
  const safeRefs = dedupeCustomerRefs(customerRefs);
  if (safeRefs.length === 0) {
    return {
      movementsCount: 0,
      totalPostpaid: 0,
      totalReceipts: 0,
      balance: 0
    };
  }

  const normalizedBranchId = normalizeBranchId(branchId);
  const includeManual = await shouldApplyManualCustomersForBranch(normalizedBranchId);
  const postpaidMatcher = buildCustomerMergeRefsMatcher('ps', safeRefs, {
    branchExpression: 'c.branch_id',
    branchId: normalizedBranchId
  });
  const receiptMatcher = buildCustomerMergeRefsMatcher('cr', safeRefs, {
    branchExpression: 'c.branch_id',
    branchId: normalizedBranchId
  });

  const unionParts = [
    `SELECT ps.amount AS amount, 'postpaid' AS tx_type
     FROM postpaid_sales ps
     LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
     LEFT JOIN cashiers c ON c.id = r.cashier_id
     WHERE ${postpaidMatcher.clause}`,
    `SELECT cr.amount AS amount, 'receipt' AS tx_type
     FROM customer_receipts cr
     LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
     LEFT JOIN cashiers c ON c.id = r.cashier_id
     WHERE ${receiptMatcher.clause}`
  ];

  const params = [
    ...postpaidMatcher.params,
    ...receiptMatcher.params
  ];

  if (includeManual) {
    const manualPostpaidMatcher = buildCustomerMergeRefsMatcher('mp', safeRefs, {
      allowUnscopedFallback: false
    });
    const manualReceiptMatcher = buildCustomerMergeRefsMatcher('mr', safeRefs, {
      allowUnscopedFallback: false
    });
    unionParts.push(
      `SELECT mp.amount AS amount, 'postpaid' AS tx_type
       FROM manual_postpaid_sales mp
       WHERE ${manualPostpaidMatcher.clause}`
    );
    unionParts.push(
      `SELECT mr.amount AS amount, 'receipt' AS tx_type
       FROM manual_customer_receipts mr
       WHERE ${manualReceiptMatcher.clause}`
    );
    params.push(...manualPostpaidMatcher.params, ...manualReceiptMatcher.params);
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
      target_customer_id INTEGER DEFAULT 0,
      target_customer_code TEXT DEFAULT '',
      source_names_json TEXT NOT NULL,
      affected_rows_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      undone_at DATETIME,
      undo_details_json TEXT
    )`
  );
  const columns = await ledgerIpc.invoke('db-query', 'PRAGMA table_info(ledger_merge_history)', []);
  const columnNames = new Set((Array.isArray(columns) ? columns : []).map((column) => String(column?.name || '')));
  if (!columnNames.has('target_customer_id')) {
    await ledgerIpc.invoke(
      'db-run',
      'ALTER TABLE ledger_merge_history ADD COLUMN target_customer_id INTEGER DEFAULT 0'
    );
  }
  if (!columnNames.has('target_customer_code')) {
    await ledgerIpc.invoke(
      'db-run',
      "ALTER TABLE ledger_merge_history ADD COLUMN target_customer_code TEXT DEFAULT ''"
    );
  }
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

  const normalizedRows = [];
  const seenIds = new Set();
  entries.forEach((row) => {
    const id = Number(row?.id);
    const oldNameSource = row?.old_name == null ? row?.oldName : row.old_name;
    const oldCodeSource = row?.old_code == null ? row?.oldCode : row.old_code;
    const oldCustomerIdSource = row?.old_customer_id == null ? row?.oldCustomerId : row.old_customer_id;
    const hasIdentitySnapshot = (
      row?.old_customer_id !== undefined
      || row?.oldCustomerId !== undefined
      || row?.old_code !== undefined
      || row?.oldCode !== undefined
    );

    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    normalizedRows.push({
      id,
      old_name: String(oldNameSource == null ? '' : oldNameSource),
      old_customer_id: normalizeCustomerId(oldCustomerIdSource),
      old_code: String(oldCodeSource == null ? '' : oldCodeSource),
      has_identity_snapshot: hasIdentitySnapshot
    });
  });

  return normalizedRows;
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
    `SELECT h.id, h.branch_id, h.target_name, h.target_customer_id, h.target_customer_code,
            h.source_names_json, h.affected_rows_json, h.created_at,
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
    target_customer_id: normalizeCustomerId(row.target_customer_id),
    target_customer_code: normalizeCustomerCode(row.target_customer_code),
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

async function fetchRowsForCustomerMergeRefs({
  tableName,
  alias,
  customerRefs,
  branchId,
  reconciled = false,
  allowUnscopedFallback = true
}) {
  const matcher = buildCustomerMergeRefsMatcher(alias, customerRefs, reconciled
    ? { branchExpression: 'c.branch_id', branchId }
    : { allowUnscopedFallback });
  const joinSql = reconciled
    ? `LEFT JOIN reconciliations r ON r.id = ${alias}.reconciliation_id
       LEFT JOIN cashiers c ON c.id = r.cashier_id`
    : '';

  return ledgerIpc.invoke(
    'db-query',
    `SELECT ${alias}.id AS id,
            COALESCE(${alias}.customer_id, 0) AS old_customer_id,
            ${alias}.customer_name AS old_name,
            COALESCE(${alias}.customer_code, '') AS old_code
     FROM ${tableName} ${alias}
     ${joinSql}
     WHERE ${matcher.clause}`,
    matcher.params
  );
}

async function fetchCustomerMergeAffectedRows({ refsToUpdate, branchId, includeManual }) {
  const [postpaidRows, receiptRows] = await Promise.all([
    fetchRowsForCustomerMergeRefs({
      tableName: 'postpaid_sales',
      alias: 'ps',
      customerRefs: refsToUpdate,
      branchId,
      reconciled: true
    }),
    fetchRowsForCustomerMergeRefs({
      tableName: 'customer_receipts',
      alias: 'cr',
      customerRefs: refsToUpdate,
      branchId,
      reconciled: true
    })
  ]);

  let manualPostpaidRows = [];
  let manualReceiptRows = [];
  if (includeManual) {
    [manualPostpaidRows, manualReceiptRows] = await Promise.all([
      fetchRowsForCustomerMergeRefs({
        tableName: 'manual_postpaid_sales',
        alias: 'mp',
        customerRefs: refsToUpdate,
        allowUnscopedFallback: false
      }),
      fetchRowsForCustomerMergeRefs({
        tableName: 'manual_customer_receipts',
        alias: 'mr',
        customerRefs: refsToUpdate,
        allowUnscopedFallback: false
      })
    ]);
  }

  return normalizeCustomerMergeAffectedRows({
    postpaid_sales: postpaidRows || [],
    customer_receipts: receiptRows || [],
    manual_postpaid_sales: manualPostpaidRows || [],
    manual_customer_receipts: manualReceiptRows || []
  });
}

async function updateCustomerMergeRows({
  tableName,
  alias,
  customerRefs,
  branchId,
  targetIdentity,
  reconciled = false,
  allowUnscopedFallback = true
}) {
  const matcher = buildCustomerMergeRefsMatcher(alias, customerRefs, reconciled
    ? { branchExpression: 'c.branch_id', branchId }
    : { allowUnscopedFallback });
  const joinSql = reconciled
    ? `LEFT JOIN reconciliations r ON r.id = ${alias}.reconciliation_id
       LEFT JOIN cashiers c ON c.id = r.cashier_id`
    : '';
  const targetCustomerId = normalizeCustomerId(targetIdentity.customer_id) || null;
  const targetCustomerName = String(targetIdentity.customer_name == null ? '' : targetIdentity.customer_name).trim();
  const targetCustomerCode = normalizeCustomerCode(targetIdentity.customer_code);

  const result = await ledgerIpc.invoke(
    'db-run',
    `UPDATE ${tableName}
     SET customer_id = ?,
         customer_name = ?,
         customer_code = ?
     WHERE id IN (
       SELECT ${alias}.id
       FROM ${tableName} ${alias}
       ${joinSql}
       WHERE ${matcher.clause}
     )`,
    [targetCustomerId, targetCustomerName, targetCustomerCode, ...matcher.params]
  );

  return Number(result?.changes || 0);
}

async function resolveCustomerMergeTargetIdentity(targetRefInput, branchId) {
  const targetRef = normalizeCustomerStatementRef(targetRefInput);
  const normalizedBranchId = normalizeBranchId(branchId || targetRef.forcedBranchId);

  if (targetRef.customerId > 0) {
    const existingCustomer = await ledgerIpc.invoke(
      'db-get',
      `SELECT id, customer_name, customer_code, branch_id
       FROM customers
       WHERE id = ?
       LIMIT 1`,
      [targetRef.customerId]
    );

    if (existingCustomer) {
      const existingCode = normalizeCustomerCode(existingCustomer.customer_code);
      if (existingCode) {
        return {
          customer_id: Number(existingCustomer.id || 0),
          customer_name: String(existingCustomer.customer_name == null ? targetRef.customerName : existingCustomer.customer_name).trim(),
          customer_code: existingCode,
          branch_id: normalizeBranchId(existingCustomer.branch_id) || normalizedBranchId || null
        };
      }

      return customerLedgerCodeHelpers.resolveCustomerIdentity({
        customerName: existingCustomer.customer_name || targetRef.customerName,
        customerCode: '',
        branchId: existingCustomer.branch_id || normalizedBranchId
      });
    }
  }

  return customerLedgerCodeHelpers.resolveCustomerIdentity({
    customerName: targetRef.customerName,
    customerCode: targetRef.customerCode,
    branchId: normalizedBranchId
  });
}

async function recordCustomerMergeHistory({
  numericBranchId,
  safeTargetName,
  targetIdentity,
  safeSourceNames,
  affectedRows
}) {
  await ensureLedgerMergeHistoryTable();
  const result = await ledgerIpc.invoke(
    'db-run',
    `INSERT INTO ledger_merge_history
      (entity_type, branch_id, target_name, target_customer_id, target_customer_code, source_names_json, affected_rows_json)
     VALUES ('customer', ?, ?, ?, ?, ?, ?)`,
    [
      numericBranchId,
      safeTargetName,
      normalizeCustomerId(targetIdentity?.customer_id),
      normalizeCustomerCode(targetIdentity?.customer_code),
      JSON.stringify(safeSourceNames),
      JSON.stringify(affectedRows)
    ]
  );
  return Number(result?.lastInsertRowid || 0);
}

async function executeCustomerMergeTransaction(sourceRefsInput, targetRefInput, branchId) {
  const normalizedBranchId = normalizeBranchId(branchId);
  const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
  const targetRef = normalizeCustomerStatementRef(targetRefInput);
  const sourceRefs = dedupeCustomerRefs(sourceRefsInput)
    .filter((customerRef) => buildCustomerSelectionKey(customerRef) !== buildCustomerSelectionKey(targetRef));
  if (sourceRefs.length === 0) {
    return { postpaidChanges: 0, receiptChanges: 0, manualChanges: 0, totalChanges: 0 };
  }

  const refsToUpdate = dedupeCustomerRefs([targetRef, ...sourceRefs]);
  const safeSourceNames = sourceRefs.map((customerRef) => formatCustomerRefForMergeSelection(customerRef));
  const includeManual = await shouldApplyManualCustomersForBranch(normalizedBranchId);
  await ensureLedgerMergeHistoryTable();

  await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
  let committed = false;
  let targetIdentity = null;
  try {
    targetIdentity = await resolveCustomerMergeTargetIdentity(targetRef, normalizedBranchId);
    const safeTargetName = String(targetIdentity.customer_name == null ? '' : targetIdentity.customer_name).trim();
    if (!safeTargetName) {
      throw new Error('اسم العميل الهدف غير صالح');
    }

    const affectedRows = await fetchCustomerMergeAffectedRows({
      refsToUpdate,
      branchId: normalizedBranchId,
      includeManual
    });
    const affectedRowsCount = countCustomerMergeAffectedRows(affectedRows);
    if (affectedRowsCount <= 0) {
      throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من الفرع/الاسم المختار.');
    }

    const postpaidChanges = await updateCustomerMergeRows({
      tableName: 'postpaid_sales',
      alias: 'ps',
      customerRefs: refsToUpdate,
      branchId: normalizedBranchId,
      targetIdentity,
      reconciled: true
    });

    const receiptChanges = await updateCustomerMergeRows({
      tableName: 'customer_receipts',
      alias: 'cr',
      customerRefs: refsToUpdate,
      branchId: normalizedBranchId,
      targetIdentity,
      reconciled: true
    });

    let manualChanges = 0;
    if (includeManual) {
      manualChanges =
        await updateCustomerMergeRows({
          tableName: 'manual_postpaid_sales',
          alias: 'mp',
          customerRefs: refsToUpdate,
          targetIdentity,
          allowUnscopedFallback: false
        }) +
        await updateCustomerMergeRows({
          tableName: 'manual_customer_receipts',
          alias: 'mr',
          customerRefs: refsToUpdate,
          targetIdentity,
          allowUnscopedFallback: false
        });
    }

    const totalChanges = postpaidChanges + receiptChanges + manualChanges;
    if (totalChanges <= 0) {
      throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من الفرع/الاسم المختار.');
    }

    const mergeHistoryId = await recordCustomerMergeHistory({
      numericBranchId,
      safeTargetName,
      targetIdentity,
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
      mergeHistoryId,
      targetIdentity
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

async function revertCustomerIdentityByRowId(tableName, entries, targetIdentity) {
  const safeEntries = normalizeMergeRowEntries(entries);
  if (safeEntries.length === 0) {
    return 0;
  }

  const targetName = String(targetIdentity?.customerName || targetIdentity?.customer_name || '').trim();
  const targetCustomerId = normalizeCustomerId(targetIdentity?.customerId || targetIdentity?.customer_id);
  const targetCustomerCode = normalizeCustomerCode(targetIdentity?.customerCode || targetIdentity?.customer_code);
  let changed = 0;
  for (const entry of safeEntries) {
    const guardClauses = ['id = ?', 'TRIM(COALESCE(customer_name, \'\')) = ?'];
    const guardParams = [entry.id, targetName];

    if (targetCustomerId > 0) {
      guardClauses.push('COALESCE(customer_id, 0) = ?');
      guardParams.push(targetCustomerId);
    }
    if (targetCustomerCode) {
      guardClauses.push("UPPER(TRIM(COALESCE(customer_code, ''))) = ?");
      guardParams.push(targetCustomerCode);
    }

    const setSql = entry.has_identity_snapshot
      ? 'customer_id = ?, customer_name = ?, customer_code = ?'
      : 'customer_name = ?';
    const setParams = entry.has_identity_snapshot
      ? [
        entry.old_customer_id > 0 ? entry.old_customer_id : null,
        entry.old_name,
        entry.old_code || ''
      ]
      : [entry.old_name];

    const result = await ledgerIpc.invoke(
      'db-run',
      `UPDATE ${tableName}
       SET ${setSql}
       WHERE ${guardClauses.join(' AND ')}`,
      [...setParams, ...guardParams]
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
  const targetIdentity = {
    customerName: safeTargetName,
    customerId: normalizeCustomerId(mergeRecord?.target_customer_id),
    customerCode: normalizeCustomerCode(mergeRecord?.target_customer_code)
  };
  const affectedRows = normalizeCustomerMergeAffectedRows(mergeRecord?.affected_rows);
  const expectedRows = countCustomerMergeAffectedRows(affectedRows);
  if (expectedRows <= 0) {
    throw new Error('لا توجد قيود محفوظة لفك هذا الدمج');
  }
  await ensureLedgerMergeHistoryTable();

  await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
  let committed = false;
  try {
    const postpaidRestored = await revertCustomerIdentityByRowId(
      'postpaid_sales',
      affectedRows.postpaid_sales,
      targetIdentity
    );
    const receiptsRestored = await revertCustomerIdentityByRowId(
      'customer_receipts',
      affectedRows.customer_receipts,
      targetIdentity
    );
    const manualPostpaidRestored = await revertCustomerIdentityByRowId(
      'manual_postpaid_sales',
      affectedRows.manual_postpaid_sales,
      targetIdentity
    );
    const manualReceiptsRestored = await revertCustomerIdentityByRowId(
      'manual_customer_receipts',
      affectedRows.manual_customer_receipts,
      targetIdentity
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

async function renameCustomerNameInLedger(customerName, branchId = '', customerCode = '', customerId = '') {
  const customerRef = normalizeCustomerStatementRef(customerName, branchId, customerCode, customerId);
  const oldName = customerRef.customerName;
  if (!oldName) return;

  try {
    const nextName = await promptForCustomerRename(oldName);
    if (nextName === null) return;
    if (nextName === oldName) {
      showTransactionAlert('لم يتم تغيير الاسم', 'info');
      return;
    }

    const result = await ledgerIpc.invoke('update-customer-data', {
      oldCustomerName: oldName,
      newName: nextName,
      customerId: customerRef.customerId || null,
      customerCode: customerRef.customerCode || '',
      branchId: customerRef.forcedBranchId || null
    });

    if (!result || !result.success) {
      throw new Error(result?.error || 'فشل تحديث اسم العميل');
    }

    await loadCustomerLedger();

    const currentRef = getCurrentCustomerStatementRef();
    const shouldRefreshStatement = (
      (customerRef.customerId > 0 && currentRef.customerId === customerRef.customerId)
      || (customerRef.customerId <= 0 && customerRef.customerCode && currentRef.customerCode === customerRef.customerCode)
      || (
        customerRef.customerId <= 0
        && !customerRef.customerCode
        && currentRef.customerName === oldName
        && currentRef.forcedBranchId === customerRef.forcedBranchId
      )
    );

    if (shouldRefreshStatement) {
      await showCustomerStatement(nextName, customerRef.forcedBranchId, customerRef.customerCode, customerRef.customerId);
    }

    const changed = Number(result?.changes || result?.affectedRows || 0);
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
function getCurrentCustomerStatementRef(fallbackCustomerName = '') {
  return normalizeCustomerStatementRef({
    ...currentCustomerStatementContext,
    customerName: currentCustomerStatementContext?.customerName || fallbackCustomerName
  });
}

async function showCustomerStatement(customerName, forcedBranchId = '', customerCode = '', customerId = '') {
  try {
    const customerRef = normalizeCustomerStatementRef(customerName, forcedBranchId, customerCode, customerId);
    const name = customerRef.customerName;
    if (!name) return;
    currentCustomerStatementContext = customerRef;

    const filters = getLedgerFilters();

    const fmt = getCurrencyFormatter();
    const mTitle = document.getElementById('customerStatementTitle');
    if (mTitle) {
      mTitle.textContent = customerRef.customerCode
        ? `كشف حساب - ${name} (${customerRef.customerCode})`
        : `كشف حساب - ${name}`;
    }

    const sOpen = document.getElementById('statementOpeningBalance');
    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sOpen) sOpen.textContent = fmt(0);
    if (sPost) sPost.textContent = fmt(0);
    if (sRec) sRec.textContent = fmt(0);
    if (sBal) sBal.textContent = fmt(0);
    currentCustomerStatementRowsCache = [];
    selectedCustomerStatementKeys.clear();
    updateCustomerStatementSelectionUi();

    const tbody = document.getElementById('customerStatementTable');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center">جاري تحميل الحركات...</td></tr>`;
    }

    setupStatementEvents(customerRef);
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

    const { transactions, openingBalance } = await loadCustomerStatementDataset(customerRef, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo
    });

    renderCustomerStatementRows(name, transactions, 'لا توجد حركات', {
      openingBalance,
      dateFrom: filters.dateFrom
    });
  } catch (error) {
    console.error('Error showing customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء عرض كشف الحساب: ' + (error && error.message ? error.message : error));
  }
}

function setupStatementEvents(customerRefInput) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const customerName = customerRef.customerName;
  console.log('🔧 [LEDGER] إعداد حدث الكشف للعميل:', customerName);

  // Store customer name for use in filter functions
  window.currentStatementCustomer = customerRef;

  const addBtn = document.getElementById('addTransactionBtn');
  if (addBtn) {
    addBtn.replaceWith(addBtn.cloneNode(true));
    const newAddBtn = document.getElementById('addTransactionBtn');
    newAddBtn.addEventListener('click', () => addNewTransaction(customerRef));
  }

  const printBtn = document.getElementById('printStatementBtn');
  if (printBtn) {
    printBtn.replaceWith(printBtn.cloneNode(true));
    const newPrintBtn = document.getElementById('printStatementBtn');
    newPrintBtn.addEventListener('click', () => printCustomerStatement(customerRef));
  }

  // إعداد أزرار الفلتر بالتاريخ
  const applyFilterBtn = document.getElementById('applyStatementDateFilter');
  if (applyFilterBtn) {
    applyFilterBtn.replaceWith(applyFilterBtn.cloneNode(true));
    const newApplyFilterBtn = document.getElementById('applyStatementDateFilter');
    newApplyFilterBtn.addEventListener('click', () => applyStatementDateFilter(customerRef));
  }

  const clearFilterBtn = document.getElementById('clearStatementDateFilter');
  if (clearFilterBtn) {
    clearFilterBtn.replaceWith(clearFilterBtn.cloneNode(true));
    const newClearFilterBtn = document.getElementById('clearStatementDateFilter');
    newClearFilterBtn.addEventListener('click', () => clearStatementDateFilter(customerRef));
  }

  const splitBtn = document.getElementById('splitStatementTransactionsBtn');
  if (splitBtn) {
    splitBtn.replaceWith(splitBtn.cloneNode(true));
    const newSplitBtn = document.getElementById('splitStatementTransactionsBtn');
    newSplitBtn.addEventListener('click', () => splitSelectedCustomerStatementTransactions(customerRef));
  }

  const clearSelectionBtn = document.getElementById('clearStatementSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.replaceWith(clearSelectionBtn.cloneNode(true));
    const newClearSelectionBtn = document.getElementById('clearStatementSelectionBtn');
    newClearSelectionBtn.addEventListener('click', () => clearCustomerStatementSelection());
  }

  const selectAll = document.getElementById('statementSelectAllTransactions');
  if (selectAll) {
    selectAll.replaceWith(selectAll.cloneNode(true));
    const newSelectAll = document.getElementById('statementSelectAllTransactions');
    newSelectAll.addEventListener('change', (event) => {
      const isChecked = !!event?.target?.checked;
      const visibleRows = Array.isArray(currentCustomerStatementRowsCache) ? currentCustomerStatementRowsCache : [];
      visibleRows.forEach((row) => {
        const key = buildStatementTransactionSelectionKey(row);
        if (isChecked) selectedCustomerStatementKeys.add(key);
        else selectedCustomerStatementKeys.delete(key);
      });

      const rowChecks = document.querySelectorAll('.customer-statement-select-checkbox');
      rowChecks.forEach((checkbox) => {
        checkbox.checked = isChecked;
      });
      updateCustomerStatementSelectionUi();
    });
  }

  const statementTableBody = document.getElementById('customerStatementTable');
  if (statementTableBody) {
    statementTableBody.onchange = (event) => {
      const target = event?.target;
      if (!target || !target.classList?.contains('customer-statement-select-checkbox')) return;

      const selectionKey = String(target.dataset.selectionKey || '');
      if (!selectionKey) return;

      if (target.checked) selectedCustomerStatementKeys.add(selectionKey);
      else selectedCustomerStatementKeys.delete(selectionKey);

      updateCustomerStatementSelectionUi();
    };
  }

  updateCustomerStatementSelectionUi();

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
        await printCustomerStatementThermal(customerRef);
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

async function applyStatementDateFilter(customerRefInput) {
  try {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    console.log('📅 [LEDGER] تطبيق فلتر التاريخ لـ:', customerRef.customerName);

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
    await refreshStatementWithFilter(customerRef, dateFrom, dateTo);

  } catch (error) {
    console.error('Error applying date filter:', error);
    showTransactionAlert('حدث خطأ أثناء تطبيق الفلتر: ' + error.message, 'danger');
  }
}

function clearStatementDateFilter(customerRefInput) {
  try {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    console.log('🗑️ [LEDGER] مسح فلتر التاريخ');

    // مسح قيم الفلترات
    const dateFromEl = document.getElementById('statementDateFrom');
    const dateToEl = document.getElementById('statementDateTo');

    if (dateFromEl) dateFromEl.value = '';
    if (dateToEl) dateToEl.value = '';

    // مسح الفلتر المحفوظ
    window.statementDateFilter = null;

    // إعادة تحميل الكشف بدون فلتر
    showCustomerStatement(customerRef);

  } catch (error) {
    console.error('Error clearing date filter:', error);
    showTransactionAlert('حدث خطأ أثناء مسح الفلتر: ' + error.message, 'danger');
  }
}

async function refreshStatementWithFilter(customerRefInput, dateFrom, dateTo) {
  try {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    const name = customerRef.customerName;
    if (!name) return;

    const { transactions, openingBalance } = await loadCustomerStatementDataset(customerRef, {
      dateFrom,
      dateTo
    });

    renderCustomerStatementRows(name, transactions, 'لا توجد حركات في الفترة المحددة', {
      openingBalance,
      dateFrom
    });

    const fmt = getCurrencyFormatter();
    showTransactionAlert(
      `✅ تم تطبيق الفلتر - عدد الحركات: ${transactions.length} - الرصيد المرحل: ${fmt(openingBalance)}`,
      'success'
    );

  } catch (error) {
    console.error('Error refreshing statement with filter:', error);
    showTransactionAlert('حدث خطأ أثناء تطبيق الفلتر: ' + error.message, 'danger');
  }
}

async function addNewTransaction(customerRefInput) {
  try {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    const customerName = customerRef.customerName;
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
    const payload = {
      customerName,
      customerCode: customerRef.customerCode,
      customerId: customerRef.customerId || null,
      branchId: customerRef.forcedBranchId || null,
      type,
      amount,
      reason,
      date: new Date().toISOString()
    };
    let result = null;
    try {
      result = await ledgerIpc.invoke('add-manual-transaction', payload);
    } catch (e) {
      console.error('add-manual-transaction IPC failed, error:', e);
      result = { success: false, error: e && e.message ? e.message : String(e) };
    }

    if (result && result.success) {
      // Refresh statement data only WITHOUT re-showing modal (to preserve sidebar state)
      refreshStatementData(customerRef);

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
async function refreshStatementData(customerRefInput) {
  try {
    const customerRef = normalizeCustomerStatementRef(customerRefInput);
    const name = customerRef.customerName;
    if (!name) return;

    const dateRange = getEffectiveStatementDateRange();
    const { transactions, openingBalance } = await loadCustomerStatementDataset(customerRef, dateRange);

    renderCustomerStatementRows(name, transactions, 'لا توجد حركات', {
      openingBalance,
      dateFrom: dateRange.dateFrom
    });
  } catch (error) {
    console.error('Error refreshing statement data:', error);
  }
}

async function promptCustomerStatementSplitTarget(customerRef) {
  const defaultName = String(customerRef?.customerName || '').trim();
  const defaultCode = '';

  if (window.Swal) {
    const result = await window.Swal.fire({
      title: 'فصل الحركات المحددة',
      html: `
        <div class="text-end">
          <label class="form-label d-block mb-1">اسم العميل الجديد/الهدف</label>
          <input id="splitStatementCustomerName" class="swal2-input" value="${escapeAttr(defaultName)}" placeholder="اسم العميل">
          <label class="form-label d-block mb-1 mt-2">كود العميل</label>
          <input id="splitStatementCustomerCode" class="swal2-input" value="${escapeAttr(defaultCode)}" placeholder="اتركه فارغاً لإنشاء كود جديد">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'تنفيذ الفصل',
      cancelButtonText: 'إلغاء',
      focusConfirm: false,
      preConfirm: () => {
        const customerName = String(document.getElementById('splitStatementCustomerName')?.value || '').trim();
        const customerCode = String(document.getElementById('splitStatementCustomerCode')?.value || '').trim();
        if (!customerName) {
          window.Swal.showValidationMessage('اسم العميل مطلوب');
          return false;
        }
        return { customerName, customerCode };
      }
    });

    if (!result.isConfirmed) return null;
    return result.value || null;
  }

  const customerName = window.prompt('اسم العميل الجديد/الهدف:', defaultName);
  if (customerName == null) return null;
  const trimmedName = String(customerName).trim();
  if (!trimmedName) {
    showTransactionAlert('اسم العميل مطلوب', 'danger');
    return null;
  }

  const customerCode = window.prompt('كود العميل (اختياري):', defaultCode);
  if (customerCode == null) return null;

  return {
    customerName: trimmedName,
    customerCode: String(customerCode).trim()
  };
}

function resolveStatementTransactionTableName(tx) {
  const isManual = tx?.source === 'manual';
  if (tx?.type === 'postpaid') {
    return isManual ? 'manual_postpaid_sales' : 'postpaid_sales';
  }
  return isManual ? 'manual_customer_receipts' : 'customer_receipts';
}

async function splitSelectedCustomerStatementTransactions(customerRefInput) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const selectedRows = getSelectedCustomerStatementRows();
  if (selectedRows.length === 0) {
    showTransactionAlert('حدد حركة واحدة على الأقل لتنفيذ الفصل', 'warning');
    return;
  }

  try {
    const targetInput = await promptCustomerStatementSplitTarget(customerRef);
    if (!targetInput) {
      return;
    }

    const targetIdentity = await customerLedgerCodeHelpers.resolveCustomerIdentity({
      customerName: targetInput.customerName,
      customerCode: targetInput.customerCode,
      branchId: customerRef.forcedBranchId
    });

    const sameCustomer = (
      (customerRef.customerId > 0 && Number(targetIdentity.customer_id || 0) === customerRef.customerId)
      || (customerRef.customerId <= 0 && customerRef.customerCode && targetIdentity.customer_code === customerRef.customerCode)
      || (
        customerRef.customerId <= 0
        && !customerRef.customerCode
        && targetIdentity.customer_name === customerRef.customerName
        && normalizeBranchId(targetIdentity.branch_id) === customerRef.forcedBranchId
      )
    );

    if (sameCustomer) {
      showTransactionAlert('العميل الهدف مطابق للعميل الحالي، لا يوجد فصل مطلوب', 'info');
      return;
    }

    await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
    let committed = false;
    try {
      let updatedRows = 0;
      for (const tx of selectedRows) {
        const tableName = resolveStatementTransactionTableName(tx);
        const result = await ledgerIpc.invoke(
          'db-run',
          `UPDATE ${tableName}
           SET customer_id = ?, customer_name = ?, customer_code = ?
           WHERE id = ?`,
          [
            targetIdentity.customer_id || null,
            targetIdentity.customer_name,
            targetIdentity.customer_code || '',
            Number(tx?.row_id || tx?.id || 0)
          ]
        );
        updatedRows += Number(result?.changes || 0);
      }

      if (updatedRows <= 0) {
        throw new Error('لم يتم العثور على قيود قابلة للتحديث');
      }

      await ledgerIpc.invoke('db-run', 'COMMIT');
      committed = true;
    } catch (error) {
      if (!committed) {
        try {
          await ledgerIpc.invoke('db-run', 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Statement split rollback failed:', rollbackError);
        }
      }
      throw error;
    }

    clearCustomerStatementSelection();
    await loadCustomerLedger();
    await refreshStatementData(customerRef);
    showTransactionAlert(`تم فصل ${selectedRows.length} حركة إلى العميل ${targetIdentity.customer_name}${targetIdentity.customer_code ? ` (${targetIdentity.customer_code})` : ''}`, 'success');
  } catch (error) {
    console.error('Error splitting selected statement transactions:', error);
    showTransactionAlert(`تعذر فصل الحركات المحددة: ${mapCustomerLedgerDbError(error)}`, 'danger');
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

function renderCustomerStatementRows(customerName, transactions, emptyMessage = 'لا توجد حركات', options = {}) {
  const tbody = document.getElementById('customerStatementTable');
  const sOpen = document.getElementById('statementOpeningBalance');
  const sPost = document.getElementById('statementTotalPostpaid');
  const sRec = document.getElementById('statementTotalReceipts');
  const sBal = document.getElementById('statementBalance');
  const allTx = Array.isArray(transactions) ? transactions : [];
  const fmt = getCurrencyFormatter();
  const openingBalance = Number(options?.openingBalance || 0);
  const dateFrom = String(options?.dateFrom || '').trim();
  const summary = summarizeStatementTransactions(allTx, {
    openingBalance,
    order: 'desc'
  });
  currentCustomerStatementRowsCache = Array.isArray(summary.rows) ? summary.rows : [];
  syncCustomerStatementSelectionWithRows();

  const rowsHtml = summary.rows.map((tx) => {
    const kind = tx.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
    const reasonText = translateReason(tx.reason || '-');
    const amountText = fmt(tx.amount || 0);
    const balanceText = fmt(tx.runningBalance || 0);
    const txDate = tx.tx_date || tx.created_at || '';
    const selectionKey = buildStatementTransactionSelectionKey(tx);
    const checked = selectedCustomerStatementKeys.has(selectionKey) ? 'checked' : '';

    return `
      <tr>
        <td>
          <input
            type="checkbox"
            class="form-check-input customer-statement-select-checkbox"
            data-selection-key="${escapeAttr(selectionKey)}"
            ${checked}
            aria-label="تحديد الحركة ${escapeAttr(txDate)}">
        </td>
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

  const openingRowHtml = shouldShowOpeningBalanceRow(dateFrom, openingBalance) ? `
    <tr class="statement-opening-carry-row">
      <td><span class="text-muted">-</span></td>
      <td>${escapeHtml(dateFrom || '-')}</td>
      <td>رصيد مرحل</td>
      <td>من فترة سابقة</td>
      <td>-</td>
      <td class="text-currency text-muted">-</td>
      <td class="text-currency fw-bold">${fmt(openingBalance)}</td>
      <td><span class="text-muted">-</span></td>
    </tr>
  ` : '';

  if (sOpen) sOpen.textContent = fmt(openingBalance);
  if (sPost) sPost.textContent = fmt(summary.totalPostpaid);
  if (sRec) sRec.textContent = fmt(summary.totalReceipts);
  if (sBal) sBal.textContent = fmt(summary.closingBalance);

  if (tbody) {
    const hasContent = Boolean(rowsHtml || openingRowHtml);
    tbody.innerHTML = hasContent
      ? `${rowsHtml}${openingRowHtml}`
      : `<tr><td colspan="8" class="text-center">${escapeHtml(emptyMessage)}</td></tr>`;
  }
  updateCustomerStatementSelectionUi();
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
    const customerRef = normalizeCustomerStatementRef(customerName);
    const name = customerRef.customerName;
    if (!name.trim()) return;

    const customerMatcher = customerRef.customerId > 0
      ? {
        clause: 'cust.id = ?',
        params: [customerRef.customerId]
      }
      : customerRef.customerCode
        ? {
          clause: "UPPER(TRIM(COALESCE(cust.customer_code, ''))) = ?",
          params: [customerRef.customerCode]
        }
        : {
          clause: 'TRIM(COALESCE(cust.customer_name, \'\')) = ?',
          params: [name]
        };

    let branchInfo = await ledgerIpc.invoke('db-query', `
      SELECT b.id, b.branch_name, b.branch_phone, b.branch_address
      FROM customers cust
      LEFT JOIN branches b ON b.id = cust.branch_id
      WHERE ${customerMatcher.clause}
      LIMIT 1
    `, customerMatcher.params);

    if (!Array.isArray(branchInfo) || branchInfo.length === 0) {
      const fallbackMatcher = buildCustomerTableMatcher('ps', customerRef, { branchExpression: 'c.branch_id' });
      branchInfo = await ledgerIpc.invoke('db-query', `
        SELECT DISTINCT b.id, b.branch_name, b.branch_phone, b.branch_address
        FROM branches b
        JOIN cashiers c ON c.branch_id = b.id
        JOIN reconciliations r ON r.cashier_id = c.id
        LEFT JOIN postpaid_sales ps ON ps.reconciliation_id = r.id
        WHERE ${fallbackMatcher.clause}
        ORDER BY r.reconciliation_date DESC
        LIMIT 1
      `, fallbackMatcher.params);
    }

    const branch = branchInfo && branchInfo[0] ? branchInfo[0] : {
      branch_name: 'غير محدد',
      branch_phone: '',
      branch_address: ''
    };

    const dateRange = getEffectiveStatementDateRange();
    const { transactions, openingBalance } = await loadCustomerStatementDataset(customerRef, dateRange);
    const summary = summarizeStatementTransactions(transactions, {
      openingBalance,
      order: 'desc'
    });

    const fmt = getCurrencyFormatter();
    const sortedTx = [...transactions].sort((left, right) => {
      const leftDate = String(left?.tx_date || left?.created_at || '');
      const rightDate = String(right?.tx_date || right?.created_at || '');
      const dateCompare = leftDate.localeCompare(rightDate);
      if (dateCompare !== 0) return dateCompare;
      return String(left?.created_at || '').localeCompare(String(right?.created_at || ''));
    });

    const printRows = summarizeStatementTransactions(sortedTx, {
      openingBalance,
      order: 'asc'
    }).rows;

    const rowsHtml = printRows.map((t) => {
      const amount = Math.abs(Number(t.amount || 0));
      const isPostpaid = t.type === 'postpaid';
      const debit = t.debit || (isPostpaid ? amount : 0);
      const credit = t.credit || (isPostpaid ? 0 : amount);

      const reasonText = translateReason(t.reason || '-');
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const cashierName = String(t.cashier_name || 'إدخال يدوي').trim();
      const sourceLabel = t.rec_no != null && t.rec_no !== 'يدوي'
        ? `تصفية ${recNo}`
        : 'قيد يدوي';
      const statementMain = isPostpaid
        ? `تحميل مديونية على ح/ ${name}`
        : `تحصيل نقدي من ح/ ${name}`;
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
          <td class="text-currency fw-bold">${fmt(t.runningBalance)}</td>
        </tr>
      `;
    }).join('');

    const openingDebit = openingBalance >= 0 ? openingBalance : 0;
    const openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;
    const closingDebit = summary.closingBalance >= 0 ? summary.closingBalance : 0;
    const closingCredit = summary.closingBalance < 0 ? Math.abs(summary.closingBalance) : 0;
    const openingDebitText = (openingDebit > 0 || (openingDebit === 0 && openingCredit === 0)) ? fmt(openingDebit) : '';
    const formattedDateRange = formatStatementDateRange(dateRange.dateFrom, dateRange.dateTo);

    const printHTML = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>كشف حساب - ${name}</title>
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
                        ${branch.branch_phone ? `<div>هاتف: ${branch.branch_phone}</div>` : ''}
                        ${branch.branch_address ? `<div>عنوان: ${branch.branch_address}</div>` : ''}
                    </div>
                </div>
                <div class="header-left">
                    <div class="details-section">
                        <div class="customer-info"><span class="detail-label">العميل</span> ${name}</div>
                        ${customerRef.customerCode ? `<div class="print-date"><span class="detail-label">كود العميل</span> ${escapeHtml(customerRef.customerCode)}</div>` : ''}
                        <div class="print-date"><span class="detail-label">التاريخ</span> ${formatDateTime(new Date())}</div>
                        ${formattedDateRange ? `<div class="print-date"><span class="detail-label">الفترة</span> ${formattedDateRange}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>
        <div class="summary">
          <div class="summary-item"><div class="label">الرصيد المرحل</div><div class="value text-currency">${fmt(openingBalance)}</div></div>
          <div class="summary-item"><div class="label">إجمالي المدين</div><div class="value text-currency">${fmt(summary.totalPostpaid)}</div></div>
          <div class="summary-item"><div class="label">إجمالي الدائن</div><div class="value text-currency">${fmt(summary.totalReceipts)}</div></div>
          <div class="summary-item"><div class="label">الرصيد النهائي</div><div class="value text-currency">${fmt(summary.closingBalance)}</div></div>
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
                <div class="statement-detail">ح/ ${escapeHtml(name)}</div>
              </td>
              <td class="text-currency">${openingDebitText}</td>
              <td class="text-currency">${openingCredit > 0 ? fmt(openingCredit) : ''}</td>
              <td class="text-currency fw-bold">${fmt(openingBalance)}</td>
            </tr>
            ${rowsHtml || '<tr><td colspan="7" class="text-center">لا توجد حركات</td></tr>'}
            <tr class="totals-row">
              <td colspan="4">إجمالي حركات الفترة</td>
              <td class="text-currency">${fmt(summary.totalPostpaid)}</td>
              <td class="text-currency">${fmt(summary.totalReceipts)}</td>
              <td class="text-currency fw-bold">${fmt(summary.periodNet)}</td>
            </tr>
            <tr class="closing-row">
              <td colspan="4">الرصيد الختامي</td>
              <td class="text-currency">${closingDebit > 0 || (closingDebit === 0 && closingCredit === 0) ? fmt(closingDebit) : ''}</td>
              <td class="text-currency">${closingCredit > 0 ? fmt(closingCredit) : ''}</td>
              <td class="text-currency fw-bold">${fmt(summary.closingBalance)}</td>
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

function buildStatementDateClauses(options = {}) {
  const dateFrom = String(options.dateFrom || '').trim();
  const dateTo = String(options.dateTo || '').trim();
  const completedOnly = !!options.completedOnly;
  let reconciledSql = '';
  let manualSql = '';
  const reconciledParams = [];
  const manualParams = [];

  if (completedOnly) {
    reconciledSql += " AND r.status = 'completed'";
  }

  if (dateFrom) {
    reconciledSql += ' AND r.reconciliation_date >= ?';
    manualSql += ' AND DATE(created_at) >= ?';
    reconciledParams.push(dateFrom);
    manualParams.push(dateFrom);
  }

  if (dateTo) {
    reconciledSql += ' AND r.reconciliation_date <= ?';
    manualSql += ' AND DATE(created_at) <= ?';
    reconciledParams.push(dateTo);
    manualParams.push(dateTo);
  }

  return {
    dateFrom,
    dateTo,
    reconciledSql,
    manualSql,
    reconciledParams,
    manualParams
  };
}

async function fetchCustomerStatementTransactions(customerRefInput, options = {}) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const name = customerRef.customerName;
  if (!name) return [];

  const clauses = buildStatementDateClauses(options);
  const postpaidMatcher = buildCustomerTableMatcher('ps', customerRef, { branchExpression: 'c.branch_id' });
  const receiptMatcher = buildCustomerTableMatcher('cr', customerRef, { branchExpression: 'c.branch_id' });
  const manualPostpaidMatcher = buildCustomerTableMatcher('mp', customerRef);
  const manualReceiptMatcher = buildCustomerTableMatcher('mr', customerRef);

  const sqlPost = `
    SELECT ps.id AS row_id, ps.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
           ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
           ps.created_at AS created_at, r.reconciliation_number AS rec_no, ps.notes AS reason,
           c.name as cashier_name
    FROM postpaid_sales ps
    LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
    LEFT JOIN cashiers c ON r.cashier_id = c.id
    WHERE ${postpaidMatcher.clause}
    ${clauses.reconciledSql}
  `;

  const sqlRec = `
    SELECT cr.id AS row_id, cr.reconciliation_id AS reconciliation_id, 'reconciled' AS source,
           cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
           cr.created_at AS created_at, r.reconciliation_number AS rec_no, cr.notes AS reason,
           c.name as cashier_name
    FROM customer_receipts cr
    LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
    LEFT JOIN cashiers c ON r.cashier_id = c.id
    WHERE ${receiptMatcher.clause}
    ${clauses.reconciledSql}
  `;

  const sqlManualPost = `
    SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
           amount, 'postpaid' as type, created_at as tx_date,
           created_at, null as rec_no, reason,
           'إدخال يدوي' as cashier_name
    FROM manual_postpaid_sales mp
    WHERE ${manualPostpaidMatcher.clause}
    ${clauses.manualSql}
  `;

  const sqlManualRec = `
    SELECT id AS row_id, NULL AS reconciliation_id, 'manual' as source,
           amount, 'receipt' as type, created_at as tx_date,
           created_at, null as rec_no, reason,
           'إدخال يدوي' as cashier_name
    FROM manual_customer_receipts mr
    WHERE ${manualReceiptMatcher.clause}
    ${clauses.manualSql}
  `;

  const postpaidParams = [...postpaidMatcher.params, ...clauses.reconciledParams];
  const receiptParams = [...receiptMatcher.params, ...clauses.reconciledParams];
  const manualPostpaidParams = [...manualPostpaidMatcher.params, ...clauses.manualParams];
  const manualReceiptParams = [...manualReceiptMatcher.params, ...clauses.manualParams];

  const [postTx, recTx, manualPostTx, manualRecTx] = await Promise.all([
    ledgerIpc.invoke('db-query', sqlPost, postpaidParams),
    ledgerIpc.invoke('db-query', sqlRec, receiptParams),
    ledgerIpc.invoke('db-query', sqlManualPost, manualPostpaidParams),
    ledgerIpc.invoke('db-query', sqlManualRec, manualReceiptParams)
  ]);

  return sortTransactionsForStatement([
    ...(postTx || []),
    ...(recTx || []),
    ...(manualPostTx || []),
    ...(manualRecTx || [])
  ]);
}

async function calculateCustomerStatementOpeningBalance(customerRefInput, options = {}) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const name = customerRef.customerName;
  const dateFrom = String(options.dateFrom || '').trim();
  const completedOnly = !!options.completedOnly;
  if (!name || !dateFrom) return 0;

  const reconciledStatusSql = completedOnly ? " AND r.status = 'completed'" : '';
  const postpaidMatcher = buildCustomerTableMatcher('ps', customerRef, { branchExpression: 'c.branch_id' });
  const receiptMatcher = buildCustomerTableMatcher('cr', customerRef, { branchExpression: 'c.branch_id' });
  const manualPostpaidMatcher = buildCustomerTableMatcher('mp', customerRef);
  const manualReceiptMatcher = buildCustomerTableMatcher('mr', customerRef);

  const sqlPost = `
    SELECT COALESCE(SUM(ps.amount), 0) AS total
    FROM postpaid_sales ps
    LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
    LEFT JOIN cashiers c ON c.id = r.cashier_id
    WHERE ${postpaidMatcher.clause}
      AND r.reconciliation_date < ?
      ${reconciledStatusSql}
  `;

  const sqlRec = `
    SELECT COALESCE(SUM(cr.amount), 0) AS total
    FROM customer_receipts cr
    LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
    LEFT JOIN cashiers c ON c.id = r.cashier_id
    WHERE ${receiptMatcher.clause}
      AND r.reconciliation_date < ?
      ${reconciledStatusSql}
  `;

  const sqlManualPost = `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM manual_postpaid_sales mp
    WHERE ${manualPostpaidMatcher.clause}
      AND DATE(created_at) < ?
  `;

  const sqlManualRec = `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM manual_customer_receipts mr
    WHERE ${manualReceiptMatcher.clause}
      AND DATE(created_at) < ?
  `;

  const [postRows, recRows, manualPostRows, manualRecRows] = await Promise.all([
    ledgerIpc.invoke('db-query', sqlPost, [...postpaidMatcher.params, dateFrom]),
    ledgerIpc.invoke('db-query', sqlRec, [...receiptMatcher.params, dateFrom]),
    ledgerIpc.invoke('db-query', sqlManualPost, [...manualPostpaidMatcher.params, dateFrom]),
    ledgerIpc.invoke('db-query', sqlManualRec, [...manualReceiptMatcher.params, dateFrom])
  ]);

  const getTotal = (rows) => Number(rows?.[0]?.total || 0);
  return getTotal(postRows) + getTotal(manualPostRows) - getTotal(recRows) - getTotal(manualRecRows);
}

async function loadCustomerStatementDataset(customerRefInput, options = {}) {
  const customerRef = normalizeCustomerStatementRef(customerRefInput);
  const [transactions, openingBalance] = await Promise.all([
    fetchCustomerStatementTransactions(customerRef, options),
    calculateCustomerStatementOpeningBalance(customerRef, options)
  ]);

  return {
    transactions,
    openingBalance
  };
}

function getEffectiveStatementDateRange() {
  if (window.statementDateFilter && (window.statementDateFilter.dateFrom || window.statementDateFilter.dateTo)) {
    return {
      dateFrom: String(window.statementDateFilter.dateFrom || '').trim(),
      dateTo: String(window.statementDateFilter.dateTo || '').trim()
    };
  }

  const filters = getLedgerFilters();
  return {
    dateFrom: String(filters.dateFrom || '').trim(),
    dateTo: String(filters.dateTo || '').trim()
  };
}

function formatStatementDateRange(dateFrom, dateTo) {
  const from = String(dateFrom || '').trim();
  const to = String(dateTo || '').trim();
  if (from && to) return `${from} إلى ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return '';
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
    const customerRef = normalizeCustomerStatementRef(customerName);
    const name = customerRef.customerName;
    console.log('🖨️ [LEDGER] بدء طباعة كشف الحساب الحرارية للعميل:', name);

    // جلب بيانات الفرع المرتبط بالعميل
    let customerBranch = { branch_name: '', branch_phone: '', branch_address: '' };
    try {
      const customerMatcher = customerRef.customerId > 0
        ? {
          clause: 'cust.id = ?',
          params: [customerRef.customerId]
        }
        : customerRef.customerCode
          ? {
            clause: "UPPER(TRIM(COALESCE(cust.customer_code, ''))) = ?",
            params: [customerRef.customerCode]
          }
          : {
            clause: 'TRIM(COALESCE(cust.customer_name, \'\')) = ?',
            params: [name]
          };

      let branchData = await ledgerIpc.invoke('db-query', `
        SELECT b.id, b.branch_name, b.branch_phone, b.branch_address
        FROM customers cust
        LEFT JOIN branches b ON b.id = cust.branch_id
        WHERE ${customerMatcher.clause}
        LIMIT 1
      `, customerMatcher.params);

      if (!Array.isArray(branchData) || branchData.length === 0) {
        const fallbackMatcher = buildCustomerTableMatcher('ps', customerRef, { branchExpression: 'c.branch_id' });
        branchData = await ledgerIpc.invoke('db-query', `
          SELECT DISTINCT b.id, b.branch_name, b.branch_phone, b.branch_address
          FROM branches b
          INNER JOIN cashiers c ON c.branch_id = b.id
          INNER JOIN reconciliations r ON r.cashier_id = c.id
          INNER JOIN postpaid_sales ps ON ps.reconciliation_id = r.id
          WHERE ${fallbackMatcher.clause}
          LIMIT 1
        `, fallbackMatcher.params);
      }

      if (branchData && branchData.length > 0) {
        customerBranch = branchData[0];
        console.log('🏢 [THERMAL] تم الحصول على بيانات الفرع:', customerBranch);
      }
    } catch (branchErr) {
      console.warn('⚠️ [THERMAL] تحذير في جلب بيانات الفرع:', branchErr);
    }

    const dateRange = getEffectiveStatementDateRange();

    // إظهار رسالة التحميل
    showTransactionAlert('جاري تحضير البيانات للطباعة...', 'info');

    const { transactions, openingBalance } = await loadCustomerStatementDataset(customerRef, {
      ...dateRange,
      completedOnly: true
    });
    const summary = summarizeStatementTransactions(transactions, {
      openingBalance,
      order: 'desc'
    });
    const fmt = getCurrencyFormatter();

    // بيانات الجدول في صيغة منظمة
    const tableData = [];
    summary.rows.forEach((t) => {
      const amount = Number(t.amount || 0);
      const kind = t.type === 'postpaid' ? 'آجل' : 'مقبوض';
      const date = (t.tx_date || '').substring(0, 10);
      const amt = amount;
      const bal = t.runningBalance;
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
    const totalPostStr = fmt(summary.totalPostpaid);
    const totalRecStr = fmt(summary.totalReceipts);
    const openingBalanceStr = fmt(openingBalance);
    const balanceStr = fmt(summary.closingBalance);

    // إنشاء بيانات متوافقة مع ThermalPrinter80mm
    const textReceipt = JSON.stringify({
      isStructuredStatement: true,
      customerName: name,
      customerCode: customerRef.customerCode,
      printDate: formatDateTime(new Date()),
      statementDateRange: formatStatementDateRange(dateRange.dateFrom, dateRange.dateTo),
      tableData,
      summary: {
        openingBalance,
        totalPostpaid: summary.totalPostpaid,
        totalReceipts: summary.totalReceipts,
        periodNet: summary.periodNet,
        balance: summary.closingBalance,
        openingBalanceStr,
        totalPostpaidStr: totalPostStr,
        totalReceiptsStr: totalRecStr,
        balanceStr: balanceStr
      }
    });

    console.log('📄 [LEDGER] تم تحضير النص للطباعة، الحجم:', textReceipt.length, 'بايت');

    // استدعاء IPC handler للطباعة الحرارية
    const result = await ledgerIpc.invoke('print-thermal-statement', {
      customerName: name,
      customerCode: customerRef.customerCode,
      textReceipt,
      totalPost: summary.totalPostpaid,
      totalRec: summary.totalReceipts,
      balance: summary.closingBalance,
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
    const customerRef = getCurrentCustomerStatementRef(customerName);
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
      const insertSql = `INSERT INTO ${newTable} (customer_id, customer_name, customer_code, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
      await ledgerIpc.invoke('db-run', insertSql, [
        customerRef.customerId || null,
        customerRef.customerName || customerName,
        customerRef.customerCode || '',
        amount,
        finalReason,
        finalDate
      ]);

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
      await refreshStatementWithFilter(customerRef, dateFilter.dateFrom, dateFilter.dateTo);
    } else {
      await showCustomerStatement(customerRef);
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
