const { createAdvancedPrintSettingsHandlers } = require('./advanced-print-settings');
const { createAdvancedPrintWorkflowHandlers } = require('./advanced-print-workflow');
const { createReconciliationOperationsHandlers } = require('./reconciliation-operations');
const { createThermalDirectPrintHandlers } = require('./thermal-direct-print');
const { createReportsManagementHandlers } = require('./reports-management');
const { createAdvancedPrintDialogHandlers } = require('./advanced-print-dialogs');

function initializeAppPrintReportBootstrap(deps) {
  const {
    initializePrintSystem,
    getPrintSettings
  } = createAdvancedPrintSettingsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    getAvailablePrinters: deps.getAvailablePrinters,
    setAvailablePrinters: deps.setAvailablePrinters,
    logger: deps.logger
  });

  const {
    showAdvancedPrintDialog,
    handleDirectPrint,
    handlePrintPreview,
    printReconciliationAdvanced,
    preparePrintData
  } = createAdvancedPrintWorkflowHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    getBootstrap: deps.getBootstrap,
    initializePrintSystem,
    getPrintSettings,
    getAvailablePrinters: deps.getAvailablePrinters,
    getCurrentPrintData: deps.getCurrentPrintData,
    setCurrentPrintData: deps.setCurrentPrintData,
    defaultCompanyName: deps.defaultCompanyName,
    logger: deps.logger
  });

  const {
    prepareReconciliationData,
    prepareReconciliationDataById,
    deleteReconciliation,
    viewReconciliation,
    printReconciliation,
    generatePDFReconciliation
  } = createReconciliationOperationsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    loadSavedReconciliations: deps.loadSavedReconciliations,
    showAdvancedPrintDialog,
    loadReconciliationForPrint: deps.loadReconciliationForPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    getSuppliers: deps.getSuppliers,
    logger: deps.logger
  });

  const {
    handleThermalPrinterPreview,
    showThermalPrintOptionsDialog,
    handleThermalPrinterPrint
  } = createThermalDirectPrintHandlers({
    document: deps.document,
    Swal: deps.Swal,
    ipcRenderer: deps.ipcRenderer,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils: deps.getDialogUtils,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    getSuppliers: deps.getSuppliers,
    prepareReconciliationData,
    logger: deps.logger
  });

  const {
    loadAdvancedReportFilters,
    loadEnhancedReportFilters,
    handleReportBranchFilterChange,
    handleGenerateReport,
    handleExportReportPdf,
    handleExportReportExcel,
    handlePrintReportsData,
    handleClearReportFilters,
    toggleSummaryView,
    toggleChartView
  } = createReportsManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    getCompanyName: deps.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    generateReportSummary: deps.generateReportSummary,
    prepareExcelData: deps.prepareExcelData,
    buildReconciliationReportHtml: deps.buildReconciliationReportHtml,
    logger: deps.logger
  });

  const {
    printReconciliationWithOptions,
    showPrintSectionDialog,
    selectAllPrintSections,
    deselectAllPrintSections,
    confirmPrintSections,
    showPrintSectionDialogForNewReconciliation,
    selectAllNewPrintSections,
    deselectAllNewPrintSections,
    confirmNewPrintSections,
    testPrintDataStructure,
    testPrintDialog,
    testNewReconciliationPrintSystem
  } = createAdvancedPrintDialogHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    prepareReconciliationData,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getCurrentPrintData: deps.getCurrentPrintData,
    setCurrentPrintData: deps.setCurrentPrintData,
    getAvailablePrinters: deps.getAvailablePrinters,
    initializePrintSystem,
    printReconciliationAdvanced,
    handlePrintReport: deps.handlePrintReport,
    handleQuickPrint: deps.handleQuickPrint,
    preparePrintData,
    logger: deps.logger
  });

  return {
    initializePrintSystem,
    getPrintSettings,
    showAdvancedPrintDialog,
    handleDirectPrint,
    handlePrintPreview,
    printReconciliationAdvanced,
    preparePrintData,
    prepareReconciliationData,
    prepareReconciliationDataById,
    deleteReconciliation,
    viewReconciliation,
    printReconciliation,
    generatePDFReconciliation,
    handleThermalPrinterPreview,
    showThermalPrintOptionsDialog,
    handleThermalPrinterPrint,
    loadAdvancedReportFilters,
    loadEnhancedReportFilters,
    handleReportBranchFilterChange,
    handleGenerateReport,
    handleExportReportPdf,
    handleExportReportExcel,
    handlePrintReportsData,
    handleClearReportFilters,
    toggleSummaryView,
    toggleChartView,
    printReconciliationWithOptions,
    showPrintSectionDialog,
    selectAllPrintSections,
    deselectAllPrintSections,
    confirmPrintSections,
    showPrintSectionDialogForNewReconciliation,
    selectAllNewPrintSections,
    deselectAllNewPrintSections,
    confirmNewPrintSections,
    testPrintDataStructure,
    testPrintDialog,
    testNewReconciliationPrintSystem
  };
}

module.exports = {
  initializeAppPrintReportBootstrap
};
