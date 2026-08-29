const {
  createFinalizationDeps,
  bindLegacyPreUiHandlers,
  buildComposedHandlers
} = require('./app-composition-finalizers');

function createShellRuntimeDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const shell = params.shell;
  const editTableHandlers = params.editTableHandlers;
  const runtime = params.runtime;

  function getGlobalRuntimeHandler(handlerName) {
    if (core.windowObj && typeof core.windowObj[handlerName] === 'function') {
      return core.windowObj[handlerName];
    }

    if (typeof globalThis[handlerName] === 'function') {
      return globalThis[handlerName];
    }

    return null;
  }

  return {
    document: core.document,
    windowObj: core.windowObj,
    localStorageObj: core.localStorageObj,
    setTimeoutFn: core.setTimeoutFn,
    keyboardShortcuts: shell.keyboardShortcuts,
    Swal: core.Swal,
    bootstrap: core.bootstrap,
    ipcRenderer: core.ipcRenderer,
    getDialogUtils: () => core.dialogUtils,
    logger: core.logger,
    reconciliationStateDeps: shared.reconciliationStateDeps,
    setCurrentUser: shell.setCurrentUser,
    hasSectionAccess: shell.hasSectionAccess,
    getFirstAllowedSection: shell.getFirstAllowedSection,
    hasPermission: shell.hasPermission,
    normalizeUser: shell.normalizeUser,
    applyPermissionsToDocument: shell.applyPermissionsToDocument,
    getRuntimeHandlers: () => ({
      ...(runtime.preUiHandlers || {}),
      ...(runtime.printReportHandlers || {}),
      ...(runtime.reconciliationUiHandlers || {}),
      ...(runtime.appUiHandlers || {}),
      ...(runtime.editRuntimeHandlers || {}),
      ...(runtime.finalizationHandlers || {}),
      initializeEditModeEventListeners: editTableHandlers.initializeEditModeEventListeners,
      handleBranchChange: shell.handleBranchChange,
      showError: shell.showError,
      loadATMsList: (...args) => runtime.appUiHandlers?.loadAtmsList?.(...args),
      loadCustomersForDropdowns: shell.loadCustomersForDropdowns,
      loadSuppliersForDropdowns: shell.loadSuppliersForDropdowns,
      loadBanksList: () => {},
      loadSuppliersList: () => {},
      loadCustomersList: () => {},
      loadCashboxes: (...args) => {
        const handler = getGlobalRuntimeHandler('loadCashboxes');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadCashboxFilters: (...args) => {
        const handler = getGlobalRuntimeHandler('loadCashboxFilters');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadCustomerLedger: (...args) => {
        const handler = getGlobalRuntimeHandler('loadCustomerLedger');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadCustomerLedgerFilters: (...args) => {
        const handler = getGlobalRuntimeHandler('loadCustomerLedgerFilters');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadSupplierLedger: (...args) => {
        const handler = getGlobalRuntimeHandler('loadSupplierLedger');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadSupplierLedgerFilters: (...args) => {
        const handler = getGlobalRuntimeHandler('loadSupplierLedgerFilters');
        return typeof handler === 'function' ? handler(...args) : undefined;
      },
      loadReportsList: () => {},
      resetUIOnly: (...args) => runtime.finalizationHandlers?.resetUIOnly?.(...args),
      clearAllReconciliationData: (...args) => runtime.finalizationHandlers?.clearAllReconciliationData?.(...args),
      resetSystemToNewReconciliationState: (...args) => runtime.preUiHandlers?.resetSystemToNewReconciliationState?.(...args)
    })
  };
}

function createPreUiRuntimeDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const shellHandlers = params.shellHandlers;
  const formatting = params.formatting;
  const report = params.report;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    windowObj: core.windowObj,
    localStorageObj: core.localStorageObj,
    sessionStorage: core.sessionStorage,
    dialogUtils: core.dialogUtils,
    Swal: core.Swal,
    setTimeoutFn: core.setTimeoutFn,
    getDialogUtils: () => core.dialogUtils,
    getBootstrap: () => core.bootstrap,
    getCurrentCompanyName: () => core.windowObj.currentCompanyName,
    defaultCompanyName: params.defaultCompanyName,
    getAutocompleteSystem: params.getAutocompleteSystem,
    matchMediaFn: params.matchMediaFn,
    FormDataCtor: core.FormDataCtor,
    FileReaderCtor: core.FileReaderCtor,
    reconciliationStateDeps: shared.reconciliationStateDeps,
    getClearAllReconciliationData: () => runtime.finalizationHandlers?.clearAllReconciliationData,
    getUpdateSummary: () => runtime.reconciliationUiHandlers?.updateSummary,
    reconciliationTableUpdateDeps: shared.reconciliationTableUpdateDeps,
    populateSelect: shellHandlers.populateSelect,
    formatDate: formatting.formatDate,
    formatCurrency: formatting.formatCurrency,
    formatDateTime: formatting.formatDateTime,
    formatNumber: formatting.formatNumber,
    formatDecimal: formatting.formatDecimal,
    getCurrentDate: formatting.getCurrentDate,
    getCurrentDateTime: formatting.getCurrentDateTime,
    getReportTypeLabel: report.getReportTypeLabel,
    formatPeriodLabel: report.formatPeriodLabel,
    getDaysBetween: report.getDaysBetween,
    generateAdvancedReportSummary: report.generateAdvancedReportSummary,
    determineReportType: report.determineReportType,
    generateAdvancedReportTableHtml: report.generateAdvancedReportTableHtml,
    buildAdvancedReportHtml: report.buildAdvancedReportHtml,
    calculateAccuracyScore: report.calculateAccuracyScore,
    calculateVolumeScore: report.calculateVolumeScore,
    calculateConsistencyScore: report.calculateConsistencyScore,
    calculateOverallRating: report.calculateOverallRating,
    getPerformanceBadge: report.getPerformanceBadge,
    generatePerformanceSummary: report.generatePerformanceSummary,
    generateStarRating: report.generateStarRating,
    buildPerformanceComprehensivePdfContent: report.buildPerformanceComprehensivePdfContent,
    generateReportSummary: report.generateReportSummary,
    prepareExcelData: report.prepareExcelData,
    buildReconciliationReportHtml: report.buildReconciliationReportHtml,
    prepareAdvancedReportExcelData: report.prepareAdvancedReportExcelData,
    applyRuntimeSecuritySettings: (...args) => shellHandlers?.applyRuntimeSecuritySettings?.(...args),
    logger: core.logger
  };
}

function createEditRuntimeDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const edit = params.edit;
  const dataEntryHandlers = params.dataEntryHandlers;
  const editTableHandlers = params.editTableHandlers;
  const formatting = params.formatting;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    windowObj: core.windowObj,
    getBootstrap: () => core.bootstrap,
    getDialogUtils: () => core.dialogUtils,
    validateEditForm: edit.validateEditForm,
    collectEditFormData: edit.collectEditFormData,
    getLoadSavedReconciliations: () => runtime.preUiHandlers?.loadSavedReconciliations,
    updateEditTotals: editTableHandlers.updateEditTotals,
    populateEditBankReceiptsTable: editTableHandlers.populateEditBankReceiptsTable,
    populateEditCashReceiptsTable: editTableHandlers.populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable: editTableHandlers.populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable: editTableHandlers.populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable: editTableHandlers.populateEditReturnInvoicesTable,
    populateEditSuppliersTable: editTableHandlers.populateEditSuppliersTable,
    isExistingCustomer: dataEntryHandlers.isExistingCustomer,
    isExistingCustomerInBranch: dataEntryHandlers.isExistingCustomerInBranch,
    isExistingSupplier: dataEntryHandlers.isExistingSupplier,
    isExistingSupplierInBranch: dataEntryHandlers.isExistingSupplierInBranch,
    getCurrentUser: edit.getCurrentUser,
    ...shared.reconciliationStateDeps,
    setTimeoutFn: core.setTimeoutFn,
    getEditMode: edit.getEditMode,
    formatDate: formatting.formatDate,
    EventCtor: core.EventCtor,
    getUpdateButtonStates: () => runtime.preUiHandlers?.updateButtonStates,
    getApplyTheme: () => runtime.preUiHandlers?.applyTheme,
    logger: core.logger
  };
}

function createPrintRuntimeDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const formatting = params.formatting;
  const report = params.report;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    windowObj: core.windowObj,
    Swal: core.Swal,
    setTimeoutFn: core.setTimeoutFn,
    getDialogUtils: () => core.dialogUtils,
    getBootstrap: () => core.bootstrap,
    printRuntimeStateDeps: shared.printRuntimeStateDeps,
    defaultCompanyName: params.defaultCompanyName,
    formatDate: formatting.formatDate,
    formatCurrency: formatting.formatCurrency,
    getCompanyName: runtime.preUiHandlers.getCompanyName,
    getCurrentDate: formatting.getCurrentDate,
    generateReportSummary: report.generateReportSummary,
    prepareExcelData: report.prepareExcelData,
    buildReconciliationReportHtml: report.buildReconciliationReportHtml,
    loadSavedReconciliations: (...args) => runtime.preUiHandlers.loadSavedReconciliations(...args),
    loadReconciliationForPrint: (...args) => runtime.reconciliationUiHandlers?.loadReconciliationForPrint?.(...args),
    transformDataForPDFGenerator: runtime.preUiHandlers.transformDataForPDFGenerator,
    reconciliationStateDeps: shared.reconciliationStateDeps,
    handlePrintReport: (...args) => runtime.reconciliationUiHandlers?.handlePrintReport?.(...args),
    handleQuickPrint: (...args) => runtime.reconciliationUiHandlers?.handleQuickPrint?.(...args),
    logger: core.logger
  };
}

function createReconciliationRuntimeDeps(params) {
  const core = params.core;
  const shared = params.shared;
  const dataEntryHandlers = params.dataEntryHandlers;
  const formatting = params.formatting;
  const printStyleDeps = params.printStyleDeps;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    windowObj: core.windowObj,
    setTimeoutFn: core.setTimeoutFn,
    getDialogUtils: () => core.dialogUtils,
    getBootstrap: () => core.bootstrap,
    reconciliationStateDeps: shared.reconciliationStateDeps,
    printRuntimeStateDeps: shared.printRuntimeStateDeps,
    handleCustomerReceipt: dataEntryHandlers.handleCustomerReceipt,
    updateCustomerReceiptsTable: dataEntryHandlers.updateCustomerReceiptsTable,
    removeCustomerReceipt: dataEntryHandlers.removeCustomerReceipt,
    validateReconciliationBeforeSave: runtime.preUiHandlers.validateReconciliationBeforeSave,
    clearAllReconciliationData: (...args) => runtime.finalizationHandlers?.clearAllReconciliationData?.(...args),
    clearAllFormFields: (...args) => runtime.finalizationHandlers?.clearAllFormFields?.(...args),
    clearAllTables: (...args) => runtime.finalizationHandlers?.clearAllTables?.(...args),
    resetAllTotalsAndSummaries: (...args) => runtime.finalizationHandlers?.resetAllTotalsAndSummaries?.(...args),
    resetSystemToNewReconciliationState: runtime.preUiHandlers.resetSystemToNewReconciliationState,
    handlePrintReportsData: runtime.printReportHandlers.handlePrintReportsData,
    handlePrintAdvancedReport: runtime.preUiHandlers.handlePrintAdvancedReport,
    prepareReconciliationData: runtime.printReportHandlers.prepareReconciliationData,
    preparePrintData: runtime.printReportHandlers.preparePrintData,
    showPrintSectionDialogForNewReconciliation: runtime.printReportHandlers.showPrintSectionDialogForNewReconciliation,
    formatDate: formatting.formatDate,
    formatCurrency: formatting.formatCurrency,
    formatDateTime: formatting.formatDateTime,
    formatNumber: formatting.formatNumber,
    getCurrentDate: formatting.getCurrentDate,
    getCurrentDateTime: formatting.getCurrentDateTime,
    generateBankReceiptsSection: runtime.preUiHandlers.generateBankReceiptsSection,
    generateCashReceiptsSection: runtime.preUiHandlers.generateCashReceiptsSection,
    generatePostpaidSalesSection: runtime.preUiHandlers.generatePostpaidSalesSection,
    generateCustomerReceiptsSection: runtime.preUiHandlers.generateCustomerReceiptsSection,
    generateReturnInvoicesSection: runtime.preUiHandlers.generateReturnInvoicesSection,
    generateSuppliersSection: runtime.preUiHandlers.generateSuppliersSection,
    generateSummarySection: runtime.preUiHandlers.generateSummarySection,
    generateNonColoredPrintStyles: printStyleDeps.generateNonColoredPrintStyles,
    getCompanyName: runtime.preUiHandlers.getCompanyName,
    updateButtonStates: runtime.preUiHandlers.updateButtonStates,
    updateSummary: (...args) => runtime.reconciliationUiHandlers?.updateSummary?.(...args),
    reconciliationTableUpdateDeps: shared.reconciliationTableUpdateDeps,
    showThermalPrintSectionDialog: runtime.preUiHandlers.showThermalPrintSectionDialog,
    selectAllThermalSections: runtime.preUiHandlers.selectAllThermalSections,
    deselectAllThermalSections: runtime.preUiHandlers.deselectAllThermalSections,
    getSelectedThermalSections: runtime.preUiHandlers.getSelectedThermalSections,
    proceedWithThermalPrint: runtime.preUiHandlers.proceedWithThermalPrint,
    printReconciliationAdvanced: runtime.printReportHandlers.printReconciliationAdvanced,
    transformDataForPDFGenerator: runtime.preUiHandlers.transformDataForPDFGenerator,
    loadSearchFilters: runtime.preUiHandlers.loadSearchFilters,
    editReconciliationNew: runtime.editRuntimeHandlers.editReconciliationNew,
    logger: core.logger
  };
}

function createUiRuntimeDeps(params) {
  const core = params.core;
  const shell = params.shell;
  const formatting = params.formatting;
  const shellHandlers = params.shellHandlers;
  const dataEntryHandlers = params.dataEntryHandlers;
  const runtime = params.runtime;

  return {
    document: core.document,
    ipcRenderer: core.ipcRenderer,
    windowObj: core.windowObj,
    localStorageObj: core.localStorageObj,
    formatDate: formatting.formatDate,
    populateSelect: shellHandlers.populateSelect,
    loadDropdownData: shellHandlers.loadDropdownData,
    getDialogUtils: () => core.dialogUtils,
    shellHandlers,
    dataEntryHandlers,
    preUiHandlers: runtime.preUiHandlers,
    printReportHandlers: runtime.printReportHandlers,
    reconciliationUiHandlers: runtime.reconciliationUiHandlers,
    handleBranchChange: shell.handleBranchChange,
    handleOperationTypeChange: shell.handleOperationTypeChange,
    handleEditOperationTypeChange: shell.handleEditOperationTypeChange,
    getHandleSaveReconciliation: () => runtime.finalizationHandlers?.handleSaveReconciliation,
    logger: core.logger
  };
}

module.exports = {
  createShellRuntimeDeps,
  createPreUiRuntimeDeps,
  createEditRuntimeDeps,
  createPrintRuntimeDeps,
  createReconciliationRuntimeDeps,
  createUiRuntimeDeps,
  createFinalizationDeps,
  bindLegacyPreUiHandlers,
  buildComposedHandlers
};
