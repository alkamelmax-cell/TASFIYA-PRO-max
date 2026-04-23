const { createReconciliationOperationsDataHandlers } = require('./reconciliation-operations-data');
const { createReconciliationOperationsDeleteHandlers } = require('./reconciliation-operations-delete');
const { createReconciliationOperationsViewHandlers } = require('./reconciliation-operations-view');
const { createReconciliationOperationsPrintHandlers } = require('./reconciliation-operations-print');

function createReconciliationOperationsHandlers(deps) {
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  const dataHandlers = createReconciliationOperationsDataHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    getSuppliers: deps.getSuppliers,
    logger
  });

  const deleteHandlers = createReconciliationOperationsDeleteHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    formatDate: deps.formatDate,
    loadSavedReconciliations: deps.loadSavedReconciliations || (async () => {}),
    logger
  });

  const viewHandlers = createReconciliationOperationsViewHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    logger
  });

  const printHandlers = createReconciliationOperationsPrintHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    showAdvancedPrintDialog: deps.showAdvancedPrintDialog || (async () => {}),
    loadReconciliationForPrint: deps.loadReconciliationForPrint || (async () => null),
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator || ((value) => value),
    prepareReconciliationDataById: dataHandlers.prepareReconciliationDataById,
    logger
  });

  windowObj.deleteReconciliation = deleteHandlers.deleteReconciliation;
  windowObj.viewReconciliation = viewHandlers.viewReconciliation;
  windowObj.printReconciliation = printHandlers.printReconciliation;
  windowObj.generatePDFReconciliation = printHandlers.generatePDFReconciliation;

  return {
    prepareReconciliationData: dataHandlers.prepareReconciliationData,
    prepareReconciliationDataById: dataHandlers.prepareReconciliationDataById,
    deleteReconciliation: deleteHandlers.deleteReconciliation,
    viewReconciliation: viewHandlers.viewReconciliation,
    printReconciliation: printHandlers.printReconciliation,
    generatePDFReconciliation: printHandlers.generatePDFReconciliation
  };
}

module.exports = {
  createReconciliationOperationsHandlers
};
