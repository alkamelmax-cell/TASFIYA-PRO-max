const { createSavedPrintToolsCoreHandlers } = require('./saved-print-tools-core');
const { createSavedPrintToolsTestHandlers } = require('./saved-print-tools-tests');

function createSavedPrintToolsHandlers(deps) {
  const windowObj = deps.windowObj || globalThis;
  const document = deps.document || windowObj.document || null;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);

  const coreHandlers = createSavedPrintToolsCoreHandlers({
    windowObj,
    ipcRenderer: deps.ipcRenderer,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils,
    setCurrentPrintReconciliation: deps.setCurrentPrintReconciliation,
    loadReconciliationForPrint: deps.loadReconciliationForPrint,
    showPrintSectionSelectionDialog: deps.showPrintSectionSelectionDialog,
    showThermalPrintSectionDialog: deps.showThermalPrintSectionDialog,
    generateAndPrint: deps.generateAndPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    printReconciliationAdvanced: deps.printReconciliationAdvanced
  });

  const testHandlers = createSavedPrintToolsTestHandlers({
    document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    setCurrentPrintReconciliation: deps.setCurrentPrintReconciliation,
    loadReconciliationForPrint: deps.loadReconciliationForPrint,
    generatePrintHTML: deps.generatePrintHTML,
    generatePrintPreview: deps.generatePrintPreview,
    formatCurrency: deps.formatCurrency,
    formatNumber: deps.formatNumber,
    quickPrintReconciliation: coreHandlers.quickPrintReconciliation
  });

  windowObj.printSavedReconciliation = deps.printSavedReconciliation;
  windowObj.quickPrintSavedReconciliation = coreHandlers.quickPrintSavedReconciliation;
  windowObj.generatePDFSavedReconciliation = coreHandlers.generatePDFSavedReconciliation;
  windowObj.selectAllPrintSections = deps.selectAllSavedPrintSections;
  windowObj.deselectAllPrintSections = deps.deselectAllSavedPrintSections;
  windowObj.showPrintPreview = deps.showSavedPrintPreview;
  windowObj.proceedToPrint = deps.proceedToSavedPrint;

  windowObj.thermalPreviewSavedReconciliation = coreHandlers.thermalPreviewSavedReconciliation;
  windowObj.thermalPrintSavedReconciliation = coreHandlers.thermalPrintSavedReconciliation;
  windowObj.showThermalPrintSectionDialog = deps.showThermalPrintSectionDialog;
  windowObj.selectAllThermalSections = deps.selectAllThermalSections;
  windowObj.deselectAllThermalSections = deps.deselectAllThermalSections;
  windowObj.getSelectedThermalSections = deps.getSelectedThermalSections;
  windowObj.proceedWithThermalPrint = deps.proceedWithThermalPrint;
  windowObj.printReconciliationFromData = coreHandlers.openPrintDialogWithData;

  console.log('✅ [THERMAL] دوال الطباعة الحرارية للتصفيات المحفوظة مع اختيار الأقسام تم تحميلها بنجاح');

  windowObj.testNewPrintSystem = testHandlers.testNewPrintSystem;
  windowObj.testNewCashDenominations = testHandlers.testNewCashDenominations;
  windowObj.testA4SinglePagePrint = testHandlers.testA4SinglePagePrint;
  windowObj.testImprovedReadabilityPrint = testHandlers.testImprovedReadabilityPrint;

  return {
    quickPrintSavedReconciliation: coreHandlers.quickPrintSavedReconciliation,
    generatePDFSavedReconciliation: coreHandlers.generatePDFSavedReconciliation,
    thermalPreviewSavedReconciliation: coreHandlers.thermalPreviewSavedReconciliation,
    thermalPrintSavedReconciliation: coreHandlers.thermalPrintSavedReconciliation,
    testNewPrintSystem: testHandlers.testNewPrintSystem,
    testNewCashDenominations: testHandlers.testNewCashDenominations,
    testA4SinglePagePrint: testHandlers.testA4SinglePagePrint,
    testImprovedReadabilityPrint: testHandlers.testImprovedReadabilityPrint,
    quickPrintReconciliation: coreHandlers.quickPrintReconciliation,
    openPrintDialogWithData: coreHandlers.openPrintDialogWithData,
    closePrintPreview: coreHandlers.closePrintPreview,
    testPrintSystem: testHandlers.testPrintSystem
  };
}

module.exports = {
  createSavedPrintToolsHandlers
};
