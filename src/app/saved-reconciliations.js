const { createSavedReconciliationsRenderHandlers } = require('./saved-reconciliations-render');
const { createSavedReconciliationsSearchHandlers } = require('./saved-reconciliations-search');
const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

function createSavedReconciliationsHandlers(deps) {
  const ipc = deps.ipcRenderer;
  const logger = deps.logger || console;
  const windowObj = deps.windowObj || globalThis;

  const state = {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1
  };

  const renderHandlers = createSavedReconciliationsRenderHandlers({
    document: deps.document,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    state
  });

  async function loadSavedReconciliations(page = 1) {
    try {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
      let whereSql = '';
      const whereParams = [];
      if (fiscalYearRange) {
        whereSql = 'WHERE DATE(r.reconciliation_date) BETWEEN ? AND ?';
        whereParams.push(fiscalYearRange.from, fiscalYearRange.to);
      }

      const countResult = await ipc.invoke(
        'db-query',
        `SELECT COUNT(*) as total FROM reconciliations r ${whereSql}`,
        whereParams
      );
      const totalRecords = countResult[0].total;
      state.totalPages = Math.ceil(totalRecords / state.pageSize);
      state.currentPage = safePage;

      const offset = (safePage - 1) * state.pageSize;
      const reconciliations = await ipc.invoke('db-query', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            LEFT JOIN branches b ON c.branch_id = b.id
            ${whereSql}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `, [...whereParams, state.pageSize, offset]);

      renderHandlers.displaySavedReconciliations(reconciliations);
      renderHandlers.renderSavedRecPagination(totalRecords);
    } catch (error) {
      logger.error('Error loading saved reconciliations:', error);
    }
  }

  const searchHandlers = createSavedReconciliationsSearchHandlers({
    document: deps.document,
    ipcRenderer: ipc,
    populateSelect: deps.populateSelect,
    getDialogUtils: deps.getDialogUtils || (() => deps.dialogUtils),
    displaySavedReconciliations: renderHandlers.displaySavedReconciliations,
    loadSavedReconciliations,
    logger
  });

  windowObj.loadSavedReconciliations = loadSavedReconciliations;

  return {
    loadSavedReconciliations,
    renderSavedRecPagination: renderHandlers.renderSavedRecPagination,
    loadSearchFilters: searchHandlers.loadSearchFilters,
    displaySavedReconciliations: renderHandlers.displaySavedReconciliations,
    handleSearchReconciliations: searchHandlers.handleSearchReconciliations,
    handleClearSearch: searchHandlers.handleClearSearch
  };
}

module.exports = {
  createSavedReconciliationsHandlers
};
