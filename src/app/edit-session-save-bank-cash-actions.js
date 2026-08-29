function createEditSessionSaveBankCashActions(deps) {
  const document = deps.document;
  const DialogUtils = deps.DialogUtils;
  const editMode = deps.editMode;
  const getEditItemData = deps.getEditItemData;
  const addOrUpdateEditData = deps.addOrUpdateEditData;
  const updateEditTotals = deps.updateEditTotals;
  const updateEditProgress = deps.updateEditProgress;
  const hideModal = deps.hideModal;
  const populateEditBankReceiptsTable = deps.populateEditBankReceiptsTable;
  const populateEditCashReceiptsTable = deps.populateEditCashReceiptsTable;

  function getEditIndex() {
    const editItemData = getEditItemData();
    return editItemData.isEdit ? editItemData.index : null;
  }

  function saveBankReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال البنك...');

    const form = document.getElementById('bankReceiptEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const operationType = document.getElementById('editOperationType').value.trim();
    const atmId = document.getElementById('editAtmSelect').value;
    const bankName = document.getElementById('editBankName').value.trim();
    const amount = parseFloat(document.getElementById('bankReceiptAmount').value) || 0;

    const data = {
      operation_type: operationType,
      atm_id: operationType === 'تحويل' ? null : atmId,
      bank_name: operationType === 'تحويل' ? 'تحويل' : bankName,
      amount
    };

    if (operationType === 'تحويل') {
      data.atm_name = 'تحويل';
    }

    if (!data.operation_type) {
      DialogUtils.showError('نوع العملية مطلوب', 'خطأ في البيانات');
      return;
    }

    if (data.operation_type !== 'تحويل' && !data.atm_id) {
      DialogUtils.showError('يجب اختيار الجهاز', 'خطأ في البيانات');
      return;
    }

    if (data.amount <= 0) {
      DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const editItemData = getEditItemData();
    addOrUpdateEditData('bankReceipts', data, getEditIndex());

    populateEditBankReceiptsTable(editMode.originalData.bankReceipts);
    updateEditTotals();
    updateEditProgress();

    hideModal('addEditBankReceiptModal');

    const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
    DialogUtils.showSuccessToast(message);
  }

  function saveCashReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال النقد...');

    const form = document.getElementById('cashReceiptEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const denomination = parseFloat(document.getElementById('editDenomination').value) || 0;
    const quantity = parseInt(document.getElementById('editQuantity').value, 10) || 0;
    const totalAmount = denomination * quantity;

    const data = {
      denomination,
      quantity,
      total_amount: totalAmount
    };

    if (data.denomination <= 0) {
      DialogUtils.showError('يجب اختيار فئة صحيحة', 'خطأ في البيانات');
      return;
    }

    if (data.quantity <= 0) {
      DialogUtils.showError('عدد الأوراق يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const editItemData = getEditItemData();
    addOrUpdateEditData('cashReceipts', data, getEditIndex());

    populateEditCashReceiptsTable(editMode.originalData.cashReceipts);
    updateEditTotals();

    hideModal('addEditCashReceiptModal');

    const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
    DialogUtils.showSuccessToast(message);
  }

  return {
    saveBankReceiptEdit,
    saveCashReceiptEdit
  };
}

module.exports = {
  createEditSessionSaveBankCashActions
};
