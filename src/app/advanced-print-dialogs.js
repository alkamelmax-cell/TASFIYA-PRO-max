const { createAdvancedPrintSavedDialogHandlers } = require('./advanced-print-dialog-saved-modal');
const { createAdvancedPrintNewDialogHandlers } = require('./advanced-print-dialog-new-modal');
const { createAdvancedPrintDialogTestHandlers } = require('./advanced-print-dialog-tests');

function createAdvancedPrintDialogHandlers(deps) {
  const document = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const getBootstrap = deps.getBootstrap;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  function getBootstrapModal() {
    return getBootstrap().Modal;
  }

  const savedDialogHandlers = createAdvancedPrintSavedDialogHandlers({
    document,
    windowObj,
    getBootstrapModal,
    getDialogUtils,
    printReconciliationAdvanced: deps.printReconciliationAdvanced,
    logger
  });

  const newDialogHandlers = createAdvancedPrintNewDialogHandlers({
    document,
    windowObj,
    getBootstrapModal,
    getDialogUtils,
    logger
  });

  const testHandlers = createAdvancedPrintDialogTestHandlers({
    document,
    prepareReconciliationData: deps.prepareReconciliationData,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getCurrentPrintData: deps.getCurrentPrintData,
    setCurrentPrintData: deps.setCurrentPrintData,
    getAvailablePrinters: deps.getAvailablePrinters,
    initializePrintSystem: deps.initializePrintSystem,
    handlePrintReport: deps.handlePrintReport,
    handleQuickPrint: deps.handleQuickPrint,
    preparePrintData: deps.preparePrintData,
    showPrintSectionDialogForNewReconciliation: newDialogHandlers.showPrintSectionDialogForNewReconciliation,
    selectAllNewPrintSections: newDialogHandlers.selectAllNewPrintSections,
    deselectAllNewPrintSections: newDialogHandlers.deselectAllNewPrintSections,
    confirmNewPrintSections: newDialogHandlers.confirmNewPrintSections,
    logger
  });

  windowObj.selectAllNewPrintSections = newDialogHandlers.selectAllNewPrintSections;
  windowObj.deselectAllNewPrintSections = newDialogHandlers.deselectAllNewPrintSections;
  windowObj.confirmNewPrintSections = newDialogHandlers.confirmNewPrintSections;
  windowObj.testPrintDataStructure = testHandlers.testPrintDataStructure;
  windowObj.testPrintDialog = testHandlers.testPrintDialog;
  windowObj.testNewReconciliationPrintSystem = testHandlers.testNewReconciliationPrintSystem;

  return {
    printReconciliationWithOptions: savedDialogHandlers.printReconciliationWithOptions,
    showPrintSectionDialog: savedDialogHandlers.showPrintSectionDialog,
    selectAllPrintSections: savedDialogHandlers.selectAllPrintSections,
    deselectAllPrintSections: savedDialogHandlers.deselectAllPrintSections,
    confirmPrintSections: savedDialogHandlers.confirmPrintSections,
    showPrintSectionDialogForNewReconciliation: newDialogHandlers.showPrintSectionDialogForNewReconciliation,
    selectAllNewPrintSections: newDialogHandlers.selectAllNewPrintSections,
    deselectAllNewPrintSections: newDialogHandlers.deselectAllNewPrintSections,
    confirmNewPrintSections: newDialogHandlers.confirmNewPrintSections,
    testPrintDataStructure: testHandlers.testPrintDataStructure,
    testPrintDialog: testHandlers.testPrintDialog,
    testNewReconciliationPrintSystem: testHandlers.testNewReconciliationPrintSystem
  };
}

module.exports = {
  createAdvancedPrintDialogHandlers
};
