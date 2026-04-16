function createFinalizationDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const formatting = params.formatting;
  const shellHandlers = params.shellHandlers;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    dialogUtils: core.dialogUtils,
    windowObj: core.windowObj,
    fetchFn: core.fetchFn,
    logger: core.logger,
    ...shared.reconciliationStateDeps,
    validateReconciliationBeforeSave: runtime.preUiHandlers.validateReconciliationBeforeSave,
    formatCurrency: formatting.formatCurrency,
    isSyncEnabled: runtime.preUiHandlers.isSyncEnabled,
    ...shared.reconciliationTableUpdateDeps,
    updateSummary: runtime.reconciliationUiHandlers.updateSummary,
    getResetSystemToNewReconciliationState: () => runtime.preUiHandlers.resetSystemToNewReconciliationState,
    initializeApp: shellHandlers.initializeApp,
    testPrintDataStructure: runtime.printReportHandlers.testPrintDataStructure,
    testPrintDialog: runtime.printReportHandlers.testPrintDialog,
    testNewReconciliationPrintSystem: runtime.printReportHandlers.testNewReconciliationPrintSystem,
    resetSystemToNewReconciliationState: runtime.preUiHandlers.resetSystemToNewReconciliationState,
    EventCtor: core.EventCtor
  };
}

function bindLegacyPreUiHandlers(windowObj, preUiHandlers) {
  windowObj.changePostpaidSalesReportPage = preUiHandlers.changePostpaidSalesReportPage;
  windowObj.updateButtonStates = preUiHandlers.updateButtonStates;
  windowObj.loadReconciliationsList = preUiHandlers.loadReconciliationsList;
  windowObj.recallReconciliationFromId = preUiHandlers.handleRecallFromList;
}

function buildComposedHandlers(shellHandlers, runtime) {
  return {
    shellHandlers,
    preUiHandlers: runtime.preUiHandlers,
    editRuntimeHandlers: runtime.editRuntimeHandlers,
    printReportHandlers: runtime.printReportHandlers,
    reconciliationUiHandlers: runtime.reconciliationUiHandlers,
    appUiHandlers: runtime.appUiHandlers,
    finalizationHandlers: runtime.finalizationHandlers
  };
}

module.exports = {
  createFinalizationDeps,
  bindLegacyPreUiHandlers,
  buildComposedHandlers
};
