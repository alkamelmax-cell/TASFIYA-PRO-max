const { createReconciliationDataEntryPostpaidHandlers } = require('./reconciliation-data-entry-postpaid');
const { createReconciliationDataEntryCustomerHandlers } = require('./reconciliation-data-entry-customer');

function createReconciliationDataEntrySalesHandlers(context) {
  const commonContext = {
    document: context.document,
    ipcRenderer: context.ipcRenderer,
    DialogUtils: context.DialogUtils,
    formNavigation: context.formNavigation,
    formatCurrency: context.formatCurrency,
    updateSummary: context.updateSummary,
    logger: context.logger || console,
    ensureCurrentReconciliation: context.ensureCurrentReconciliation,
    getArraySafe: context.getArraySafe,
    setArray: context.setArray,
    isExistingCustomer: context.isExistingCustomer,
    isExistingCustomerInBranch: context.isExistingCustomerInBranch,
    resolveReconciliationBranchId: context.resolveReconciliationBranchId
  };

  const postpaidHandlers = createReconciliationDataEntryPostpaidHandlers({
    ...commonContext,
    getPostpaidSales: context.getPostpaidSales,
    setPostpaidSales: context.setPostpaidSales
  });

  const customerHandlers = createReconciliationDataEntryCustomerHandlers({
    ...commonContext,
    getCustomerReceipts: context.getCustomerReceipts,
    setCustomerReceipts: context.setCustomerReceipts
  });

  return {
    handlePostpaidSale: postpaidHandlers.handlePostpaidSale,
    updatePostpaidSalesTable: postpaidHandlers.updatePostpaidSalesTable,
    editPostpaidSale: postpaidHandlers.editPostpaidSale,
    removePostpaidSale: postpaidHandlers.removePostpaidSale,
    cancelPostpaidSaleEdit: postpaidHandlers.cancelPostpaidSaleEdit,
    handleCustomerReceipt: customerHandlers.handleCustomerReceipt,
    updateCustomerReceiptsTable: customerHandlers.updateCustomerReceiptsTable,
    editCustomerReceipt: customerHandlers.editCustomerReceipt,
    removeCustomerReceipt: customerHandlers.removeCustomerReceipt,
    cancelCustomerReceiptEdit: customerHandlers.cancelCustomerReceiptEdit
  };
}

module.exports = {
  createReconciliationDataEntrySalesHandlers
};
