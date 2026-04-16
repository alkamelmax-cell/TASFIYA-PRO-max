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

      let query = `
            SELECT DISTINCT c.customer_name
            FROM (
                SELECT ps.customer_name, ch.branch_id
                FROM postpaid_sales ps
                JOIN reconciliations r ON ps.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
                UNION
                SELECT cr.customer_name, ch.branch_id
                FROM customer_receipts cr
                JOIN reconciliations r ON cr.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
            ) c
            WHERE c.customer_name IS NOT NULL
        `;

      const params = [];

      if (branchId) {
        query += ' AND c.branch_id = ?';
        params.push(branchId);
        console.log('🔍 [POPULATE-SELECT] تصفية العملاء حسب الفرع:', branchId);
      }

      query += ' ORDER BY c.customer_name';

      const customers = await ipcRenderer.invoke('db-query', query, params);
      const datalistElement = document.getElementById(datalistId);

      if (!datalistElement) {
        console.warn('⚠️ [POPULATE-SELECT] عنصر datalist غير موجود:', datalistId);
        return;
      }

      datalistElement.innerHTML = '';

      customers.forEach((customer) => {
        const option = document.createElement('option');
        option.value = customer.customer_name;
        datalistElement.appendChild(option);
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

  function addEditPostpaidSale() {
    console.log('➕ [ADD] فتح نافذة إضافة مبيعة آجلة...');

    setEditItemState('postpaidSale', null, false);

    document.getElementById('postpaidSaleEditForm').reset();
    document.getElementById('postpaidSaleModalTitle').textContent = 'إضافة مبيعة آجلة';

    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;
    populateCustomersInSelect('postpaidSaleCustomerName', 'postpaidSaleCustomersList', branchId);

    showEditModal('addEditPostpaidSaleModal');
  }

  function addEditCustomerReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة مقبوضة عميل...');

    setEditItemState('customerReceipt', null, false);

    document.getElementById('customerReceiptEditForm').reset();
    document.getElementById('customerReceiptModalTitle').textContent = 'إضافة مقبوضة عميل';

    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;
    populateCustomersInSelect('customerReceiptEditCustomerName', 'customerReceiptEditCustomersList', branchId);

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
