// ===================================================
// 🧾 Cashboxes Module
// ===================================================
/* global document, window, DialogUtils */

(() => {
  const cashboxIpc = typeof window !== 'undefined' && window.RendererIPC
    ? window.RendererIPC
    : require('./renderer-ipc');
  const { mapDbErrorMessage } = require('./app/db-error-messages');
  const {
    summarizeCashboxReport,
    prepareCashboxReportExcelData,
    buildCashboxReportHtml
  } = require('./app/cashbox-report-utils');
  const {
    buildCashboxVoucherLabel,
    buildCashboxVoucherSyncKey,
    buildCashboxVoucherAuditNote
  } = require('./app/cashbox-voucher-utils');

  let initialized = false;
  let schemaEnsured = false;
  let branchesLoaded = false;
  let currentContextBranchId = '';
  let branchOptions = [];
  let currentVoucherRows = [];
  let currentVoucherFilters = {
    branchId: '',
    voucherType: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  };
  let currentReportSummary = summarizeCashboxReport();
  let activeVoucherEdit = null;
  const AUTO_POST_SETTING_CATEGORY = 'cashboxes';
  const AUTO_POST_SETTING_KEY = 'auto_post_reconciliation_vouchers';

  function getElement(id) {
    return document.getElementById(id);
  }

  function getDialogUtils() {
    if (typeof DialogUtils !== 'undefined') {
      return DialogUtils;
    }
    return null;
  }

  function getToday() {
    const now = new Date();
    const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return localNow.toISOString().split('T')[0];
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseBooleanSetting(value, defaultValue = false) {
    if (value == null) {
      return defaultValue;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return defaultValue;
    }

    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return true;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return false;
    }

    return defaultValue;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(value) {
    return toNumber(value, 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return '-';
    }

    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      return rawValue;
    }

    return date.toLocaleDateString('en-GB');
  }

  function formatDateTime(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return '-';
    }

    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      return rawValue;
    }

    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  function setTextContent(id, value) {
    const element = getElement(id);
    if (element) {
      element.textContent = value;
    }
  }

  function toggleHidden(id, shouldHide) {
    const element = getElement(id);
    if (element) {
      element.classList.toggle('d-none', shouldHide);
    }
  }

  function setButtonDisabled(id, disabled) {
    const element = getElement(id);
    if (element) {
      element.disabled = !!disabled;
    }
  }

  function updateSignedValueState(id, value) {
    const element = getElement(id);
    if (!element) {
      return;
    }

    element.classList.remove('text-success', 'text-danger');
    if (value > 0) {
      element.classList.add('text-success');
    } else if (value < 0) {
      element.classList.add('text-danger');
    }
  }

  function ensureSelectOption(selectOrId, value, label) {
    const select = typeof selectOrId === 'string' ? getElement(selectOrId) : selectOrId;
    const normalizedValue = String(value || '').trim();

    if (!select || !normalizedValue) {
      return;
    }

    const exists = Array.from(select.options).some((option) => option.value === normalizedValue);
    if (exists) {
      return;
    }

    const option = document.createElement('option');
    option.value = normalizedValue;
    option.textContent = String(label || normalizedValue).trim();
    select.appendChild(option);
  }

  function scrollToElement(id) {
    const element = getElement(id);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function getCurrentUserName() {
    const currentUser = getElement('currentUser');
    const name = String(currentUser?.textContent || '').trim();
    return name || 'غير معروف';
  }

  function showToast(message, type = 'success') {
    const dialog = getDialogUtils();
    if (!dialog || !message) {
      return;
    }

    if (type === 'error' && typeof dialog.showErrorToast === 'function') {
      dialog.showErrorToast(message);
      return;
    }

    if (type === 'success' && typeof dialog.showSuccessToast === 'function') {
      dialog.showSuccessToast(message);
    }
  }

  function setInlineAlert(containerId, message, type = 'success') {
    const container = getElement(containerId);
    if (!container) {
      return;
    }

    if (!message) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `<div class="alert alert-${type} mb-0">${escapeHtml(message)}</div>`;
  }

  function populateSelectWithRows(selectId, rows, valueKey, labelBuilder, options = {}) {
    const select = getElement(selectId);
    if (!select) {
      return;
    }

    const preserveValue = String(options.preserveValue != null ? options.preserveValue : select.value || '');
    const includePlaceholder = options.includePlaceholder !== false;
    const placeholderValue = options.placeholderValue || '';
    const placeholderText = options.placeholderText || 'اختر';

    select.innerHTML = '';

    if (includePlaceholder) {
      const option = document.createElement('option');
      option.value = placeholderValue;
      option.textContent = placeholderText;
      select.appendChild(option);
    }

    (rows || []).forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row[valueKey]);
      option.textContent = typeof labelBuilder === 'function' ? labelBuilder(row) : String(row[labelBuilder] || '');
      select.appendChild(option);
    });

    if (preserveValue && Array.from(select.options).some((option) => option.value === preserveValue)) {
      select.value = preserveValue;
    }
  }

  function buildVoucherLabel(voucherType, voucherSequenceNumber, fallbackVoucherNumber = 0) {
    return buildCashboxVoucherLabel(voucherType, voucherSequenceNumber, fallbackVoucherNumber);
  }

  function getVoucherDisplayNumber(voucher) {
    return toNumber(voucher?.voucher_sequence_number, toNumber(voucher?.voucher_number, 0));
  }

  function getVoucherTypeLabel(voucherType) {
    return voucherType === 'receipt' ? 'سند قبض' : 'سند صرف';
  }

  function resolveBranchName(branchId) {
    const normalizedBranchId = String(branchId || '').trim();
    if (!normalizedBranchId) {
      return 'جميع الفروع';
    }

    const cachedBranch = branchOptions.find((branch) => String(branch.id) === normalizedBranchId);
    if (cachedBranch?.branch_name) {
      return cachedBranch.branch_name;
    }

    const selects = ['cashboxVoucherBranchFilter', 'cashboxContextBranchFilter']
      .map((id) => getElement(id))
      .filter(Boolean);

    for (const select of selects) {
      const option = Array.from(select.options).find((item) => item.value === normalizedBranchId);
      if (option?.textContent?.trim()) {
        return option.textContent.trim();
      }
    }

    return `فرع ${normalizedBranchId}`;
  }

  function buildCashboxReportMeta(filters = currentVoucherFilters) {
    const reportMeta = [
      {
        label: 'الفرع',
        value: filters.branchId ? resolveBranchName(filters.branchId) : 'جميع الفروع'
      },
      {
        label: 'النوع',
        value: filters.voucherType ? getVoucherTypeLabel(filters.voucherType) : 'كل السندات'
      }
    ];

    if (filters.dateFrom || filters.dateTo) {
      reportMeta.push({
        label: 'الفترة',
        value: `${filters.dateFrom || 'البداية'} - ${filters.dateTo || 'اليوم'}`
      });
    }

    if (filters.search) {
      reportMeta.push({
        label: 'البحث',
        value: filters.search
      });
    }

    return reportMeta;
  }

  function getCurrentCashboxReportTitle(filters = currentVoucherFilters) {
    if (filters.branchId) {
      return `تقرير صندوق ${resolveBranchName(filters.branchId)}`;
    }

    return 'تقرير صناديق الفروع';
  }

  async function runQuery(sql, params = []) {
    return cashboxIpc.invoke('db-query', sql, params);
  }

  async function runStatement(sql, params = []) {
    return cashboxIpc.invoke('db-run', sql, params);
  }

  async function getCompanyName() {
    const cachedCompanyName = String(window.currentCompanyName || '').trim();
    if (cachedCompanyName) {
      return cachedCompanyName;
    }

    try {
      const rows = await runQuery(
        'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ? LIMIT 1',
        ['general', 'company_name']
      );
      const companyName = String(rows?.[0]?.setting_value || '').trim();
      return companyName || 'تقرير النظام';
    } catch (_error) {
      return 'تقرير النظام';
    }
  }

  async function ensureCashboxSchema() {
    if (schemaEnsured) {
      return;
    }

    await runStatement(`
      CREATE TABLE IF NOT EXISTS branch_cashboxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_id INTEGER NOT NULL UNIQUE,
        cashbox_name TEXT NOT NULL,
        opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
      )
    `);

    await runStatement(`
      CREATE TABLE IF NOT EXISTS cashbox_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_number INTEGER NOT NULL UNIQUE,
        voucher_sequence_number INTEGER,
        sync_key TEXT UNIQUE,
        voucher_type TEXT NOT NULL,
        cashbox_id INTEGER NOT NULL,
        branch_id INTEGER NOT NULL,
        counterparty_type TEXT NOT NULL,
        counterparty_name TEXT NOT NULL,
        cashier_id INTEGER,
        amount DECIMAL(10,2) NOT NULL,
        reference_no TEXT,
        description TEXT,
        voucher_date DATE NOT NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_reconciliation_id INTEGER,
        source_entry_key TEXT,
        is_auto_generated INTEGER DEFAULT 0,
        FOREIGN KEY (cashbox_id) REFERENCES branch_cashboxes(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE SET NULL
      )
    `);

    await runStatement(`
      CREATE TABLE IF NOT EXISTS cashbox_voucher_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id INTEGER,
        voucher_number INTEGER,
        voucher_sequence_number INTEGER,
        voucher_type TEXT NOT NULL,
        branch_id INTEGER,
        action_type TEXT NOT NULL,
        action_by TEXT,
        action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        payload_json TEXT,
        notes TEXT,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
      )
    `);

    const voucherColumns = await runQuery('PRAGMA table_info(cashbox_vouchers)');
    const hasVoucherSequenceNumber = Array.isArray(voucherColumns)
      && voucherColumns.some((column) => column.name === 'voucher_sequence_number');
    const hasSyncKey = Array.isArray(voucherColumns)
      && voucherColumns.some((column) => column.name === 'sync_key');
    const hasSourceReconciliationId = Array.isArray(voucherColumns)
      && voucherColumns.some((column) => column.name === 'source_reconciliation_id');
    const hasSourceEntryKey = Array.isArray(voucherColumns)
      && voucherColumns.some((column) => column.name === 'source_entry_key');
    const hasAutoGeneratedFlag = Array.isArray(voucherColumns)
      && voucherColumns.some((column) => column.name === 'is_auto_generated');

    if (!hasVoucherSequenceNumber) {
      await runStatement('ALTER TABLE cashbox_vouchers ADD COLUMN voucher_sequence_number INTEGER');
    }
    if (!hasSyncKey) {
      await runStatement('ALTER TABLE cashbox_vouchers ADD COLUMN sync_key TEXT');
    }
    if (!hasSourceReconciliationId) {
      await runStatement('ALTER TABLE cashbox_vouchers ADD COLUMN source_reconciliation_id INTEGER');
    }
    if (!hasSourceEntryKey) {
      await runStatement('ALTER TABLE cashbox_vouchers ADD COLUMN source_entry_key TEXT');
    }
    if (!hasAutoGeneratedFlag) {
      await runStatement('ALTER TABLE cashbox_vouchers ADD COLUMN is_auto_generated INTEGER DEFAULT 0');
    }
    await runStatement(`
      UPDATE cashbox_vouchers
      SET is_auto_generated = COALESCE(is_auto_generated, 0)
      WHERE is_auto_generated IS NULL
    `);

    await runStatement('CREATE INDEX IF NOT EXISTS idx_branch_cashboxes_branch_id ON branch_cashboxes(branch_id)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_branch_date ON cashbox_vouchers(branch_id, voucher_date)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_date ON cashbox_vouchers(voucher_type, voucher_date)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence ON cashbox_vouchers(voucher_type, voucher_sequence_number)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_reconciliation ON cashbox_vouchers(source_reconciliation_id, source_entry_key)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_auto_generated ON cashbox_vouchers(is_auto_generated, source_reconciliation_id)');
    await runStatement('CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_voucher_action ON cashbox_voucher_audit_log(voucher_id, action_at DESC)');
    await runStatement('CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_branch_action ON cashbox_voucher_audit_log(branch_id, action_at DESC)');
    await runStatement(`
      INSERT OR IGNORE INTO branch_cashboxes (
        branch_id,
        cashbox_name,
        opening_balance,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        b.id,
        'صندوق ' || TRIM(COALESCE(b.branch_name, 'الفرع')),
        0,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.is_active = 1
    `);

    await runStatement(`
      INSERT OR IGNORE INTO system_settings (
        category,
        setting_key,
        setting_value,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [AUTO_POST_SETTING_CATEGORY, AUTO_POST_SETTING_KEY, 'false']);

    const missingSequenceRows = await runQuery(`
      SELECT id
      FROM cashbox_vouchers
      WHERE COALESCE(voucher_sequence_number, 0) <= 0
      LIMIT 1
    `);
    if (Array.isArray(missingSequenceRows) && missingSequenceRows.length > 0) {
      await normalizeCashboxVoucherSequences();
    }
    await backfillCashboxVoucherSyncKeys();
    await runStatement(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence_unique
      ON cashbox_vouchers(voucher_type, voucher_sequence_number)
      WHERE voucher_sequence_number IS NOT NULL
    `);
    await runStatement(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique
      ON cashbox_vouchers(source_reconciliation_id, source_entry_key)
      WHERE source_reconciliation_id IS NOT NULL
        AND source_entry_key IS NOT NULL
    `);

    schemaEnsured = true;
  }

  async function ensureBranchCashbox(branchId) {
    const normalizedBranchId = String(branchId || '').trim();
    if (!normalizedBranchId) {
      return null;
    }

    const rows = await runQuery(`
      SELECT cb.id, cb.cashbox_name
      FROM branch_cashboxes cb
      WHERE cb.branch_id = ?
      LIMIT 1
    `, [normalizedBranchId]);

    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0];
    }

    await runStatement(`
      INSERT OR IGNORE INTO branch_cashboxes (
        branch_id,
        cashbox_name,
        opening_balance,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        b.id,
        'صندوق ' || TRIM(COALESCE(b.branch_name, 'الفرع')),
        0,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.id = ?
    `, [normalizedBranchId]);

    const freshRows = await runQuery(`
      SELECT cb.id, cb.cashbox_name
      FROM branch_cashboxes cb
      WHERE cb.branch_id = ?
      LIMIT 1
    `, [normalizedBranchId]);

    return Array.isArray(freshRows) ? freshRows[0] || null : null;
  }

  async function normalizeCashboxVoucherSequences() {
    const rows = await runQuery(`
      SELECT id, voucher_type
      FROM cashbox_vouchers
      ORDER BY voucher_number ASC, id ASC
    `);

    const counters = {
      receipt: 0,
      payment: 0
    };

    for (const row of Array.isArray(rows) ? rows : []) {
      const voucherType = row.voucher_type === 'payment' ? 'payment' : 'receipt';
      counters[voucherType] += 1;
      await runStatement(`
        UPDATE cashbox_vouchers
        SET voucher_sequence_number = ?
        WHERE id = ?
      `, [counters[voucherType], row.id]);
    }
  }

  async function backfillCashboxVoucherSyncKeys() {
    const rows = await runQuery(`
      SELECT
        id,
        voucher_number,
        voucher_sequence_number,
        sync_key,
        voucher_type,
        cashbox_id,
        branch_id,
        counterparty_type,
        counterparty_name,
        amount,
        voucher_date,
        created_at,
        updated_at,
        source_reconciliation_id,
        source_entry_key
      FROM cashbox_vouchers
      WHERE sync_key IS NULL OR TRIM(sync_key) = ''
    `);

    for (const row of Array.isArray(rows) ? rows : []) {
      const syncKey = buildCashboxVoucherSyncKey(row, { branchId: row.branch_id });
      if (!syncKey) {
        continue;
      }

      await runStatement(`
        UPDATE cashbox_vouchers
        SET sync_key = ?
        WHERE id = ?
      `, [syncKey, row.id]);
    }
  }

  async function loadBranches(forceReload = false) {
    if (branchesLoaded && !forceReload) {
      return;
    }

    const branches = await runQuery(
      'SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name',
      []
    );

    branchOptions = Array.isArray(branches) ? branches : [];

    populateSelectWithRows(
      'cashboxContextBranchFilter',
      branchOptions,
      'id',
      (row) => row.branch_name || `فرع ${row.id}`,
      {
        placeholderText: 'اختر الفرع',
        preserveValue: getElement('cashboxContextBranchFilter')?.value || currentContextBranchId
      }
    );

    populateSelectWithRows(
      'cashboxVoucherBranchFilter',
      branchOptions,
      'id',
      (row) => row.branch_name || `فرع ${row.id}`,
      {
        placeholderText: 'جميع الفروع',
        preserveValue: getElement('cashboxVoucherBranchFilter')?.value || currentContextBranchId
      }
    );

    const contextSelect = getElement('cashboxContextBranchFilter');
    if (contextSelect && !contextSelect.value && contextSelect.options.length > 1) {
      contextSelect.value = contextSelect.options[1].value;
    }

    currentContextBranchId = String(contextSelect?.value || '').trim();

    const voucherBranchFilter = getElement('cashboxVoucherBranchFilter');
    if (voucherBranchFilter && !voucherBranchFilter.value && currentContextBranchId) {
      voucherBranchFilter.value = currentContextBranchId;
    }

    branchesLoaded = true;
  }

  async function loadCashiersForBranch(branchId) {
    const normalizedBranchId = String(branchId || '').trim();
    const cashiers = normalizedBranchId
      ? await runQuery(
        'SELECT id, name, cashier_number FROM cashiers WHERE active = 1 AND branch_id = ? ORDER BY name',
        [normalizedBranchId]
      )
      : [];

    populateSelectWithRows(
      'cashboxReceiptCashier',
      cashiers,
      'id',
      (row) => row.cashier_number ? `${row.name} (${row.cashier_number})` : row.name,
      {
        placeholderText: cashiers.length > 0 ? 'اختر الكاشير' : 'لا يوجد كاشير في هذا الفرع'
      }
    );
  }

  async function loadSuppliersForBranch(branchId) {
    const normalizedBranchId = String(branchId || '').trim();
    const rows = await runQuery(`
      SELECT supplier_name
      FROM (
        SELECT DISTINCT s.supplier_name AS supplier_name
        FROM suppliers s
        JOIN reconciliations r ON r.id = s.reconciliation_id
        JOIN cashiers c ON c.id = r.cashier_id
        WHERE (? = '' OR c.branch_id = ?)
        UNION
        SELECT DISTINCT mst.supplier_name AS supplier_name
        FROM manual_supplier_transactions mst
        WHERE (? = '' OR mst.branch_id = ?)
      )
      WHERE TRIM(COALESCE(supplier_name, '')) != ''
      ORDER BY supplier_name
    `, [normalizedBranchId, normalizedBranchId, normalizedBranchId, normalizedBranchId]);

    const datalist = getElement('cashboxSupplierOptions');
    if (!datalist) {
      return;
    }

    datalist.innerHTML = '';
    (rows || []).forEach((row) => {
      const option = document.createElement('option');
      option.value = row.supplier_name || '';
      datalist.appendChild(option);
    });
  }

  async function loadCashboxSettings() {
    const branchId = String(currentContextBranchId || '').trim();
    const nameInput = getElement('cashboxNameInput');
    const openingBalanceInput = getElement('cashboxOpeningBalanceInput');
    const autoPostingToggle = getElement('cashboxAutoPostReconciliationToggle');
    const branchLabel = getElement('cashboxSummaryBranchLabel');

    if (!branchId) {
      if (nameInput) nameInput.value = '';
      if (openingBalanceInput) openingBalanceInput.value = '0.00';
      if (autoPostingToggle) autoPostingToggle.checked = false;
      if (branchLabel) branchLabel.textContent = 'الفرع المحدد';
      return;
    }

    await ensureBranchCashbox(branchId);

    const rows = await runQuery(`
      SELECT
        cb.id,
        cb.cashbox_name,
        cb.opening_balance,
        b.branch_name
      FROM branch_cashboxes cb
      JOIN branches b ON b.id = cb.branch_id
      WHERE cb.branch_id = ?
      LIMIT 1
    `, [branchId]);

    const cashbox = Array.isArray(rows) ? rows[0] || null : null;
    if (nameInput) {
      nameInput.value = cashbox?.cashbox_name || '';
    }
    if (openingBalanceInput) {
      openingBalanceInput.value = formatCurrency(cashbox?.opening_balance || 0);
    }
    if (branchLabel) {
      branchLabel.textContent = cashbox?.branch_name || 'الفرع المحدد';
    }

    if (autoPostingToggle) {
      const settingRows = await runQuery(
        `SELECT setting_value
         FROM system_settings
         WHERE category = ?
           AND setting_key = ?
         LIMIT 1`,
        [AUTO_POST_SETTING_CATEGORY, AUTO_POST_SETTING_KEY]
      );
      autoPostingToggle.checked = parseBooleanSetting(settingRows?.[0]?.setting_value, false);
    }
  }

  async function loadCashboxSummary() {
    const branchId = String(currentContextBranchId || '').trim();
    const openingEl = getElement('cashboxSummaryOpeningBalance');
    const receiptsEl = getElement('cashboxSummaryReceipts');
    const paymentsEl = getElement('cashboxSummaryPayments');
    const balanceEl = getElement('cashboxSummaryCurrentBalance');

    if (!branchId) {
      [openingEl, receiptsEl, paymentsEl, balanceEl].forEach((node) => {
        if (node) node.textContent = formatCurrency(0);
      });
      return;
    }

    await ensureBranchCashbox(branchId);

    const rows = await runQuery(`
      SELECT
        cb.opening_balance,
        COALESCE(SUM(CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END), 0) AS total_receipts,
        COALESCE(SUM(CASE WHEN v.voucher_type = 'payment' THEN v.amount ELSE 0 END), 0) AS total_payments
      FROM branch_cashboxes cb
      LEFT JOIN cashbox_vouchers v ON v.cashbox_id = cb.id
      WHERE cb.branch_id = ?
      GROUP BY cb.id, cb.opening_balance
      LIMIT 1
    `, [branchId]);

    const summary = Array.isArray(rows) ? rows[0] || null : null;
    const openingBalance = toNumber(summary?.opening_balance, 0);
    const totalReceipts = toNumber(summary?.total_receipts, 0);
    const totalPayments = toNumber(summary?.total_payments, 0);
    const currentBalance = openingBalance + totalReceipts - totalPayments;

    if (openingEl) openingEl.textContent = formatCurrency(openingBalance);
    if (receiptsEl) receiptsEl.textContent = formatCurrency(totalReceipts);
    if (paymentsEl) paymentsEl.textContent = formatCurrency(totalPayments);
    if (balanceEl) {
      balanceEl.textContent = formatCurrency(currentBalance);
      balanceEl.classList.remove('text-success', 'text-danger');
      if (currentBalance > 0) {
        balanceEl.classList.add('text-success');
      } else if (currentBalance < 0) {
        balanceEl.classList.add('text-danger');
      }
    }
  }

  function getVoucherFilters() {
    return {
      branchId: String(getElement('cashboxVoucherBranchFilter')?.value || '').trim(),
      voucherType: String(getElement('cashboxVoucherTypeFilter')?.value || '').trim(),
      search: String(getElement('cashboxVoucherSearch')?.value || '').trim(),
      dateFrom: String(getElement('cashboxVoucherDateFrom')?.value || '').trim(),
      dateTo: String(getElement('cashboxVoucherDateTo')?.value || '').trim()
    };
  }

  function resetCashboxReceiptForm(options = {}) {
    const cashierSelect = getElement('cashboxReceiptCashier');
    const amountInput = getElement('cashboxReceiptAmount');
    const dateInput = getElement('cashboxReceiptDate');
    const referenceInput = getElement('cashboxReceiptReference');
    const descriptionInput = getElement('cashboxReceiptDescription');

    if (cashierSelect) cashierSelect.value = '';
    if (amountInput) amountInput.value = '';
    if (referenceInput) referenceInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (dateInput) dateInput.value = getToday();

    if (options.clearAlert !== false) {
      setInlineAlert('cashboxReceiptAlert', '');
    }
  }

  function resetCashboxPaymentForm(options = {}) {
    const supplierInput = getElement('cashboxPaymentSupplier');
    const amountInput = getElement('cashboxPaymentAmount');
    const dateInput = getElement('cashboxPaymentDate');
    const referenceInput = getElement('cashboxPaymentReference');
    const descriptionInput = getElement('cashboxPaymentDescription');

    if (supplierInput) supplierInput.value = '';
    if (amountInput) amountInput.value = '';
    if (referenceInput) referenceInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (dateInput) dateInput.value = getToday();

    if (options.clearAlert !== false) {
      setInlineAlert('cashboxPaymentAlert', '');
    }
  }

  function syncVoucherEditModeUi() {
    const isReceiptEdit = activeVoucherEdit?.voucherType === 'receipt';
    const isPaymentEdit = activeVoucherEdit?.voucherType === 'payment';
    const activeLabel = activeVoucherEdit
      ? buildVoucherLabel(
        activeVoucherEdit.voucherType,
        activeVoucherEdit.voucherSequenceNumber,
        activeVoucherEdit.voucherNumber
      )
      : '';

    setTextContent(
      'cashboxReceiptTitle',
      isReceiptEdit ? `تعديل سند قبض ${activeLabel}` : 'سند قبض من كاشير'
    );
    setTextContent(
      'cashboxPaymentTitle',
      isPaymentEdit ? `تعديل سند صرف ${activeLabel}` : 'سند صرف لمورد'
    );
    setTextContent(
      'cashboxReceiptModeHint',
      isReceiptEdit ? 'راجع البيانات ثم اضغط حفظ التعديل.' : ''
    );
    setTextContent(
      'cashboxPaymentModeHint',
      isPaymentEdit ? 'راجع البيانات ثم اضغط حفظ التعديل.' : ''
    );
    setTextContent(
      'createCashboxReceiptBtn',
      isReceiptEdit ? 'حفظ تعديل سند القبض' : 'إصدار سند قبض'
    );
    setTextContent(
      'createCashboxPaymentBtn',
      isPaymentEdit ? 'حفظ تعديل سند الصرف' : 'إصدار سند صرف'
    );

    toggleHidden('cashboxReceiptModeHint', !isReceiptEdit);
    toggleHidden('cashboxPaymentModeHint', !isPaymentEdit);
    toggleHidden('cancelCashboxReceiptEditBtn', !isReceiptEdit);
    toggleHidden('cancelCashboxPaymentEditBtn', !isPaymentEdit);

    const contextBranchFilter = getElement('cashboxContextBranchFilter');
    if (contextBranchFilter) {
      contextBranchFilter.disabled = !!activeVoucherEdit;
    }
  }

  function clearActiveVoucherEdit(options = {}) {
    const previousType = activeVoucherEdit?.voucherType || '';
    activeVoucherEdit = null;
    syncVoucherEditModeUi();

    if (options.resetForm === false) {
      return;
    }

    if (previousType === 'receipt') {
      resetCashboxReceiptForm({ clearAlert: options.clearFormAlert === true });
    } else if (previousType === 'payment') {
      resetCashboxPaymentForm({ clearAlert: options.clearFormAlert === true });
    }
  }

  function setActiveVoucherEdit(voucher) {
    activeVoucherEdit = voucher
      ? {
        id: toNumber(voucher.id, 0),
        voucherType: voucher.voucher_type,
        voucherNumber: toNumber(voucher.voucher_number, 0),
        voucherSequenceNumber: getVoucherDisplayNumber(voucher)
      }
      : null;

    syncVoucherEditModeUi();
  }

  function fillReceiptFormForEdit(voucher) {
    const cashierSelect = getElement('cashboxReceiptCashier');
    const cashierLabel = voucher.cashier_name
      ? `${voucher.cashier_name}${voucher.cashier_number ? ` (${voucher.cashier_number})` : ''}`
      : voucher.counterparty_name || 'الكاشير الحالي';

    ensureSelectOption(cashierSelect, voucher.cashier_id, cashierLabel);

    if (cashierSelect) cashierSelect.value = String(voucher.cashier_id || '');
    if (getElement('cashboxReceiptAmount')) getElement('cashboxReceiptAmount').value = toNumber(voucher.amount, 0);
    if (getElement('cashboxReceiptDate')) getElement('cashboxReceiptDate').value = String(voucher.voucher_date || getToday());
    if (getElement('cashboxReceiptReference')) getElement('cashboxReceiptReference').value = voucher.reference_no || '';
    if (getElement('cashboxReceiptDescription')) getElement('cashboxReceiptDescription').value = voucher.description || '';

    setInlineAlert(
      'cashboxReceiptAlert',
      `أنت الآن تعدل ${buildVoucherLabel('receipt', voucher.voucher_sequence_number, voucher.voucher_number)}.`,
      'info'
    );
    scrollToElement('cashboxReceiptForm');
  }

  function fillPaymentFormForEdit(voucher) {
    if (getElement('cashboxPaymentSupplier')) getElement('cashboxPaymentSupplier').value = voucher.counterparty_name || '';
    if (getElement('cashboxPaymentAmount')) getElement('cashboxPaymentAmount').value = toNumber(voucher.amount, 0);
    if (getElement('cashboxPaymentDate')) getElement('cashboxPaymentDate').value = String(voucher.voucher_date || getToday());
    if (getElement('cashboxPaymentReference')) getElement('cashboxPaymentReference').value = voucher.reference_no || '';
    if (getElement('cashboxPaymentDescription')) getElement('cashboxPaymentDescription').value = voucher.description || '';

    setInlineAlert(
      'cashboxPaymentAlert',
      `أنت الآن تعدل ${buildVoucherLabel('payment', voucher.voucher_sequence_number, voucher.voucher_number)}.`,
      'info'
    );
    scrollToElement('cashboxPaymentForm');
  }

  async function getCashboxReportOpeningBalance(branchId) {
    await ensureCashboxSchema();

    const normalizedBranchId = String(branchId || '').trim();
    const rows = await runQuery(`
      SELECT COALESCE(SUM(cb.opening_balance), 0) AS total_opening
      FROM branch_cashboxes cb
      JOIN branches b ON b.id = cb.branch_id
      WHERE b.is_active = 1
        AND (? = '' OR cb.branch_id = ?)
    `, [normalizedBranchId, normalizedBranchId]);

    return toNumber(rows?.[0]?.total_opening, 0);
  }

  function renderCashboxReport(summary, meta) {
    setTextContent('cashboxReportCount', String(summary.vouchersCount || 0));
    setTextContent('cashboxReportOpeningBalance', formatCurrency(summary.openingBalance || 0));
    setTextContent('cashboxReportReceipts', formatCurrency(summary.totalReceipts || 0));
    setTextContent('cashboxReportPayments', formatCurrency(summary.totalPayments || 0));
    setTextContent('cashboxReportNetMovement', formatCurrency(summary.netMovement || 0));
    setTextContent('cashboxReportClosingBalance', formatCurrency(summary.closingBalance || 0));
    setTextContent(
      'cashboxReportMeta',
      (meta || []).map((item) => `${item.label}: ${item.value}`).join(' • ') || 'يعتمد على فلاتر سجل السندات الحالية.'
    );

    updateSignedValueState('cashboxReportNetMovement', summary.netMovement || 0);
    updateSignedValueState('cashboxReportClosingBalance', summary.closingBalance || 0);

    const disableActions = !currentVoucherRows.length;
    setButtonDisabled('cashboxPrintReportBtn', disableActions);
    setButtonDisabled('cashboxExportPdfBtn', disableActions);
    setButtonDisabled('cashboxExportExcelBtn', disableActions);
  }

  async function updateCashboxReportState(rows, filters) {
    const openingBalance = await getCashboxReportOpeningBalance(filters.branchId);
    currentVoucherRows = Array.isArray(rows) ? rows : [];
    currentVoucherFilters = { ...filters };
    currentReportSummary = summarizeCashboxReport({
      vouchers: currentVoucherRows,
      openingBalance
    });
    renderCashboxReport(currentReportSummary, buildCashboxReportMeta(currentVoucherFilters));
  }

  function renderCashboxVouchers(rows) {
    const tableBody = getElement('cashboxVouchersTable');
    if (!tableBody) {
      return;
    }

    const vouchers = Array.isArray(rows) ? rows : [];
    if (vouchers.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted py-4">لا توجد سندات مطابقة للفلاتر الحالية</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = vouchers.map((row) => {
      const badgeClass = row.voucher_type === 'receipt'
        ? 'cashbox-voucher-badge-receipt'
        : 'cashbox-voucher-badge-payment';
      const voucherTypeLabel = getVoucherTypeLabel(row.voucher_type);
      const isEditing = activeVoucherEdit && Number(activeVoucherEdit.id) === Number(row.id);

      return `
        <tr class="${isEditing ? 'cashbox-voucher-row-editing' : ''}">
          <td class="cashbox-voucher-code">${escapeHtml(buildVoucherLabel(row.voucher_type, row.voucher_sequence_number, row.voucher_number))}</td>
          <td><span class="cashbox-voucher-badge ${badgeClass}">${escapeHtml(voucherTypeLabel)}</span></td>
          <td>${escapeHtml(row.branch_name || 'غير محدد')}</td>
          <td>${escapeHtml(row.counterparty_name || row.cashier_name || 'غير محدد')}</td>
          <td>${escapeHtml(formatDate(row.voucher_date))}</td>
          <td>${escapeHtml(row.reference_no || row.description || '-')}</td>
          <td class="text-currency">${escapeHtml(formatCurrency(row.amount))}</td>
          <td>${escapeHtml(row.created_by || 'غير معروف')}</td>
          <td>
            <div class="cashbox-voucher-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${row.id}">
                تعديل
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="print" data-id="${row.id}">
                طباعة
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger cashbox-voucher-delete-btn" data-action="delete" data-id="${row.id}">
                حذف
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderCashboxAuditLog(rows) {
    const tableBody = getElement('cashboxAuditLogTable');
    if (!tableBody) {
      return;
    }

    const actionsMap = {
      create: 'إنشاء',
      update: 'تعديل',
      delete: 'حذف'
    };

    const logs = Array.isArray(rows) ? rows : [];
    if (logs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">لا توجد عمليات تدقيق مطابقة حاليًا</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = logs.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.action_at))}</td>
        <td>${escapeHtml(actionsMap[row.action_type] || row.action_type || '-')}</td>
        <td class="cashbox-voucher-code">${escapeHtml(buildVoucherLabel(row.voucher_type, row.voucher_sequence_number, row.voucher_number))}</td>
        <td>${escapeHtml(getVoucherTypeLabel(row.voucher_type))}</td>
        <td>${escapeHtml(row.action_by || 'غير معروف')}</td>
        <td>${escapeHtml(row.notes || row.branch_name || '-')}</td>
      </tr>
    `).join('');
  }

  async function loadCashboxVouchers() {
    await ensureCashboxSchema();

    const filters = getVoucherFilters();
    const clauses = ['1 = 1'];
    const params = [];

    if (filters.branchId) {
      clauses.push('v.branch_id = ?');
      params.push(filters.branchId);
    }

    if (filters.voucherType) {
      clauses.push('v.voucher_type = ?');
      params.push(filters.voucherType);
    }

    if (filters.dateFrom) {
      clauses.push('DATE(v.voucher_date) >= DATE(?)');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      clauses.push('DATE(v.voucher_date) <= DATE(?)');
      params.push(filters.dateTo);
    }

    if (filters.search) {
      clauses.push(`
        (
          CAST(COALESCE(v.voucher_sequence_number, v.voucher_number) AS TEXT) LIKE ?
          OR CAST(v.voucher_number AS TEXT) LIKE ?
          OR LOWER(COALESCE(v.counterparty_name, '')) LIKE ?
          OR LOWER(COALESCE(v.reference_no, '')) LIKE ?
          OR LOWER(COALESCE(v.description, '')) LIKE ?
        )
      `);
      const token = `%${filters.search.toLowerCase()}%`;
      params.push(token, token, token, token, token);
    }

    const rows = await runQuery(`
      SELECT
        v.*,
        b.branch_name,
        cb.cashbox_name,
        c.name AS cashier_name
      FROM cashbox_vouchers v
      JOIN branches b ON b.id = v.branch_id
      LEFT JOIN branch_cashboxes cb ON cb.id = v.cashbox_id
      LEFT JOIN cashiers c ON c.id = v.cashier_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY DATE(v.voucher_date) DESC, v.voucher_number DESC, v.id DESC
    `, params);

    renderCashboxVouchers(rows);
    await updateCashboxReportState(rows, filters);
  }

  async function getVoucherDetails(voucherId) {
    const rows = await runQuery(`
      SELECT
        v.*,
        b.branch_name,
        cb.cashbox_name,
        c.name AS cashier_name,
        c.cashier_number
      FROM cashbox_vouchers v
      JOIN branches b ON b.id = v.branch_id
      LEFT JOIN branch_cashboxes cb ON cb.id = v.cashbox_id
      LEFT JOIN cashiers c ON c.id = v.cashier_id
      WHERE v.id = ?
      LIMIT 1
    `, [voucherId]);

    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function getNextVoucherNumber() {
    const rows = await runQuery(
      'SELECT COALESCE(MAX(voucher_number), 0) + 1 AS next_number FROM cashbox_vouchers',
      []
    );
    return toNumber(rows?.[0]?.next_number, 1);
  }

  async function getNextVoucherSequenceNumber(voucherType) {
    const rows = await runQuery(
      'SELECT COALESCE(MAX(voucher_sequence_number), 0) + 1 AS next_number FROM cashbox_vouchers WHERE voucher_type = ?',
      [voucherType]
    );
    return toNumber(rows?.[0]?.next_number, 1);
  }

  async function appendCashboxAuditLog(entry) {
    await ensureCashboxSchema();

    await runStatement(`
      INSERT INTO cashbox_voucher_audit_log (
        voucher_id,
        voucher_number,
        voucher_sequence_number,
        voucher_type,
        branch_id,
        action_type,
        action_by,
        action_at,
        payload_json,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `, [
      entry.voucherId || null,
      entry.voucherNumber || null,
      entry.voucherSequenceNumber || null,
      entry.voucherType || null,
      entry.branchId || null,
      entry.actionType,
      entry.actionBy || getCurrentUserName(),
      entry.payloadJson || null,
      entry.note || null
    ]);
  }

  async function createCashboxVoucher(payload, attempt = 0) {
    await ensureCashboxSchema();

    const branchCashbox = await ensureBranchCashbox(payload.branchId);
    if (!branchCashbox?.id) {
      throw new Error('تعذر تجهيز صندوق الفرع المحدد.');
    }

    const voucherNumber = await getNextVoucherNumber();
    const voucherSequenceNumber = await getNextVoucherSequenceNumber(payload.voucherType);
    const now = new Date().toISOString();
    const syncKey = buildCashboxVoucherSyncKey({
      branch_id: payload.branchId,
      voucher_type: payload.voucherType,
      voucher_sequence_number: voucherSequenceNumber,
      voucher_number: voucherNumber,
      voucher_date: payload.voucherDate,
      created_at: now
    });

    try {
      await runStatement(`
        INSERT INTO cashbox_vouchers (
          voucher_number,
          voucher_sequence_number,
          sync_key,
          voucher_type,
          cashbox_id,
          branch_id,
          counterparty_type,
          counterparty_name,
          cashier_id,
          amount,
          reference_no,
          description,
          voucher_date,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        voucherNumber,
        voucherSequenceNumber,
        syncKey,
        payload.voucherType,
        branchCashbox.id,
        payload.branchId,
        payload.counterpartyType,
        payload.counterpartyName,
        payload.cashierId || null,
        Math.abs(toNumber(payload.amount, 0)),
        payload.referenceNo || null,
        payload.description || null,
        payload.voucherDate,
        getCurrentUserName(),
        now,
        now
      ]);
    } catch (error) {
      const message = String(error?.message || error || '');
      if ((message.includes('cashbox_vouchers.voucher_number') || message.includes('idx_cashbox_vouchers_type_sequence_unique') || message.includes('UNIQUE constraint failed')) && attempt < 2) {
        return createCashboxVoucher(payload, attempt + 1);
      }
      throw error;
    }

    const rows = await runQuery(`
      SELECT *
      FROM cashbox_vouchers
      WHERE voucher_number = ?
      LIMIT 1
    `, [voucherNumber]);

    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function updateCashboxVoucher(voucherId, payload) {
    await ensureCashboxSchema();

    const branchCashbox = await ensureBranchCashbox(payload.branchId);
    if (!branchCashbox?.id) {
      throw new Error('تعذر تجهيز صندوق الفرع المحدد.');
    }

    const existingRows = await runQuery(`
      SELECT id, voucher_number, voucher_sequence_number, created_at
      FROM cashbox_vouchers
      WHERE id = ?
      LIMIT 1
    `, [voucherId]);
    const existingVoucher = Array.isArray(existingRows) ? existingRows[0] || null : null;
    const syncKey = buildCashboxVoucherSyncKey({
      id: voucherId,
      branch_id: payload.branchId,
      voucher_type: payload.voucherType,
      voucher_sequence_number: existingVoucher?.voucher_sequence_number,
      voucher_number: existingVoucher?.voucher_number,
      voucher_date: payload.voucherDate,
      created_at: existingVoucher?.created_at
    });

    await runStatement(`
      UPDATE cashbox_vouchers
      SET
        sync_key = ?,
        voucher_type = ?,
        cashbox_id = ?,
        branch_id = ?,
        counterparty_type = ?,
        counterparty_name = ?,
        cashier_id = ?,
        amount = ?,
        reference_no = ?,
        description = ?,
        voucher_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      syncKey,
      payload.voucherType,
      branchCashbox.id,
      payload.branchId,
      payload.counterpartyType,
      payload.counterpartyName,
      payload.cashierId || null,
      Math.abs(toNumber(payload.amount, 0)),
      payload.referenceNo || null,
      payload.description || null,
      payload.voucherDate,
      voucherId
    ]);

    return getVoucherDetails(voucherId);
  }

  async function loadCashboxAuditLog() {
    await ensureCashboxSchema();

    const filters = getVoucherFilters();
    const clauses = ['1 = 1'];
    const params = [];

    if (filters.branchId) {
      clauses.push('l.branch_id = ?');
      params.push(filters.branchId);
    }

    if (filters.voucherType) {
      clauses.push('l.voucher_type = ?');
      params.push(filters.voucherType);
    }

    const rows = await runQuery(`
      SELECT
        l.*,
        b.branch_name
      FROM cashbox_voucher_audit_log l
      LEFT JOIN branches b ON b.id = l.branch_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY DATETIME(l.action_at) DESC, l.id DESC
      LIMIT 20
    `, params);

    renderCashboxAuditLog(rows);
  }

  async function refreshCashboxSection(options = {}) {
    if (options.reloadFilters) {
      await loadCashboxFilters({ forceReload: !!options.forceReload });
    }
    await Promise.all([
      loadCashboxSummary(),
      loadCashboxVouchers(),
      loadCashboxAuditLog()
    ]);
  }

  async function loadCashboxFilters(options = {}) {
    initializeCashboxes();
    await ensureCashboxSchema();
    await loadBranches(options.forceReload !== false);
    await loadCashiersForBranch(currentContextBranchId);
    await loadSuppliersForBranch(currentContextBranchId);
    await loadCashboxSettings();
  }

  async function loadCashboxes() {
    await loadCashboxFilters();
    await refreshCashboxSection();
  }

  async function startCashboxVoucherEdit(voucherId) {
    const numericId = Number(voucherId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return;
    }

    try {
      const voucher = await getVoucherDetails(numericId);
      if (!voucher) {
        setInlineAlert('cashboxVouchersAlert', 'تعذر العثور على بيانات السند للتعديل.', 'danger');
        return;
      }

      currentContextBranchId = String(voucher.branch_id || '').trim();

      const contextBranchFilter = getElement('cashboxContextBranchFilter');
      if (contextBranchFilter) {
        contextBranchFilter.value = currentContextBranchId;
      }

      const voucherBranchFilter = getElement('cashboxVoucherBranchFilter');
      if (voucherBranchFilter) {
        voucherBranchFilter.value = currentContextBranchId;
      }

      await loadCashiersForBranch(currentContextBranchId);
      await loadSuppliersForBranch(currentContextBranchId);
      await loadCashboxSettings();

      setActiveVoucherEdit(voucher);

      if (voucher.voucher_type === 'receipt') {
        resetCashboxPaymentForm({ clearAlert: false });
        fillReceiptFormForEdit(voucher);
      } else {
        resetCashboxReceiptForm({ clearAlert: false });
        fillPaymentFormForEdit(voucher);
      }

      await refreshCashboxSection();
      const voucherLabel = buildVoucherLabel(voucher.voucher_type, voucher.voucher_sequence_number, voucher.voucher_number);
      setInlineAlert('cashboxVouchersAlert', `تم تحميل السند ${voucherLabel} للتعديل.`, 'success');
      showToast(`تم تحميل السند ${voucherLabel} للتعديل`);
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحميل بيانات السند للتعديل.'
      });
      setInlineAlert('cashboxVouchersAlert', friendly, 'danger');
    }
  }

  async function handleCashboxSettingsSubmit(event) {
    event.preventDefault();
    setInlineAlert('cashboxSettingsAlert', '');

    const branchId = String(currentContextBranchId || '').trim();
    const cashboxName = String(getElement('cashboxNameInput')?.value || '').trim();
    const openingBalance = toNumber(getElement('cashboxOpeningBalanceInput')?.value, NaN);
    const autoPostingEnabled = !!getElement('cashboxAutoPostReconciliationToggle')?.checked;

    if (!branchId) {
      setInlineAlert('cashboxSettingsAlert', 'اختر فرع العمل أولاً.', 'danger');
      return;
    }

    if (!cashboxName) {
      setInlineAlert('cashboxSettingsAlert', 'اسم الصندوق مطلوب.', 'danger');
      return;
    }

    if (!Number.isFinite(openingBalance)) {
      setInlineAlert('cashboxSettingsAlert', 'الرصيد الافتتاحي غير صالح.', 'danger');
      return;
    }

    try {
      await ensureBranchCashbox(branchId);
      await runStatement(`
        UPDATE branch_cashboxes
        SET cashbox_name = ?, opening_balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE branch_id = ?
      `, [cashboxName, openingBalance, branchId]);

      await runStatement(`
        INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(category, setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `, [
        AUTO_POST_SETTING_CATEGORY,
        AUTO_POST_SETTING_KEY,
        autoPostingEnabled ? 'true' : 'false'
      ]);

      await refreshCashboxSection();
      const postingMessage = autoPostingEnabled
        ? 'تم حفظ إعدادات الصندوق وتفعيل الترحيل للصندوق كخيار افتراضي عند حفظ التصفية.'
        : 'تم حفظ إعدادات الصندوق وضبط الاختيار الافتراضي على الحفظ بدون ترحيل للصندوق.';
      setInlineAlert('cashboxSettingsAlert', postingMessage, 'success');
      showToast('تم حفظ إعدادات الصندوق');
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر حفظ إعدادات الصندوق.'
      });
      setInlineAlert('cashboxSettingsAlert', friendly, 'danger');
    }
  }

  async function handleCashboxReceiptSubmit(event) {
    event.preventDefault();
    setInlineAlert('cashboxReceiptAlert', '');

    const editState = activeVoucherEdit?.voucherType === 'receipt' ? activeVoucherEdit : null;
    const branchId = String(currentContextBranchId || '').trim();
    const cashierSelect = getElement('cashboxReceiptCashier');
    const cashierId = String(cashierSelect?.value || '').trim();
    const amount = toNumber(getElement('cashboxReceiptAmount')?.value, NaN);
    const voucherDate = String(getElement('cashboxReceiptDate')?.value || '').trim();
    const referenceNo = String(getElement('cashboxReceiptReference')?.value || '').trim();
    const description = String(getElement('cashboxReceiptDescription')?.value || '').trim();
    const counterpartyName = cashierSelect?.selectedOptions?.[0]?.textContent?.trim() || '';

    if (!branchId) {
      setInlineAlert('cashboxReceiptAlert', 'اختر فرع العمل أولاً.', 'danger');
      return;
    }

    if (!cashierId) {
      setInlineAlert('cashboxReceiptAlert', 'اختر الكاشير.', 'danger');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setInlineAlert('cashboxReceiptAlert', 'أدخل مبلغًا صحيحًا أكبر من صفر.', 'danger');
      return;
    }

    if (!voucherDate) {
      setInlineAlert('cashboxReceiptAlert', 'تاريخ السند مطلوب.', 'danger');
      return;
    }

    try {
      let voucher;
      const voucherPayload = {
        voucherType: 'receipt',
        branchId,
        counterpartyType: 'cashier',
        counterpartyName,
        cashierId: Number(cashierId),
        amount,
        referenceNo,
        description,
        voucherDate
      };

      if (editState) {
        const previousVoucher = await getVoucherDetails(editState.id);
        voucher = await updateCashboxVoucher(editState.id, voucherPayload);
        await appendCashboxAuditLog({
          voucherId: voucher?.id || editState.id,
          voucherNumber: voucher?.voucher_number || editState.voucherNumber,
          voucherSequenceNumber: voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
          voucherType: 'receipt',
          branchId,
          actionType: 'update',
          payloadJson: JSON.stringify({
            before: previousVoucher,
            after: voucher
          }),
          note: buildCashboxVoucherAuditNote({
            actionType: 'update',
            voucherType: 'receipt',
            voucherSequenceNumber: voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
            voucherNumber: voucher?.voucher_number || editState.voucherNumber,
            previousVoucher,
            nextValues: voucherPayload
          })
        });

        clearActiveVoucherEdit({ resetForm: true, clearFormAlert: false });
        await refreshCashboxSection();
        const label = buildVoucherLabel(
          'receipt',
          voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
          voucher?.voucher_number || editState.voucherNumber
        );
        setInlineAlert('cashboxReceiptAlert', `تم تحديث سند القبض ${label} بنجاح.`, 'success');
        setInlineAlert('cashboxVouchersAlert', `تم تحديث السند ${label} بنجاح.`, 'success');
        showToast(`تم تحديث سند القبض ${label}`);
        return;
      }

      voucher = await createCashboxVoucher(voucherPayload);
      await appendCashboxAuditLog({
        voucherId: voucher?.id,
        voucherNumber: voucher?.voucher_number,
        voucherSequenceNumber: voucher?.voucher_sequence_number,
        voucherType: 'receipt',
        branchId,
        actionType: 'create',
        payloadJson: JSON.stringify(voucher),
        note: buildCashboxVoucherAuditNote({
          actionType: 'create',
          voucherType: 'receipt',
          voucherSequenceNumber: voucher?.voucher_sequence_number,
          voucherNumber: voucher?.voucher_number
        })
      });

      resetCashboxReceiptForm({ clearAlert: false });
      await refreshCashboxSection();
      const label = buildVoucherLabel('receipt', voucher?.voucher_sequence_number, voucher?.voucher_number || 0);
      setInlineAlert('cashboxReceiptAlert', `تم إصدار سند القبض ${label} بنجاح.`, 'success');
      showToast(`تم إصدار سند القبض ${label}`);
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: editState ? 'تعذر تحديث سند القبض.' : 'تعذر إصدار سند القبض.'
      });
      setInlineAlert('cashboxReceiptAlert', friendly, 'danger');
    }
  }

  async function handleCashboxPaymentSubmit(event) {
    event.preventDefault();
    setInlineAlert('cashboxPaymentAlert', '');

    const editState = activeVoucherEdit?.voucherType === 'payment' ? activeVoucherEdit : null;
    const branchId = String(currentContextBranchId || '').trim();
    const supplierName = String(getElement('cashboxPaymentSupplier')?.value || '').trim();
    const amount = toNumber(getElement('cashboxPaymentAmount')?.value, NaN);
    const voucherDate = String(getElement('cashboxPaymentDate')?.value || '').trim();
    const referenceNo = String(getElement('cashboxPaymentReference')?.value || '').trim();
    const description = String(getElement('cashboxPaymentDescription')?.value || '').trim();

    if (!branchId) {
      setInlineAlert('cashboxPaymentAlert', 'اختر فرع العمل أولاً.', 'danger');
      return;
    }

    if (!supplierName) {
      setInlineAlert('cashboxPaymentAlert', 'اسم المورد مطلوب.', 'danger');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setInlineAlert('cashboxPaymentAlert', 'أدخل مبلغًا صحيحًا أكبر من صفر.', 'danger');
      return;
    }

    if (!voucherDate) {
      setInlineAlert('cashboxPaymentAlert', 'تاريخ السند مطلوب.', 'danger');
      return;
    }

    try {
      let voucher;
      const voucherPayload = {
        voucherType: 'payment',
        branchId,
        counterpartyType: 'supplier',
        counterpartyName: supplierName,
        amount,
        referenceNo,
        description,
        voucherDate
      };

      if (editState) {
        const previousVoucher = await getVoucherDetails(editState.id);
        voucher = await updateCashboxVoucher(editState.id, voucherPayload);
        await appendCashboxAuditLog({
          voucherId: voucher?.id || editState.id,
          voucherNumber: voucher?.voucher_number || editState.voucherNumber,
          voucherSequenceNumber: voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
          voucherType: 'payment',
          branchId,
          actionType: 'update',
          payloadJson: JSON.stringify({
            before: previousVoucher,
            after: voucher
          }),
          note: buildCashboxVoucherAuditNote({
            actionType: 'update',
            voucherType: 'payment',
            voucherSequenceNumber: voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
            voucherNumber: voucher?.voucher_number || editState.voucherNumber,
            previousVoucher,
            nextValues: voucherPayload
          })
        });

        clearActiveVoucherEdit({ resetForm: true, clearFormAlert: false });
        await refreshCashboxSection();
        const label = buildVoucherLabel(
          'payment',
          voucher?.voucher_sequence_number || editState.voucherSequenceNumber,
          voucher?.voucher_number || editState.voucherNumber
        );
        setInlineAlert('cashboxPaymentAlert', `تم تحديث سند الصرف ${label} بنجاح.`, 'success');
        setInlineAlert('cashboxVouchersAlert', `تم تحديث السند ${label} بنجاح.`, 'success');
        showToast(`تم تحديث سند الصرف ${label}`);
        return;
      }

      voucher = await createCashboxVoucher(voucherPayload);
      await appendCashboxAuditLog({
        voucherId: voucher?.id,
        voucherNumber: voucher?.voucher_number,
        voucherSequenceNumber: voucher?.voucher_sequence_number,
        voucherType: 'payment',
        branchId,
        actionType: 'create',
        payloadJson: JSON.stringify(voucher),
        note: buildCashboxVoucherAuditNote({
          actionType: 'create',
          voucherType: 'payment',
          voucherSequenceNumber: voucher?.voucher_sequence_number,
          voucherNumber: voucher?.voucher_number
        })
      });

      resetCashboxPaymentForm({ clearAlert: false });
      await refreshCashboxSection();
      const label = buildVoucherLabel('payment', voucher?.voucher_sequence_number, voucher?.voucher_number || 0);
      setInlineAlert('cashboxPaymentAlert', `تم إصدار سند الصرف ${label} بنجاح.`, 'success');
      showToast(`تم إصدار سند الصرف ${label}`);
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: editState ? 'تعذر تحديث سند الصرف.' : 'تعذر إصدار سند الصرف.'
      });
      setInlineAlert('cashboxPaymentAlert', friendly, 'danger');
    }
  }

  async function deleteCashboxVoucher(voucherId) {
    const numericId = Number(voucherId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return;
    }

    try {
      const dialog = getDialogUtils();
      let confirmed = false;
      if (dialog && typeof dialog.showConfirm === 'function') {
        confirmed = await dialog.showConfirm('هل أنت متأكد من حذف هذا السند؟', 'تأكيد الحذف');
      } else {
        confirmed = globalThis.confirm('هل أنت متأكد من حذف هذا السند؟');
      }

      if (!confirmed) {
        return;
      }

      const voucher = await getVoucherDetails(numericId);
      await runStatement('DELETE FROM cashbox_vouchers WHERE id = ?', [numericId]);
      if (voucher) {
        await appendCashboxAuditLog({
          voucherId: voucher.id,
          voucherNumber: voucher.voucher_number,
          voucherSequenceNumber: voucher.voucher_sequence_number,
          voucherType: voucher.voucher_type,
          branchId: voucher.branch_id,
          actionType: 'delete',
          payloadJson: JSON.stringify(voucher),
          note: buildCashboxVoucherAuditNote({
            actionType: 'delete',
            voucherType: voucher.voucher_type,
            voucherSequenceNumber: voucher.voucher_sequence_number,
            voucherNumber: voucher.voucher_number
          })
        });
      }

      if (activeVoucherEdit && Number(activeVoucherEdit.id) === numericId) {
        clearActiveVoucherEdit({ resetForm: true, clearFormAlert: false });
      }

      await refreshCashboxSection();
      setInlineAlert('cashboxVouchersAlert', 'تم حذف السند بنجاح.', 'success');
      showToast('تم حذف السند');
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر حذف السند.'
      });
      setInlineAlert('cashboxVouchersAlert', friendly, 'danger');
    }
  }

  async function printCashboxVoucher(voucherId) {
    const voucher = await getVoucherDetails(voucherId);
    if (!voucher) {
      setInlineAlert('cashboxVouchersAlert', 'تعذر العثور على بيانات السند للطباعة.', 'danger');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setInlineAlert('cashboxVouchersAlert', 'تعذر فتح نافذة الطباعة. تحقق من إعدادات النوافذ المنبثقة.', 'danger');
      return;
    }

    const voucherTypeLabel = voucher.voucher_type === 'receipt' ? 'سند قبض' : 'سند صرف';
    const counterpartyLabel = voucher.counterparty_type === 'cashier' ? 'الكاشير' : 'المورد';
    const voucherLabel = buildVoucherLabel(voucher.voucher_type, voucher.voucher_sequence_number, voucher.voucher_number);
    const counterpartyValue = voucher.counterparty_type === 'cashier'
      ? `${voucher.cashier_name || voucher.counterparty_name}${voucher.cashier_number ? ` (${voucher.cashier_number})` : ''}`
      : voucher.counterparty_name;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(voucherTypeLabel)} ${escapeHtml(voucherLabel)}</title>
        <style>
          body {
            font-family: "Cairo", sans-serif;
            margin: 24px;
            color: #0f172a;
            background: #fff;
          }
          .voucher-sheet {
            border: 2px solid #dbe5eb;
            border-radius: 20px;
            padding: 28px;
          }
          .voucher-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            gap: 16px;
            border-bottom: 1px solid #dbe5eb;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }
          .voucher-title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 6px 0;
          }
          .voucher-subtitle {
            color: #475569;
            margin: 0;
          }
          .voucher-meta {
            text-align: left;
            min-width: 220px;
          }
          .voucher-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
          }
          .voucher-item {
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 12px 14px;
            background: #f8fafc;
          }
          .voucher-item strong {
            display: block;
            color: #475569;
            margin-bottom: 6px;
            font-size: 13px;
          }
          .voucher-amount {
            font-size: 28px;
            font-weight: 700;
            color: ${voucher.voucher_type === 'receipt' ? '#047857' : '#b45309'};
          }
          .voucher-notes {
            border: 1px dashed #cbd5e1;
            border-radius: 14px;
            padding: 14px;
            margin-top: 14px;
            min-height: 72px;
          }
          .voucher-signatures {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 20px;
            margin-top: 36px;
          }
          .voucher-signatures div {
            text-align: center;
            padding-top: 28px;
            border-top: 1px solid #94a3b8;
          }
          @media print {
            body {
              margin: 0;
            }
            .voucher-sheet {
              border: none;
              border-radius: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="voucher-sheet">
          <div class="voucher-header">
            <div>
              <h1 class="voucher-title">${escapeHtml(voucherTypeLabel)}</h1>
              <p class="voucher-subtitle">وحدة الصناديق - ${escapeHtml(voucher.cashbox_name || 'صندوق الفرع')}</p>
            </div>
            <div class="voucher-meta">
              <div><strong>رقم السند:</strong> ${escapeHtml(voucherLabel)}</div>
              <div><strong>التاريخ:</strong> ${escapeHtml(formatDate(voucher.voucher_date))}</div>
              <div><strong>الفرع:</strong> ${escapeHtml(voucher.branch_name || 'غير محدد')}</div>
            </div>
          </div>

          <div class="voucher-grid">
            <div class="voucher-item">
              <strong>${escapeHtml(counterpartyLabel)}</strong>
              <div>${escapeHtml(counterpartyValue || 'غير محدد')}</div>
            </div>
            <div class="voucher-item">
              <strong>المبلغ</strong>
              <div class="voucher-amount">${escapeHtml(formatCurrency(voucher.amount))} ريال</div>
            </div>
            <div class="voucher-item">
              <strong>المرجع</strong>
              <div>${escapeHtml(voucher.reference_no || '-')}</div>
            </div>
            <div class="voucher-item">
              <strong>المنشئ</strong>
              <div>${escapeHtml(voucher.created_by || 'غير معروف')}</div>
            </div>
          </div>

          <div class="voucher-notes">
            <strong>البيان</strong>
            <div>${escapeHtml(voucher.description || 'لا توجد ملاحظات إضافية')}</div>
          </div>

          <div class="voucher-signatures">
            <div>توقيع المستلم</div>
            <div>توقيع المسؤول</div>
            <div>ختم الفرع</div>
          </div>
        </div>
        <script>
          window.onload = function () {
            window.focus();
            setTimeout(function () {
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function ensureCashboxReportReady(validationMessage) {
    if (currentVoucherRows.length > 0) {
      setInlineAlert('cashboxReportAlert', '');
      return true;
    }

    const message = validationMessage || 'لا توجد بيانات تقرير للصناديق.';
    setInlineAlert('cashboxReportAlert', message, 'danger');
    const dialog = getDialogUtils();
    if (dialog?.showValidationError) {
      dialog.showValidationError(message);
    }
    return false;
  }

  async function buildCurrentCashboxReportArtifacts() {
    const companyName = await getCompanyName();
    const title = getCurrentCashboxReportTitle(currentVoucherFilters);
    const meta = buildCashboxReportMeta(currentVoucherFilters);
    const reportDate = new Date().toLocaleDateString('en-GB');

    return {
      title,
      html: buildCashboxReportHtml({
        title,
        companyName,
        reportDate,
        meta,
        summary: currentReportSummary,
        vouchers: currentVoucherRows,
        formatCurrency,
        formatDate
      }),
      excelData: prepareCashboxReportExcelData({
        summary: currentReportSummary,
        vouchers: currentVoucherRows,
        meta
      })
    };
  }

  async function handlePrintCashboxReport() {
    if (!ensureCashboxReportReady('لا توجد بيانات تقرير للطباعة.')) {
      return;
    }

    const dialog = getDialogUtils();
    try {
      if (dialog?.showLoading) {
        dialog.showLoading('جاري تحضير تقرير الصناديق للطباعة...', 'يرجى الانتظار');
      }

      const printSettings = await cashboxIpc.invoke('get-print-settings');
      const reportArtifacts = await buildCurrentCashboxReportArtifacts();
      const result = await cashboxIpc.invoke('create-print-preview', {
        html: reportArtifacts.html,
        title: reportArtifacts.title,
        isColorPrint: printSettings.color !== false
      });

      if (dialog?.close) {
        dialog.close();
      }

      if (result?.success) {
        setInlineAlert('cashboxReportAlert', 'تم فتح معاينة تقرير الصناديق بنجاح.', 'success');
        showToast('تم فتح معاينة تقرير الصناديق');
        return;
      }

      const friendly = mapDbErrorMessage(result?.error, {
        fallback: 'تعذر فتح معاينة تقرير الصناديق.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showError) {
        dialog.showError(`فشل في فتح معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      if (dialog?.close) {
        dialog.close();
      }
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء طباعة تقرير الصناديق.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showErrorToast) {
        dialog.showErrorToast(friendly);
      }
    }
  }

  async function handleExportCashboxReportPdf() {
    if (!ensureCashboxReportReady('لا توجد بيانات تقرير للتصدير إلى PDF.')) {
      return;
    }

    const dialog = getDialogUtils();
    try {
      if (dialog?.showLoading) {
        dialog.showLoading('جاري تصدير تقرير الصناديق إلى PDF...', 'يرجى الانتظار');
      }

      const reportArtifacts = await buildCurrentCashboxReportArtifacts();
      const result = await cashboxIpc.invoke('export-pdf', {
        html: reportArtifacts.html,
        filename: `cashboxes-report-${getToday()}.pdf`,
        reportType: 'cashboxes',
        reportTitle: reportArtifacts.title
      });

      if (dialog?.close) {
        dialog.close();
      }

      if (result?.success) {
        setInlineAlert('cashboxReportAlert', 'تم تصدير تقرير الصناديق إلى PDF بنجاح.', 'success');
        showToast('تم تصدير تقرير الصناديق إلى PDF');
        return;
      }

      if (String(result?.error || '').trim() === 'تم إلغاء العملية') {
        setInlineAlert('cashboxReportAlert', 'تم إلغاء تصدير PDF.', 'warning');
        return;
      }

      const friendly = mapDbErrorMessage(result?.error, {
        fallback: 'تعذر تصدير تقرير الصناديق إلى PDF.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showError) {
        dialog.showError(`فشل في تصدير PDF: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      if (dialog?.close) {
        dialog.close();
      }
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء تصدير تقرير الصناديق إلى PDF.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showErrorToast) {
        dialog.showErrorToast(friendly);
      }
    }
  }

  async function handleExportCashboxReportExcel() {
    if (!ensureCashboxReportReady('لا توجد بيانات تقرير للتصدير إلى Excel.')) {
      return;
    }

    const dialog = getDialogUtils();
    try {
      if (dialog?.showLoading) {
        dialog.showLoading('جاري تصدير تقرير الصناديق إلى Excel...', 'يرجى الانتظار');
      }

      const reportArtifacts = await buildCurrentCashboxReportArtifacts();
      const result = await cashboxIpc.invoke('export-excel', {
        data: reportArtifacts.excelData,
        filename: `cashboxes-report-${getToday()}.xlsx`,
        reportType: 'cashboxes',
        reportTitle: reportArtifacts.title
      });

      if (dialog?.close) {
        dialog.close();
      }

      if (result?.success) {
        setInlineAlert('cashboxReportAlert', 'تم تصدير تقرير الصناديق إلى Excel بنجاح.', 'success');
        showToast('تم تصدير تقرير الصناديق إلى Excel');
        return;
      }

      if (String(result?.error || '').trim() === 'تم إلغاء العملية') {
        setInlineAlert('cashboxReportAlert', 'تم إلغاء تصدير Excel.', 'warning');
        return;
      }

      const friendly = mapDbErrorMessage(result?.error, {
        fallback: 'تعذر تصدير تقرير الصناديق إلى Excel.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showError) {
        dialog.showError(`فشل في تصدير Excel: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      if (dialog?.close) {
        dialog.close();
      }
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء تصدير تقرير الصناديق إلى Excel.'
      });
      setInlineAlert('cashboxReportAlert', friendly, 'danger');
      if (dialog?.showErrorToast) {
        dialog.showErrorToast(friendly);
      }
    }
  }

  async function handleContextBranchChange(event) {
    const previousBranchId = currentContextBranchId;
    currentContextBranchId = String(event?.target?.value || '').trim();

    const voucherBranchFilter = getElement('cashboxVoucherBranchFilter');
    if (voucherBranchFilter && (!voucherBranchFilter.value || voucherBranchFilter.value === previousBranchId)) {
      voucherBranchFilter.value = currentContextBranchId;
    }

    await loadCashiersForBranch(currentContextBranchId);
    await loadSuppliersForBranch(currentContextBranchId);
    await loadCashboxSettings();
    await refreshCashboxSection();
  }

  async function handleVoucherTableClick(event) {
    const actionButton = event?.target?.closest('button[data-action]');
    if (!actionButton) {
      return;
    }

    const voucherId = actionButton.getAttribute('data-id');
    const action = actionButton.getAttribute('data-action');

    if (action === 'edit') {
      await startCashboxVoucherEdit(voucherId);
      return;
    }

    if (action === 'print') {
      await printCashboxVoucher(voucherId);
      return;
    }

    if (action === 'delete') {
      await deleteCashboxVoucher(voucherId);
    }
  }

  function clearVoucherFilters() {
    const branchFilter = getElement('cashboxVoucherBranchFilter');
    const typeFilter = getElement('cashboxVoucherTypeFilter');
    const searchInput = getElement('cashboxVoucherSearch');
    const dateFrom = getElement('cashboxVoucherDateFrom');
    const dateTo = getElement('cashboxVoucherDateTo');

    if (branchFilter) branchFilter.value = currentContextBranchId || '';
    if (typeFilter) typeFilter.value = '';
    if (searchInput) searchInput.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
  }

  function setDefaultDates() {
    const today = getToday();
    const receiptDate = getElement('cashboxReceiptDate');
    const paymentDate = getElement('cashboxPaymentDate');

    if (receiptDate && !receiptDate.value) {
      receiptDate.value = today;
    }
    if (paymentDate && !paymentDate.value) {
      paymentDate.value = today;
    }
  }

  function attachEventListeners() {
    const contextBranchFilter = getElement('cashboxContextBranchFilter');
    if (contextBranchFilter) {
      contextBranchFilter.addEventListener('change', handleContextBranchChange);
    }

    const settingsForm = getElement('cashboxSettingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', handleCashboxSettingsSubmit);
    }

    const receiptForm = getElement('cashboxReceiptForm');
    if (receiptForm) {
      receiptForm.addEventListener('submit', handleCashboxReceiptSubmit);
    }

    const paymentForm = getElement('cashboxPaymentForm');
    if (paymentForm) {
      paymentForm.addEventListener('submit', handleCashboxPaymentSubmit);
    }

    const cancelReceiptEditBtn = getElement('cancelCashboxReceiptEditBtn');
    if (cancelReceiptEditBtn) {
      cancelReceiptEditBtn.addEventListener('click', () => {
        clearActiveVoucherEdit({ resetForm: true, clearFormAlert: false });
        setInlineAlert('cashboxReceiptAlert', 'تم إلغاء تعديل سند القبض.', 'warning');
      });
    }

    const cancelPaymentEditBtn = getElement('cancelCashboxPaymentEditBtn');
    if (cancelPaymentEditBtn) {
      cancelPaymentEditBtn.addEventListener('click', () => {
        clearActiveVoucherEdit({ resetForm: true, clearFormAlert: false });
        setInlineAlert('cashboxPaymentAlert', 'تم إلغاء تعديل سند الصرف.', 'warning');
      });
    }

    const searchBtn = getElement('cashboxVoucherSearchBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        loadCashboxVouchers().catch(() => {});
      });
    }

    const clearBtn = getElement('cashboxVoucherClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearVoucherFilters();
        loadCashboxVouchers().catch(() => {});
      });
    }

    ['cashboxVoucherBranchFilter', 'cashboxVoucherTypeFilter', 'cashboxVoucherDateFrom', 'cashboxVoucherDateTo'].forEach((id) => {
      const input = getElement(id);
      if (input) {
        input.addEventListener('change', () => {
          loadCashboxVouchers().catch(() => {});
        });
      }
    });

    const searchInput = getElement('cashboxVoucherSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          loadCashboxVouchers().catch(() => {});
        }
      });
    }

    const tableBody = getElement('cashboxVouchersTable');
    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        handleVoucherTableClick(event).catch(() => {});
      });
    }

    const printReportBtn = getElement('cashboxPrintReportBtn');
    if (printReportBtn) {
      printReportBtn.addEventListener('click', () => {
        handlePrintCashboxReport().catch(() => {});
      });
    }

    const exportPdfBtn = getElement('cashboxExportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => {
        handleExportCashboxReportPdf().catch(() => {});
      });
    }

    const exportExcelBtn = getElement('cashboxExportExcelBtn');
    if (exportExcelBtn) {
      exportExcelBtn.addEventListener('click', () => {
        handleExportCashboxReportExcel().catch(() => {});
      });
    }
  }

  function exposeGlobals() {
    window.loadCashboxFilters = loadCashboxFilters;
    window.loadCashboxes = loadCashboxes;
    window.printCashboxVoucher = printCashboxVoucher;
    window.deleteCashboxVoucher = deleteCashboxVoucher;
    window.startCashboxVoucherEdit = startCashboxVoucherEdit;
    window.handlePrintCashboxReport = handlePrintCashboxReport;
    window.handleExportCashboxReportPdf = handleExportCashboxReportPdf;
    window.handleExportCashboxReportExcel = handleExportCashboxReportExcel;
  }

  function initializeCashboxes() {
    if (initialized) {
      return;
    }

    setDefaultDates();
    syncVoucherEditModeUi();
    renderCashboxReport(currentReportSummary, buildCashboxReportMeta(currentVoucherFilters));
    attachEventListeners();
    exposeGlobals();
    initialized = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCashboxes);
  } else {
    initializeCashboxes();
  }
})();
