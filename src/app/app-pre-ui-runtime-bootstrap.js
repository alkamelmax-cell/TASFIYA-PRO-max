const { initializeAppPreUiBootstrap } = require('./app-pre-ui-bootstrap');

function initializeAppPreUiRuntimeBootstrap(deps) {
  return initializeAppPreUiBootstrap({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    localStorageObj: deps.localStorageObj,
    sessionStorage: deps.sessionStorage,
    dialogUtils: deps.dialogUtils,
    Swal: deps.Swal,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils: deps.getDialogUtils,
    getBootstrap: deps.getBootstrap,
    getCurrentCompanyName: deps.getCurrentCompanyName,
    defaultCompanyName: deps.defaultCompanyName,
    getAutocompleteSystem: deps.getAutocompleteSystem,
    matchMediaFn: deps.matchMediaFn,
    FormDataCtor: deps.FormDataCtor,
    FileReaderCtor: deps.FileReaderCtor,
    ...deps.reconciliationStateDeps,
    getClearAllReconciliationData: deps.getClearAllReconciliationData,
    getUpdateSummary: deps.getUpdateSummary,
    ...deps.reconciliationTableUpdateDeps,
    populateSelect: deps.populateSelect,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    formatDateTime: deps.formatDateTime,
    formatNumber: deps.formatNumber,
    formatDecimal: deps.formatDecimal,
    getCurrentDate: deps.getCurrentDate,
    getCurrentDateTime: deps.getCurrentDateTime,
    getReportTypeLabel: deps.getReportTypeLabel,
    formatPeriodLabel: deps.formatPeriodLabel,
    getDaysBetween: deps.getDaysBetween,
    generateAdvancedReportSummary: deps.generateAdvancedReportSummary,
    determineReportType: deps.determineReportType,
    generateAdvancedReportTableHtml: deps.generateAdvancedReportTableHtml,
    buildAdvancedReportHtml: deps.buildAdvancedReportHtml,
    calculateAccuracyScore: deps.calculateAccuracyScore,
    calculateVolumeScore: deps.calculateVolumeScore,
    calculateConsistencyScore: deps.calculateConsistencyScore,
    calculateOverallRating: deps.calculateOverallRating,
    getPerformanceBadge: deps.getPerformanceBadge,
    generatePerformanceSummary: deps.generatePerformanceSummary,
    generateStarRating: deps.generateStarRating,
    buildPerformanceComprehensivePdfContent: deps.buildPerformanceComprehensivePdfContent,
    generateReportSummary: deps.generateReportSummary,
    prepareExcelData: deps.prepareExcelData,
    buildReconciliationReportHtml: deps.buildReconciliationReportHtml,
    prepareAdvancedReportExcelData: deps.prepareAdvancedReportExcelData,
    applyRuntimeSecuritySettings: deps.applyRuntimeSecuritySettings,
    logger: deps.logger
  });
}

module.exports = {
  initializeAppPreUiRuntimeBootstrap
};
