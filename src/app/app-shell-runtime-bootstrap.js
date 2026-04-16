const { createAppShellHandlers } = require('./app-shell-handlers');

function createRuntimeHandlerForwarder(getRuntimeHandlers, handlerName) {
  return (...args) => {
    const runtimeHandlers = getRuntimeHandlers();
    const handler = runtimeHandlers ? runtimeHandlers[handlerName] : null;

    if (typeof handler !== 'function') {
      return undefined;
    }

    return handler(...args);
  };
}

function initializeAppShellRuntimeBootstrap(deps) {
  const runtimeHandlerNames = [
    'applyTheme',
    'setupEventListeners',
    'updateButtonStates',
    'initializeSidebarToggle',
    'loadSystemSettings',
    'handleBranchSelectionChange',
    'initializePrintSystem',
    'initializeThermalPrinterSettings',
    'initializeEditModeEventListeners',
    'initializeAutocomplete',
    'initializeSyncControls',
    'initializeReconciliationsListModal',
    'handleSaveReconciliation',
    'handlePrintReport',
    'handleGenerateReport',
    'toggleSidebar',
    'handleBranchChange',
    'showError',
    'loadBranches',
    'loadCashiersList',
    'loadCashboxes',
    'loadCashboxFilters',
    'loadAdminsList',
    'loadAccountantsList',
    'loadAtmsList',
    'loadATMsList',
    'loadBanksList',
    'loadSuppliersList',
    'loadCustomersList',
    'loadCustomerLedger',
    'loadCustomerLedgerFilters',
    'loadSupplierLedger',
    'loadSupplierLedgerFilters',
    'loadReportsList',
    'loadReconciliationsList',
    'loadSavedReconciliations',
    'loadSearchFilters',
    'loadReportFilters',
    'loadAdvancedReportFilters',
    'loadCashierPerformanceFilters',
    'loadAllSettings',
    'loadCustomersForDropdowns',
    'loadSuppliersForDropdowns',
    'loadEnhancedReportFilters',
    'loadPostpaidSalesReportFilters',
    'loadBranchesForAtms',
    'resetUIOnly',
    'clearAllReconciliationData',
    'resetSystemToNewReconciliationState'
  ];

  const forwardedHandlers = {};
  runtimeHandlerNames.forEach((handlerName) => {
    forwardedHandlers[handlerName] = createRuntimeHandlerForwarder(deps.getRuntimeHandlers, handlerName);
  });

  return createAppShellHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    localStorageObj: deps.localStorageObj,
    setTimeoutFn: deps.setTimeoutFn,
    keyboardShortcuts: deps.keyboardShortcuts,
    Swal: deps.Swal,
    bootstrap: deps.bootstrap,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger,
    ...deps.reconciliationStateDeps,
    setCurrentUser: deps.setCurrentUser,
    hasSectionAccess: deps.hasSectionAccess,
    getFirstAllowedSection: deps.getFirstAllowedSection,
    hasPermission: deps.hasPermission,
    normalizeUser: deps.normalizeUser,
    applyPermissionsToDocument: deps.applyPermissionsToDocument,
    ...forwardedHandlers
  });
}

module.exports = {
  initializeAppShellRuntimeBootstrap
};
