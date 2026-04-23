const { createAppApi } = require('./app-api');

function initializeAppRuntime(deps) {
  const document = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const ipcRenderer = deps.ipcRenderer;
  const logger = deps.logger || console;
  const EventCtor = deps.EventCtor || Event;

  // Keep connection manager side-effects loaded at runtime bootstrap.
  require('../connection-manager');

  document.addEventListener('DOMContentLoaded', () => {
    deps.initializeApp();

    const OfflineStorage = require('../offline-storage');
    OfflineStorage.initConnectionListeners();
  });

  windowObj.testPrintDataStructure = deps.testPrintDataStructure;
  windowObj.testPrintDialog = deps.testPrintDialog;
  windowObj.testNewReconciliationPrintSystem = deps.testNewReconciliationPrintSystem;

  windowObj.appAPI = createAppApi({
    document,
    ipcRenderer,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    setBankReceipts: deps.setBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    setCashReceipts: deps.setCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    setPostpaidSales: deps.setPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    setCustomerReceipts: deps.setCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    setReturnInvoices: deps.setReturnInvoices,
    getSuppliers: deps.getSuppliers,
    setSuppliers: deps.setSuppliers,
    updateBankReceiptsTable: deps.updateBankReceiptsTable,
    updateCashReceiptsTable: deps.updateCashReceiptsTable,
    updatePostpaidSalesTable: deps.updatePostpaidSalesTable,
    updateCustomerReceiptsTable: deps.updateCustomerReceiptsTable,
    updateReturnInvoicesTable: deps.updateReturnInvoicesTable,
    updateSuppliersTable: deps.updateSuppliersTable,
    updateSummary: deps.updateSummary,
    logger,
    EventCtor
  });

  logger.log('✅ AppAPI exposed for external modules');
  logger.log('✅ Full AppAPI extensions loaded');

  if (windowObj.appAPI) {
    windowObj.appAPI.resetSystem = deps.resetSystemToNewReconciliationState;
  }

  return {
    appAPI: windowObj.appAPI
  };
}

module.exports = {
  initializeAppRuntime
};
