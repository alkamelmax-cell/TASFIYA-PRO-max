const { createLegacyDebugToolsEditTestHandlers } = require('./legacy-debug-tools-edit-tests');
const { createLegacyDebugToolsFilterTestHandlers } = require('./legacy-debug-tools-filter-tests');
const { createLegacyDebugToolsSavedPrintTestHandlers } = require('./legacy-debug-tools-saved-print-tests');
const { createLegacyDebugToolsLoaderHandlers } = require('./legacy-debug-tools-loader');

function createLegacyDebugToolsHandlers(deps) {
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  const editTests = createLegacyDebugToolsEditTestHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    editReconciliationNew: deps.editReconciliationNew,
    setTimeoutFn: deps.setTimeoutFn,
    logger
  });

  const filterTests = createLegacyDebugToolsFilterTestHandlers({
    document: deps.document,
    getDialogUtils,
    ipcRenderer: deps.ipcRenderer,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    logger
  });

  const savedPrintTests = createLegacyDebugToolsSavedPrintTestHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    loadReconciliationForPrint: deps.loadReconciliationForPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    logger
  });

  const loaderHandlers = createLegacyDebugToolsLoaderHandlers({
    document: deps.document,
    getDialogUtils,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    setBankReceipts: deps.setBankReceipts,
    setCashReceipts: deps.setCashReceipts,
    setPostpaidSales: deps.setPostpaidSales,
    setCustomerReceipts: deps.setCustomerReceipts,
    setReturnInvoices: deps.setReturnInvoices,
    setSuppliers: deps.setSuppliers,
    updateBankReceiptsTable: deps.updateBankReceiptsTable,
    updateCashReceiptsTable: deps.updateCashReceiptsTable,
    updatePostpaidSalesTable: deps.updatePostpaidSalesTable,
    updateCustomerReceiptsTable: deps.updateCustomerReceiptsTable,
    updateReturnInvoicesTable: deps.updateReturnInvoicesTable,
    updateSuppliersTable: deps.updateSuppliersTable,
    updateSummary: deps.updateSummary,
    logger
  });

  windowObj.testEditReconciliation = editTests.testEditReconciliation;
  windowObj.testEditButtons = editTests.testEditButtons;
  windowObj.testTableStructures = editTests.testTableStructures;
  windowObj.testFilterEnhancements = filterTests.testFilterEnhancements;
  windowObj.quickTestFilterFields = filterTests.quickTestFilterFields;
  windowObj.testPrintWithNewFields = filterTests.testPrintWithNewFields;
  windowObj.testSavedReconciliationPrint = savedPrintTests.testSavedReconciliationPrint;
  windowObj.loadReconciliationForEditOLD = loaderHandlers.loadReconciliationForEditOLD;

  logger.log(`
🧪 وظائف الاختبار المتاحة:
- testEditReconciliation() - اختبار وظيفة تعديل التصفية
- testEditButtons() - اختبار أزرار التعديل في الجداول
- testTableStructures() - اختبار هيكل الجداول والتطابق
- testFilterEnhancements() - اختبار الميزات الجديدة للتصفية (شامل)
- quickTestFilterFields() - اختبار سريع للحقول الجديدة (مبسط)
- testPrintWithNewFields() - اختبار شامل للطباعة مع الحقول الجديدة
- testSavedReconciliationPrint() - اختبار طباعة التصفيات المحفوظة

🚀 للاختبار السريع: quickTestFilterFields()
📊 للاختبار الشامل: testFilterEnhancements()
🖨️ لاختبار الطباعة: testPrintWithNewFields()
💾 لاختبار التصفيات المحفوظة: testSavedReconciliationPrint()
`);

  return {
    testEditReconciliation: editTests.testEditReconciliation,
    testEditButtons: editTests.testEditButtons,
    testTableStructures: editTests.testTableStructures,
    testFilterEnhancements: filterTests.testFilterEnhancements,
    quickTestFilterFields: filterTests.quickTestFilterFields,
    testPrintWithNewFields: filterTests.testPrintWithNewFields,
    testSavedReconciliationPrint: savedPrintTests.testSavedReconciliationPrint,
    loadReconciliationForEditOLD: loaderHandlers.loadReconciliationForEditOLD
  };
}

module.exports = {
  createLegacyDebugToolsHandlers
};
