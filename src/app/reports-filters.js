const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

function createReportsFilterHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const populateState = context.state;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const logger = context.logger || console;
  let cachedCashiers = [];

  function parseOptionalNumber(value) {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getFilteredCashiersByBranch(branchId) {
    if (!branchId) {
      return cachedCashiers;
    }

    const normalizedBranchId = String(branchId);
    return cachedCashiers.filter((cashier) => String(cashier.branch_id || '') === normalizedBranchId);
  }

  function populateCashierFilterOptions(branchId = '', selectedCashierId = '') {
    const cashierSelect = doc.getElementById('reportCashierFilter');
    if (!cashierSelect) {
      return;
    }

    const filteredCashiers = getFilteredCashiersByBranch(branchId);
    cashierSelect.innerHTML = '<option value="">جميع الكاشير</option>';

    filteredCashiers.forEach((cashier) => {
      const option = doc.createElement('option');
      option.value = cashier.id;
      option.textContent = `${cashier.name} (${cashier.cashier_number})`;
      cashierSelect.appendChild(option);
    });

    const normalizedSelectedId = String(selectedCashierId || '');
    const canKeepSelection = normalizedSelectedId && filteredCashiers.some((cashier) => String(cashier.id) === normalizedSelectedId);
    cashierSelect.value = canKeepSelection ? normalizedSelectedId : '';
    cashierSelect.disabled = Boolean(branchId) && filteredCashiers.length === 0;
  }

  function handleReportBranchFilterChange() {
    const branchSelect = doc.getElementById('reportBranchFilter');
    const cashierSelect = doc.getElementById('reportCashierFilter');
    if (!cashierSelect) {
      return;
    }

    const selectedBranchId = branchSelect ? branchSelect.value : '';
    const selectedCashierId = cashierSelect.value;
    populateCashierFilterOptions(selectedBranchId, selectedCashierId);
  }

  async function loadAdvancedReportFilters() {
    try {
      const atms = await ipc.invoke('db-query',
        `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.active = 1
             ORDER BY b.branch_name, a.name`
      );

      const atmSelect = doc.getElementById('atmReportFilter');
      atmSelect.innerHTML = '<option value="">جميع الأجهزة</option>';
      atms.forEach((atm) => {
        const option = doc.createElement('option');
        option.value = atm.id;
        option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
        atmSelect.appendChild(option);
      });

      const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
      if (fiscalYearRange) {
        doc.getElementById('timeReportFrom').value = fiscalYearRange.from;
        doc.getElementById('timeReportTo').value = fiscalYearRange.to;
        doc.getElementById('atmReportFrom').value = fiscalYearRange.from;
        doc.getElementById('atmReportTo').value = fiscalYearRange.to;
      } else {
        const today = new Date();
        const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);

        doc.getElementById('timeReportFrom').value = lastWeek.toISOString().split('T')[0];
        doc.getElementById('timeReportTo').value = today.toISOString().split('T')[0];
        doc.getElementById('atmReportFrom').value = lastWeek.toISOString().split('T')[0];
        doc.getElementById('atmReportTo').value = today.toISOString().split('T')[0];
      }

      ['timeReportFrom', 'timeReportTo', 'atmReportFrom', 'atmReportTo'].forEach((inputId) => {
        const inputEl = doc.getElementById(inputId);
        if (inputEl) {
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    } catch (error) {
      logger.error('Error loading advanced report filters:', error);
    }
  }

  async function loadEnhancedReportFilters() {
    try {
      const branchSelect = doc.getElementById('reportBranchFilter');
      const cashierSelect = doc.getElementById('reportCashierFilter');
      const accountantSelect = doc.getElementById('reportAccountantFilter');
      const selectedBranchId = branchSelect ? branchSelect.value : '';
      const selectedCashierId = cashierSelect ? cashierSelect.value : '';
      const selectedAccountantId = accountantSelect ? accountantSelect.value : '';

      const branches = await ipc.invoke('db-all', 'SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name');
      if (branchSelect) {
        branchSelect.innerHTML = '<option value="">جميع الفروع</option>';
        branches.forEach((branch) => {
          const option = doc.createElement('option');
          option.value = branch.id;
          option.textContent = branch.branch_name;
          branchSelect.appendChild(option);
        });

        if (selectedBranchId && branches.some((branch) => String(branch.id) === String(selectedBranchId))) {
          branchSelect.value = String(selectedBranchId);
        }
      }

      const cashiers = await ipc.invoke(
        'db-all',
        'SELECT id, name, cashier_number, branch_id FROM cashiers WHERE active = 1 ORDER BY name'
      );
      cachedCashiers = Array.isArray(cashiers) ? cashiers : [];
      populateCashierFilterOptions(branchSelect ? branchSelect.value : '', selectedCashierId);

      const accountants = await ipc.invoke('db-all', 'SELECT id, name FROM accountants ORDER BY name');
      if (accountantSelect) {
        accountantSelect.innerHTML = '<option value="">جميع المحاسبين</option>';
        accountants.forEach((accountant) => {
          const option = doc.createElement('option');
          option.value = accountant.id;
          option.textContent = accountant.name;
          accountantSelect.appendChild(option);
        });

        if (selectedAccountantId && accountants.some((accountant) => String(accountant.id) === String(selectedAccountantId))) {
          accountantSelect.value = String(selectedAccountantId);
        }
      }

      await applyDefaultDateRangeIfEmpty();

      logger.log('✅ [REPORTS] تم تحميل مرشحات التقارير المحسنة بنجاح');
    } catch (error) {
      logger.error('❌ [REPORTS] خطأ في تحميل مرشحات التقارير:', error);
    }
  }

  async function applyDefaultDateRangeIfEmpty() {
    const dateFromField = doc.getElementById('reportDateFrom');
    const dateToField = doc.getElementById('reportDateTo');

    if (!dateFromField || !dateToField) {
      return;
    }

    if (dateFromField.value || dateToField.value) {
      return;
    }

    const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
    if (fiscalYearRange) {
      dateFromField.value = fiscalYearRange.from;
      dateToField.value = fiscalYearRange.to;
      return;
    }

    let rangeKey = 'week';
    try {
      const setting = await ipc.invoke(
        'db-get',
        'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?',
        ['reports', 'default_date_range']
      );
      if (setting && setting.setting_value) {
        rangeKey = setting.setting_value;
      }
    } catch (error) {
      logger.warn('⚠️ [REPORTS] تعذر قراءة النطاق الافتراضي، سيتم استخدام أسبوع', error);
    }

    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(endDate);

    switch (rangeKey) {
      case 'today':
        break;
      case 'month':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'quarter':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        startDate.setDate(startDate.getDate() - 365);
        break;
      case 'week':
      default:
        startDate.setDate(startDate.getDate() - 6);
        break;
    }

    dateFromField.value = startDate.toISOString().split('T')[0];
    dateToField.value = endDate.toISOString().split('T')[0];
  }

  function getReportFilters() {
    return {
      dateFrom: doc.getElementById('reportDateFrom').value,
      dateTo: doc.getElementById('reportDateTo').value,
      branchId: doc.getElementById('reportBranchFilter').value,
      cashierId: doc.getElementById('reportCashierFilter').value,
      accountantId: doc.getElementById('reportAccountantFilter').value,
      status: doc.getElementById('reportStatusFilter').value,
      minAmount: parseOptionalNumber(doc.getElementById('reportMinAmount').value),
      maxAmount: parseOptionalNumber(doc.getElementById('reportMaxAmount').value),
      searchText: doc.getElementById('reportSearchText').value.trim()
    };
  }

  function validateReportFilters(filters) {
    const errors = [];

    if (filters.dateFrom && filters.dateTo && new Date(filters.dateFrom) > new Date(filters.dateTo)) {
      errors.push('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية');
    }

    if (filters.minAmount !== null && filters.minAmount < 0) {
      errors.push('أقل مبلغ يجب أن يكون رقماً موجباً أو صفراً');
    }

    if (filters.maxAmount !== null && filters.maxAmount < 0) {
      errors.push('أعلى مبلغ يجب أن يكون رقماً موجباً أو صفراً');
    }

    if (
      filters.minAmount !== null &&
      filters.maxAmount !== null &&
      filters.minAmount > filters.maxAmount
    ) {
      errors.push('أقل مبلغ يجب أن يكون أقل من أو يساوي أعلى مبلغ');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  function buildReportQuery(filters) {
    let query = `
        SELECT r.*,
               c.name as cashier_name,
               c.cashier_number,
               a.name as accountant_name,
               b.branch_name
        FROM reconciliations r
        JOIN cashiers c ON r.cashier_id = c.id
        JOIN accountants a ON r.accountant_id = a.id
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE 1=1
    `;

    const params = [];

    if (filters.dateFrom) {
      query += ' AND DATE(r.reconciliation_date) >= ?';
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      query += ' AND DATE(r.reconciliation_date) <= ?';
      params.push(filters.dateTo);
    }
    if (filters.branchId) {
      query += ' AND c.branch_id = ?';
      params.push(filters.branchId);
    }
    if (filters.cashierId) {
      query += ' AND r.cashier_id = ?';
      params.push(filters.cashierId);
    }
    if (filters.accountantId) {
      query += ' AND r.accountant_id = ?';
      params.push(filters.accountantId);
    }
    if (filters.status) {
      query += ' AND r.status = ?';
      params.push(filters.status);
    }
    if (filters.minAmount !== null) {
      query += ' AND r.total_receipts >= ?';
      params.push(filters.minAmount);
    }
    if (filters.maxAmount !== null) {
      query += ' AND r.total_receipts <= ?';
      params.push(filters.maxAmount);
    }
    if (filters.searchText) {
      query += `
        AND (
          c.name LIKE ?
          OR c.cashier_number LIKE ?
          OR a.name LIKE ?
          OR b.branch_name LIKE ?
          OR CAST(COALESCE(r.reconciliation_number, '') AS TEXT) LIKE ?
          OR CAST(r.id AS TEXT) LIKE ?
        )
      `;
      const searchPattern = `%${filters.searchText}%`;
      params.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    query += ' ORDER BY r.reconciliation_date DESC, r.id DESC';
    return { query, params };
  }

  function handleClearReportFilters() {
    doc.getElementById('reportDateFrom').value = '';
    doc.getElementById('reportDateTo').value = '';
    doc.getElementById('reportBranchFilter').value = '';
    doc.getElementById('reportAccountantFilter').value = '';
    doc.getElementById('reportStatusFilter').value = '';
    doc.getElementById('reportMinAmount').value = '';
    doc.getElementById('reportMaxAmount').value = '';
    doc.getElementById('reportSearchText').value = '';

    populateCashierFilterOptions('', '');

    doc.getElementById('reportResultsCard').style.display = 'none';
    populateState.currentReportData = null;
    populateState.currentReportPage = 1;

    getDialogUtils().showSuccessToast('تم مسح جميع المرشحات');
  }

  return {
    loadAdvancedReportFilters,
    loadEnhancedReportFilters,
    handleReportBranchFilterChange,
    getReportFilters,
    validateReportFilters,
    buildReportQuery,
    handleClearReportFilters
  };
}

module.exports = {
  createReportsFilterHandlers
};
