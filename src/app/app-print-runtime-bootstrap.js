const { initializeAppPrintReportBootstrap } = require('./app-print-report-bootstrap');

function initializeAppPrintRuntimeBootstrap(deps) {
  return initializeAppPrintReportBootstrap({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    Swal: deps.Swal,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils: deps.getDialogUtils,
    getBootstrap: deps.getBootstrap,
    ...deps.printRuntimeStateDeps,
    defaultCompanyName: deps.defaultCompanyName,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    getCompanyName: deps.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    generateReportSummary: deps.generateReportSummary,
    prepareExcelData: deps.prepareExcelData,
    buildReconciliationReportHtml: deps.buildReconciliationReportHtml,
    loadSavedReconciliations: deps.loadSavedReconciliations,
    loadReconciliationForPrint: deps.loadReconciliationForPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    ...deps.reconciliationStateDeps,
    handlePrintReport: deps.handlePrintReport,
    handleQuickPrint: deps.handleQuickPrint,
    logger: deps.logger
  });
}

module.exports = {
  initializeAppPrintRuntimeBootstrap
};
