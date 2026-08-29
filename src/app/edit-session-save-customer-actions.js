const { createCustomerCodeHelpers } = require('./customer-code-helpers');
const { createCustomerCodeAutoFill } = require('./customer-code-autofill');
const { mapDbErrorMessage } = require('./db-error-messages');

function createEditSessionSaveCustomerActions(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const DialogUtils = deps.DialogUtils;
  const isExistingCustomer = deps.isExistingCustomer;
  const isExistingCustomerInBranch = deps.isExistingCustomerInBranch || null;
  const isExistingSupplier = deps.isExistingSupplier || null;
  const isExistingSupplierInBranch = deps.isExistingSupplierInBranch || null;
  const editMode = deps.editMode;
  const getEditItemData = deps.getEditItemData;
  const addOrUpdateEditData = deps.addOrUpdateEditData;
  const updateEditTotals = deps.updateEditTotals;
  const hideModal = deps.hideModal;
  const populateEditPostpaidSalesTable = deps.populateEditPostpaidSalesTable;
  const populateEditCustomerReceiptsTable = deps.populateEditCustomerReceiptsTable;
  const populateEditReturnInvoicesTable = deps.populateEditReturnInvoicesTable;
  const populateEditSuppliersTable = deps.populateEditSuppliersTable;
  const logger = deps.logger || console;
  const customerCodeHelpers = ipcRenderer
    ? createCustomerCodeHelpers({ ipcRenderer, logger })
    : null;
  const resolveCustomerIdentity = typeof deps.resolveCustomerIdentity === 'function'
    ? deps.resolveCustomerIdentity
    : (customerCodeHelpers
      ? customerCodeHelpers.resolveCustomerIdentity
      : async ({ customerName, customerCode }) => ({
        customer_id: null,
        customer_name: String(customerName || '').trim(),
        customer_code: String(customerCode || '').trim().toUpperCase()
      }));

  function getEditIndex() {
    const editItemData = getEditItemData();
    return editItemData.isEdit ? editItemData.index : null;
  }

  function getSelectedEditBranchId() {
    const branchSelect = document.getElementById('editBranchSelect');
    if (!branchSelect) return null;

    const rawValue = String(branchSelect.value == null ? '' : branchSelect.value).trim();
    if (!rawValue) return null;

    const numericBranchId = Number(rawValue);
    return Number.isFinite(numericBranchId) && numericBranchId > 0 ? numericBranchId : null;
  }

  if (customerCodeHelpers) {
    createCustomerCodeAutoFill({
      document,
      logger,
      suggestCustomerCodeForName: customerCodeHelpers.suggestCustomerCodeForName,
      resolveBranchId: () => getSelectedEditBranchId()
    }).bindPairs([
      { nameInputId: 'postpaidSaleCustomerName', codeInputId: 'postpaidSaleCustomerCode' },
      { nameInputId: 'customerReceiptEditCustomerName', codeInputId: 'customerReceiptEditCustomerCode' }
    ]);
  }

  async function checkCustomerExistsInCurrentScope(customerName) {
    const branchId = getSelectedEditBranchId();
    if (typeof isExistingCustomerInBranch === 'function' && branchId) {
      const existsInBranch = await isExistingCustomerInBranch(customerName, branchId);
      return { exists: existsInBranch, branchScoped: true };
    }

    const existsGlobally = await isExistingCustomer(customerName);
    return { exists: existsGlobally, branchScoped: false };
  }

  async function checkSupplierExistsInCurrentScope(supplierName) {
    const branchId = getSelectedEditBranchId();
    if (typeof isExistingSupplierInBranch === 'function' && branchId) {
      const existsInBranch = await isExistingSupplierInBranch(supplierName, branchId);
      return { exists: existsInBranch, branchScoped: true };
    }

    if (typeof isExistingSupplier === 'function') {
      const existsGlobally = await isExistingSupplier(supplierName);
      return { exists: existsGlobally, branchScoped: false };
    }

    return { exists: false, branchScoped: Boolean(branchId) };
  }

  async function savePostpaidSaleEdit() {
    console.log('💾 [SAVE] حفظ المبيعة الآجلة...');

    const form = document.getElementById('postpaidSaleEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const customerName = document.getElementById('postpaidSaleCustomerName').value.trim();
    const customerCode = document.getElementById('postpaidSaleCustomerCode').value.trim();
    const amount = parseFloat(document.getElementById('postpaidSaleAmount').value) || 0;

    if (amount <= 0) {
      DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const customerScope = await checkCustomerExistsInCurrentScope(customerName);
    if (!customerScope.exists) {
      const confirmationMessage = customerScope.branchScoped
        ? `العميل "${customerName}" غير موجود مسبقاً في هذا الفرع. هل أنت متأكد من إضافته؟`
        : `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`;
      const confirmed = await DialogUtils.showConfirm(
        confirmationMessage,
        'عميل جديد'
      );
      if (!confirmed) return;
    }

    try {
      const identity = await resolveCustomerIdentity({
        customerName,
        customerCode,
        branchId: getSelectedEditBranchId()
      });

      const data = {
        customer_id: identity.customer_id || null,
        customer_name: identity.customer_name,
        customer_code: identity.customer_code,
        amount
      };

      const editItemData = getEditItemData();
      addOrUpdateEditData('postpaidSales', data, getEditIndex());

      populateEditPostpaidSalesTable(editMode.originalData.postpaidSales);
      updateEditTotals();

      hideModal('addEditPostpaidSaleModal');

      const message = editItemData.isEdit ? 'تم تحديث المبيعة بنجاح' : 'تم إضافة المبيعة بنجاح';
      DialogUtils.showSuccessToast(message);
    } catch (error) {
      DialogUtils.showError(
        mapDbErrorMessage(error, {
          fallback: 'تعذر حفظ المبيعة الآجلة.'
        }),
        'خطأ في البيانات'
      );
    }
  }

  async function saveCustomerReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال العميل...');

    const form = document.getElementById('customerReceiptEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const customerName = document.getElementById('customerReceiptEditCustomerName').value.trim();
    const customerCode = document.getElementById('customerReceiptEditCustomerCode').value.trim();
    const amount = parseFloat(document.getElementById('customerReceiptEditAmount').value) || 0;
    const paymentType = document.getElementById('customerReceiptEditPaymentType').value.trim();

    if (!customerName) {
      DialogUtils.showError('اسم العميل مطلوب', 'خطأ في البيانات');
      return;
    }

    if (!paymentType) {
      DialogUtils.showError('نوع الدفع مطلوب', 'خطأ في البيانات');
      return;
    }

    if (amount <= 0) {
      DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const customerScope = await checkCustomerExistsInCurrentScope(customerName);
    if (!customerScope.exists) {
      const confirmationMessage = customerScope.branchScoped
        ? `العميل "${customerName}" غير موجود مسبقاً في هذا الفرع. هل أنت متأكد من إضافته؟`
        : `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`;
      const confirmed = await DialogUtils.showConfirm(
        confirmationMessage,
        'عميل جديد'
      );
      if (!confirmed) return;
    }

    try {
      const identity = await resolveCustomerIdentity({
        customerName,
        customerCode,
        branchId: getSelectedEditBranchId()
      });

      const data = {
        customer_id: identity.customer_id || null,
        customer_name: identity.customer_name,
        customer_code: identity.customer_code,
        amount,
        payment_type: paymentType
      };

      const editItemData = getEditItemData();
      addOrUpdateEditData('customerReceipts', data, getEditIndex());

      populateEditCustomerReceiptsTable(editMode.originalData.customerReceipts);
      updateEditTotals();

      hideModal('addEditCustomerReceiptModal');

      const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
      DialogUtils.showSuccessToast(message);
    } catch (error) {
      DialogUtils.showError(
        mapDbErrorMessage(error, {
          fallback: 'تعذر حفظ مقبوض العميل.'
        }),
        'خطأ في البيانات'
      );
    }
  }

  function saveReturnInvoiceEdit() {
    console.log('💾 [SAVE] حفظ فاتورة المرتجع...');

    const form = document.getElementById('returnInvoiceEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = {
      invoice_number: document.getElementById('returnInvoiceNumber').value.trim(),
      amount: parseFloat(document.getElementById('returnInvoiceAmount').value) || 0
    };

    if (data.amount <= 0) {
      DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const editItemData = getEditItemData();
    addOrUpdateEditData('returnInvoices', data, getEditIndex());

    populateEditReturnInvoicesTable(editMode.originalData.returnInvoices);
    updateEditTotals();

    hideModal('addEditReturnInvoiceModal');

    const message = editItemData.isEdit ? 'تم تحديث الفاتورة بنجاح' : 'تم إضافة الفاتورة بنجاح';
    DialogUtils.showSuccessToast(message);
  }

  async function saveSupplierEdit() {
    console.log('💾 [SAVE] حفظ المورد...');

    const form = document.getElementById('supplierEditForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const supplierName = document.getElementById('supplierEditName').value.trim();
    const amountInput = document.getElementById('supplierEditAmount').value.trim();

    if (!supplierName) {
      DialogUtils.showError('اسم المورد مطلوب', 'خطأ في البيانات');
      return;
    }

    if (!amountInput) {
      DialogUtils.showError('المبلغ مطلوب', 'خطأ في البيانات');
      return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      DialogUtils.showError('يرجى إدخال مبلغ صحيح أكبر من صفر', 'خطأ في البيانات');
      return;
    }

    const supplierScope = await checkSupplierExistsInCurrentScope(supplierName);
    if (!supplierScope.exists) {
      const confirmationMessage = supplierScope.branchScoped
        ? `المورد "${supplierName}" غير موجود مسبقاً في هذا الفرع. هل أنت متأكد من إضافته؟`
        : `المورد "${supplierName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`;
      const confirmed = await DialogUtils.showConfirm(
        confirmationMessage,
        'مورد جديد'
      );
      if (!confirmed) return;
    }

    const data = {
      supplier_name: supplierName,
      amount
    };

    const editItemData = getEditItemData();
    addOrUpdateEditData('suppliers', data, getEditIndex());

    populateEditSuppliersTable(editMode.originalData.suppliers);
    updateEditTotals();

    hideModal('addEditSupplierModal');

    const message = editItemData.isEdit ? 'تم تحديث المورد بنجاح' : 'تم إضافة المورد بنجاح';
    DialogUtils.showSuccessToast(message);
  }

  return {
    savePostpaidSaleEdit,
    saveCustomerReceiptEdit,
    saveReturnInvoiceEdit,
    saveSupplierEdit
  };
}

module.exports = {
  createEditSessionSaveCustomerActions
};
