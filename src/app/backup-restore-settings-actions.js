const {
  PERMISSION_GROUPS,
  SECTION_RULES,
  parseStoredPermissions,
  serializePermissions,
  normalizeUser,
  applyPermissionsToDocument
} = require('./user-permissions');
const { mapDbErrorMessage } = require('./db-error-messages');
const {
  parseStoredFormulaSettings,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS
} = require('./reconciliation-formula');
const { getSelectedFiscalYear, normalizeFiscalYear } = require('./fiscal-year');

function createBackupRestoreSettingsActions(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || (typeof globalThis !== 'undefined' ? globalThis : null);
  const Swal = context.Swal || (windowObj && windowObj.Swal) || (typeof globalThis !== 'undefined' ? globalThis.Swal : null);
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const getThermalPrintSectionDialog = () => (
    context.showThermalPrintSectionDialog
    || (windowObj && windowObj.showThermalPrintSectionDialog)
  );
  const getPdfTransformer = () => context.transformDataForPDFGenerator;
  const getCurrentUser = context.getCurrentUser;
  const setCurrentUser = context.setCurrentUser;
  const applyRuntimeSecuritySettings = context.applyRuntimeSecuritySettings;
  const getDialogUtils = context.getDialogUtils;

  const MAINTENANCE_BUTTON_IDS = ['optimizeDbBtn', 'repairDbBtn', 'analyzeDbBtn'];
  const PERMISSION_CHECKBOX_SELECTOR = '.permission-checkbox';

  let permissionsUiInitialized = false;
  let permissionsUsersCache = [];
  let selectedPermissionsUserId = null;
  const archiveBrowseState = {
    currentYear: null,
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    totalRecords: 0,
    isLoading: false,
    searchNumber: '',
    searchDate: '',
    searchCashier: '',
    sortKey: 'reconciliation_date',
    sortDir: 'desc'
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getFirstValue(row) {
    if (!row || typeof row !== 'object') return null;
    const keys = Object.keys(row);
    if (!keys.length) return null;
    return row[keys[0]];
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatNumber(value) {
    try {
      return Number(value || 0).toLocaleString('en-US');
    } catch (_error) {
      return String(value || 0);
    }
  }

  function formatBytes(bytes) {
    const amount = toNumber(bytes);
    if (amount <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = amount;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const precision = unitIndex === 0 ? 0 : 2;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
  }

  function normalizeYearValue(value) {
    return normalizeFiscalYear(value);
  }

  function getActiveFiscalYear() {
    return normalizeYearValue(getSelectedFiscalYear());
  }

  const ARCHIVE_SORT_CONFIG = {
    reconciliation_number: { sql: 'COALESCE(ar.reconciliation_number, 0)', defaultDir: 'desc' },
    branch_name: { sql: 'LOWER(COALESCE(b.branch_name, \'\'))', defaultDir: 'asc' },
    cashier_name: { sql: 'LOWER(COALESCE(c.name, \'\'))', defaultDir: 'asc' },
    accountant_name: { sql: 'LOWER(COALESCE(a.name, \'\'))', defaultDir: 'asc' },
    reconciliation_date: { sql: 'COALESCE(ar.reconciliation_date, \'\')', defaultDir: 'desc' },
    total_receipts: { sql: 'COALESCE(ar.total_receipts, 0)', defaultDir: 'desc' },
    system_sales: { sql: 'COALESCE(ar.system_sales, 0)', defaultDir: 'desc' },
    surplus_deficit: { sql: 'COALESCE(ar.surplus_deficit, 0)', defaultDir: 'desc' },
    status: { sql: 'LOWER(COALESCE(ar.status, \'\'))', defaultDir: 'asc' }
  };

  function normalizeSearchValue(value) {
    return String(value || '').trim();
  }

  function getArchiveBrowseFiltersFromInputs() {
    const numberValue = normalizeSearchValue(getElement('archiveBrowseSearchNumber')?.value);
    const dateValue = normalizeSearchValue(getElement('archiveBrowseSearchDate')?.value);
    const cashierValue = normalizeSearchValue(getElement('archiveBrowseSearchCashier')?.value);
    return {
      numberValue,
      dateValue,
      cashierValue
    };
  }

  function syncArchiveBrowseFilters() {
    const filters = getArchiveBrowseFiltersFromInputs();
    archiveBrowseState.searchNumber = filters.numberValue;
    archiveBrowseState.searchDate = filters.dateValue;
    archiveBrowseState.searchCashier = filters.cashierValue;
  }

  function clearArchiveBrowseFilters() {
    const numberInput = getElement('archiveBrowseSearchNumber');
    const dateInput = getElement('archiveBrowseSearchDate');
    const cashierInput = getElement('archiveBrowseSearchCashier');
    if (numberInput) numberInput.value = '';
    if (dateInput) dateInput.value = '';
    if (cashierInput) cashierInput.value = '';
    archiveBrowseState.searchNumber = '';
    archiveBrowseState.searchDate = '';
    archiveBrowseState.searchCashier = '';
  }

  function hasArchiveBrowseFilters() {
    return Boolean(
      archiveBrowseState.searchNumber
      || archiveBrowseState.searchDate
      || archiveBrowseState.searchCashier
    );
  }

  function buildArchiveBrowseFilterQuery(yearValue) {
    const clauses = [`strftime('%Y', ar.reconciliation_date) = ?`];
    const params = [String(yearValue)];

    if (archiveBrowseState.searchNumber) {
      clauses.push('CAST(ar.reconciliation_number AS TEXT) LIKE ?');
      params.push(`%${archiveBrowseState.searchNumber}%`);
    }

    if (archiveBrowseState.searchDate) {
      clauses.push('date(ar.reconciliation_date) = date(?)');
      params.push(archiveBrowseState.searchDate);
    }

    if (archiveBrowseState.searchCashier) {
      clauses.push('LOWER(COALESCE(c.name, \'\')) LIKE ?');
      params.push(`%${archiveBrowseState.searchCashier.toLowerCase()}%`);
    }

    return {
      whereSql: `WHERE ${clauses.join(' AND ')}`,
      params
    };
  }

  function buildArchiveBrowseOrderBy() {
    const config = ARCHIVE_SORT_CONFIG[archiveBrowseState.sortKey];
    if (!config) {
      return 'ORDER BY ar.reconciliation_date DESC, ar.id DESC';
    }
    const dir = archiveBrowseState.sortDir === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${config.sql} ${dir}, ar.reconciliation_date DESC, ar.id DESC`;
  }

  function updateArchiveBrowseSortIndicators() {
    if (!document || typeof document.querySelectorAll !== 'function') {
      return;
    }

    const headers = document.querySelectorAll('th.archived-rec-sortable');
    headers.forEach((header) => {
      const key = header.getAttribute('data-sort-key');
      const indicator = header.querySelector('.sort-indicator');
      if (!indicator) {
        return;
      }
      if (key && key === archiveBrowseState.sortKey) {
        const isAsc = archiveBrowseState.sortDir === 'asc';
        indicator.textContent = isAsc ? ' ▲' : ' ▼';
        header.setAttribute('aria-sort', isAsc ? 'ascending' : 'descending');
      } else {
        indicator.textContent = ' ↕';
        header.setAttribute('aria-sort', 'none');
      }
    });

    const resetSortBtn = document.getElementById('archiveBrowseResetSortBtn');
    if (resetSortBtn) {
      const isDefaultSort = archiveBrowseState.sortKey === 'reconciliation_date'
        && archiveBrowseState.sortDir === 'desc';
      resetSortBtn.classList.toggle('d-none', isDefaultSort);
      resetSortBtn.disabled = isDefaultSort;
    }

    const tbody = document.getElementById('archivedReconciliationsTableBody');
    if (tbody && typeof tbody.querySelectorAll === 'function') {
      const highlightedCells = tbody.querySelectorAll('td.archived-rec-sorted');
      highlightedCells.forEach((cell) => cell.classList.remove('archived-rec-sorted'));

      if (archiveBrowseState.sortKey) {
        const targetCells = tbody.querySelectorAll(`td[data-col="${archiveBrowseState.sortKey}"]`);
        targetCells.forEach((cell) => cell.classList.add('archived-rec-sorted'));
      }
    }
  }

  function formatYearList(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return '';
    }
    return values.map((year) => String(year)).join(', ');
  }

  function quoteIdentifier(identifier) {
    return `"${String(identifier || '').replace(/"/g, '""')}"`;
  }

  async function runDb(sql, params = []) {
    return ipcRenderer.invoke('db-run', sql, params);
  }

  async function queryDb(sql, params = []) {
    return ipcRenderer.invoke('db-query', sql, params);
  }

  async function getDbStats() {
    return ipcRenderer.invoke('get-database-stats');
  }

  async function ensureArchiveTables() {
    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_years (
        year TEXT PRIMARY KEY,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_reconciliations INTEGER DEFAULT 0,
        total_bank_receipts INTEGER DEFAULT 0,
        total_cash_receipts INTEGER DEFAULT 0,
        total_postpaid_sales INTEGER DEFAULT 0,
        total_customer_receipts INTEGER DEFAULT 0,
        total_return_invoices INTEGER DEFAULT 0,
        total_suppliers INTEGER DEFAULT 0
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_reconciliations (
        id INTEGER PRIMARY KEY,
        reconciliation_number INTEGER NULL,
        cashier_id INTEGER NOT NULL,
        accountant_id INTEGER NOT NULL,
        reconciliation_date DATE NOT NULL,
        time_range_start TIME NULL,
        time_range_end TIME NULL,
        filter_notes TEXT,
        system_sales DECIMAL(10,2) DEFAULT 0,
        total_receipts DECIMAL(10,2) DEFAULT 0,
        surplus_deficit DECIMAL(10,2) DEFAULT 0,
        status TEXT DEFAULT 'draft',
        notes TEXT,
        formula_profile_id INTEGER,
        formula_settings TEXT,
        cashbox_posting_enabled INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified_date DATETIME,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_bank_receipts (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        operation_type TEXT NOT NULL,
        atm_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_cash_receipts (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        denomination INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_postpaid_sales (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_customer_receipts (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type TEXT NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_return_invoices (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runDb(`
      CREATE TABLE IF NOT EXISTS archived_suppliers (
        id INTEGER PRIMARY KEY,
        reconciliation_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        invoice_number TEXT,
        amount DECIMAL(10,2) NOT NULL,
        notes TEXT,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      const columns = await queryDb('PRAGMA table_info(archived_reconciliations)');
      const hasTimeRangeStart = (columns || []).some((col) => col && col.name === 'time_range_start');
      const hasTimeRangeEnd = (columns || []).some((col) => col && col.name === 'time_range_end');
      const hasFilterNotes = (columns || []).some((col) => col && col.name === 'filter_notes');
      const hasCashboxPostingEnabled = (columns || []).some((col) => col && col.name === 'cashbox_posting_enabled');
      if (!hasTimeRangeStart) {
        await runDb('ALTER TABLE archived_reconciliations ADD COLUMN time_range_start TIME NULL');
      }
      if (!hasTimeRangeEnd) {
        await runDb('ALTER TABLE archived_reconciliations ADD COLUMN time_range_end TIME NULL');
      }
      if (!hasFilterNotes) {
        await runDb('ALTER TABLE archived_reconciliations ADD COLUMN filter_notes TEXT');
      }
      if (!hasCashboxPostingEnabled) {
        await runDb('ALTER TABLE archived_reconciliations ADD COLUMN cashbox_posting_enabled INTEGER');
      }
    } catch (_error) {
      // Ignore column add errors for legacy tables.
    }
  }

  async function upsertSetting(category, key, value) {
    return runDb(`
      INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category, setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `, [category, key, value == null ? '' : String(value)]);
  }

  async function saveDatabaseBackupSettings(autoBackup, backupLocation) {
    await Promise.all([
      upsertSetting('database', 'auto_backup', autoBackup),
      upsertSetting('database', 'backup_location', backupLocation),
      upsertSetting('backup', 'auto_backup_frequency', autoBackup),
      upsertSetting('backup', 'default_backup_path', backupLocation)
    ]);
  }

  async function runImmediateAutoBackupCheckIfEnabled(autoBackup, backupLocation, source = 'settings-update') {
    const frequency = String(autoBackup || '').trim().toLowerCase();
    const backupPath = String(backupLocation || '').trim();

    if (!frequency || frequency === 'disabled') {
      return { success: true, skipped: true, reason: 'disabled' };
    }

    if (!backupPath) {
      return {
        success: false,
        skipped: true,
        reason: 'path-missing',
        error: 'تم تفعيل النسخ الاحتياطي التلقائي بدون تحديد مجلد الحفظ'
      };
    }

    try {
      const result = await ipcRenderer.invoke('run-auto-backup-check', source);
      if (!result || typeof result !== 'object') {
        return { success: true, skipped: true, reason: 'unknown-response' };
      }
      if (result.success === false) {
        return result;
      }
      if (result.success === true) {
        return result;
      }
      return { success: true, skipped: true, reason: 'unknown-response' };
    } catch (error) {
      return {
        success: false,
        error: mapDbErrorMessage(error, {
          fallback: 'تعذر تشغيل فحص النسخ التلقائي'
        })
      };
    }
  }

  async function refreshDatabaseStatsUI() {
    try {
      const dbStats = await getDbStats();
      if (!dbStats) return;

      const dbSizeElement = getElement('dbSize');
      if (dbSizeElement) dbSizeElement.textContent = dbStats.size || 'غير متاح';

      const recordCountElement = getElement('recordCount');
      if (recordCountElement) recordCountElement.textContent = dbStats.recordCount || '0';

      const lastDbUpdateElement = getElement('lastDbUpdate');
      if (lastDbUpdateElement) {
        lastDbUpdateElement.textContent = new Date().toLocaleString('en-GB');
      }
    } catch (error) {
      console.error('❌ [DB-MAINTENANCE] Failed to refresh DB stats:', error);
    }
  }

  function getActiveUser() {
    if (typeof getCurrentUser === 'function') {
      return getCurrentUser();
    }
    return null;
  }

  function getAllAvailablePermissionKeys() {
    return [
      ...PERMISSION_GROUPS.sections.map((rule) => rule.key),
      ...PERMISSION_GROUPS.settingsTabs.map((rule) => rule.key),
      ...PERMISSION_GROUPS.operations.map((rule) => rule.key)
    ];
  }

  function resolvePermissionListForEditor(user) {
    const parsed = parseStoredPermissions(user ? user.permissions : null);
    if (!parsed.explicit && user && user.role === 'admin') {
      return getAllAvailablePermissionKeys();
    }
    return parsed.permissions;
  }

  function renderPermissionGroup(containerId, rules, prefix) {
    const container = getElement(containerId);
    if (!container) return;

    container.innerHTML = rules.map((rule) => `
      <div class="permission-item">
        <div class="form-check">
          <input class="form-check-input permission-checkbox" type="checkbox"
            id="${prefix}-${escapeHtml(rule.key)}"
            data-permission-key="${escapeHtml(rule.key)}">
          <label class="form-check-label" for="${prefix}-${escapeHtml(rule.key)}">
            ${escapeHtml(rule.label)}
          </label>
        </div>
      </div>
    `).join('');
  }

  function renderPermissionsMatrix() {
    renderPermissionGroup('screenPermissionsContainer', PERMISSION_GROUPS.sections, 'perm-section');
    renderPermissionGroup('settingsTabPermissionsContainer', PERMISSION_GROUPS.settingsTabs, 'perm-tab');
    renderPermissionGroup('operationPermissionsContainer', PERMISSION_GROUPS.operations, 'perm-op');
  }

  function getSelectedPermissionKeys() {
    return Array.from(document.querySelectorAll(PERMISSION_CHECKBOX_SELECTOR))
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.getAttribute('data-permission-key'))
      .filter(Boolean);
  }

  function setSelectedPermissionKeys(permissionKeys) {
    const set = new Set(permissionKeys || []);
    document.querySelectorAll(PERMISSION_CHECKBOX_SELECTOR).forEach((checkbox) => {
      const key = checkbox.getAttribute('data-permission-key');
      checkbox.checked = set.has(key);
    });
  }

  function updateSelectedUserInfoPanel(user) {
    const nameEl = getElement('permissionsSelectedUserName');
    const roleEl = getElement('permissionsSelectedUserRole');
    const statusEl = getElement('permissionsSelectedUserStatus');

    if (!user) {
      if (nameEl) nameEl.textContent = '-';
      if (roleEl) roleEl.textContent = '-';
      if (statusEl) statusEl.textContent = '-';
      return;
    }

    if (nameEl) {
      nameEl.textContent = `${user.name || '-'}${user.username ? ` (${user.username})` : ''}`;
    }
    if (roleEl) {
      roleEl.textContent = user.role === 'admin' ? 'مدير' : (user.role || 'مستخدم');
    }
    if (statusEl) {
      statusEl.textContent = user.active ? 'نشط' : 'غير نشط';
    }
  }

  async function loadPermissionsUsers() {
    const rows = await queryDb(`
      SELECT id, name, username, role, active, permissions
      FROM admins
      ORDER BY id ASC
    `);

    permissionsUsersCache = rows || [];
    return permissionsUsersCache;
  }

  function fillPermissionsUsersDropdown(users) {
    const select = getElement('permissionsUserSelect');
    if (!select) return;

    const options = ['<option value="">اختر مستخدمًا لإدارة صلاحياته</option>'];
    users.forEach((user) => {
      const label = `${user.name || 'بدون اسم'} (${user.username || '-'})`;
      options.push(`<option value="${escapeHtml(String(user.id))}">${escapeHtml(label)}</option>`);
    });

    select.innerHTML = options.join('');
  }

  function findUserById(userId) {
    const targetId = Number(userId);
    if (!Number.isFinite(targetId)) return null;
    return permissionsUsersCache.find((user) => Number(user.id) === targetId) || null;
  }

  function ensureAtLeastOneSectionPermission(permissionKeys) {
    const selected = new Set(permissionKeys || []);
    return SECTION_RULES.some((rule) => selected.has(rule.key));
  }

  async function refreshPermissionManagerSelection() {
    const select = getElement('permissionsUserSelect');
    if (!select) return;

    const selectedId = Number(select.value);
    if (!Number.isFinite(selectedId)) {
      selectedPermissionsUserId = null;
      setSelectedPermissionKeys([]);
      updateSelectedUserInfoPanel(null);
      return;
    }

    selectedPermissionsUserId = selectedId;
    const selectedUser = findUserById(selectedId);
    updateSelectedUserInfoPanel(selectedUser);
    setSelectedPermissionKeys(resolvePermissionListForEditor(selectedUser));
  }

  async function handleLoadUserPermissionsManager() {
    try {
      if (!permissionsUiInitialized) {
        renderPermissionsMatrix();
        permissionsUiInitialized = true;
      }

      const users = await loadPermissionsUsers();
      fillPermissionsUsersDropdown(users);

      const select = getElement('permissionsUserSelect');
      if (!select) return;

      const activeUser = getActiveUser();
      const currentSelected = Number(select.value);
      const hasCurrent = Number.isFinite(currentSelected) && users.some((user) => Number(user.id) === currentSelected);

      if (!hasCurrent) {
        const preferredUserId = activeUser && activeUser.id ? Number(activeUser.id) : (users[0] ? Number(users[0].id) : null);
        if (Number.isFinite(preferredUserId)) {
          select.value = String(preferredUserId);
        }
      }

      await refreshPermissionManagerSelection();
    } catch (error) {
      console.error('❌ [USER-PERMISSIONS] Failed to load permissions manager:', error);
      getDialogUtils().showErrorToast('تعذر تحميل بيانات صلاحيات المستخدمين');
    }
  }

  async function handlePermissionsUserChange() {
    await refreshPermissionManagerSelection();
  }

  function setAllPermissionCheckboxes(checked) {
    document.querySelectorAll(PERMISSION_CHECKBOX_SELECTOR).forEach((checkbox) => {
      checkbox.checked = !!checked;
    });
  }

  function setMaintenanceButtonsDisabled(disabled) {
    MAINTENANCE_BUTTON_IDS.forEach((id) => {
      const button = getElement(id);
      if (button) button.disabled = disabled;
    });
  }

  function setButtonLoading(button, loadingText) {
    if (!button) return () => {};

    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span>${escapeHtml(loadingText)}`;
    button.disabled = true;

    return () => {
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      button.disabled = false;
      delete button.dataset.originalHtml;
    };
  }

  async function getPragmaNumber(pragmaName) {
    const rows = await queryDb(`PRAGMA ${pragmaName}`);
    return toNumber(getFirstValue(rows && rows[0]), 0);
  }

  async function getDatabaseSizeBytes() {
    const [pageCount, pageSize] = await Promise.all([
      getPragmaNumber('page_count'),
      getPragmaNumber('page_size')
    ]);
    return pageCount * pageSize;
  }

  function parseIntegrityIssues(rows) {
    return (rows || [])
      .map((row) => String(getFirstValue(row) || '').trim())
      .filter((value) => value && value.toLowerCase() !== 'ok');
  }

  async function runOptionalDbQuery(sql, params = []) {
    try {
      return await queryDb(sql, params);
    } catch (error) {
      console.warn(`⚠️ [DB-MAINTENANCE] Optional query failed: ${sql}`, error.message || error);
      return [];
    }
  }

  function setArchiveSummaryValue(id, value) {
    const element = getElement(id);
    if (element) {
      element.textContent = value;
    }
  }

  function resetArchiveSummary() {
    [
      'archiveYearReconciliations',
      'archiveYearBankReceipts',
      'archiveYearCashReceipts',
      'archiveYearPostpaidSales',
      'archiveYearCustomerReceipts',
      'archiveYearReturnInvoices',
      'archiveYearSuppliers'
    ].forEach((id) => setArchiveSummaryValue(id, '-'));
  }

  function updateArchiveSummary(summary) {
    if (!summary) {
      resetArchiveSummary();
      return;
    }

    setArchiveSummaryValue('archiveYearReconciliations', formatNumber(summary.reconciliations));
    setArchiveSummaryValue('archiveYearBankReceipts', formatNumber(summary.bankReceipts));
    setArchiveSummaryValue('archiveYearCashReceipts', formatNumber(summary.cashReceipts));
    setArchiveSummaryValue('archiveYearPostpaidSales', formatNumber(summary.postpaidSales));
    setArchiveSummaryValue('archiveYearCustomerReceipts', formatNumber(summary.customerReceipts));
    setArchiveSummaryValue('archiveYearReturnInvoices', formatNumber(summary.returnInvoices));
    setArchiveSummaryValue('archiveYearSuppliers', formatNumber(summary.suppliers));
  }

  function setArchiveControlsDisabled(disabled) {
    const select = getElement('archiveYearSelect');
    if (select) {
      select.disabled = !!disabled;
    }
    const button = getElement('archiveFiscalYearBtn');
    if (button) {
      button.disabled = !!disabled;
    }
  }

  async function loadAvailableArchiveYears() {
    const rows = await queryDb(`
      SELECT DISTINCT strftime('%Y', reconciliation_date) AS year
      FROM reconciliations
      WHERE reconciliation_date IS NOT NULL
      ORDER BY year DESC
    `);

    return (rows || [])
      .map((row) => normalizeYearValue(row?.year))
      .filter(Boolean);
  }

  async function loadArchivedYears() {
    try {
      const rows = await queryDb('SELECT year FROM archived_years ORDER BY year DESC');
      return (rows || [])
        .map((row) => normalizeYearValue(row?.year))
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  async function fetchArchiveYearSummary(year) {
    const normalizedYear = normalizeYearValue(year);
    if (!normalizedYear) {
      return null;
    }

    const yearValue = String(normalizedYear);
    const [reconciliationsRows, bankRows, cashRows, postpaidRows, customerRows, returnRows, suppliersRows] = await Promise.all([
      queryDb(
        `SELECT COUNT(*) AS count
         FROM reconciliations
         WHERE strftime('%Y', reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM bank_receipts br
         INNER JOIN reconciliations r ON r.id = br.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM cash_receipts cr
         INNER JOIN reconciliations r ON r.id = cr.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM postpaid_sales ps
         INNER JOIN reconciliations r ON r.id = ps.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM customer_receipts cr
         INNER JOIN reconciliations r ON r.id = cr.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM return_invoices ri
         INNER JOIN reconciliations r ON r.id = ri.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM suppliers s
         INNER JOIN reconciliations r ON r.id = s.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      )
    ]);

    return {
      year: yearValue,
      reconciliations: toNumber(reconciliationsRows?.[0]?.count, 0),
      bankReceipts: toNumber(bankRows?.[0]?.count, 0),
      cashReceipts: toNumber(cashRows?.[0]?.count, 0),
      postpaidSales: toNumber(postpaidRows?.[0]?.count, 0),
      customerReceipts: toNumber(customerRows?.[0]?.count, 0),
      returnInvoices: toNumber(returnRows?.[0]?.count, 0),
      suppliers: toNumber(suppliersRows?.[0]?.count, 0)
    };
  }

  async function handleLoadArchiveYears() {
    const select = getElement('archiveYearSelect');
    const hint = getElement('archiveYearHint');
    const browseSelect = getElement('archiveBrowseYearSelect');
    const browseHint = getElement('archiveBrowseHint');
    if (!select) {
      return;
    }

    try {
      await ensureArchiveTables();
      const [availableYears, archivedYears] = await Promise.all([
        loadAvailableArchiveYears(),
        loadArchivedYears()
      ]);

      const activeFiscalYear = getActiveFiscalYear();
      const years = Array.isArray(availableYears) ? availableYears : [];

      select.innerHTML = '<option value="">اختر السنة</option>';
      years.forEach((year) => {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        select.appendChild(option);
      });

      const canArchive = years.length > 0;
      setArchiveControlsDisabled(!canArchive);
      resetArchiveSummary();

      if (hint) {
        const activeText = activeFiscalYear ? `السنة الحالية: ${activeFiscalYear}` : '';
        const archivedText = archivedYears.length > 0
          ? `السنوات المؤرشفة: ${formatYearList(archivedYears)}`
          : 'لا توجد سنوات مؤرشفة بعد';
        hint.textContent = [activeText, archivedText].filter(Boolean).join(' | ');
      }

      if (!canArchive) {
        select.disabled = true;
        if (hint) {
          hint.textContent = 'لا توجد سنوات متاحة للأرشفة حالياً.';
        }
      }

      if (browseSelect) {
        browseSelect.innerHTML = '<option value="">اختر السنة</option>';
        archivedYears.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = String(year);
          browseSelect.appendChild(option);
        });

        const hasArchivedYears = archivedYears.length > 0;
        browseSelect.disabled = !hasArchivedYears;
        const restoreBtn = getElement('restoreArchivedYearBtn');
        if (restoreBtn) {
          restoreBtn.disabled = !hasArchivedYears;
        }
        if (browseHint) {
          browseHint.textContent = hasArchivedYears
            ? 'اختر سنة مؤرشفة لعرض التصفيات.'
            : 'لا توجد سنوات مؤرشفة بعد.';
        }

        if (hasArchivedYears) {
          const selectedYear = normalizeYearValue(browseSelect.value) || archivedYears[0];
          browseSelect.value = String(selectedYear);
          archiveBrowseState.currentYear = selectedYear;
          archiveBrowseState.currentPage = 1;
          await loadArchivedReconciliationsPage(1);
        } else {
          archiveBrowseState.currentYear = null;
          archiveBrowseState.currentPage = 1;
          archiveBrowseState.totalRecords = 0;
          archiveBrowseState.totalPages = 1;
          renderArchiveBrowseEmpty('لا توجد سنوات مؤرشفة بعد.');
          setArchiveBrowseMeta();
          updateArchiveBrowseButtons();
        }
      }
    } catch (error) {
      console.error('❌ [ARCHIVE] Failed to load archive years:', error);
      resetArchiveSummary();
      setArchiveControlsDisabled(true);
      if (hint) {
        hint.textContent = 'تعذر تحميل سنوات الأرشفة.';
      }
      if (browseHint) {
        browseHint.textContent = 'تعذر تحميل بيانات الأرشيف.';
      }
      renderArchiveBrowseEmpty('تعذر تحميل بيانات الأرشيف.');
      setArchiveBrowseMeta();
      updateArchiveBrowseButtons();
    }
  }

  async function handleArchiveYearChange() {
    const select = getElement('archiveYearSelect');
    if (!select) {
      return;
    }

    const year = normalizeYearValue(select.value);
    if (!year) {
      resetArchiveSummary();
      return;
    }

    try {
      const summary = await fetchArchiveYearSummary(year);
      updateArchiveSummary(summary);
    } catch (error) {
      console.error('❌ [ARCHIVE] Failed to load year summary:', error);
      resetArchiveSummary();
    }
  }

  function renderArchiveBrowseEmpty(message) {
    const tbody = getElement('archivedReconciliationsTableBody');
    if (!tbody) {
      return;
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center text-muted py-3">${escapeHtml(message || 'لا توجد بيانات')}</td>
      </tr>
    `;
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0.00';
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setArchiveBrowseMeta() {
    const metaEl = getElement('archivedReconciliationsMeta');
    if (!metaEl) {
      return;
    }

    const total = archiveBrowseState.totalRecords || 0;
    if (total <= 0) {
      metaEl.textContent = 'عرض 0 من 0';
      return;
    }

    const start = (archiveBrowseState.currentPage - 1) * archiveBrowseState.pageSize + 1;
    const end = Math.min(archiveBrowseState.currentPage * archiveBrowseState.pageSize, total);
    metaEl.textContent = `عرض ${formatNumber(start)}-${formatNumber(end)} من ${formatNumber(total)}`;
  }

  function updateArchiveBrowseButtons() {
    const prevBtn = getElement('archivedRecPrevPage');
    const nextBtn = getElement('archivedRecNextPage');
    if (prevBtn) {
      prevBtn.disabled = archiveBrowseState.currentPage <= 1 || archiveBrowseState.totalRecords <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = archiveBrowseState.currentPage >= archiveBrowseState.totalPages || archiveBrowseState.totalRecords <= 0;
    }
  }

  function renderArchivedReconciliations(reconciliations) {
    const tbody = getElement('archivedReconciliationsTableBody');
    if (!tbody) {
      return;
    }

    if (!Array.isArray(reconciliations) || reconciliations.length === 0) {
      renderArchiveBrowseEmpty('لا توجد تصفيات مؤرشفة لهذه السنة.');
      return;
    }

    tbody.innerHTML = '';
    reconciliations.forEach((reconciliation) => {
      const row = document.createElement('tr');
      const statusClass = reconciliation.status === 'completed' ? 'bg-success' : 'bg-warning';
      const statusText = reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة';
      const surplusDeficitClass = reconciliation.surplus_deficit > 0 ? 'text-success'
        : reconciliation.surplus_deficit < 0 ? 'text-danger' : 'text-muted';
      const recNumber = reconciliation.status === 'completed' && reconciliation.reconciliation_number
        ? `#${reconciliation.reconciliation_number}`
        : '<span class="text-muted">مسودة</span>';
      const recId = Number(reconciliation.id);
      const canView = Number.isFinite(recId) && recId > 0;
      const actionsHtml = canView
        ? `<div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle archived-rec-actions-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              إجراءات
            </button>
            <ul class="dropdown-menu">
              <li><button class="dropdown-item archived-rec-view-btn" type="button" onclick="window.viewArchivedReconciliation(${recId})">👁️ عرض التفاصيل</button></li>
              <li><button class="dropdown-item archived-rec-a4-btn" type="button" onclick="window.printArchivedReconciliationA4(${recId})">🖨️ طباعة A4</button></li>
              <li><button class="dropdown-item archived-rec-pdf-btn" type="button" onclick="window.generatePDFArchivedReconciliation(${recId})">📄 تصدير PDF</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item archived-rec-thermal-preview-btn" type="button" onclick="window.thermalPreviewArchivedReconciliation(${recId})">🔥 معاينة حرارية</button></li>
              <li><button class="dropdown-item archived-rec-thermal-print-btn" type="button" onclick="window.thermalPrintArchivedReconciliation(${recId})">🔥 طباعة حرارية</button></li>
              <li><button class="dropdown-item archived-rec-thermal-summary-btn" type="button" onclick="window.printArchivedThermalSummary(${recId})">ملخص حراري</button></li>
            </ul>
          </div>`
        : '<button class="btn btn-sm btn-secondary" disabled>غير متاح</button>';

      row.innerHTML = `
        <td data-col="reconciliation_number">${recNumber}</td>
        <td data-col="branch_name">${escapeHtml(reconciliation.branch_name || '')}</td>
        <td data-col="cashier_name">${escapeHtml(reconciliation.cashier_name || '')}${reconciliation.cashier_number ? ` (${escapeHtml(reconciliation.cashier_number)})` : ''}</td>
        <td data-col="accountant_name">${escapeHtml(reconciliation.accountant_name || '')}</td>
        <td data-col="reconciliation_date">${escapeHtml(reconciliation.reconciliation_date || '')}</td>
        <td data-col="total_receipts" class="text-currency">${formatMoney(reconciliation.total_receipts)}</td>
        <td data-col="system_sales" class="text-currency">${formatMoney(reconciliation.system_sales)}</td>
        <td data-col="surplus_deficit" class="text-currency ${surplusDeficitClass}">${formatMoney(reconciliation.surplus_deficit)}</td>
        <td data-col="status"><span class="badge ${statusClass}">${statusText}</span></td>
        <td data-col="actions">${actionsHtml}</td>
      `;
      tbody.appendChild(row);
    });
  }

  async function handleViewArchivedReconciliation(id) {
    const dialog = getDialogUtils();
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      dialog.showErrorToast('معرف التصفية غير صالح');
      return;
    }

    try {
      dialog.showLoading('جاري تحميل تفاصيل التصفية المؤرشفة...', 'يرجى الانتظار');
      await ensureArchiveTables();

      const reconciliation = await ipcRenderer.invoke(
        'db-get',
        `SELECT ar.*, c.name as cashier_name, c.cashier_number,
                a.name as accountant_name, b.branch_name as branch_name
         FROM archived_reconciliations ar
         LEFT JOIN cashiers c ON ar.cashier_id = c.id
         LEFT JOIN accountants a ON ar.accountant_id = a.id
         LEFT JOIN branches b ON b.id = c.branch_id
         WHERE ar.id = ?
         LIMIT 1`,
        [recordId]
      );

      if (!reconciliation) {
        dialog.close();
        dialog.showError('لم يتم العثور على التصفية المؤرشفة المطلوبة', 'غير موجودة');
        return;
      }

      const [
        bankRows,
        cashRows,
        postpaidRows,
        customerRows,
        returnRows,
        suppliersRows
      ] = await Promise.all([
        queryDb('SELECT COUNT(*) AS count FROM archived_bank_receipts WHERE reconciliation_id = ?', [recordId]),
        queryDb('SELECT COUNT(*) AS count FROM archived_cash_receipts WHERE reconciliation_id = ?', [recordId]),
        queryDb('SELECT COUNT(*) AS count FROM archived_postpaid_sales WHERE reconciliation_id = ?', [recordId]),
        queryDb('SELECT COUNT(*) AS count FROM archived_customer_receipts WHERE reconciliation_id = ?', [recordId]),
        queryDb('SELECT COUNT(*) AS count FROM archived_return_invoices WHERE reconciliation_id = ?', [recordId]),
        queryDb('SELECT COUNT(*) AS count FROM archived_suppliers WHERE reconciliation_id = ?', [recordId])
      ]);

      dialog.close();

      const additionalInfo = `\n\nتفاصيل إضافية:\n` +
        `• المقبوضات البنكية: ${formatNumber(bankRows?.[0]?.count || 0)} عنصر\n` +
        `• المقبوضات النقدية: ${formatNumber(cashRows?.[0]?.count || 0)} عنصر\n` +
        `• المبيعات الآجلة: ${formatNumber(postpaidRows?.[0]?.count || 0)} عنصر\n` +
        `• مقبوضات العملاء: ${formatNumber(customerRows?.[0]?.count || 0)} عنصر\n` +
        `• فواتير المرتجع: ${formatNumber(returnRows?.[0]?.count || 0)} عنصر\n` +
        `• الموردين: ${formatNumber(suppliersRows?.[0]?.count || 0)} عنصر`;

      const timeRangeText = reconciliation.time_range_start && reconciliation.time_range_end
        ? `\nالفترة الزمنية: ${reconciliation.time_range_start} - ${reconciliation.time_range_end}`
        : '';
      const notesText = reconciliation.filter_notes ? `\nملاحظات التصفية: ${reconciliation.filter_notes}` : '';

      const summary = `
تفاصيل التصفية المؤرشفة #${reconciliation.id}

الفرع: ${reconciliation.branch_name || '-'}
الكاشير: ${reconciliation.cashier_name || '-'}${reconciliation.cashier_number ? ` (${reconciliation.cashier_number})` : ''}
المحاسب: ${reconciliation.accountant_name || '-'}
التاريخ: ${reconciliation.reconciliation_date || '-'}${timeRangeText}${notesText}

إجمالي المقبوضات: ${formatMoney(reconciliation.total_receipts)} ريال
مبيعات النظام: ${formatMoney(reconciliation.system_sales)} ريال
الفائض/العجز: ${formatMoney(reconciliation.surplus_deficit)} ريال
الحالة: ${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}${additionalInfo}
      `;

      dialog.showAlert(summary, 'تفاصيل التصفية المؤرشفة', 'info');
    } catch (error) {
      dialog.close();
      console.error('❌ [ARCHIVE] Failed to view archived reconciliation:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء عرض تفاصيل الأرشيف.'
      });
      dialog.showError(friendly, 'خطأ في النظام');
    }
  }

  async function loadArchivedReconciliationForPrint(recordId) {
    await ensureArchiveTables();

    const reconciliation = await ipcRenderer.invoke(
      'db-get',
      `SELECT ar.*, c.name as cashier_name, c.cashier_number,
              a.name as accountant_name, b.branch_name as branch_name
       FROM archived_reconciliations ar
       LEFT JOIN cashiers c ON ar.cashier_id = c.id
       LEFT JOIN accountants a ON ar.accountant_id = a.id
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE ar.id = ?
       LIMIT 1`,
      [recordId]
    );

    if (!reconciliation) {
      throw new Error('التصفية المؤرشفة غير موجودة');
    }

    const normalizedReconciliation = {
      ...reconciliation,
      cashier_name: reconciliation.cashier_name || 'غير محدد',
      cashier_number: reconciliation.cashier_number || '-',
      accountant_name: reconciliation.accountant_name || 'غير محدد'
    };

    const formulaSettings = parseStoredFormulaSettings(reconciliation.formula_settings)
      || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
    normalizedReconciliation.formula_settings = formulaSettings;

    const [bankReceipts, cashReceipts, postpaidSales, customerReceipts, returnInvoices, suppliers] = await Promise.all([
      ipcRenderer.invoke('db-query', `
        SELECT br.*, atm.name as atm_name, atm.bank_name
        FROM archived_bank_receipts br
        LEFT JOIN atms atm ON br.atm_id = atm.id
        WHERE br.reconciliation_id = ?
        ORDER BY br.id
      `, [recordId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM archived_cash_receipts WHERE reconciliation_id = ? ORDER BY id', [recordId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM archived_postpaid_sales WHERE reconciliation_id = ? ORDER BY id', [recordId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM archived_customer_receipts WHERE reconciliation_id = ? ORDER BY id', [recordId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM archived_return_invoices WHERE reconciliation_id = ? ORDER BY id', [recordId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM archived_suppliers WHERE reconciliation_id = ? ORDER BY id', [recordId])
    ]);

    return {
      reconciliation: normalizedReconciliation,
      formulaSettings,
      bankReceipts: bankReceipts || [],
      cashReceipts: cashReceipts || [],
      postpaidSales: postpaidSales || [],
      customerReceipts: customerReceipts || [],
      returnInvoices: returnInvoices || [],
      suppliers: suppliers || []
    };
  }

  async function runThermalForArchivedReconciliation(recordId, isPreview) {
    const dialog = getDialogUtils();
    const thermalDialog = getThermalPrintSectionDialog();

    if (!thermalDialog || typeof thermalDialog !== 'function') {
      dialog.showError('ميزة الطباعة الحرارية غير متاحة حالياً.', 'غير متاحة');
      return;
    }

    if (!windowObj || typeof windowObj !== 'object') {
      dialog.showError('تعذر تشغيل الطباعة الحرارية في هذه الجلسة.', 'خطأ في النظام');
      return;
    }

    try {
      const actionLabel = isPreview ? 'المعاينة الحرارية' : 'الطباعة الحرارية';
      dialog.showLoading(`جاري تحضير بيانات ${actionLabel}...`);

      const reconciliationData = await loadArchivedReconciliationForPrint(recordId);
      if (!reconciliationData) {
        dialog.close();
        dialog.showError('فشل في تحميل بيانات التصفية المؤرشفة', 'خطأ في البيانات');
        return;
      }

      windowObj.currentThermalReconciliationData = reconciliationData;
      windowObj.thermalPreviewMode = isPreview === true;

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      dialog.close();
      thermalDialog(reconciliationData);
    } catch (error) {
      dialog.close();
      console.error('❌ [ARCHIVE] Thermal print failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: isPreview ? 'تعذر فتح المعاينة الحرارية.' : 'تعذر تنفيذ الطباعة الحرارية.'
      });
      dialog.showError(`خطأ في الطباعة الحرارية: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function handleThermalPreviewArchivedReconciliation(id) {
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      getDialogUtils().showErrorToast('معرف التصفية غير صالح');
      return;
    }

    await runThermalForArchivedReconciliation(recordId, true);
  }

  async function handleThermalPrintArchivedReconciliation(id) {
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      getDialogUtils().showErrorToast('معرف التصفية غير صالح');
      return;
    }

    await runThermalForArchivedReconciliation(recordId, false);
  }

  async function handleGeneratePDFArchivedReconciliation(id) {
    const dialog = getDialogUtils();
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      dialog.showErrorToast('معرف التصفية غير صالح');
      return;
    }

    const pdfTransformer = getPdfTransformer();
    if (!pdfTransformer || typeof pdfTransformer !== 'function') {
      dialog.showError('ميزة تصدير PDF غير متاحة حالياً.', 'غير متاحة');
      return;
    }

    try {
      dialog.showLoading('جاري إنشاء ملف PDF...', 'يرجى الانتظار');
      const printData = await loadArchivedReconciliationForPrint(recordId);

      if (!printData) {
        dialog.close();
        dialog.showError('فشل في تحميل بيانات التصفية المؤرشفة', 'خطأ في البيانات');
        return;
      }

      const pdfData = pdfTransformer(printData);
      const result = await ipcRenderer.invoke('generate-pdf', pdfData);

      dialog.close();

      if (result.success) {
        dialog.showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
      } else {
        const friendly = mapDbErrorMessage(result.message || result.error, {
          fallback: 'تعذر إنشاء ملف PDF للتصفية.'
        });
        dialog.showError(`فشل في إنشاء التقرير: ${friendly}`, 'خطأ في إنشاء التقرير');
      }
    } catch (error) {
      dialog.close();
      console.error('❌ [ARCHIVE] PDF export failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إنشاء ملف PDF للتصفية.'
      });
      dialog.showError(`خطأ في إنشاء PDF: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function handlePrintArchivedReconciliationA4(id) {
    const dialog = getDialogUtils();
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      dialog.showErrorToast('معرف التصفية غير صالح');
      return;
    }

    if (!windowObj || typeof windowObj.printReconciliationFromData !== 'function') {
      dialog.showError('ميزة طباعة A4 غير متاحة حالياً.', 'غير متاحة');
      return;
    }

    try {
      dialog.showLoading('جاري تحضير بيانات الطباعة...', 'يرجى الانتظار');
      const printData = await loadArchivedReconciliationForPrint(recordId);
      dialog.close();

      if (!printData) {
        dialog.showError('فشل في تحميل بيانات التصفية المؤرشفة', 'خطأ في البيانات');
        return;
      }

      const opened = windowObj.printReconciliationFromData(printData);
      if (!opened) {
        dialog.showError('تعذر فتح خيارات الطباعة.', 'خطأ في الطباعة');
      }
    } catch (error) {
      dialog.close();
      console.error('❌ [ARCHIVE] A4 print failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر فتح خيارات طباعة A4.'
      });
      dialog.showError(`خطأ في الطباعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function handleThermalSummaryArchivedReconciliation(id) {
    const dialog = getDialogUtils();
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      dialog.showErrorToast('معرف التصفية غير صالح');
      return;
    }

    try {
      let mode = null;

      if (Swal && typeof Swal.fire === 'function') {
        const result = await Swal.fire({
          title: 'ملخص التصفية الحراري',
          text: 'اختر الإجراء المطلوب:',
          icon: 'question',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: 'معاينة',
          denyButtonText: 'طباعة',
          cancelButtonText: 'إلغاء',
          confirmButtonColor: '#0d6efd',
          denyButtonColor: '#198754',
          cancelButtonColor: '#6c757d',
          reverseButtons: true,
          customClass: {
            popup: 'rtl-popup',
            title: 'rtl-title',
            content: 'rtl-content'
          }
        });

        if (result.isConfirmed) {
          mode = 'preview';
        } else if (result.isDenied) {
          mode = 'print';
        } else {
          mode = null;
        }
      } else {
        mode = 'print';
      }

      if (!mode) {
        return;
      }

      const actionLabel = mode === 'preview' ? 'المعاينة الحرارية' : 'الطباعة الحرارية';
      dialog.showLoading(`جاري تحضير ${actionLabel}...`, 'يرجى الانتظار');

      const reconciliationData = await loadArchivedReconciliationForPrint(recordId);
      if (!reconciliationData) {
        dialog.close();
        dialog.showError('فشل في تحميل بيانات التصفية المؤرشفة', 'خطأ في البيانات');
        return;
      }

      const payload = {
        reconciliation: reconciliationData.reconciliation,
        bankReceipts: reconciliationData.bankReceipts,
        cashReceipts: reconciliationData.cashReceipts,
        postpaidSales: reconciliationData.postpaidSales,
        customerReceipts: reconciliationData.customerReceipts,
        returnInvoices: reconciliationData.returnInvoices,
        suppliers: reconciliationData.suppliers,
        selectedSections: {
          bankReceipts: false,
          cashReceipts: false,
          postpaidSales: false,
          customerReceipts: false,
          returnInvoices: false,
          suppliers: false,
          summary: true
        },
        companySettings: reconciliationData.companySettings || {}
      };

      let result = null;
      if (mode === 'preview') {
        result = await ipcRenderer.invoke('thermal-printer-preview', payload);
      } else {
        const settingsResult = await ipcRenderer.invoke('thermal-printer-settings-get');
        const printerSettings = settingsResult && settingsResult.success ? settingsResult.settings : {};
        result = await ipcRenderer.invoke('thermal-printer-print', payload, printerSettings);
      }

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      dialog.close();

      if (result.success) {
        const successMessage = mode === 'preview'
          ? 'تم فتح معاينة الملخص الحراري بنجاح'
          : 'تم إرسال الملخص للطباعة الحرارية بنجاح';
        dialog.showSuccessToast(successMessage);
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: mode === 'preview' ? 'تعذر فتح المعاينة الحرارية.' : 'تعذر إتمام الطباعة الحرارية.'
        });
        const failureTitle = mode === 'preview' ? 'خطأ في المعاينة' : 'خطأ في الطباعة';
        dialog.showError(`خطأ: ${friendly}`, failureTitle);
      }
    } catch (error) {
      dialog.close();
      console.error('❌ [ARCHIVE] Thermal summary failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إتمام العملية الحرارية.'
      });
      dialog.showError(`خطأ: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function loadArchivedReconciliationsPage(page = 1) {
    if (archiveBrowseState.isLoading) {
      return;
    }

    const select = getElement('archiveBrowseYearSelect');
    const yearValue = archiveBrowseState.currentYear || normalizeYearValue(select?.value);
    if (!yearValue) {
      archiveBrowseState.totalRecords = 0;
      archiveBrowseState.totalPages = 1;
      archiveBrowseState.currentPage = 1;
      renderArchiveBrowseEmpty('اختر سنة مؤرشفة لعرض البيانات.');
      setArchiveBrowseMeta();
      updateArchiveBrowseButtons();
      return;
    }

    archiveBrowseState.isLoading = true;
    try {
      await ensureArchiveTables();
      const year = String(yearValue);
      const { whereSql, params } = buildArchiveBrowseFilterQuery(year);
      const countRows = await queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_reconciliations ar
         LEFT JOIN cashiers c ON c.id = ar.cashier_id
         ${whereSql}`,
        params
      );

      const totalRecords = toNumber(countRows?.[0]?.count, 0);
      archiveBrowseState.totalRecords = totalRecords;
      archiveBrowseState.totalPages = Math.max(1, Math.ceil(totalRecords / archiveBrowseState.pageSize));
      archiveBrowseState.currentPage = Math.min(Math.max(1, Number(page) || 1), archiveBrowseState.totalPages);
      archiveBrowseState.currentYear = yearValue;

      if (totalRecords === 0) {
        const emptyMessage = hasArchiveBrowseFilters()
          ? 'لا توجد نتائج مطابقة لخيارات البحث.'
          : 'لا توجد تصفيات مؤرشفة لهذه السنة.';
        renderArchiveBrowseEmpty(emptyMessage);
        updateArchiveBrowseSortIndicators();
        setArchiveBrowseMeta();
        updateArchiveBrowseButtons();
        return;
      }

      const offset = (archiveBrowseState.currentPage - 1) * archiveBrowseState.pageSize;
      const orderBySql = buildArchiveBrowseOrderBy();
      const rows = await queryDb(
        `SELECT ar.id, ar.reconciliation_number, ar.reconciliation_date, ar.total_receipts,
                ar.system_sales, ar.surplus_deficit, ar.status,
                c.name AS cashier_name, c.cashier_number,
                b.branch_name AS branch_name,
                a.name AS accountant_name
         FROM archived_reconciliations ar
         LEFT JOIN cashiers c ON c.id = ar.cashier_id
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN accountants a ON a.id = ar.accountant_id
         ${whereSql}
         ${orderBySql}
         LIMIT ? OFFSET ?`,
        [...params, archiveBrowseState.pageSize, offset]
      );

      renderArchivedReconciliations(rows || []);
      updateArchiveBrowseSortIndicators();
      setArchiveBrowseMeta();
      updateArchiveBrowseButtons();
    } catch (error) {
      console.error('❌ [ARCHIVE] Failed to load archived reconciliations:', error);
      renderArchiveBrowseEmpty('تعذر تحميل بيانات الأرشيف.');
      archiveBrowseState.totalRecords = 0;
      archiveBrowseState.totalPages = 1;
      archiveBrowseState.currentPage = 1;
      setArchiveBrowseMeta();
      updateArchiveBrowseButtons();
    } finally {
      archiveBrowseState.isLoading = false;
    }
  }

  async function handleArchiveBrowseYearChange() {
    const select = getElement('archiveBrowseYearSelect');
    const yearValue = normalizeYearValue(select?.value);
    syncArchiveBrowseFilters();
    archiveBrowseState.currentYear = yearValue || null;
    archiveBrowseState.currentPage = 1;
    await loadArchivedReconciliationsPage(1);
  }

  async function handleLoadArchivedReconciliations() {
    syncArchiveBrowseFilters();
    await loadArchivedReconciliationsPage(1);
  }

  async function handleArchiveBrowseSort(event) {
    const target = event?.currentTarget || event?.target;
    const header = target && typeof target.closest === 'function'
      ? target.closest('th.archived-rec-sortable')
      : null;
    const sortKey = header ? header.getAttribute('data-sort-key') : null;
    if (!sortKey || !ARCHIVE_SORT_CONFIG[sortKey]) {
      return;
    }

    if (archiveBrowseState.sortKey === sortKey) {
      archiveBrowseState.sortDir = archiveBrowseState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      archiveBrowseState.sortKey = sortKey;
      archiveBrowseState.sortDir = ARCHIVE_SORT_CONFIG[sortKey].defaultDir || 'asc';
    }

    updateArchiveBrowseSortIndicators();
    archiveBrowseState.currentPage = 1;
    await loadArchivedReconciliationsPage(1);
  }

  async function handleArchiveBrowseResetSort() {
    archiveBrowseState.sortKey = 'reconciliation_date';
    archiveBrowseState.sortDir = 'desc';
    updateArchiveBrowseSortIndicators();
    archiveBrowseState.currentPage = 1;
    await loadArchivedReconciliationsPage(1);
  }

  async function handleArchiveBrowseSearch() {
    syncArchiveBrowseFilters();
    archiveBrowseState.currentPage = 1;
    await loadArchivedReconciliationsPage(1);
  }

  async function handleArchiveBrowseClear() {
    clearArchiveBrowseFilters();
    archiveBrowseState.currentPage = 1;
    await loadArchivedReconciliationsPage(1);
  }

  async function handleArchiveBrowsePrevPage() {
    if (archiveBrowseState.currentPage <= 1) {
      return;
    }
    await loadArchivedReconciliationsPage(archiveBrowseState.currentPage - 1);
  }

  async function handleArchiveBrowseNextPage() {
    if (archiveBrowseState.currentPage >= archiveBrowseState.totalPages) {
      return;
    }
    await loadArchivedReconciliationsPage(archiveBrowseState.currentPage + 1);
  }

  if (windowObj && typeof windowObj === 'object') {
    windowObj.viewArchivedReconciliation = handleViewArchivedReconciliation;
    windowObj.thermalPreviewArchivedReconciliation = handleThermalPreviewArchivedReconciliation;
    windowObj.thermalPrintArchivedReconciliation = handleThermalPrintArchivedReconciliation;
    windowObj.generatePDFArchivedReconciliation = handleGeneratePDFArchivedReconciliation;
    windowObj.printArchivedReconciliationA4 = handlePrintArchivedReconciliationA4;
    windowObj.printArchivedThermalSummary = handleThermalSummaryArchivedReconciliation;
  }

  async function fetchArchivedYearSummary(year) {
    const normalizedYear = normalizeYearValue(year);
    if (!normalizedYear) {
      return null;
    }

    const yearValue = String(normalizedYear);
    try {
      const rows = await queryDb(
        `SELECT year, total_reconciliations, total_bank_receipts, total_cash_receipts,
                total_postpaid_sales, total_customer_receipts, total_return_invoices, total_suppliers
         FROM archived_years
         WHERE year = ?
         LIMIT 1`,
        [yearValue]
      );
      const row = rows && rows[0];
      if (row) {
        return {
          year: yearValue,
          reconciliations: toNumber(row.total_reconciliations, 0),
          bankReceipts: toNumber(row.total_bank_receipts, 0),
          cashReceipts: toNumber(row.total_cash_receipts, 0),
          postpaidSales: toNumber(row.total_postpaid_sales, 0),
          customerReceipts: toNumber(row.total_customer_receipts, 0),
          returnInvoices: toNumber(row.total_return_invoices, 0),
          suppliers: toNumber(row.total_suppliers, 0)
        };
      }
    } catch (_error) {
      // Fall back to live counts
    }

    const [reconciliationsRows, bankRows, cashRows, postpaidRows, customerRows, returnRows, suppliersRows] = await Promise.all([
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_reconciliations
         WHERE strftime('%Y', reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_bank_receipts br
         INNER JOIN archived_reconciliations r ON r.id = br.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_cash_receipts cr
         INNER JOIN archived_reconciliations r ON r.id = cr.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_postpaid_sales ps
         INNER JOIN archived_reconciliations r ON r.id = ps.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_customer_receipts cr
         INNER JOIN archived_reconciliations r ON r.id = cr.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_return_invoices ri
         INNER JOIN archived_reconciliations r ON r.id = ri.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      ),
      queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_suppliers s
         INNER JOIN archived_reconciliations r ON r.id = s.reconciliation_id
         WHERE strftime('%Y', r.reconciliation_date) = ?`,
        [yearValue]
      )
    ]);

    return {
      year: yearValue,
      reconciliations: toNumber(reconciliationsRows?.[0]?.count, 0),
      bankReceipts: toNumber(bankRows?.[0]?.count, 0),
      cashReceipts: toNumber(cashRows?.[0]?.count, 0),
      postpaidSales: toNumber(postpaidRows?.[0]?.count, 0),
      customerReceipts: toNumber(customerRows?.[0]?.count, 0),
      returnInvoices: toNumber(returnRows?.[0]?.count, 0),
      suppliers: toNumber(suppliersRows?.[0]?.count, 0)
    };
  }

  async function hasActiveYearData(year) {
    const normalizedYear = normalizeYearValue(year);
    if (!normalizedYear) {
      return false;
    }
    const rows = await queryDb(
      `SELECT COUNT(*) AS count
       FROM reconciliations
       WHERE strftime('%Y', reconciliation_date) = ?`,
      [String(normalizedYear)]
    );
    return toNumber(rows?.[0]?.count, 0) > 0;
  }

  function setArchiveBrowseControlsDisabled(disabled) {
    const ids = [
      'archiveBrowseYearSelect',
      'loadArchivedReconciliationsBtn',
      'restoreArchivedYearBtn',
      'archiveBrowseSearchNumber',
      'archiveBrowseSearchDate',
      'archiveBrowseSearchCashier',
      'archiveBrowseSearchBtn',
      'archiveBrowseClearBtn',
      'archiveBrowseResetSortBtn',
      'archivedRecPrevPage',
      'archivedRecNextPage'
    ];
    ids.forEach((id) => {
      const element = getElement(id);
      if (element && typeof element.disabled === 'boolean') {
        element.disabled = !!disabled;
      }
    });
  }

  async function handleRestoreArchivedYear() {
    const dialog = getDialogUtils();
    const select = getElement('archiveBrowseYearSelect');
    const yearValue = normalizeYearValue(select?.value);

    if (!yearValue) {
      dialog.showErrorToast('يرجى اختيار سنة مؤرشفة أولاً');
      return;
    }

    try {
      await ensureArchiveTables();
      const archivedCountRows = await queryDb(
        `SELECT COUNT(*) AS count
         FROM archived_reconciliations
         WHERE strftime('%Y', reconciliation_date) = ?`,
        [String(yearValue)]
      );

      if (toNumber(archivedCountRows?.[0]?.count, 0) === 0) {
        dialog.showInfo('لا توجد بيانات مؤرشفة لهذه السنة.', 'لا يوجد بيانات');
        return;
      }

      const hasActive = await hasActiveYearData(yearValue);
      if (hasActive) {
        dialog.showError(
          'يوجد بيانات نشطة لهذه السنة في الجداول الحالية. قم بأرشفتها أو حذفها قبل الاستعادة.',
          'تعارض في البيانات'
        );
        return;
      }

      const summary = await fetchArchivedYearSummary(yearValue);
      const confirmMessage = [
        `سيتم استعادة بيانات سنة ${summary?.year || yearValue} إلى الجداول النشطة وإزالتها من الأرشيف.`,
        'هذا الإجراء قد يستغرق بعض الوقت ولا يمكن التراجع عنه إلا باستعادة نسخة احتياطية.',
        `التصفيات: ${formatNumber(summary?.reconciliations || 0)}`,
        `المقبوضات البنكية: ${formatNumber(summary?.bankReceipts || 0)}`,
        `المقبوضات النقدية: ${formatNumber(summary?.cashReceipts || 0)}`,
        `البيع الآجل: ${formatNumber(summary?.postpaidSales || 0)}`,
        `تحصيل العملاء: ${formatNumber(summary?.customerReceipts || 0)}`,
        `مرتجعات الفواتير: ${formatNumber(summary?.returnInvoices || 0)}`,
        `الموردين: ${formatNumber(summary?.suppliers || 0)}`
      ].join('\n');

      const confirmed = await dialog.showConfirm(
        confirmMessage,
        'تأكيد استعادة السنة',
        'استعادة الآن',
        'إلغاء'
      );

      if (!confirmed) {
        return;
      }

      const restoreBtn = getElement('restoreArchivedYearBtn');
      const restoreRestoreBtn = setButtonLoading(restoreBtn, 'جارٍ الاستعادة...');
      setArchiveBrowseControlsDisabled(true);
      const startedAt = Date.now();
      let restoreControls = true;

      try {
        dialog.showLoading('جاري استعادة بيانات السنة...', 'يرجى الانتظار');
        await runDb('BEGIN TRANSACTION');

        const archivedRecs = await queryDb(
          `SELECT *
           FROM archived_reconciliations
           WHERE strftime('%Y', reconciliation_date) = ?
           ORDER BY id ASC`,
          [String(yearValue)]
        );

        const idMap = new Map();
        const insertRecQuery = `
          INSERT INTO reconciliations (
            reconciliation_number, cashier_id, accountant_id, reconciliation_date,
            time_range_start, time_range_end, filter_notes,
            system_sales, total_receipts, surplus_deficit, status, notes,
            formula_profile_id, formula_settings, cashbox_posting_enabled, created_at, updated_at, last_modified_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (const row of archivedRecs || []) {
          const insertResult = await runDb(insertRecQuery, [
            row.reconciliation_number ?? null,
            row.cashier_id,
            row.accountant_id,
            row.reconciliation_date,
            row.time_range_start ?? null,
            row.time_range_end ?? null,
            row.filter_notes ?? null,
            row.system_sales ?? 0,
            row.total_receipts ?? 0,
            row.surplus_deficit ?? 0,
            row.status ?? 'draft',
            row.notes ?? null,
            row.formula_profile_id ?? null,
            row.formula_settings ?? null,
            row.cashbox_posting_enabled ?? null,
            row.created_at ?? null,
            row.updated_at ?? null,
            row.last_modified_date ?? null
          ]);
          idMap.set(row.id, insertResult.lastInsertRowid);
        }

        const insertBankQuery = `
          INSERT INTO bank_receipts (
            reconciliation_id, operation_type, atm_id, amount, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertCashQuery = `
          INSERT INTO cash_receipts (
            reconciliation_id, denomination, quantity, total_amount, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertPostpaidQuery = `
          INSERT INTO postpaid_sales (
            reconciliation_id, customer_name, amount, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `;
        const insertCustomerQuery = `
          INSERT INTO customer_receipts (
            reconciliation_id, customer_name, amount, payment_type, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertReturnQuery = `
          INSERT INTO return_invoices (
            reconciliation_id, invoice_number, amount, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `;
        const insertSupplierQuery = `
          INSERT INTO suppliers (
            reconciliation_id, supplier_name, invoice_number, amount, notes, is_modified, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const bankRows = await queryDb(
          `SELECT br.*
           FROM archived_bank_receipts br
           INNER JOIN archived_reconciliations ar ON ar.id = br.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY br.id ASC`,
          [String(yearValue)]
        );
        for (const row of bankRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertBankQuery, [
            newRecId,
            row.operation_type,
            row.atm_id,
            row.amount,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        const cashRows = await queryDb(
          `SELECT cr.*
           FROM archived_cash_receipts cr
           INNER JOIN archived_reconciliations ar ON ar.id = cr.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY cr.id ASC`,
          [String(yearValue)]
        );
        for (const row of cashRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertCashQuery, [
            newRecId,
            row.denomination,
            row.quantity,
            row.total_amount,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        const postpaidRows = await queryDb(
          `SELECT ps.*
           FROM archived_postpaid_sales ps
           INNER JOIN archived_reconciliations ar ON ar.id = ps.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY ps.id ASC`,
          [String(yearValue)]
        );
        for (const row of postpaidRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertPostpaidQuery, [
            newRecId,
            row.customer_name,
            row.amount,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        const customerRows = await queryDb(
          `SELECT cr.*
           FROM archived_customer_receipts cr
           INNER JOIN archived_reconciliations ar ON ar.id = cr.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY cr.id ASC`,
          [String(yearValue)]
        );
        for (const row of customerRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertCustomerQuery, [
            newRecId,
            row.customer_name,
            row.amount,
            row.payment_type,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        const returnRows = await queryDb(
          `SELECT ri.*
           FROM archived_return_invoices ri
           INNER JOIN archived_reconciliations ar ON ar.id = ri.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY ri.id ASC`,
          [String(yearValue)]
        );
        for (const row of returnRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertReturnQuery, [
            newRecId,
            row.invoice_number,
            row.amount,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        const supplierRows = await queryDb(
          `SELECT s.*
           FROM archived_suppliers s
           INNER JOIN archived_reconciliations ar ON ar.id = s.reconciliation_id
           WHERE strftime('%Y', ar.reconciliation_date) = ?
           ORDER BY s.id ASC`,
          [String(yearValue)]
        );
        for (const row of supplierRows || []) {
          const newRecId = idMap.get(row.reconciliation_id);
          if (!newRecId) continue;
          await runDb(insertSupplierQuery, [
            newRecId,
            row.supplier_name,
            row.invoice_number ?? null,
            row.amount,
            row.notes ?? null,
            row.is_modified ?? 0,
            row.created_at ?? null
          ]);
        }

        await runDb(
          `DELETE FROM archived_bank_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_cash_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_postpaid_sales
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_customer_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_return_invoices
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_suppliers
           WHERE reconciliation_id IN (
             SELECT id FROM archived_reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [String(yearValue)]
        );
        await runDb(
          `DELETE FROM archived_reconciliations
           WHERE strftime('%Y', reconciliation_date) = ?`,
          [String(yearValue)]
        );
        await runDb('DELETE FROM archived_years WHERE year = ?', [String(yearValue)]);

        await runDb('COMMIT');
        dialog.close();

        await refreshDatabaseStatsUI();
        await handleLoadArchiveYears();
        restoreControls = false;

        const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        dialog.showSuccess(
          `تم استعادة سنة ${yearValue} بنجاح.\nالمدة: ${durationSec} ثانية`,
          'اكتملت الاستعادة'
        );
      } catch (error) {
        await runDb('ROLLBACK');
        dialog.close();
        console.error('❌ [ARCHIVE] Restore failed:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'تعذر استعادة السنة المحددة.'
        });
        dialog.showError(`فشل في استعادة السنة: ${friendly}`, 'خطأ في الاستعادة');
      } finally {
        restoreRestoreBtn();
        if (restoreControls) {
          setArchiveBrowseControlsDisabled(false);
        }
      }
    } catch (outerError) {
      console.error('❌ [ARCHIVE] Unexpected restore error:', outerError);
      dialog.showError('حدث خطأ غير متوقع أثناء الاستعادة.', 'خطأ في الاستعادة');
    }
  }

  function buildAnalyzeHtml(report) {
    const rows = report.tableStats.slice(0, 10).map((table) => `
      <tr>
        <td style="text-align:right;">${escapeHtml(table.name)}</td>
        <td style="text-align:right;">${formatNumber(table.count)}</td>
      </tr>
    `).join('');

    const hiddenTablesCount = Math.max(0, report.tableStats.length - 10);
    const hiddenTablesNote = hiddenTablesCount > 0
      ? `<div style="margin-top:6px;color:#6b7f8e;font-size:12px;">+ ${hiddenTablesCount} جدول إضافي</div>`
      : '';

    return `
      <div style="text-align:right; direction:rtl;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px;">
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>الجداول:</strong> ${formatNumber(report.tableCount)}
          </div>
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>الفهارس:</strong> ${formatNumber(report.indexCount)}
          </div>
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>السجلات:</strong> ${formatNumber(report.totalRecords)}
          </div>
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>الحجم التقديري:</strong> ${formatBytes(report.sizeBytes)}
          </div>
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>صفحات فارغة:</strong> ${formatNumber(report.freePages)}
          </div>
          <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.05);">
            <strong>نسبة التجزئة:</strong> ${report.fragmentation.toFixed(2)}%
          </div>
        </div>

        <div style="padding:10px;border:1px solid rgba(12,44,62,.16);border-radius:10px;background:rgba(15,110,143,.04);margin-bottom:12px;">
          <strong>سلامة البيانات:</strong>
          ${report.integrityIssues.length === 0
            ? '<span style="color:#0b9a6d;font-weight:700;"> سليمة</span>'
            : `<span style="color:#dc3545;font-weight:700;"> يوجد ${report.integrityIssues.length} مشكلة</span>`}
          ${report.foreignKeyIssues.length === 0
            ? '<br><strong>سلامة العلاقات:</strong> <span style="color:#0b9a6d;font-weight:700;">سليمة</span>'
            : `<br><strong>سلامة العلاقات:</strong> <span style="color:#dc3545;font-weight:700;">يوجد ${report.foreignKeyIssues.length} مشكلة</span>`}
        </div>

        <div style="font-weight:700;margin-bottom:8px;">أكبر الجداول:</div>
        <div style="max-height:260px;overflow:auto;border:1px solid rgba(12,44,62,.16);border-radius:10px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:linear-gradient(135deg,#1b465e,#163a4f);color:#fff;">
                <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.16);text-align:right;">اسم الجدول</th>
                <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.16);text-align:right;">عدد السجلات</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="2" style="padding:8px;">لا توجد بيانات</td></tr>'}</tbody>
          </table>
        </div>
        ${hiddenTablesNote}
      </div>
    `;
  }

  async function handleTestPrintSettings() {
    getDialogUtils().showInfo('سيتم تطوير اختبار الطباعة قريباً', 'قيد التطوير');
  }

  async function handleExportData() {
    getDialogUtils().showInfo('استخدم زر "إنشاء نسخة احتياطية الآن" لتصدير كامل البيانات حالياً.', 'تصدير البيانات');
  }

  async function handleOptimizeDatabase() {
    const dialog = getDialogUtils();
    const confirmed = await dialog.showConfirm(
      'سيتم تنفيذ عمليات التحسين (REINDEX + ANALYZE + VACUUM). قد تستغرق العملية بعض الوقت.',
      'تحسين قاعدة البيانات',
      'تنفيذ التحسين',
      'إلغاء'
    );
    if (!confirmed) return;

    const optimizeBtn = getElement('optimizeDbBtn');
    const restoreOptimizeBtn = setButtonLoading(optimizeBtn, 'جارٍ تحسين قاعدة البيانات...');
    setMaintenanceButtonsDisabled(true);
    const startedAt = Date.now();

    try {
      dialog.showLoading('جاري تنفيذ عمليات التحسين...', 'يرجى الانتظار');

      const beforeBytes = await getDatabaseSizeBytes();
      await runOptionalDbQuery('PRAGMA wal_checkpoint(FULL)');
      await runDb('REINDEX');
      await runDb('ANALYZE');
      await runDb('VACUUM');
      await runOptionalDbQuery('PRAGMA optimize');
      const afterBytes = await getDatabaseSizeBytes();

      await refreshDatabaseStatsUI();
      dialog.close();

      const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const savedBytes = Math.max(0, beforeBytes - afterBytes);
      await dialog.showSuccess(
        `تم تحسين قاعدة البيانات بنجاح.\nالمدة: ${durationSec} ثانية\nالمساحة الموفرة: ${formatBytes(savedBytes)}`,
        'اكتمل التحسين'
      );
    } catch (error) {
      dialog.close();
      console.error('❌ [DB-MAINTENANCE] Optimize failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحسين قاعدة البيانات.'
      });
      await dialog.showError(`فشل تحسين قاعدة البيانات: ${friendly}`, 'خطأ في التحسين');
    } finally {
      restoreOptimizeBtn();
      setMaintenanceButtonsDisabled(false);
    }
  }

  async function handleRepairDatabase() {
    const dialog = getDialogUtils();
    const confirmed = await dialog.showConfirm(
      'سيتم فحص سلامة قاعدة البيانات ومحاولة إصلاح المشاكل الشائعة. يُنصح بوجود نسخة احتياطية قبل المتابعة.',
      'إصلاح قاعدة البيانات',
      'بدء الفحص والإصلاح',
      'إلغاء'
    );
    if (!confirmed) return;

    const repairBtn = getElement('repairDbBtn');
    const restoreRepairBtn = setButtonLoading(repairBtn, 'جارٍ فحص وإصلاح قاعدة البيانات...');
    setMaintenanceButtonsDisabled(true);
    const startedAt = Date.now();

    try {
      dialog.showLoading('جاري فحص سلامة قاعدة البيانات...', 'يرجى الانتظار');

      const initialIntegrityRows = await queryDb('PRAGMA integrity_check');
      const initialForeignKeyRows = await queryDb('PRAGMA foreign_key_check');
      const initialIntegrityIssues = parseIntegrityIssues(initialIntegrityRows);

      const hadIssues = initialIntegrityIssues.length > 0 || initialForeignKeyRows.length > 0;

      await runOptionalDbQuery('PRAGMA wal_checkpoint(FULL)');
      await runDb('REINDEX');
      await runDb('ANALYZE');
      if (hadIssues) {
        await runDb('VACUUM');
      }

      const finalIntegrityRows = await queryDb('PRAGMA integrity_check');
      const finalForeignKeyRows = await queryDb('PRAGMA foreign_key_check');
      const finalIntegrityIssues = parseIntegrityIssues(finalIntegrityRows);

      await refreshDatabaseStatsUI();
      dialog.close();

      const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (finalIntegrityIssues.length === 0 && finalForeignKeyRows.length === 0) {
        const details = hadIssues
          ? `تمت معالجة المشاكل الأولية.\nالمشاكل قبل الإصلاح: ${initialIntegrityIssues.length + initialForeignKeyRows.length}`
          : 'لم يتم العثور على مشاكل سلامة. تم تنفيذ صيانة وقائية.';

        await dialog.showSuccess(
          `${details}\nالمدة: ${durationSec} ثانية`,
          'اكتملت عملية الإصلاح'
        );
        return;
      }

      const unresolvedCount = finalIntegrityIssues.length + finalForeignKeyRows.length;
      await dialog.showWarning(
        `اكتملت العملية لكن ما زالت هناك ${unresolvedCount} مشكلة.\nيُنصح باستعادة آخر نسخة احتياطية سليمة.`,
        'تحذير بعد الإصلاح'
      );
    } catch (error) {
      dialog.close();
      console.error('❌ [DB-MAINTENANCE] Repair failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إصلاح قاعدة البيانات.'
      });
      await dialog.showError(`فشل إصلاح قاعدة البيانات: ${friendly}`, 'خطأ في الإصلاح');
    } finally {
      restoreRepairBtn();
      setMaintenanceButtonsDisabled(false);
    }
  }

  async function handleAnalyzeDatabase() {
    const dialog = getDialogUtils();
    const analyzeBtn = getElement('analyzeDbBtn');
    const restoreAnalyzeBtn = setButtonLoading(analyzeBtn, 'جارٍ تحليل قاعدة البيانات...');
    setMaintenanceButtonsDisabled(true);

    try {
      dialog.showLoading('جاري جمع معلومات قاعدة البيانات...', 'تحليل قاعدة البيانات');

      const tables = await queryDb(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const tableStats = [];
      for (const row of tables) {
        const tableName = String(row.name || '');
        if (!tableName) continue;
        const countRow = await queryDb(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`);
        tableStats.push({
          name: tableName,
          count: toNumber(countRow && countRow[0] ? countRow[0].count : 0, 0)
        });
      }

      tableStats.sort((a, b) => b.count - a.count);

      const [pageCount, pageSize, freePages, indexCountRows, integrityRows, foreignKeyRows] = await Promise.all([
        getPragmaNumber('page_count'),
        getPragmaNumber('page_size'),
        getPragmaNumber('freelist_count'),
        queryDb(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`),
        queryDb('PRAGMA quick_check'),
        queryDb('PRAGMA foreign_key_check')
      ]);

      const indexCount = toNumber(indexCountRows && indexCountRows[0] ? indexCountRows[0].count : 0, 0);
      const totalRecords = tableStats.reduce((sum, table) => sum + table.count, 0);
      const sizeBytes = pageCount * pageSize;
      const fragmentation = pageCount > 0 ? (freePages / pageCount) * 100 : 0;
      const integrityIssues = parseIntegrityIssues(integrityRows);

      const report = {
        tableCount: tableStats.length,
        indexCount,
        totalRecords,
        pageCount,
        pageSize,
        freePages,
        sizeBytes,
        fragmentation,
        integrityIssues,
        foreignKeyIssues: foreignKeyRows || [],
        tableStats
      };

      await refreshDatabaseStatsUI();
      dialog.close();

      if (typeof Swal !== 'undefined') {
        await Swal.fire({
          title: 'تحليل قاعدة البيانات',
          html: buildAnalyzeHtml(report),
          width: 860,
          confirmButtonText: 'إغلاق',
          confirmButtonColor: '#0f6e8f',
          customClass: {
            popup: 'rtl-popup',
            title: 'rtl-title'
          }
        });
      } else {
        await dialog.showInfo(
          `الجداول: ${formatNumber(report.tableCount)}\n` +
          `الفهارس: ${formatNumber(report.indexCount)}\n` +
          `إجمالي السجلات: ${formatNumber(report.totalRecords)}\n` +
          `الحجم التقديري: ${formatBytes(report.sizeBytes)}\n` +
          `نسبة التجزئة: ${report.fragmentation.toFixed(2)}%`,
          'تحليل قاعدة البيانات'
        );
      }
    } catch (error) {
      dialog.close();
      console.error('❌ [DB-MAINTENANCE] Analyze failed:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحليل قاعدة البيانات.'
      });
      await dialog.showError(`فشل تحليل قاعدة البيانات: ${friendly}`, 'خطأ في التحليل');
    } finally {
      restoreAnalyzeBtn();
      setMaintenanceButtonsDisabled(false);
    }
  }

  async function handleArchiveFiscalYear() {
    const dialog = getDialogUtils();
    const select = getElement('archiveYearSelect');
    if (!select) {
      return;
    }

    const selectedYear = normalizeYearValue(select.value);
    if (!selectedYear) {
      dialog.showErrorToast('يرجى اختيار السنة المراد أرشفتها أولاً');
      return;
    }

    const activeFiscalYear = getActiveFiscalYear();
    if (activeFiscalYear && Number(activeFiscalYear) === Number(selectedYear)) {
      dialog.showErrorToast('لا يمكن أرشفة السنة الحالية المختارة. اختر سنة مختلفة.');
      return;
    }

    try {
      await ensureArchiveTables();
      const summary = await fetchArchiveYearSummary(selectedYear);

      if (!summary || summary.reconciliations === 0) {
        dialog.showInfo('لا توجد بيانات للتصفية في السنة المحددة.', 'لا يوجد بيانات');
        return;
      }

      const confirmMessage = [
        `سيتم نقل بيانات سنة ${summary.year} إلى الأرشيف وإزالتها من الجداول النشطة.`,
        'هذا الإجراء قد يستغرق بعض الوقت ولا يمكن التراجع عنه إلا باستعادة نسخة احتياطية.',
        `التصفيات: ${formatNumber(summary.reconciliations)}`,
        `المقبوضات البنكية: ${formatNumber(summary.bankReceipts)}`,
        `المقبوضات النقدية: ${formatNumber(summary.cashReceipts)}`,
        `البيع الآجل: ${formatNumber(summary.postpaidSales)}`,
        `تحصيل العملاء: ${formatNumber(summary.customerReceipts)}`,
        `مرتجعات الفواتير: ${formatNumber(summary.returnInvoices)}`,
        `الموردين: ${formatNumber(summary.suppliers)}`
      ].join('\n');

      const confirmed = await dialog.showConfirm(
        confirmMessage,
        'تأكيد أرشفة السنة',
        'أرشفة الآن',
        'إلغاء'
      );

      if (!confirmed) {
        return;
      }

      const archiveBtn = getElement('archiveFiscalYearBtn');
      const restoreArchiveBtn = setButtonLoading(archiveBtn, 'جارٍ أرشفة البيانات...');
      setArchiveControlsDisabled(true);
      const startedAt = Date.now();
      let restoreControls = true;

      try {
        dialog.showLoading('جاري نقل بيانات السنة إلى الأرشيف...', 'يرجى الانتظار');
        await runDb('BEGIN TRANSACTION');

        await runDb(
          `INSERT OR IGNORE INTO archived_reconciliations (
             id, reconciliation_number, cashier_id, accountant_id, reconciliation_date,
             time_range_start, time_range_end, filter_notes,
             system_sales, total_receipts, surplus_deficit, status, notes,
             formula_profile_id, formula_settings, cashbox_posting_enabled, created_at, updated_at,
             last_modified_date, archived_at
           )
           SELECT
             id, reconciliation_number, cashier_id, accountant_id, reconciliation_date,
             time_range_start, time_range_end, filter_notes,
             system_sales, total_receipts, surplus_deficit, status, notes,
             formula_profile_id, formula_settings, cashbox_posting_enabled, created_at, updated_at,
             last_modified_date, CURRENT_TIMESTAMP
           FROM reconciliations
           WHERE strftime('%Y', reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_bank_receipts (
             id, reconciliation_id, operation_type, atm_id, amount, is_modified, created_at, archived_at
           )
           SELECT
             br.id, br.reconciliation_id, br.operation_type, br.atm_id, br.amount, br.is_modified, br.created_at, CURRENT_TIMESTAMP
           FROM bank_receipts br
           INNER JOIN reconciliations r ON r.id = br.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_cash_receipts (
             id, reconciliation_id, denomination, quantity, total_amount, is_modified, created_at, archived_at
           )
           SELECT
             cr.id, cr.reconciliation_id, cr.denomination, cr.quantity, cr.total_amount, cr.is_modified, cr.created_at, CURRENT_TIMESTAMP
           FROM cash_receipts cr
           INNER JOIN reconciliations r ON r.id = cr.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_postpaid_sales (
             id, reconciliation_id, customer_name, amount, is_modified, created_at, archived_at
           )
           SELECT
             ps.id, ps.reconciliation_id, ps.customer_name, ps.amount, ps.is_modified, ps.created_at, CURRENT_TIMESTAMP
           FROM postpaid_sales ps
           INNER JOIN reconciliations r ON r.id = ps.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_customer_receipts (
             id, reconciliation_id, customer_name, amount, payment_type, is_modified, created_at, archived_at
           )
           SELECT
             cr.id, cr.reconciliation_id, cr.customer_name, cr.amount, cr.payment_type, cr.is_modified, cr.created_at, CURRENT_TIMESTAMP
           FROM customer_receipts cr
           INNER JOIN reconciliations r ON r.id = cr.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_return_invoices (
             id, reconciliation_id, invoice_number, amount, is_modified, created_at, archived_at
           )
           SELECT
             ri.id, ri.reconciliation_id, ri.invoice_number, ri.amount, ri.is_modified, ri.created_at, CURRENT_TIMESTAMP
           FROM return_invoices ri
           INNER JOIN reconciliations r ON r.id = ri.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT OR IGNORE INTO archived_suppliers (
             id, reconciliation_id, supplier_name, invoice_number, amount, notes, is_modified, created_at, archived_at
           )
           SELECT
             s.id, s.reconciliation_id, s.supplier_name, s.invoice_number, s.amount, s.notes, s.is_modified, s.created_at, CURRENT_TIMESTAMP
           FROM suppliers s
           INNER JOIN reconciliations r ON r.id = s.reconciliation_id
           WHERE strftime('%Y', r.reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb(
          `INSERT INTO archived_years (
             year, archived_at, total_reconciliations, total_bank_receipts,
             total_cash_receipts, total_postpaid_sales, total_customer_receipts,
             total_return_invoices, total_suppliers
           )
           VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(year) DO UPDATE SET
             archived_at = excluded.archived_at,
             total_reconciliations = excluded.total_reconciliations,
             total_bank_receipts = excluded.total_bank_receipts,
             total_cash_receipts = excluded.total_cash_receipts,
             total_postpaid_sales = excluded.total_postpaid_sales,
             total_customer_receipts = excluded.total_customer_receipts,
             total_return_invoices = excluded.total_return_invoices,
             total_suppliers = excluded.total_suppliers`,
          [
            summary.year,
            summary.reconciliations,
            summary.bankReceipts,
            summary.cashReceipts,
            summary.postpaidSales,
            summary.customerReceipts,
            summary.returnInvoices,
            summary.suppliers
          ]
        );

        await runDb(
          `DELETE FROM bank_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM cash_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM postpaid_sales
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM customer_receipts
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM return_invoices
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM suppliers
           WHERE reconciliation_id IN (
             SELECT id FROM reconciliations WHERE strftime('%Y', reconciliation_date) = ?
           )`,
          [summary.year]
        );
        await runDb(
          `DELETE FROM reconciliations
           WHERE strftime('%Y', reconciliation_date) = ?`,
          [summary.year]
        );

        await runDb('COMMIT');
        dialog.close();

        await refreshDatabaseStatsUI();
        await handleLoadArchiveYears();
        restoreControls = false;

        const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        dialog.showSuccess(
          `تم أرشفة سنة ${summary.year} بنجاح.\nالمدة: ${durationSec} ثانية`,
          'اكتملت الأرشفة'
        );
      } catch (error) {
        await runDb('ROLLBACK');
        dialog.close();
        console.error('❌ [ARCHIVE] Archive failed:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'تعذر أرشفة السنة المحددة.'
        });
        dialog.showError(`فشل في أرشفة السنة: ${friendly}`, 'خطأ في الأرشفة');
      } finally {
        restoreArchiveBtn();
        if (restoreControls) {
          setArchiveControlsDisabled(false);
        }
      }
    } catch (outerError) {
      console.error('❌ [ARCHIVE] Unexpected archive error:', outerError);
      dialog.showError('حدث خطأ غير متوقع أثناء الأرشفة.', 'خطأ في الأرشفة');
    }
  }

  async function handleSaveDatabaseSettings() {
    const dialog = getDialogUtils();

    try {
      const autoBackupValue = getElement('autoBackup')?.value || 'disabled';
      const backupLocationValue = (getElement('backupLocation')?.value || '').trim();

      dialog.showLoading('جاري حفظ إعدادات قاعدة البيانات...', 'يرجى الانتظار');

      await saveDatabaseBackupSettings(autoBackupValue, backupLocationValue);
      await refreshDatabaseStatsUI();
      const autoCheckResult = await runImmediateAutoBackupCheckIfEnabled(
        autoBackupValue,
        backupLocationValue,
        'settings-save'
      );

      dialog.close();
      if (autoCheckResult && autoCheckResult.success === false) {
        const friendly = mapDbErrorMessage(autoCheckResult.error, {
          fallback: 'خطأ غير معروف'
        });
        dialog.showErrorToast(`تم حفظ الإعدادات لكن فشل التحقق الفوري للنسخ التلقائي: ${friendly}`);
      }
      const successMessage = autoCheckResult && autoCheckResult.created
        ? 'تم حفظ إعدادات قاعدة البيانات وإنشاء نسخة احتياطية فورية بنجاح'
        : 'تم حفظ إعدادات قاعدة البيانات بنجاح';
      dialog.showSuccessToast(successMessage);
    } catch (error) {
      dialog.close();
      console.error('❌ [SETTINGS] خطأ في حفظ إعدادات قاعدة البيانات:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر حفظ إعدادات قاعدة البيانات.'
      });
      dialog.showError(`حدث خطأ في حفظ إعدادات قاعدة البيانات: ${friendly}`, 'خطأ في الحفظ');
    }
  }

  async function saveUserSecuritySettings(sessionTimeoutValue, autoLockValue) {
    await Promise.all([
      upsertSetting('user', 'session_timeout', sessionTimeoutValue),
      upsertSetting('user', 'auto_lock', autoLockValue)
    ]);
  }

  function buildUserSettingsSuccessMessage(sessionTimeoutValue, autoLockValue) {
    if (sessionTimeoutValue === '0' && autoLockValue !== 'disabled') {
      return 'تم حفظ الإعدادات بنجاح. ملاحظة: انتهاء الجلسة معطل، لكن القفل التلقائي عند عدم النشاط ما زال مفعلاً.';
    }

    if (autoLockValue === 'disabled' && sessionTimeoutValue !== '0') {
      return `تم حفظ الإعدادات بنجاح. ملاحظة: القفل التلقائي معطل، لكن انتهاء صلاحية الجلسة ما زال مضبوطًا على ${sessionTimeoutValue} دقيقة.`;
    }

    return 'تم حفظ إعدادات المستخدمين والصلاحيات بنجاح';
  }

  function readSelectSettingValue(elementId, fallbackValue) {
    const field = getElement(elementId);
    if (!field) {
      return fallbackValue;
    }

    const rawValue = field.value;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return fallbackValue;
    }

    return String(rawValue);
  }

  async function saveSelectedUserPermissions(permissionKeys) {
    if (!Number.isFinite(selectedPermissionsUserId)) {
      return null;
    }

    const serialized = serializePermissions(permissionKeys);
    await runDb(
      'UPDATE admins SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [serialized, selectedPermissionsUserId]
    );

    return serialized;
  }

  async function handleSaveUserSettings() {
    const dialog = getDialogUtils();

    try {
      const sessionTimeoutValue = readSelectSettingValue('sessionTimeout', '60');
      const autoLockValue = readSelectSettingValue('autoLock', 'disabled');
      const selectedPermissionKeys = getSelectedPermissionKeys();

      if (Number.isFinite(selectedPermissionsUserId)) {
        if (!ensureAtLeastOneSectionPermission(selectedPermissionKeys)) {
          dialog.showErrorToast('يجب اختيار شاشة واحدة على الأقل ضمن صلاحيات المستخدم');
          return;
        }
      }

      dialog.showLoading('جاري حفظ إعدادات المستخدمين...', 'يرجى الانتظار');

      await saveUserSecuritySettings(sessionTimeoutValue, autoLockValue);
      const serializedPermissions = await saveSelectedUserPermissions(selectedPermissionKeys);

      if (typeof applyRuntimeSecuritySettings === 'function') {
        await applyRuntimeSecuritySettings({
          sessionTimeout: sessionTimeoutValue,
          autoLock: autoLockValue
        });
      }

      if (Number.isFinite(selectedPermissionsUserId)) {
        const selectedUser = findUserById(selectedPermissionsUserId);
        if (selectedUser) {
          selectedUser.permissions = serializedPermissions;
        }
      }

      const activeUser = getActiveUser();
      if (activeUser && Number(activeUser.id) === Number(selectedPermissionsUserId) && serializedPermissions != null) {
        const updatedCurrentUser = normalizeUser({
          ...activeUser,
          permissions: serializedPermissions
        });

        if (typeof setCurrentUser === 'function') {
          setCurrentUser(updatedCurrentUser);
        }
        applyPermissionsToDocument(document, updatedCurrentUser);
      }

      dialog.close();
      dialog.showSuccessToast(buildUserSettingsSuccessMessage(sessionTimeoutValue, autoLockValue));
    } catch (error) {
      dialog.close();
      console.error('❌ [USER-SETTINGS] Failed to save user settings:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر حفظ إعدادات المستخدمين.'
      });
      dialog.showError(`تعذر حفظ إعدادات المستخدمين: ${friendly}`, 'خطأ في الحفظ');
    }
  }

  async function handleChangePassword() {
    const dialog = getDialogUtils();

    try {
      const currentPassword = (getElement('currentPassword')?.value || '').trim();
      const newPassword = (getElement('newPassword')?.value || '').trim();
      const confirmPassword = (getElement('confirmPassword')?.value || '').trim();
      const activeUser = getActiveUser();

      if (!activeUser || !activeUser.id) {
        dialog.showErrorToast('تعذر تحديد المستخدم الحالي. أعد تسجيل الدخول');
        return;
      }

      if (!currentPassword || !newPassword || !confirmPassword) {
        dialog.showErrorToast('يرجى تعبئة جميع حقول كلمة المرور');
        return;
      }

      if (newPassword !== confirmPassword) {
        dialog.showErrorToast('كلمة المرور الجديدة وتأكيدها غير متطابقين');
        return;
      }

      if (newPassword === currentPassword) {
        dialog.showErrorToast('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
        return;
      }

      if (newPassword.length < 6) {
        dialog.showErrorToast('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
        return;
      }

      const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(newPassword);
      const hasNumber = /\d/.test(newPassword);
      if (!hasLetter || !hasNumber) {
        dialog.showErrorToast('كلمة المرور يجب أن تحتوي على أحرف وأرقام');
        return;
      }

      const userRecord = await ipcRenderer.invoke(
        'db-get',
        'SELECT id, password FROM admins WHERE id = ? AND active = 1 LIMIT 1',
        [activeUser.id]
      );

      const authResult = await ipcRenderer.invoke(
        'auth-verify-secret',
        userRecord ? userRecord.password : '',
        currentPassword
      );

      if (!userRecord || !authResult.ok) {
        dialog.showErrorToast('كلمة المرور الحالية غير صحيحة');
        return;
      }

      const hashedPassword = await ipcRenderer.invoke('auth-hash-secret', newPassword);
      await runDb(
        'UPDATE admins SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, activeUser.id]
      );

      const currentPasswordEl = getElement('currentPassword');
      const newPasswordEl = getElement('newPassword');
      const confirmPasswordEl = getElement('confirmPassword');
      if (currentPasswordEl) currentPasswordEl.value = '';
      if (newPasswordEl) newPasswordEl.value = '';
      if (confirmPasswordEl) confirmPasswordEl.value = '';

      dialog.showSuccessToast('تم تغيير كلمة المرور بنجاح');
    } catch (error) {
      console.error('❌ [USER-SETTINGS] Failed to change password:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تغيير كلمة المرور.'
      });
      dialog.showError(`تعذر تغيير كلمة المرور: ${friendly}`, 'خطأ');
    }
  }

  async function handleSelectAllPermissions() {
    setAllPermissionCheckboxes(true);
  }

  async function handleClearAllPermissions() {
    setAllPermissionCheckboxes(false);
  }

  async function handleSelectBackupLocation() {
    try {
      console.log('📁 [SETTINGS] اختيار مجلد النسخ الاحتياطي...');

      const result = await ipcRenderer.invoke('select-directory', {
        title: 'اختر مجلد النسخ الاحتياطي',
        defaultPath: ''
      });

      if (!result.success || !result.filePath) {
        console.log('ℹ️ [SETTINGS] تم إلغاء اختيار مجلد النسخ الاحتياطي');
        return;
      }

      const autoBackupValue = getElement('autoBackup')?.value || 'disabled';
      const selectedPath = result.filePath;
      const backupLocationField = getElement('backupLocation');
      if (backupLocationField) backupLocationField.value = selectedPath;

      await saveDatabaseBackupSettings(autoBackupValue, selectedPath);
      await refreshDatabaseStatsUI();
      const autoCheckResult = await runImmediateAutoBackupCheckIfEnabled(
        autoBackupValue,
        selectedPath,
        'backup-location-change'
      );

      console.log('✅ [SETTINGS] تم حفظ مجلد النسخ الاحتياطي:', selectedPath);
      if (autoCheckResult && autoCheckResult.success === false) {
        const friendly = mapDbErrorMessage(autoCheckResult.error, {
          fallback: 'خطأ غير معروف'
        });
        getDialogUtils().showErrorToast(`تم حفظ المجلد لكن فشل التحقق الفوري للنسخ التلقائي: ${friendly}`);
      }
      getDialogUtils().showSuccess('تم حفظ مجلد النسخ الاحتياطي بنجاح');
    } catch (error) {
      console.error('❌ [SETTINGS] خطأ في اختيار مجلد النسخ الاحتياطي:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر اختيار مجلد النسخ الاحتياطي.'
      });
      getDialogUtils().showError(`حدث خطأ في اختيار مجلد النسخ الاحتياطي: ${friendly}`);
    }
  }

  async function handleAutoBackupChange() {
    try {
      const autoBackupSelect = getElement('autoBackup');
      const selectedValue = autoBackupSelect ? autoBackupSelect.value : 'disabled';
      const backupLocation = (getElement('backupLocation')?.value || '').trim();

      console.log('⚙️ [SETTINGS] تغيير تكرار النسخ الاحتياطي التلقائي:', selectedValue);

      await saveDatabaseBackupSettings(selectedValue, backupLocation);
      await refreshDatabaseStatsUI();
      const autoCheckResult = await runImmediateAutoBackupCheckIfEnabled(
        selectedValue,
        backupLocation,
        'backup-frequency-change'
      );

      const frequencyText = {
        disabled: 'معطل',
        daily: 'يومياً',
        weekly: 'أسبوعياً',
        monthly: 'شهرياً'
      };

      if (autoCheckResult && autoCheckResult.success === false) {
        const friendly = mapDbErrorMessage(autoCheckResult.error, {
          fallback: 'خطأ غير معروف'
        });
        getDialogUtils().showErrorToast(`تم حفظ التكرار لكن فشل التحقق الفوري للنسخ التلقائي: ${friendly}`);
      }

      const updatedMessage = autoCheckResult && autoCheckResult.created
        ? `تم تحديث النسخ الاحتياطي التلقائي: ${frequencyText[selectedValue] || selectedValue} (تم إنشاء نسخة فورية)`
        : `تم تحديث النسخ الاحتياطي التلقائي: ${frequencyText[selectedValue] || selectedValue}`;
      getDialogUtils().showSuccessToast(updatedMessage);
    } catch (error) {
      console.error('❌ [SETTINGS] خطأ في حفظ إعداد النسخ الاحتياطي التلقائي:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ في حفظ الإعداد'
        })
      );
    }
  }

  return {
    handleTestPrintSettings,
    handleExportData,
    handleOptimizeDatabase,
    handleRepairDatabase,
    handleAnalyzeDatabase,
    handleLoadArchiveYears,
    handleArchiveYearChange,
    handleArchiveFiscalYear,
    handleArchiveBrowseYearChange,
    handleLoadArchivedReconciliations,
    handleArchiveBrowseSort,
    handleArchiveBrowseResetSort,
    handleArchiveBrowseSearch,
    handleArchiveBrowseClear,
    handleArchiveBrowsePrevPage,
    handleArchiveBrowseNextPage,
    handleRestoreArchivedYear,
    handleViewArchivedReconciliation,
    handleSaveDatabaseSettings,
    handleLoadUserPermissionsManager,
    handlePermissionsUserChange,
    handleSelectAllPermissions,
    handleClearAllPermissions,
    handleSaveUserSettings,
    handleChangePassword,
    handleSelectBackupLocation,
    handleAutoBackupChange
  };
}

module.exports = {
  createBackupRestoreSettingsActions
};
