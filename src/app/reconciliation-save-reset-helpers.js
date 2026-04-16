const { clearActiveFormulaSettingsInDocument } = require('./reconciliation-formula');

function createReconciliationSaveResetHelpers(context) {
  const doc = context.document;
  const windowObj = context.windowObj || {};
  const logger = context.logger || console;
  const setCurrentReconciliation = context.setCurrentReconciliation;
  const setBankReceipts = context.setBankReceipts;
  const setCashReceipts = context.setCashReceipts;
  const setPostpaidSales = context.setPostpaidSales;
  const setCustomerReceipts = context.setCustomerReceipts;
  const setReturnInvoices = context.setReturnInvoices;
  const setSuppliers = context.setSuppliers;
  const updateBankReceiptsTable = context.updateBankReceiptsTable;
  const updateCashReceiptsTable = context.updateCashReceiptsTable;
  const updatePostpaidSalesTable = context.updatePostpaidSalesTable;
  const updateCustomerReceiptsTable = context.updateCustomerReceiptsTable;
  const updateReturnInvoicesTable = context.updateReturnInvoicesTable;
  const updateSuppliersTable = context.updateSuppliersTable;
  const updateSummary = context.updateSummary;

function resetCurrentReconciliationInfoPanel() {
  const infoDiv = doc.getElementById('currentReconciliationInfo');
  const detailsSpan = doc.getElementById('currentReconciliationDetails');

  if (detailsSpan) {
    detailsSpan.textContent = '';
  }

  if (infoDiv) {
    infoDiv.style.display = 'none';
  }
}

async function clearAllReconciliationData() {
  logger.log('🧹 [CLEAR] بدء تفريغ جميع بيانات التصفية...');

  try {
    setBankReceipts([]);
    setCashReceipts([]);
    setPostpaidSales([]);
    setCustomerReceipts([]);
    setReturnInvoices([]);
    setSuppliers([]);

    try {
      clearAllFormFields();
    } catch (formError) {
      logger.error('⚠️ [CLEAR] خطأ جزئي في تفريغ النماذج:', formError);
    }

    try {
      clearAllTables();
    } catch (tableError) {
      logger.error('⚠️ [CLEAR] خطأ جزئي في تفريغ الجداول:', tableError);
    }

    try {
      if (windowObj.appAPI && typeof windowObj.appAPI.resetReconciliationForm === 'function') {
        logger.log('🔄 [CLEAR] Calling resetReconciliationForm...');
        windowObj.appAPI.resetReconciliationForm();
      }
    } catch (formResetErr) {
      logger.error('⚠️ [CLEAR] Failed to reset reconciliation form:', formResetErr);
    }

    try {
      resetAllTotalsAndSummaries();
    } catch (totalError) {
      logger.error('⚠️ [CLEAR] خطأ جزئي في تصفير المجاميع:', totalError);
    }

    logger.log('✅ [CLEAR] تم تفريغ البيانات (المحاولة) بنجاح');
  } catch (error) {
    logger.error('❌ [CLEAR] خطأ غير متوقع في تفريغ البيانات:', error);
  } finally {
    logger.log('🔒 [CLEAR] إجبار تصفير كائن التصفية الحالية');
    clearActiveFormulaSettingsInDocument(doc);
    setCurrentReconciliation(null);
    if (windowObj.pendingReconciliationData) {
      windowObj.pendingReconciliationData = null;
    }
    if (windowObj.recalledReconciliationSnapshot) {
      windowObj.recalledReconciliationSnapshot = null;
    }
    resetCurrentReconciliationInfoPanel();
  }
}

async function resetUIOnly() {
  logger.log('🧹 [UI RESET] تنظيف واجهة المستخدم فقط...');

  try {
    setBankReceipts([]);
    setCashReceipts([]);
    setPostpaidSales([]);
    setCustomerReceipts([]);
    setReturnInvoices([]);
    setSuppliers([]);
    clearActiveFormulaSettingsInDocument(doc);
    setCurrentReconciliation(null);

    clearAllFormFields();
    updateBankReceiptsTable();
    updateCashReceiptsTable();
    updatePostpaidSalesTable();
    updateCustomerReceiptsTable();
    updateReturnInvoicesTable();
    updateSuppliersTable();
    updateSummary();

    logger.log('✅ [UI RESET] تم تنظيف واجهة المستخدم بنجاح');
  } catch (error) {
    logger.error('❌ [UI RESET] خطأ في تنظيف واجهة المستخدم:', error);
    throw error;
  }
}

function clearAllFormFields() {
  logger.log('📝 [CLEAR] تفريغ جميع حقول النماذج...');

  const branchSelect = doc.getElementById('branchSelect');
  const cashierSelect = doc.getElementById('cashierSelect');
  const cashierNumber = doc.getElementById('cashierNumber');
  const accountantSelect = doc.getElementById('accountantSelect');
  const reconciliationDate = doc.getElementById('reconciliationDate');
  const systemSales = doc.getElementById('systemSales');
  const timeRangeStart = doc.getElementById('timeRangeStart');
  const timeRangeEnd = doc.getElementById('timeRangeEnd');
  const filterNotes = doc.getElementById('filterNotes');
  const activeFormulaProfileId = doc.getElementById('activeReconciliationFormulaProfileId');
  const operationType = doc.getElementById('operationType');
  const atmSelect = doc.getElementById('atmSelect');
  const bankName = doc.getElementById('bankName');
  const cashTotal = doc.getElementById('cashTotal');

  if (branchSelect) branchSelect.value = '';
  if (cashierSelect) cashierSelect.value = '';
  if (cashierNumber) cashierNumber.value = '';
  if (accountantSelect) accountantSelect.value = '';
  if (reconciliationDate) reconciliationDate.value = '';
  if (systemSales) systemSales.value = '';
  if (timeRangeStart) timeRangeStart.value = '';
  if (timeRangeEnd) timeRangeEnd.value = '';
  if (filterNotes) filterNotes.value = '';
  if (activeFormulaProfileId) activeFormulaProfileId.value = '';
  if (operationType) operationType.value = '';
  if (atmSelect) {
    atmSelect.value = '';
    atmSelect.disabled = true;
  }
  if (bankName) bankName.value = '';
  if (cashTotal) cashTotal.value = '';

  const bankReceiptForm = doc.getElementById('bankReceiptForm');
  if (bankReceiptForm) bankReceiptForm.reset();
  const cashReceiptForm = doc.getElementById('cashReceiptForm');
  if (cashReceiptForm) cashReceiptForm.reset();
  const postpaidSaleForm = doc.getElementById('postpaidSaleForm');
  if (postpaidSaleForm) postpaidSaleForm.reset();
  const customerReceiptForm = doc.getElementById('customerReceiptForm');
  if (customerReceiptForm) customerReceiptForm.reset();
  const returnInvoiceForm = doc.getElementById('returnInvoiceForm');
  if (returnInvoiceForm) returnInvoiceForm.reset();
  const supplierForm = doc.getElementById('supplierForm');
  if (supplierForm) supplierForm.reset();
  resetCurrentReconciliationInfoPanel();

  logger.log('✅ [CLEAR] تم تفريغ جميع النماذج');
}

function clearAllTables() {
  logger.log('📊 [CLEAR] تفريغ جميع الجداول...');
  const tablesToClear = [
    'bankReceiptsTable',
    'cashReceiptsTable',
    'postpaidSalesTable',
    'customerReceiptsTable',
    'returnInvoicesTable',
    'suppliersTable'
  ];

  tablesToClear.forEach((tableId) => {
    const tableBody = doc.getElementById(tableId);
    if (tableBody) {
      tableBody.innerHTML = '';
    }
  });

  logger.log('✅ [CLEAR] تم تفريغ جميع الجداول');
}

function resetAllTotalsAndSummaries() {
  logger.log('🔢 [RESET] إعادة تعيين جميع المجاميع والملخصات...');
  const totalsToReset = [
    'bankReceiptsTotal',
    'cashReceiptsTotal',
    'postpaidSalesTotal',
    'customerReceiptsTotal',
    'returnInvoicesTotal',
    'suppliersTotal'
  ];

  totalsToReset.forEach((totalId) => {
    const element = doc.getElementById(totalId);
    if (element) {
      element.textContent = '0.00';
    }
  });

  const summaryTotalsToReset = [
    'summaryBankTotal',
    'summaryCashTotal',
    'summaryPostpaidTotal',
    'summaryCustomerTotal',
    'summaryReturnTotal',
    'totalReceipts',
    'surplusDeficit'
  ];

  summaryTotalsToReset.forEach((totalId) => {
    const element = doc.getElementById(totalId);
    if (element) {
      element.textContent = '0.00';
      if (totalId === 'surplusDeficit') {
        element.className = 'summary-value';
      }
    }
  });

  logger.log('✅ [RESET] تم إعادة تعيين جميع المجاميع');
}

  return {
    clearAllReconciliationData,
    resetUIOnly,
    clearAllFormFields,
    clearAllTables,
    resetAllTotalsAndSummaries
  };
}

module.exports = {
  createReconciliationSaveResetHelpers
};
