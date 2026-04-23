const { createEditSessionPersistence } = require('./edit-session-persistence');
const { createEditSessionDataHelpers } = require('./edit-session-data-helpers');
const { createEditSessionCoreActions } = require('./edit-session-core-actions');
const { createEditSessionItemActions } = require('./edit-session-item-actions');
const { createEditSessionSaveActions } = require('./edit-session-save-actions');

function createEditSessionHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const bootstrap = deps.getBootstrap();
  const DialogUtils = deps.getDialogUtils();
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const getEditMode = deps.getEditMode;

  const editMode = new Proxy({}, {
    get(_target, prop) {
      return getEditMode()[prop];
    },
    set(_target, prop, value) {
      getEditMode()[prop] = value;
      return true;
    }
  });

  const persistenceHandlers = createEditSessionPersistence({
    document,
    ipcRenderer,
    getEditMode: () => editMode,
    getCurrentUser: deps.getCurrentUser || (() => null),
    DialogUtils,
    logger: console
  });

  const dataHelpers = createEditSessionDataHelpers({
    document,
    getEditMode: () => editMode,
    setTimeoutFn,
    logger: console
  });

  const coreActions = createEditSessionCoreActions({
    document,
    bootstrap,
    DialogUtils,
    validateEditForm: deps.validateEditForm,
    collectEditFormData: deps.collectEditFormData,
    loadSavedReconciliations: deps.loadSavedReconciliations,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    setBankReceipts: deps.setBankReceipts,
    setCashReceipts: deps.setCashReceipts,
    setPostpaidSales: deps.setPostpaidSales,
    setCustomerReceipts: deps.setCustomerReceipts,
    setReturnInvoices: deps.setReturnInvoices,
    setSuppliers: deps.setSuppliers,
    editMode,
    persistenceHandlers
  });

  const itemActions = createEditSessionItemActions({
    document,
    ipcRenderer,
    bootstrap,
    DialogUtils,
    isEditModeActive: coreActions.isEditModeActive,
    editMode,
    dataHelpers,
    updateEditTotals: deps.updateEditTotals,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable
  });

  const saveActions = createEditSessionSaveActions({
    document,
    bootstrap,
    DialogUtils,
    isExistingCustomer: deps.isExistingCustomer,
    isExistingCustomerInBranch: deps.isExistingCustomerInBranch,
    isExistingSupplier: deps.isExistingSupplier,
    isExistingSupplierInBranch: deps.isExistingSupplierInBranch,
    editMode,
    getEditItemData: itemActions.getEditItemData,
    addOrUpdateEditData: itemActions.addOrUpdateEditData,
    updateEditTotals: deps.updateEditTotals,
    updateEditProgress: dataHelpers.updateEditProgress,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable
  });

  function updateEditProgress() {
    return dataHelpers.updateEditProgress();
  }

  function addSuccessHighlight(elementId) {
    return dataHelpers.addSuccessHighlight(elementId);
  }

  function setButtonLoading(button, loading) {
    return dataHelpers.setButtonLoading(button, loading);
  }

  return {
    resetEditMode: coreActions.resetEditMode,
    isEditModeActive: coreActions.isEditModeActive,
    getCurrentEditingReconciliationId: coreActions.getCurrentEditingReconciliationId,
    saveEditedReconciliation: coreActions.saveEditedReconciliation,
    updateReconciliationInDatabase: coreActions.updateReconciliationInDatabase,
    deleteExistingRecords: coreActions.deleteExistingRecords,
    insertUpdatedRecords: coreActions.insertUpdatedRecords,
    handleEditError: coreActions.handleEditError,
    validateEditModalState: coreActions.validateEditModalState,
    logEditOperation: coreActions.logEditOperation,
    addEditBankReceipt: itemActions.addEditBankReceipt,
    addEditCashReceipt: itemActions.addEditCashReceipt,
    populateCustomersInSelect: itemActions.populateCustomersInSelect,
    addEditPostpaidSale: itemActions.addEditPostpaidSale,
    addEditCustomerReceipt: itemActions.addEditCustomerReceipt,
    addEditReturnInvoice: itemActions.addEditReturnInvoice,
    addEditSupplier: itemActions.addEditSupplier,
    editEditBankReceipt: itemActions.editEditBankReceipt,
    editEditCashReceipt: itemActions.editEditCashReceipt,
    editEditPostpaidSale: itemActions.editEditPostpaidSale,
    editEditCustomerReceipt: itemActions.editEditCustomerReceipt,
    editEditReturnInvoice: itemActions.editEditReturnInvoice,
    editEditSupplier: itemActions.editEditSupplier,
    deleteEditBankReceipt: itemActions.deleteEditBankReceipt,
    deleteEditCashReceipt: itemActions.deleteEditCashReceipt,
    deleteEditPostpaidSale: itemActions.deleteEditPostpaidSale,
    deleteEditCustomerReceipt: itemActions.deleteEditCustomerReceipt,
    deleteEditReturnInvoice: itemActions.deleteEditReturnInvoice,
    deleteEditSupplier: itemActions.deleteEditSupplier,
    getCurrentEditData: itemActions.getCurrentEditData,
    deleteItemFromEditData: itemActions.deleteItemFromEditData,
    addOrUpdateEditData: itemActions.addOrUpdateEditData,
    saveBankReceiptEdit: saveActions.saveBankReceiptEdit,
    saveCashReceiptEdit: saveActions.saveCashReceiptEdit,
    savePostpaidSaleEdit: saveActions.savePostpaidSaleEdit,
    saveCustomerReceiptEdit: saveActions.saveCustomerReceiptEdit,
    saveReturnInvoiceEdit: saveActions.saveReturnInvoiceEdit,
    saveSupplierEdit: saveActions.saveSupplierEdit,
    updateEditProgress,
    addSuccessHighlight,
    setButtonLoading
  };
}

module.exports = {
  createEditSessionHandlers
};
