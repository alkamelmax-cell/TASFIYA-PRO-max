const { createEditSessionHandlers } = require('./edit-session-handlers');
const { createEditModalPopulationHandlers } = require('./edit-modal-population');
const { createEditReconciliationLoader } = require('./edit-reconciliation-loader');
const { createSettingsUiLoader } = require('./settings-ui-loader');

function initializeAppEditRuntimeBootstrap(deps) {
  const windowObj = deps.windowObj || globalThis;

  const sessionHandlers = createEditSessionHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    validateEditForm: deps.validateEditForm,
    collectEditFormData: deps.collectEditFormData,
    loadSavedReconciliations: (...args) => deps.getLoadSavedReconciliations()(...args),
    updateEditTotals: deps.updateEditTotals,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable,
    isExistingCustomer: deps.isExistingCustomer,
    isExistingCustomerInBranch: deps.isExistingCustomerInBranch,
    isExistingSupplier: deps.isExistingSupplier,
    isExistingSupplierInBranch: deps.isExistingSupplierInBranch,
    getCurrentUser: deps.getCurrentUser,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    setBankReceipts: deps.setBankReceipts,
    setCashReceipts: deps.setCashReceipts,
    setPostpaidSales: deps.setPostpaidSales,
    setCustomerReceipts: deps.setCustomerReceipts,
    setReturnInvoices: deps.setReturnInvoices,
    setSuppliers: deps.setSuppliers,
    setTimeoutFn: deps.setTimeoutFn,
    getEditMode: deps.getEditMode
  });

  const {
    handleEditError,
    updateEditProgress
  } = sessionHandlers;

  const { populateEditModal } = createEditModalPopulationHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    formatDate: deps.formatDate,
    EventCtor: deps.EventCtor,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable,
    updateEditTotals: deps.updateEditTotals,
    updateEditProgress,
    logger: deps.logger
  });

  const {
    editReconciliationNew,
    fetchReconciliationForEdit
  } = createEditReconciliationLoader({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    getEditMode: deps.getEditMode,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    updateButtonStates: (...args) => deps.getUpdateButtonStates()(...args),
    populateEditModal,
    handleEditError,
    setTimeoutFn: deps.setTimeoutFn,
    logger: deps.logger
  });

  windowObj.editReconciliationNew = editReconciliationNew;

  const { loadAllSettings } = createSettingsUiLoader({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    applyTheme: (...args) => deps.getApplyTheme()(...args),
    logger: deps.logger
  });

  return {
    sessionHandlers,
    handleEditError,
    updateEditProgress,
    populateEditModal,
    editReconciliationNew,
    fetchReconciliationForEdit,
    loadAllSettings
  };
}

module.exports = {
  initializeAppEditRuntimeBootstrap
};
