const { mapDbErrorMessage } = require('./db-error-messages');

function createEditSessionItemEditActions(deps) {
  const document = deps.document;
  const DialogUtils = deps.DialogUtils;
  const isEditModeActive = deps.isEditModeActive;
  const setEditItemState = deps.setEditItemState;
  const showEditModal = deps.showEditModal;
  const getCurrentEditData = deps.getCurrentEditData;
  const populateCustomersInSelect = deps.populateCustomersInSelect;

  function editEditBankReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال البنك:', index);

    try {
      if (!isEditModeActive()) {
        console.error('❌ [EDIT] وضع التعديل غير نشط');
        DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
        return;
      }

      const data = getCurrentEditData('bankReceipts', index);
      if (!data) {
        console.error('❌ [EDIT] لم يتم العثور على البيانات للفهرس:', index);
        DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
        return;
      }

      setEditItemState('bankReceipt', index, true);

      document.getElementById('editOperationType').value = data.operation_type || '';
      document.getElementById('editAtmSelect').value = data.atm_id || '';
      document.getElementById('editBankName').value = data.bank_name || '';
      document.getElementById('bankReceiptAmount').value = data.amount || '';
      document.getElementById('bankReceiptModalTitle').textContent = 'تعديل مقبوضة بنكية';

      showEditModal('addEditBankReceiptModal');
      console.log('✅ [EDIT] تم فتح نافذة تعديل إيصال البنك بنجاح');
    } catch (error) {
      console.error('❌ [EDIT] خطأ في تعديل إيصال البنك:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تعديل الإيصال.'
      });
      DialogUtils.showError(`خطأ في تعديل الإيصال: ${friendly}`, 'خطأ في النظام');
    }
  }

  function editEditCashReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال النقد:', index);

    try {
      if (!isEditModeActive()) {
        console.error('❌ [EDIT] وضع التعديل غير نشط');
        DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
        return;
      }

      const data = getCurrentEditData('cashReceipts', index);
      if (!data) {
        console.error('❌ [EDIT] لم يتم العثور على البيانات للفهرس:', index);
        DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
        return;
      }

      setEditItemState('cashReceipt', index, true);

      document.getElementById('editDenomination').value = data.denomination || '';
      document.getElementById('editQuantity').value = data.quantity || '';
      document.getElementById('editCashTotal').value = data.total_amount || '';
      document.getElementById('cashReceiptModalTitle').textContent = 'تعديل فئة نقدية';

      showEditModal('addEditCashReceiptModal');
      console.log('✅ [EDIT] تم فتح نافذة تعديل إيصال النقد بنجاح');
    } catch (error) {
      console.error('❌ [EDIT] خطأ في تعديل إيصال النقد:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تعديل الإيصال.'
      });
      DialogUtils.showError(`خطأ في تعديل الإيصال: ${friendly}`, 'خطأ في النظام');
    }
  }

  function editEditPostpaidSale(index) {
    console.log('✏️ [EDIT] تعديل المبيعة الآجلة:', index);

    try {
      if (!isEditModeActive()) {
        DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
        return;
      }

      const data = getCurrentEditData('postpaidSales', index);
      if (!data) {
        DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
        return;
      }

      setEditItemState('postpaidSale', index, true);

      const editBranchSelect = document.getElementById('editBranchSelect');
      const branchId = editBranchSelect ? editBranchSelect.value : null;

      populateCustomersInSelect('postpaidSaleCustomerName', 'postpaidSaleCustomersList', branchId).then(() => {
        document.getElementById('postpaidSaleCustomerName').value = data.customer_name || '';
        document.getElementById('postpaidSaleAmount').value = data.amount || '';
        document.getElementById('postpaidSaleModalTitle').textContent = 'تعديل مبيعة آجلة';
        showEditModal('addEditPostpaidSaleModal');
      });
    } catch (error) {
      console.error('❌ [EDIT] خطأ في تعديل المبيعة الآجلة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تعديل المبيعة.'
      });
      DialogUtils.showError(`خطأ في تعديل المبيعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  function editEditCustomerReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال العميل:', index);

    try {
      const data = getCurrentEditData('customerReceipts', index);
      if (!data) return;

      setEditItemState('customerReceipt', index, true);

      const editBranchSelect = document.getElementById('editBranchSelect');
      const branchId = editBranchSelect ? editBranchSelect.value : null;

      populateCustomersInSelect('customerReceiptEditCustomerName', 'customerReceiptEditCustomersList', branchId)
        .then(() => {
          document.getElementById('customerReceiptEditCustomerName').value = data.customer_name || '';
          document.getElementById('customerReceiptEditAmount').value = data.amount || '';
          document.getElementById('customerReceiptEditPaymentType').value = data.payment_type || '';
          document.getElementById('customerReceiptModalTitle').textContent = 'تعديل مقبوضة عميل';
          showEditModal('addEditCustomerReceiptModal');
        });
    } catch (error) {
      console.error('❌ [EDIT] خطأ في تعديل إيصال العميل:', error);
    }
  }

  function editEditReturnInvoice(index) {
    console.log('✏️ [EDIT] تعديل فاتورة المرتجع:', index);

    const data = getCurrentEditData('returnInvoices', index);
    if (!data) return;

    setEditItemState('returnInvoice', index, true);

    document.getElementById('returnInvoiceNumber').value = data.invoice_number || '';
    document.getElementById('returnInvoiceAmount').value = data.amount || '';
    document.getElementById('returnInvoiceModalTitle').textContent = 'تعديل فاتورة مرتجع';

    showEditModal('addEditReturnInvoiceModal');
  }

  function editEditSupplier(index) {
    console.log('✏️ [EDIT] تعديل المورد:', index);

    const data = getCurrentEditData('suppliers', index);
    if (!data) return;

    setEditItemState('supplier', index, true);

    document.getElementById('supplierEditName').value = data.supplier_name || '';
    document.getElementById('supplierEditAmount').value = data.amount || '';
    document.getElementById('supplierModalTitle').textContent = 'تعديل مورد';

    showEditModal('addEditSupplierModal');
  }

  return {
    editEditBankReceipt,
    editEditCashReceipt,
    editEditPostpaidSale,
    editEditCustomerReceipt,
    editEditReturnInvoice,
    editEditSupplier
  };
}

module.exports = {
  createEditSessionItemEditActions
};
