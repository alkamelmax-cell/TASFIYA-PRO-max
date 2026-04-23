const { createEditSessionItemAddActions } = require('./edit-session-item-add-actions');
const { createEditSessionItemEditActions } = require('./edit-session-item-edit-actions');
const { createEditSessionItemDeleteActions } = require('./edit-session-item-delete-actions');

function createEditSessionItemActions(deps) {
  const document = deps.document;
  const bootstrap = deps.bootstrap;
  const DialogUtils = deps.DialogUtils;
  const isEditModeActive = deps.isEditModeActive;
  const editMode = deps.editMode;
  const dataHelpers = deps.dataHelpers;

  let editItemData = {
    type: null,
    index: null,
    isEdit: false
  };

  function setEditItemState(type, index, isEdit) {
    editItemData = { type, index, isEdit };
  }

  function getEditItemData() {
    return editItemData;
  }

  function showEditModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement) return;

    // Keep nested edit modals at document root to avoid backdrop layering bugs.
    if (modalElement.parentElement !== document.body) {
      document.body.appendChild(modalElement);
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
  }

  function getCurrentEditData(type, index) {
    return dataHelpers.getCurrentEditData(type, index);
  }

  function deleteItemFromEditData(type, index) {
    return dataHelpers.deleteItemFromEditData(type, index);
  }

  function addOrUpdateEditData(type, data, index = null) {
    return dataHelpers.addOrUpdateEditData(type, data, index);
  }

  const addActions = createEditSessionItemAddActions({
    document,
    ipcRenderer: deps.ipcRenderer,
    editMode,
    setEditItemState,
    showEditModal
  });

  const editActions = createEditSessionItemEditActions({
    document,
    DialogUtils,
    isEditModeActive,
    setEditItemState,
    showEditModal,
    getCurrentEditData,
    populateCustomersInSelect: addActions.populateCustomersInSelect
  });

  const deleteActions = createEditSessionItemDeleteActions({
    DialogUtils,
    deleteItemFromEditData,
    editMode,
    updateEditTotals: deps.updateEditTotals,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable
  });

  return {
    addEditBankReceipt: addActions.addEditBankReceipt,
    addEditCashReceipt: addActions.addEditCashReceipt,
    populateCustomersInSelect: addActions.populateCustomersInSelect,
    addEditPostpaidSale: addActions.addEditPostpaidSale,
    addEditCustomerReceipt: addActions.addEditCustomerReceipt,
    addEditReturnInvoice: addActions.addEditReturnInvoice,
    addEditSupplier: addActions.addEditSupplier,
    editEditBankReceipt: editActions.editEditBankReceipt,
    editEditCashReceipt: editActions.editEditCashReceipt,
    editEditPostpaidSale: editActions.editEditPostpaidSale,
    editEditCustomerReceipt: editActions.editEditCustomerReceipt,
    editEditReturnInvoice: editActions.editEditReturnInvoice,
    editEditSupplier: editActions.editEditSupplier,
    deleteEditBankReceipt: deleteActions.deleteEditBankReceipt,
    deleteEditCashReceipt: deleteActions.deleteEditCashReceipt,
    deleteEditPostpaidSale: deleteActions.deleteEditPostpaidSale,
    deleteEditCustomerReceipt: deleteActions.deleteEditCustomerReceipt,
    deleteEditReturnInvoice: deleteActions.deleteEditReturnInvoice,
    deleteEditSupplier: deleteActions.deleteEditSupplier,
    getCurrentEditData,
    deleteItemFromEditData,
    addOrUpdateEditData,
    getEditItemData
  };
}

module.exports = {
  createEditSessionItemActions
};
