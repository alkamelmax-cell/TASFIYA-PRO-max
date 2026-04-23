const { createReconciliationSaveResetHandlers } = require('./reconciliation-save-reset');
const { initializeAppRuntime } = require('./app-runtime');

function finalizeAppInitialization(deps) {
  const saveResetHandlers = createReconciliationSaveResetHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    dialogUtils: deps.dialogUtils,
    windowObj: deps.windowObj,
    fetchFn: deps.fetchFn,
    logger: deps.logger,
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
    validateReconciliationBeforeSave: deps.validateReconciliationBeforeSave,
    formatCurrency: deps.formatCurrency,
    isSyncEnabled: deps.isSyncEnabled,
    updateBankReceiptsTable: deps.updateBankReceiptsTable,
    updateCashReceiptsTable: deps.updateCashReceiptsTable,
    updatePostpaidSalesTable: deps.updatePostpaidSalesTable,
    updateCustomerReceiptsTable: deps.updateCustomerReceiptsTable,
    updateReturnInvoicesTable: deps.updateReturnInvoicesTable,
    updateSuppliersTable: deps.updateSuppliersTable,
    updateSummary: deps.updateSummary,
    getResetSystemToNewReconciliationState: deps.getResetSystemToNewReconciliationState
  });

  initializeAppRuntime({
    document: deps.document,
    windowObj: deps.windowObj,
    ipcRenderer: deps.ipcRenderer,
    initializeApp: deps.initializeApp,
    testPrintDataStructure: deps.testPrintDataStructure,
    testPrintDialog: deps.testPrintDialog,
    testNewReconciliationPrintSystem: deps.testNewReconciliationPrintSystem,
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
    resetSystemToNewReconciliationState: deps.resetSystemToNewReconciliationState,
    EventCtor: deps.EventCtor,
    logger: deps.logger
  });

  return saveResetHandlers;
}

module.exports = {
  finalizeAppInitialization
};
