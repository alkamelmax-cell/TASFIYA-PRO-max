const { createReconciliationUiSummaryActions } = require('./reconciliation-ui-summary');
const { createReconciliationUiPrintActions } = require('./reconciliation-ui-print-actions');
const { createReconciliationUiMiscActions } = require('./reconciliation-ui-misc-actions');

function createReconciliationUiActions(deps) {
  const state = {
    isResetting: false
  };

  const context = {
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    DialogUtils: deps.getDialogUtils(),
    formatCurrency: deps.formatCurrency,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    getSuppliers: deps.getSuppliers,
    showPrintSectionDialogForNewReconciliation: deps.showPrintSectionDialogForNewReconciliation,
    prepareReconciliationData: deps.prepareReconciliationData,
    preparePrintData: deps.preparePrintData,
    clearAllReconciliationData: deps.clearAllReconciliationData,
    resetSystemToNewReconciliationState: deps.resetSystemToNewReconciliationState,
    loadSearchFilters: deps.loadSearchFilters,
    state,
    logger: deps.logger || console
  };

  const summaryActions = createReconciliationUiSummaryActions(context);
  const printActions = createReconciliationUiPrintActions(context);
  const miscActions = createReconciliationUiMiscActions(context);

  return {
    updateSummary: summaryActions.updateSummary,
    handlePrintReport: printActions.handlePrintReport,
    handleQuickPrint: printActions.handleQuickPrint,
    handleSavePdf: printActions.handleSavePdf,
    handleCancelFilter: miscActions.handleCancelFilter,
    handleCashierChange: miscActions.handleCashierChange,
    handleAtmChange: miscActions.handleAtmChange,
    loadReportFilters: miscActions.loadReportFilters
  };
}

module.exports = {
  createReconciliationUiActions
};
