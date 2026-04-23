const {
  parseStoredBankFeeSettings,
  calculateBankFeeBreakdown
} = require('./bank-fee-settings');
const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

const DETAILED_ATM_FEES_MODES = ['without_fees', 'with_fees'];
const DEFAULT_DETAILED_ATM_FEES_MODE = 'without_fees';
const REMEMBER_LAST_DETAILED_ATM_FEES_MODE = 'remember_last';

function createDetailedAtmReportDataHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const formatCurrency = context.formatCurrency;
  const formatDate = context.formatDate;
  const formatDateTime = context.formatDateTime;
  const logger = context.logger || console;

  function normalizeDetailedAtmFeesMode(value, fallback = DEFAULT_DETAILED_ATM_FEES_MODE) {
    return DETAILED_ATM_FEES_MODES.includes(value) ? value : fallback;
  }

  function normalizeDetailedAtmFeesModePreference(value) {
    if (value === REMEMBER_LAST_DETAILED_ATM_FEES_MODE) {
      return REMEMBER_LAST_DETAILED_ATM_FEES_MODE;
    }

    return normalizeDetailedAtmFeesMode(value);
  }

  function getDetailedFeesModeField() {
    return doc.getElementById('detailedFeesMode');
  }

  function setDetailedFeesModeValue(value) {
    const field = getDetailedFeesModeField();
    const normalizedValue = normalizeDetailedAtmFeesMode(value);
    if (field) {
      field.value = normalizedValue;
    }
    return normalizedValue;
  }

  async function loadDetailedAtmFeesModePreference() {
    try {
      const [defaultModeRow, lastModeRow] = await Promise.all([
        ipc.invoke(
          'db-get',
          `SELECT setting_value
           FROM system_settings
           WHERE category = ? AND setting_key = ?
           ORDER BY id DESC
           LIMIT 1`,
          ['reports', 'detailed_atm_fees_mode_default']
        ),
        ipc.invoke(
          'db-get',
          `SELECT setting_value
           FROM system_settings
           WHERE category = ? AND setting_key = ?
           ORDER BY id DESC
           LIMIT 1`,
          ['reports', 'detailed_atm_fees_mode_last']
        )
      ]);

      const defaultMode = normalizeDetailedAtmFeesModePreference(defaultModeRow && defaultModeRow.setting_value);
      const lastMode = normalizeDetailedAtmFeesMode(lastModeRow && lastModeRow.setting_value);
      const resolvedMode = defaultMode === REMEMBER_LAST_DETAILED_ATM_FEES_MODE
        ? lastMode
        : normalizeDetailedAtmFeesMode(defaultMode);

      return setDetailedFeesModeValue(resolvedMode);
    } catch (error) {
      logger.warn('⚠️ [DETAILED-ATM] تعذر تحميل وضع عرض الرسوم، سيتم استخدام الوضع الافتراضي', error);
      return setDetailedFeesModeValue(DEFAULT_DETAILED_ATM_FEES_MODE);
    }
  }

  async function persistDetailedAtmFeesModeSelection(mode = null) {
    const normalizedMode = normalizeDetailedAtmFeesMode(mode || getDetailedFeesModeField()?.value);

    try {
      await ipc.invoke(
        'db-run',
        `INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        ['reports', 'detailed_atm_fees_mode_last', normalizedMode]
      );
    } catch (error) {
      logger.warn('⚠️ [DETAILED-ATM] تعذر حفظ آخر اختيار لطريقة عرض الرسوم', error);
    }

    return normalizedMode;
  }

  async function loadDetailedAtmReportFilters() {
    try {
      const atms = await ipc.invoke('db-query',
        `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.active = 1
             ORDER BY b.branch_name, a.name`
      );
      const atmSelect = doc.getElementById('detailedAtmFilter');
      atmSelect.innerHTML = '<option value="">جميع الأجهزة</option>';
      atms.forEach((atm) => {
        const option = doc.createElement('option');
        option.value = atm.id;
        option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
        atmSelect.appendChild(option);
      });

      const accountNumbers = await ipc.invoke('db-query',
        `SELECT DISTINCT location FROM atms WHERE active = 1 AND location IS NOT NULL AND location != '' ORDER BY location`
      );
      const accountSelect = doc.getElementById('detailedAccountNumberFilter');
      if (accountSelect) {
        accountSelect.innerHTML = '<option value="">جميع الحسابات</option>';
        accountNumbers.forEach((item) => {
          const option = doc.createElement('option');
          option.value = item.location;
          option.textContent = item.location;
          accountSelect.appendChild(option);
        });
      }

      const cashiers = await ipc.invoke('db-query', 'SELECT * FROM cashiers WHERE active = 1 ORDER BY name');
      const cashierSelect = doc.getElementById('detailedCashierFilter');
      cashierSelect.innerHTML = '<option value="">جميع الكاشيرين</option>';
      cashiers.forEach((cashier) => {
        const option = doc.createElement('option');
        option.value = cashier.id;
        option.textContent = `${cashier.name} (${cashier.cashier_number})`;
        cashierSelect.appendChild(option);
      });

      const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
      if (fiscalYearRange) {
        doc.getElementById('detailedDateFrom').value = fiscalYearRange.from;
        doc.getElementById('detailedDateTo').value = fiscalYearRange.to;
      } else {
        const today = new Date();
        const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

        doc.getElementById('detailedDateFrom').value = lastWeek.toISOString().split('T')[0];
        doc.getElementById('detailedDateTo').value = today.toISOString().split('T')[0];
      }

      await loadDetailedAtmFeesModePreference();
    } catch (error) {
      logger.error('Error loading detailed report filters:', error);
    }
  }

  function getDetailedAtmReportFilters() {
    return {
      atmId: doc.getElementById('detailedAtmFilter').value,
      accountNumber: doc.getElementById('detailedAccountNumberFilter').value,
      operationType: doc.getElementById('detailedOperationTypeFilter').value,
      cashierId: doc.getElementById('detailedCashierFilter').value,
      dateFrom: doc.getElementById('detailedDateFrom').value,
      dateTo: doc.getElementById('detailedDateTo').value,
      minAmount: parseFloat(doc.getElementById('detailedMinAmount').value) || 0,
      maxAmount: parseFloat(doc.getElementById('detailedMaxAmount').value) || null,
      feesMode: normalizeDetailedAtmFeesMode(doc.getElementById('detailedFeesMode')?.value)
    };
  }

  async function loadDetailedAtmBankFeeSettings() {
    try {
      const row = await ipc.invoke(
        'db-get',
        `SELECT setting_value
         FROM system_settings
         WHERE category = ? AND setting_key = ?
         ORDER BY id DESC
         LIMIT 1`,
        ['reports', 'bank_fee_rules_json']
      );

      return parseStoredBankFeeSettings(row && row.setting_value);
    } catch (error) {
      logger.warn('⚠️ [DETAILED-ATM] تعذر تحميل إعدادات الرسوم البنكية، سيتم استخدام القيم الافتراضية', error);
      return parseStoredBankFeeSettings();
    }
  }

  async function generateDetailedAtmReportData(filters) {
    logger.log('🏧 [DETAILED-ATM] توليد بيانات التقرير التحليلي المفصل...');

    const whereConditions = [];
    const params = [];

    whereConditions.push('DATE(r.reconciliation_date) BETWEEN ? AND ?');
    params.push(filters.dateFrom, filters.dateTo);

    if (filters.atmId) {
      whereConditions.push('br.atm_id = ?');
      params.push(filters.atmId);
    }

    if (filters.accountNumber) {
      whereConditions.push('a.location = ?');
      params.push(filters.accountNumber);
    }

    if (filters.operationType) {
      whereConditions.push('br.operation_type = ?');
      params.push(filters.operationType);
    }

    if (filters.cashierId) {
      whereConditions.push('r.cashier_id = ?');
      params.push(filters.cashierId);
    }

    const exactAmount = parseFloat(doc.getElementById('detailedExactAmount').value);

    if (!isNaN(exactAmount) && exactAmount > 0) {
      whereConditions.push('br.amount = ?');
      params.push(exactAmount);
    } else {
      if (filters.minAmount > 0) {
        whereConditions.push('br.amount >= ?');
        params.push(filters.minAmount);
      }

      if (filters.maxAmount && filters.maxAmount > 0) {
        whereConditions.push('br.amount <= ?');
        params.push(filters.maxAmount);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
        SELECT
            br.id as receipt_id,
            br.operation_type,
            br.amount,
            br.created_at as operation_datetime,
            a.id as atm_id,
            a.name as atm_name,
            a.location as atm_location,
            a.bank_name,
            b.branch_name as atm_branch_name,
            c.id as cashier_id,
            c.name as cashier_name,
            c.cashier_number,
            r.id as reconciliation_id,
            r.reconciliation_number,
            r.reconciliation_date,
            r.created_at as reconciliation_created_at
        FROM bank_receipts br
        INNER JOIN atms a ON br.atm_id = a.id
        LEFT JOIN branches b ON a.branch_id = b.id
        INNER JOIN reconciliations r ON br.reconciliation_id = r.id
        INNER JOIN cashiers c ON r.cashier_id = c.id
        ${whereClause}
        ORDER BY br.created_at DESC, br.id DESC
    `;

    logger.log('🔍 [DETAILED-ATM] استعلام قاعدة البيانات:', query);
    logger.log('🔍 [DETAILED-ATM] معاملات الاستعلام:', params);

    const [results, bankFeeSettings] = await Promise.all([
      ipc.invoke('db-all', query, params),
      loadDetailedAtmBankFeeSettings()
    ]);

    logger.log(`📊 [DETAILED-ATM] تم العثور على ${results.length} عملية`);

    return results.map((row) => {
      const breakdown = calculateBankFeeBreakdown(
        row.amount,
        row.bank_name,
        row.operation_type,
        bankFeeSettings
      );

      return {
        ...row,
        gross_amount: breakdown.grossAmount,
        fee_percent: breakdown.feePercent,
        fee_amount: breakdown.feeAmount,
        fee_vat_percent: breakdown.feeVatPercent,
        fee_vat_amount: breakdown.feeVatAmount,
        total_deductions: breakdown.totalDeductions,
        net_amount: breakdown.netAmount,
        formatted_amount: formatCurrency(row.amount),
        formatted_gross_amount: formatCurrency(breakdown.grossAmount),
        formatted_fee_amount: formatCurrency(breakdown.feeAmount),
        formatted_fee_vat_amount: formatCurrency(breakdown.feeVatAmount),
        formatted_net_amount: formatCurrency(breakdown.netAmount),
        formatted_datetime: formatDateTime(row.operation_datetime),
        formatted_date: formatDate(row.reconciliation_date)
      };
    });
  }

  return {
    loadDetailedAtmReportFilters,
    getDetailedAtmReportFilters,
    persistDetailedAtmFeesModeSelection,
    generateDetailedAtmReportData
  };
}

module.exports = {
  createDetailedAtmReportDataHandlers
};
