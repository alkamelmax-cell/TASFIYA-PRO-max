const {
  getEffectiveFormulaSettingsFromDocument,
  calculateReconciliationSummaryByFormula
} = require('./reconciliation-formula');

function createEditFormHelpers(deps) {
  const doc = deps.document;
  const getEditMode = deps.getEditMode;
  const logger = deps.logger || console;

  function normalizeModifiedFlag(value) {
    return value === 1 || value === '1' || value === true ? 1 : 0;
  }

  function normalizeBoolean(value, fallback = false) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value !== 0 : fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  function collectBankReceiptsData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.bankReceipts) return [];
    return editMode.originalData.bankReceipts.map((receipt) => ({
      id: receipt.id ?? null,
      operation_type: receipt.operation_type,
      atm_id: receipt.atm_id,
      amount: parseFloat(receipt.amount) || 0,
      is_modified: normalizeModifiedFlag(receipt.is_modified)
    }));
  }

  function collectCashReceiptsData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.cashReceipts) return [];
    return editMode.originalData.cashReceipts.map((receipt) => ({
      id: receipt.id ?? null,
      denomination: receipt.denomination,
      quantity: receipt.quantity,
      total_amount: parseFloat(receipt.total_amount) || 0,
      is_modified: normalizeModifiedFlag(receipt.is_modified)
    }));
  }

  function collectPostpaidSalesData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.postpaidSales) return [];
    return editMode.originalData.postpaidSales.map((sale) => ({
      id: sale.id ?? null,
      customer_name: sale.customer_name,
      amount: parseFloat(sale.amount) || 0,
      is_modified: normalizeModifiedFlag(sale.is_modified)
    }));
  }

  function collectCustomerReceiptsData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.customerReceipts) return [];
    return editMode.originalData.customerReceipts.map((receipt) => ({
      id: receipt.id ?? null,
      customer_name: receipt.customer_name,
      amount: parseFloat(receipt.amount) || 0,
      payment_type: receipt.payment_type || 'نقدي',
      is_modified: normalizeModifiedFlag(receipt.is_modified)
    }));
  }

  function collectReturnInvoicesData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.returnInvoices) return [];
    return editMode.originalData.returnInvoices.map((invoice) => ({
      id: invoice.id ?? null,
      invoice_number: invoice.invoice_number,
      amount: parseFloat(invoice.amount) || 0,
      is_modified: normalizeModifiedFlag(invoice.is_modified)
    }));
  }

  function collectSuppliersData() {
    const editMode = getEditMode();
    if (!editMode.originalData || !editMode.originalData.suppliers) return [];
    return editMode.originalData.suppliers.map((supplier) => ({
      id: supplier.id ?? null,
      supplier_name: supplier.supplier_name,
      amount: parseFloat(supplier.amount) || 0,
      is_modified: normalizeModifiedFlag(supplier.is_modified)
    }));
  }

  function collectTableData(tableId, columns) {
    const table = doc.getElementById(tableId);
    if (!table) return [];

    const rows = table.querySelectorAll('tr');
    const data = [];
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= columns.length) {
        const rowData = {};
        columns.forEach((column, index) => {
          let value = cells[index].textContent.trim();
          if (column === 'amount') {
            value = parseFloat(value) || 0;
          }
          rowData[column] = value;
        });
        data.push(rowData);
      }
    });

    return data;
  }

  function validateEditForm() {
    logger.log('✅ [VALIDATE] فحص صحة بيانات النموذج...');
    const editBranchSelect = doc.getElementById('editBranchSelect');
    const editCashierSelect = doc.getElementById('editCashierSelect');
    const editAccountantSelect = doc.getElementById('editAccountantSelect');
    const editReconciliationDate = doc.getElementById('editReconciliationDate');
    const editSystemSales = doc.getElementById('editSystemSales');

    if (!editBranchSelect || !editBranchSelect.value) return { isValid: false, message: 'يجب اختيار الفرع' };
    if (!editCashierSelect || !editCashierSelect.value) return { isValid: false, message: 'يجب اختيار الكاشير' };
    if (!editAccountantSelect || !editAccountantSelect.value) return { isValid: false, message: 'يجب اختيار المحاسب' };
    if (!editReconciliationDate || !editReconciliationDate.value) return { isValid: false, message: 'يجب تحديد تاريخ التصفية' };
    if (!editSystemSales || editSystemSales.value === '' || Number.isNaN(Number(editSystemSales.value))) {
      return { isValid: false, message: 'يجب إدخال مبيعات النظام بشكل صحيح' };
    }

    const systemSalesValue = parseFloat(editSystemSales.value);
    if (systemSalesValue < 0) return { isValid: false, message: 'مبيعات النظام لا يمكن أن تكون سالبة' };
    logger.log('✅ [VALIDATE] جميع البيانات صحيحة');
    return { isValid: true, message: 'البيانات صحيحة' };
  }

  function collectEditFormData() {
    logger.log('📊 [COLLECT] جمع البيانات من النموذج...');
    const editMode = getEditMode();
    const reconciliationId = editMode.reconciliationId;
    const cashierId = doc.getElementById('editCashierSelect').value;
    const accountantId = doc.getElementById('editAccountantSelect').value;
    const reconciliationDate = doc.getElementById('editReconciliationDate').value;
    const systemSales = parseFloat(doc.getElementById('editSystemSales').value) || 0;
    const timeRangeStart = doc.getElementById('editTimeRangeStart').value || null;
    const timeRangeEnd = doc.getElementById('editTimeRangeEnd').value || null;
    const filterNotes = doc.getElementById('editFilterNotes').value.trim() || null;
    const editCashboxPostingEnabled = doc.getElementById('editCashboxPostingEnabled');
    const cashboxPostingEnabled = editCashboxPostingEnabled
      ? !!editCashboxPostingEnabled.checked
      : normalizeBoolean(editMode?.originalData?.reconciliation?.cashbox_posting_enabled, false);

    const bankTotal = parseFloat(doc.getElementById('editBankReceiptsTotal').textContent) || 0;
    const cashTotal = parseFloat(doc.getElementById('editCashReceiptsTotal').textContent) || 0;
    const postpaidTotal = parseFloat(doc.getElementById('editPostpaidSalesTotal').textContent) || 0;
    const customerTotal = parseFloat(doc.getElementById('editCustomerReceiptsTotal').textContent) || 0;
    const returnTotal = parseFloat(doc.getElementById('editReturnInvoicesTotal').textContent) || 0;
    const supplierTotal = parseFloat(doc.getElementById('editSuppliersTotal').textContent) || 0;
    const parsedFormulaProfileId = Number.parseInt(
      editMode?.originalData?.reconciliation?.formula_profile_id,
      10
    );
    const formulaProfileId = Number.isFinite(parsedFormulaProfileId) && parsedFormulaProfileId > 0
      ? parsedFormulaProfileId
      : null;

    const formulaSettings = getEffectiveFormulaSettingsFromDocument(doc);
    const formulaResult = calculateReconciliationSummaryByFormula(
      {
        bankTotal,
        cashTotal,
        postpaidTotal,
        customerTotal,
        returnTotal,
        supplierTotal
      },
      systemSales,
      formulaSettings
    );
    const totalReceipts = formulaResult.totalReceipts;
    const surplusDeficit = formulaResult.surplusDeficit;

    const data = {
      reconciliationId,
      cashierId,
      accountantId,
      reconciliationDate,
      systemSales,
      totalReceipts,
      surplusDeficit,
      timeRangeStart,
      timeRangeEnd,
      filterNotes,
      bankReceipts: collectBankReceiptsData(),
      cashReceipts: collectCashReceiptsData(),
      postpaidSales: collectPostpaidSalesData(),
      customerReceipts: collectCustomerReceiptsData(),
      returnInvoices: collectReturnInvoicesData(),
      suppliers: collectSuppliersData(),
      supplierTotal,
      formulaProfileId,
      formulaSettings,
      cashboxPostingEnabled
    };

    logger.log('✅ [COLLECT] تم جمع البيانات:', {
      reconciliationId: data.reconciliationId,
      totalReceipts: data.totalReceipts,
      systemSales: data.systemSales,
      surplusDeficit: data.surplusDeficit,
      cashboxPostingEnabled: data.cashboxPostingEnabled,
      itemCounts: {
        bankReceipts: data.bankReceipts.length,
        cashReceipts: data.cashReceipts.length,
        postpaidSales: data.postpaidSales.length,
        customerReceipts: data.customerReceipts.length,
        returnInvoices: data.returnInvoices.length,
        suppliers: data.suppliers.length
      }
    });

    return data;
  }

  return {
    validateEditForm,
    collectEditFormData,
    collectBankReceiptsData,
    collectCashReceiptsData,
    collectPostpaidSalesData,
    collectCustomerReceiptsData,
    collectReturnInvoicesData,
    collectSuppliersData,
    collectTableData
  };
}

module.exports = {
  createEditFormHelpers
};
