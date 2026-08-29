const {
  buildCustomersByBranchQuery,
  createCustomerOption,
  normalizeBranchId
} = require('./customer-list-data');

function createEditSessionItemAddActions(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const editMode = deps.editMode;
  const setEditItemState = deps.setEditItemState;
  const showEditModal = deps.showEditModal;

  async function populateCustomersInSelect(inputId, datalistId = null, branchId = null) {
    try {
      console.log('📋 [POPULATE-SELECT] جاري تحميل العملاء في الحقل:', inputId, 'الفرع:', branchId);

      if (!datalistId) {
        datalistId = `${inputId}List`;
      }

      if (!branchId && editMode.isActive) {
        const editBranchSelect = document.getElementById('editBranchSelect');
        if (editBranchSelect) {
          branchId = editBranchSelect.value;
          console.log('🏢 [POPULATE-SELECT] تم الحصول على الفرع من النموذج:', branchId);
        }
      }

      const normalizedBranchId = normalizeBranchId(branchId);
      const hasBranchFilter = normalizedBranchId !== null;
      const datalistElement = document.getElementById(datalistId);

      if (!datalistElement) {
        console.warn('⚠️ [POPULATE-SELECT] عنصر datalist غير موجود:', datalistId);
        return;
      }

      if (!hasBranchFilter) {
        datalistElement.innerHTML = '';
        console.log('ℹ️ [POPULATE-SELECT] لم يتم اختيار فرع، تم تفريغ قائمة العملاء:', datalistId);
        return;
      }

      console.log('🔍 [POPULATE-SELECT] تصفية العملاء حسب الفرع:', normalizedBranchId);

      const customers = await ipcRenderer.invoke('db-query', buildCustomersByBranchQuery(), [normalizedBranchId]);

      datalistElement.innerHTML = '';

      customers.forEach((customer) => {
        datalistElement.appendChild(createCustomerOption(document, customer));
      });

      console.log(`✅ [POPULATE-SELECT] تم تحميل ${customers.length} عميل في ${datalistId}`);
    } catch (error) {
      console.error('❌ [POPULATE-SELECT] خطأ في تحميل العملاء:', error);
    }
  }

  function addEditBankReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة مقبوضة بنكية...');

    setEditItemState('bankReceipt', null, false);
    document.getElementById('bankReceiptEditForm').reset();
    document.getElementById('bankReceiptModalTitle').textContent = 'إضافة مقبوضة بنكية';
    showEditModal('addEditBankReceiptModal');
  }

  function addEditCashReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة فئة نقدية...');

    setEditItemState('cashReceipt', null, false);
    document.getElementById('cashReceiptEditForm').reset();
    document.getElementById('cashReceiptModalTitle').textContent = 'إضافة فئة نقدية';
    showEditModal('addEditCashReceiptModal');
  }

  async function addEditPostpaidSale() {
    console.log('➕ [ADD] فتح نافذة إضافة مبيعة آجلة...');

    setEditItemState('postpaidSale', null, false);

    document.getElementById('postpaidSaleEditForm').reset();
    document.getElementById('postpaidSaleModalTitle').textContent = 'إضافة مبيعة آجلة';

    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;
    await populateCustomersInSelect('postpaidSaleCustomerName', 'postpaidSaleCustomersList', branchId);

    showEditModal('addEditPostpaidSaleModal');
  }

  async function addEditCustomerReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة مقبوضة عميل...');

    setEditItemState('customerReceipt', null, false);

    document.getElementById('customerReceiptEditForm').reset();
    document.getElementById('customerReceiptModalTitle').textContent = 'إضافة مقبوضة عميل';

    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;
    await populateCustomersInSelect('customerReceiptEditCustomerName', 'customerReceiptEditCustomersList', branchId);

    showEditModal('addEditCustomerReceiptModal');
  }

  function addEditReturnInvoice() {
    console.log('➕ [ADD] فتح نافذة إضافة فاتورة مرتجع...');

    setEditItemState('returnInvoice', null, false);

    document.getElementById('returnInvoiceEditForm').reset();
    document.getElementById('returnInvoiceModalTitle').textContent = 'إضافة فاتورة مرتجع';
    showEditModal('addEditReturnInvoiceModal');
  }

  function addEditSupplier() {
    console.log('➕ [ADD] فتح نافذة إضافة مورد...');

    setEditItemState('supplier', null, false);

    document.getElementById('supplierEditForm').reset();
    document.getElementById('supplierModalTitle').textContent = 'إضافة مورد';
    showEditModal('addEditSupplierModal');
  }

  return {
    populateCustomersInSelect,
    addEditBankReceipt,
    addEditCashReceipt,
    addEditPostpaidSale,
    addEditCustomerReceipt,
    addEditReturnInvoice,
    addEditSupplier
  };
}

module.exports = {
  createEditSessionItemAddActions
};
