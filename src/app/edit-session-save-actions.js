const { createEditSessionSaveBankCashActions } = require('./edit-session-save-bank-cash-actions');
const { createEditSessionSaveCustomerActions } = require('./edit-session-save-customer-actions');

function createEditSessionSaveActions(deps) {
  const document = deps.document;
  const bootstrap = deps.bootstrap;

  function hideModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement) return;

    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) {
      modal.hide();
      return;
    }

    modalElement.classList.remove('show');
    modalElement.style.display = 'none';
    modalElement.setAttribute('aria-hidden', 'true');
  }

  const bankCashActions = createEditSessionSaveBankCashActions({
    document,
    DialogUtils: deps.DialogUtils,
    editMode: deps.editMode,
    getEditItemData: deps.getEditItemData,
    addOrUpdateEditData: deps.addOrUpdateEditData,
    updateEditTotals: deps.updateEditTotals,
    updateEditProgress: deps.updateEditProgress,
    hideModal,
    populateEditBankReceiptsTable: deps.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: deps.populateEditCashReceiptsTable
  });

  const customerActions = createEditSessionSaveCustomerActions({
    document,
    DialogUtils: deps.DialogUtils,
    isExistingCustomer: deps.isExistingCustomer,
    isExistingCustomerInBranch: deps.isExistingCustomerInBranch,
    isExistingSupplier: deps.isExistingSupplier,
    isExistingSupplierInBranch: deps.isExistingSupplierInBranch,
    editMode: deps.editMode,
    getEditItemData: deps.getEditItemData,
    addOrUpdateEditData: deps.addOrUpdateEditData,
    updateEditTotals: deps.updateEditTotals,
    hideModal,
    populateEditPostpaidSalesTable: deps.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: deps.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: deps.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: deps.populateEditSuppliersTable
  });

  return {
    saveBankReceiptEdit: bankCashActions.saveBankReceiptEdit,
    saveCashReceiptEdit: bankCashActions.saveCashReceiptEdit,
    savePostpaidSaleEdit: customerActions.savePostpaidSaleEdit,
    saveCustomerReceiptEdit: customerActions.saveCustomerReceiptEdit,
    saveReturnInvoiceEdit: customerActions.saveReturnInvoiceEdit,
    saveSupplierEdit: customerActions.saveSupplierEdit
  };
}

module.exports = {
  createEditSessionSaveActions
};
