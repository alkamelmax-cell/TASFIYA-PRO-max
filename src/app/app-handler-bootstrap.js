const { createCustomerDropdownLoader } = require('./customer-dropdowns');
const { createSupplierDropdownLoader } = require('./supplier-dropdowns');
const { createReconciliationHandlers } = require('./reconciliation-handlers');
const { createEditFormHelpers } = require('./edit-form-helpers');
const { createEditTableHandlers } = require('./edit-table-handlers');
const { createReconciliationDataEntryHandlers } = require('./reconciliation-data-entry');

function createAppHandlerBootstrap(deps) {
  const logger = deps.logger || console;
  const state = deps.state;

  let editMode = {
    isActive: false,
    reconciliationId: null,
    originalData: null,
    initialSnapshot: null
  };

  let editSessionHandlers = null;
  let appModules = null;

  const loadCustomersForDropdowns = createCustomerDropdownLoader({
    ipcRenderer: deps.ipcRenderer,
    document: deps.document,
    logger
  });

  const loadSuppliersForDropdowns = createSupplierDropdownLoader({
    ipcRenderer: deps.ipcRenderer,
    document: deps.document,
    logger
  });

  const reconciliationHandlers = createReconciliationHandlers({
    ipcRenderer: deps.ipcRenderer,
    document: deps.document,
    getDialogUtils: deps.getDialogUtils,
    getCurrentReconciliation: state.getCurrentReconciliation,
    loadCustomersForDropdowns,
    loadSuppliersForDropdowns,
    logger
  });

  const editFormHelpers = createEditFormHelpers({
    document: deps.document,
    getEditMode: () => editMode,
    logger
  });

  const editTableHandlers = createEditTableHandlers({
    document: deps.document,
    formatCurrency: deps.formatting.formatCurrency,
    getDialogUtils: deps.getDialogUtils,
    isEditModeActive: () => (editSessionHandlers ? editSessionHandlers.isEditModeActive() : false),
    getCurrentEditingReconciliationId: () => (
      editSessionHandlers ? editSessionHandlers.getCurrentEditingReconciliationId() : null
    ),
    getEditMode: () => editMode,
    onEditBankReceipt: (index) => editSessionHandlers?.editEditBankReceipt(index),
    onEditCashReceipt: (index) => editSessionHandlers?.editEditCashReceipt(index),
    onEditPostpaidSale: (index) => editSessionHandlers?.editEditPostpaidSale(index),
    onEditCustomerReceipt: (index) => editSessionHandlers?.editEditCustomerReceipt(index),
    onEditReturnInvoice: (index) => editSessionHandlers?.editEditReturnInvoice(index),
    onEditSupplier: (index) => editSessionHandlers?.editEditSupplier(index),
    onDeleteBankReceipt: (index) => editSessionHandlers?.deleteEditBankReceipt(index),
    onDeleteCashReceipt: (index) => editSessionHandlers?.deleteEditCashReceipt(index),
    onDeletePostpaidSale: (index) => editSessionHandlers?.deleteEditPostpaidSale(index),
    onDeleteCustomerReceipt: (index) => editSessionHandlers?.deleteEditCustomerReceipt(index),
    onDeleteReturnInvoice: (index) => editSessionHandlers?.deleteEditReturnInvoice(index),
    onDeleteSupplier: (index) => editSessionHandlers?.deleteEditSupplier(index),
    onResetEditMode: () => editSessionHandlers?.resetEditMode()
  });

  const dataEntryHandlers = createReconciliationDataEntryHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    formNavigation: deps.formNavigation,
    formatCurrency: deps.formatting.formatCurrency,
    getCurrentReconciliation: state.getCurrentReconciliation,
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
    updateSummary: (...args) => appModules?.reconciliationUiHandlers?.updateSummary?.(...args),
    windowObj: deps.windowObj,
    logger
  });

  return {
    shellDeps: {
      loadCustomersForDropdowns,
      loadSuppliersForDropdowns,
      handleBranchChange: reconciliationHandlers.handleBranchChange,
      handleOperationTypeChange: reconciliationHandlers.handleOperationTypeChange,
      handleEditOperationTypeChange: reconciliationHandlers.handleEditOperationTypeChange,
      showError: reconciliationHandlers.showError
    },
    editDeps: {
      validateEditForm: editFormHelpers.validateEditForm,
      collectEditFormData: editFormHelpers.collectEditFormData,
      getCurrentUser: state.getCurrentUser,
      getEditMode: () => editMode,
      setEditSessionHandlers: (handlers) => {
        editSessionHandlers = handlers;
      }
    },
    dataEntryHandlers,
    editTableHandlers,
    setAppModules: (modules) => {
      appModules = modules;
    }
  };
}

module.exports = {
  createAppHandlerBootstrap
};
