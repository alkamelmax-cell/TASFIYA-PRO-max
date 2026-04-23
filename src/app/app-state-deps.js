function createReconciliationStateDeps(state) {
  return {
    getCurrentUser: state.getCurrentUser,
    setCurrentUser: state.setCurrentUser,
    getCurrentReconciliation: state.getCurrentReconciliation,
    setCurrentReconciliation: state.setCurrentReconciliation,
    getBankReceipts: state.getBankReceipts,
    setBankReceipts: state.setBankReceipts,
    getCashReceipts: state.getCashReceipts,
    setCashReceipts: state.setCashReceipts,
    getPostpaidSales: state.getPostpaidSales,
    setPostpaidSales: state.setPostpaidSales,
    getCustomerReceipts: state.getCustomerReceipts,
    setCustomerReceipts: state.setCustomerReceipts,
    getReturnInvoices: state.getReturnInvoices,
    setReturnInvoices: state.setReturnInvoices,
    getSuppliers: state.getSuppliers,
    setSuppliers: state.setSuppliers,
    getDataCounts: state.getDataCounts
  };
}

function createPrintRuntimeStateDeps(state) {
  return {
    getCurrentPrintReconciliation: state.getCurrentPrintReconciliation,
    setCurrentPrintReconciliation: state.setCurrentPrintReconciliation,
    getAvailablePrinters: state.getAvailablePrinters,
    setAvailablePrinters: state.setAvailablePrinters,
    getCurrentPrintData: state.getCurrentPrintData,
    setCurrentPrintData: state.setCurrentPrintData
  };
}

function createReconciliationTableUpdateDeps(dataEntryHandlers) {
  return {
    updateBankReceiptsTable: dataEntryHandlers.updateBankReceiptsTable,
    updateCashReceiptsTable: dataEntryHandlers.updateCashReceiptsTable,
    updatePostpaidSalesTable: dataEntryHandlers.updatePostpaidSalesTable,
    updateCustomerReceiptsTable: dataEntryHandlers.updateCustomerReceiptsTable,
    updateReturnInvoicesTable: dataEntryHandlers.updateReturnInvoicesTable,
    updateSuppliersTable: dataEntryHandlers.updateSuppliersTable
  };
}

module.exports = {
  createReconciliationStateDeps,
  createPrintRuntimeStateDeps,
  createReconciliationTableUpdateDeps
};
