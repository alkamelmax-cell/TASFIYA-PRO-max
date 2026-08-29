const { createPrintSectionBuilders } = require('./print-section-builders');
const { createPdfDataTransformer } = require('./pdf-data-transformer');
const { createThermalPrintSections } = require('./thermal-print-sections');
const { createThermalPrinterSettingsHandlers } = require('./thermal-printer-settings');
const { createAutocompleteHelpers } = require('./autocomplete-helpers');
const { createSyncControl } = require('./sync-control');
const { createSystemSettingsHandlers } = require('./system-settings');
const { createBackupRestoreManagementHandlers } = require('./backup-restore-management');
const { createPostpaidSalesReportHandlers } = require('./postpaid-sales-report');
const { createAdvancedReportsHandlers } = require('./advanced-reports');
const { createCashierPerformanceComparisonHandlers } = require('./cashier-performance-comparison');
const { createReconciliationStateControls } = require('./reconciliation-state-controls');
const { createReconciliationRecallHandlers } = require('./reconciliation-recall');
const { createReconciliationListHandlers } = require('./reconciliation-list');
const { createSavedReconciliationsHandlers } = require('./saved-reconciliations');

function initializeAppPreUiBootstrap(deps) {
  const printSectionBuilders = createPrintSectionBuilders({
    formatCurrency: deps.formatCurrency,
    formatNumber: deps.formatNumber,
    formatDate: deps.formatDate,
    logger: deps.logger
  });

  const { transformDataForPDFGenerator } = createPdfDataTransformer({
    logger: deps.logger,
    getCurrentCompanyName: deps.getCurrentCompanyName,
    defaultCompanyName: deps.defaultCompanyName
  });

  const thermalPrintSections = createThermalPrintSections({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const { initializeThermalPrinterSettings } = createThermalPrinterSettingsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const { initializeAutocomplete } = createAutocompleteHelpers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getAutocompleteSystem: deps.getAutocompleteSystem,
    formatDecimal: deps.formatDecimal,
    logger: deps.logger
  });

  const { isSyncEnabled, initializeSyncControls } = createSyncControl({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    Swal: deps.Swal,
    logger: deps.logger
  });

  const systemSettingsHandlers = createSystemSettingsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    localStorageObj: deps.localStorageObj,
    matchMediaFn: deps.matchMediaFn,
    getCurrentDate: deps.getCurrentDate,
    getCurrentDateTime: deps.getCurrentDateTime,
    FormDataCtor: deps.FormDataCtor,
    FileReaderCtor: deps.FileReaderCtor,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const backupRestoreHandlers = createBackupRestoreManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    Swal: deps.Swal,
    setTimeoutFn: deps.setTimeoutFn,
    showThermalPrintSectionDialog: thermalPrintSections.showThermalPrintSectionDialog,
    transformDataForPDFGenerator,
    getCurrentUser: deps.getCurrentUser,
    setCurrentUser: deps.setCurrentUser,
    applyRuntimeSecuritySettings: deps.applyRuntimeSecuritySettings,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const postpaidSalesReportHandlers = createPostpaidSalesReportHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    getCompanyName: systemSettingsHandlers.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    formatDecimal: deps.formatDecimal,
    formatDate: deps.formatDate,
    logger: deps.logger
  });

  const advancedReportsHandlers = createAdvancedReportsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    getReportTypeLabel: deps.getReportTypeLabel,
    formatDecimal: deps.formatDecimal,
    formatPeriodLabel: deps.formatPeriodLabel,
    getDaysBetween: deps.getDaysBetween,
    formatCurrency: deps.formatCurrency,
    generateAdvancedReportSummary: deps.generateAdvancedReportSummary,
    prepareAdvancedReportExcelData: deps.prepareAdvancedReportExcelData,
    determineReportType: deps.determineReportType,
    getCompanyName: systemSettingsHandlers.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    generateAdvancedReportTableHtml: deps.generateAdvancedReportTableHtml,
    buildAdvancedReportHtml: deps.buildAdvancedReportHtml,
    logger: deps.logger
  });

  const cashierPerformanceComparisonHandlers = createCashierPerformanceComparisonHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    calculateAccuracyScore: deps.calculateAccuracyScore,
    calculateVolumeScore: deps.calculateVolumeScore,
    calculateConsistencyScore: deps.calculateConsistencyScore,
    calculateOverallRating: deps.calculateOverallRating,
    getPerformanceBadge: deps.getPerformanceBadge,
    generatePerformanceSummary: deps.generatePerformanceSummary,
    generateStarRating: deps.generateStarRating,
    buildPerformanceComprehensivePdfContent: deps.buildPerformanceComprehensivePdfContent,
    formatNumber: deps.formatNumber,
    formatCurrency: deps.formatCurrency,
    getCurrentDate: deps.getCurrentDate,
    logger: deps.logger
  });

  const reconciliationStateControls = createReconciliationStateControls({
    document: deps.document,
    sessionStorage: deps.sessionStorage,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getDataCounts: deps.getDataCounts,
    logger: deps.logger
  });

  const recallHandlers = createReconciliationRecallHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    getBootstrap: deps.getBootstrap,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    clearAllReconciliationData: (...args) => deps.getClearAllReconciliationData()(...args),
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
    updateSummary: (...args) => deps.getUpdateSummary()(...args),
    logger: deps.logger
  });

  const reconciliationsListHandlers = createReconciliationListHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    dialogUtils: deps.dialogUtils,
    onRecall: recallHandlers.handleRecallFromList,
    logger: deps.logger
  });

  const savedReconciliationsHandlers = createSavedReconciliationsHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    ipcRenderer: deps.ipcRenderer,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    populateSelect: deps.populateSelect,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  return {
    ...printSectionBuilders,
    transformDataForPDFGenerator,
    ...thermalPrintSections,
    initializeThermalPrinterSettings,
    initializeAutocomplete,
    isSyncEnabled,
    initializeSyncControls,
    ...systemSettingsHandlers,
    ...backupRestoreHandlers,
    ...postpaidSalesReportHandlers,
    ...advancedReportsHandlers,
    ...cashierPerformanceComparisonHandlers,
    ...reconciliationStateControls,
    ...recallHandlers,
    ...reconciliationsListHandlers,
    ...savedReconciliationsHandlers
  };
}

module.exports = {
  initializeAppPreUiBootstrap
};
