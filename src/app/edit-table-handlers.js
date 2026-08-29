const { createEditTableActionHandlers } = require('./edit-table-action-handlers');
const { createEditTablePopulators } = require('./edit-table-populators');
const { createEditTableTotalsHandlers } = require('./edit-table-totals');
const { createEditTableListeners } = require('./edit-table-listeners');

function createEditTableHandlers(deps) {
  const document = deps.document;
  const formatCurrency = deps.formatCurrency;
  const DialogUtils = deps.getDialogUtils();
  const isEditModeActive = deps.isEditModeActive;
  const getCurrentEditingReconciliationId = deps.getCurrentEditingReconciliationId;
  const getEditMode = deps.getEditMode;

  const actionHandlers = createEditTableActionHandlers({
    DialogUtils,
    isEditModeActive,
    getCurrentEditingReconciliationId,
    getEditMode,
    onEditBankReceipt: deps.onEditBankReceipt,
    onEditCashReceipt: deps.onEditCashReceipt,
    onEditPostpaidSale: deps.onEditPostpaidSale,
    onEditCustomerReceipt: deps.onEditCustomerReceipt,
    onEditReturnInvoice: deps.onEditReturnInvoice,
    onEditSupplier: deps.onEditSupplier,
    onDeleteBankReceipt: deps.onDeleteBankReceipt,
    onDeleteCashReceipt: deps.onDeleteCashReceipt,
    onDeletePostpaidSale: deps.onDeletePostpaidSale,
    onDeleteCustomerReceipt: deps.onDeleteCustomerReceipt,
    onDeleteReturnInvoice: deps.onDeleteReturnInvoice,
    onDeleteSupplier: deps.onDeleteSupplier,
    logger: console
  });

  const totalsHandlers = createEditTableTotalsHandlers({
    document,
    formatCurrency,
    logger: console
  });

  const tablePopulators = createEditTablePopulators({
    document,
    formatCurrency,
    addEditButtonListeners: actionHandlers.addEditButtonListeners,
    updateEditTotals: totalsHandlers.updateEditTotals,
    logger: console
  });

  const listenerHandlers = createEditTableListeners({
    document,
    formatCurrency,
    updateEditTotals: totalsHandlers.updateEditTotals,
    onResetEditMode: deps.onResetEditMode
  });

  return {
    populateEditBankReceiptsTable: tablePopulators.populateEditBankReceiptsTable,
    addEditButtonListeners: actionHandlers.addEditButtonListeners,
    handleEditAction: actionHandlers.handleEditAction,
    handleDeleteAction: actionHandlers.handleDeleteAction,
    populateEditCashReceiptsTable: tablePopulators.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: tablePopulators.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: tablePopulators.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: tablePopulators.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: tablePopulators.populateEditSuppliersTable,
    updateEditTotals: totalsHandlers.updateEditTotals,
    initializeEditModeEventListeners: listenerHandlers.initializeEditModeEventListeners,
    initializeModalAmountListeners: listenerHandlers.initializeModalAmountListeners,
    validateAmountField: listenerHandlers.validateAmountField,
    initializeCashCalculationListeners: listenerHandlers.initializeCashCalculationListeners
  };
}

module.exports = {
  createEditTableHandlers
};
