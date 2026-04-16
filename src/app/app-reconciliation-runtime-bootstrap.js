const { initializeAppReconciliationUiBootstrap } = require('./app-reconciliation-ui-bootstrap');

function initializeAppReconciliationRuntimeBootstrap(deps) {
  return initializeAppReconciliationUiBootstrap({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils: deps.getDialogUtils,
    getBootstrap: deps.getBootstrap,
    ...deps.reconciliationStateDeps,
    ...deps.printRuntimeStateDeps,
    handleCustomerReceipt: deps.handleCustomerReceipt,
    updateCustomerReceiptsTable: deps.updateCustomerReceiptsTable,
    removeCustomerReceipt: deps.removeCustomerReceipt,
    validateReconciliationBeforeSave: deps.validateReconciliationBeforeSave,
    clearAllReconciliationData: deps.clearAllReconciliationData,
    clearAllFormFields: deps.clearAllFormFields,
    clearAllTables: deps.clearAllTables,
    resetAllTotalsAndSummaries: deps.resetAllTotalsAndSummaries,
    resetSystemToNewReconciliationState: deps.resetSystemToNewReconciliationState,
    handlePrintReportsData: deps.handlePrintReportsData,
    handlePrintAdvancedReport: deps.handlePrintAdvancedReport,
    prepareReconciliationData: deps.prepareReconciliationData,
    preparePrintData: deps.preparePrintData,
    showPrintSectionDialogForNewReconciliation: deps.showPrintSectionDialogForNewReconciliation,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    formatDateTime: deps.formatDateTime,
    formatNumber: deps.formatNumber,
    getCurrentDate: deps.getCurrentDate,
    getCurrentDateTime: deps.getCurrentDateTime,
    generateBankReceiptsSection: deps.generateBankReceiptsSection,
    generateCashReceiptsSection: deps.generateCashReceiptsSection,
    generatePostpaidSalesSection: deps.generatePostpaidSalesSection,
    generateCustomerReceiptsSection: deps.generateCustomerReceiptsSection,
    generateReturnInvoicesSection: deps.generateReturnInvoicesSection,
    generateSuppliersSection: deps.generateSuppliersSection,
    generateSummarySection: deps.generateSummarySection,
    generateNonColoredPrintStyles: deps.generateNonColoredPrintStyles,
    getCompanyName: deps.getCompanyName,
    updateButtonStates: deps.updateButtonStates,
    ...deps.reconciliationTableUpdateDeps,
    showThermalPrintSectionDialog: deps.showThermalPrintSectionDialog,
    selectAllThermalSections: deps.selectAllThermalSections,
    deselectAllThermalSections: deps.deselectAllThermalSections,
    getSelectedThermalSections: deps.getSelectedThermalSections,
    proceedWithThermalPrint: deps.proceedWithThermalPrint,
    printReconciliationAdvanced: deps.printReconciliationAdvanced,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    loadSearchFilters: deps.loadSearchFilters,
    editReconciliationNew: deps.editReconciliationNew,
    logger: deps.logger
  });
}

module.exports = {
  initializeAppReconciliationRuntimeBootstrap
};
