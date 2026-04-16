const { initializeAppUiBootstrap } = require('./app-ui-bootstrap');

function initializeAppUiRuntimeBootstrap(deps) {
  const uiEventHandlers = {
    ...deps.shellHandlers,
    ...deps.dataEntryHandlers,
    ...deps.preUiHandlers,
    ...deps.printReportHandlers,
    ...deps.reconciliationUiHandlers,
    handleBranchChange: deps.handleBranchChange,
    handleOperationTypeChange: deps.handleOperationTypeChange,
    handleEditOperationTypeChange: deps.handleEditOperationTypeChange,
    handleSaveReconciliation: (...args) => deps.getHandleSaveReconciliation()(...args)
  };

  return initializeAppUiBootstrap({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    localStorageObj: deps.localStorageObj,
    formatDate: deps.formatDate,
    populateSelect: deps.populateSelect,
    loadDropdownData: deps.loadDropdownData,
    getDialogUtils: deps.getDialogUtils,
    eventHandlers: uiEventHandlers,
    logger: deps.logger
  });
}

module.exports = {
  initializeAppUiRuntimeBootstrap
};
