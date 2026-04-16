function createSavedReconciliationsSearchHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const populateSelect = context.populateSelect;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const displaySavedReconciliations = context.displaySavedReconciliations;
  const loadSavedReconciliations = context.loadSavedReconciliations;
  const logger = context.logger || console;
  const {
    getSelectedFiscalYear,
    getFiscalYearDateRange,
    applyFiscalYearToDateInputs
  } = require('./fiscal-year');

  async function loadSearchFilters() {
    try {
      const branches = await ipc.invoke('db-query', 'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name');
      populateSelect('searchBranchFilter', branches, 'id', 'branch_name');

      const cashiers = await ipc.invoke('db-query', 'SELECT * FROM cashiers WHERE active = 1 ORDER BY name');
      populateSelect('searchCashierFilter', cashiers, 'id', 'name');
      populateSelect('reportCashierFilter', cashiers, 'id', 'name');

      applyFiscalYearToDateInputs(doc, 'searchDateFrom', 'searchDateTo', { force: true });
    } catch (error) {
      logger.error('Error loading search filters:', error);
    }
  }

  async function handleSearchReconciliations() {
    try {
      const branchId = doc.getElementById('searchBranchFilter')?.value;
      const cashierId = doc.getElementById('searchCashierFilter')?.value;
      const dateFrom = doc.getElementById('searchDateFrom')?.value;
      const dateTo = doc.getElementById('searchDateTo')?.value;
      const status = doc.getElementById('searchStatus')?.value;
      const reconciliationNumberRaw = doc.getElementById('searchReconciliationNumber')?.value?.trim();

      let query = `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;
      const params = [];

      if (branchId) {
        query += ' AND b.id = ?';
        params.push(branchId);
      }

      if (cashierId) {
        query += ' AND r.cashier_id = ?';
        params.push(cashierId);
      }

      if (dateFrom) {
        query += ' AND r.reconciliation_date >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        query += ' AND r.reconciliation_date <= ?';
        params.push(dateTo);
      }

      if (status) {
        query += ' AND r.status = ?';
        params.push(status);
      }

      if (reconciliationNumberRaw) {
        const reconciliationNumber = parseInt(reconciliationNumberRaw, 10);
        if (!Number.isNaN(reconciliationNumber) && reconciliationNumber > 0) {
          query += ' AND r.reconciliation_number = ?';
          params.push(reconciliationNumber);
        }
      }

      const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
      if (fiscalYearRange) {
        query += ' AND DATE(r.reconciliation_date) BETWEEN ? AND ?';
        params.push(fiscalYearRange.from, fiscalYearRange.to);
      }

      query += ' ORDER BY r.created_at DESC';

      const reconciliations = await ipc.invoke('db-query', query, params);
      displaySavedReconciliations(reconciliations);
    } catch (error) {
      logger.error('Error searching reconciliations:', error);
      const dialogUtils = getDialogUtils();
      dialogUtils?.showErrorToast('حدث خطأ أثناء البحث');
    }
  }

  function handleClearSearch() {
    const branchFilter = doc.getElementById('searchBranchFilter');
    const cashierFilter = doc.getElementById('searchCashierFilter');
    const dateFromFilter = doc.getElementById('searchDateFrom');
    const dateToFilter = doc.getElementById('searchDateTo');
    const statusFilter = doc.getElementById('searchStatus');
    const reconciliationNumberFilter = doc.getElementById('searchReconciliationNumber');

    if (branchFilter) branchFilter.value = '';
    if (cashierFilter) cashierFilter.value = '';
    if (dateFromFilter) dateFromFilter.value = '';
    if (dateToFilter) dateToFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (reconciliationNumberFilter) reconciliationNumberFilter.value = '';

    loadSavedReconciliations();
  }

  return {
    loadSearchFilters,
    handleSearchReconciliations,
    handleClearSearch
  };
}

module.exports = {
  createSavedReconciliationsSearchHandlers
};
