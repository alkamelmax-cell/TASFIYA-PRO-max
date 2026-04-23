function createEditSessionItemDeleteActions(deps) {
  const DialogUtils = deps.DialogUtils;
  const deleteItemFromEditData = deps.deleteItemFromEditData;
  const editMode = deps.editMode;
  const updateEditTotals = deps.updateEditTotals;
  const populateEditBankReceiptsTable = deps.populateEditBankReceiptsTable;
  const populateEditCashReceiptsTable = deps.populateEditCashReceiptsTable;
  const populateEditPostpaidSalesTable = deps.populateEditPostpaidSalesTable;
  const populateEditCustomerReceiptsTable = deps.populateEditCustomerReceiptsTable;
  const populateEditReturnInvoicesTable = deps.populateEditReturnInvoicesTable;
  const populateEditSuppliersTable = deps.populateEditSuppliersTable;

  async function deleteEditBankReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال البنك:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذا الإيصال؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('bankReceipts', index);
      populateEditBankReceiptsTable(editMode.originalData.bankReceipts);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
  }

  async function deleteEditCashReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال النقد:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذا الإيصال؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('cashReceipts', index);
      populateEditCashReceiptsTable(editMode.originalData.cashReceipts);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
  }

  async function deleteEditPostpaidSale(index) {
    console.log('🗑️ [DELETE] حذف المبيعة الآجلة:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذه المبيعة؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('postpaidSales', index);
      populateEditPostpaidSalesTable(editMode.originalData.postpaidSales);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف المبيعة بنجاح');
    }
  }

  async function deleteEditCustomerReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال العميل:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذا الإيصال؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('customerReceipts', index);
      populateEditCustomerReceiptsTable(editMode.originalData.customerReceipts);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
  }

  async function deleteEditReturnInvoice(index) {
    console.log('🗑️ [DELETE] حذف فاتورة المرتجع:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذه الفاتورة؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('returnInvoices', index);
      populateEditReturnInvoicesTable(editMode.originalData.returnInvoices);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف الفاتورة بنجاح');
    }
  }

  async function deleteEditSupplier(index) {
    console.log('🗑️ [DELETE] حذف المورد:', index);

    const confirmed = await DialogUtils.showConfirm(
      'هل أنت متأكد من حذف هذا المورد؟',
      'تأكيد الحذف'
    );

    if (confirmed) {
      deleteItemFromEditData('suppliers', index);
      populateEditSuppliersTable(editMode.originalData.suppliers);
      updateEditTotals();
      DialogUtils.showSuccessToast('تم حذف المورد بنجاح');
    }
  }

  return {
    deleteEditBankReceipt,
    deleteEditCashReceipt,
    deleteEditPostpaidSale,
    deleteEditCustomerReceipt,
    deleteEditReturnInvoice,
    deleteEditSupplier
  };
}

module.exports = {
  createEditSessionItemDeleteActions
};
