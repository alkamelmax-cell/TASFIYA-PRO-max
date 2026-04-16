const { createDebugValidationToolsHandlers } = require('./debug-validation-tools');
const { createPrintHtmlGenerator } = require('./print-html-generator');
const { createPrintWindowHandlers } = require('./print-window');
const { createPrintSelectionModalHandlers } = require('./print-selection-modal');
const { createDetailedAtmReportManagementHandlers } = require('./detailed-atm-report-management');
const { createDetailedAtmReportPrintHandlers } = require('./detailed-atm-report-print');
const { createNewReconciliationHandlers } = require('./new-reconciliation');
const { createSavedReconciliationPrintHandlers } = require('./saved-reconciliation-print');
const { createSavedPrintToolsHandlers } = require('./saved-print-tools');
const { createReconciliationUiActions } = require('./reconciliation-ui-actions');
const { createLegacyDebugToolsHandlers } = require('./legacy-debug-tools');

function initializeAppReconciliationUiBootstrap(deps) {
  createDebugValidationToolsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getDataCounts: deps.getDataCounts,
    handleCustomerReceipt: deps.handleCustomerReceipt,
    updateCustomerReceiptsTable: deps.updateCustomerReceiptsTable,
    removeCustomerReceipt: deps.removeCustomerReceipt,
    validateReconciliationBeforeSave: deps.validateReconciliationBeforeSave,
    clearAllReconciliationData: deps.clearAllReconciliationData,
    clearAllFormFields: deps.clearAllFormFields,
    clearAllTables: deps.clearAllTables,
    resetAllTotalsAndSummaries: deps.resetAllTotalsAndSummaries,
    resetSystemToNewReconciliationState: deps.resetSystemToNewReconciliationState,
    handlePrintReport: deps.handlePrintReport,
    handleQuickPrint: deps.handleQuickPrint,
    handlePrintReportsData: deps.handlePrintReportsData,
    handlePrintAdvancedReport: deps.handlePrintAdvancedReport,
    prepareReconciliationData: deps.prepareReconciliationData,
    preparePrintData: deps.preparePrintData,
    showPrintSectionDialogForNewReconciliation: deps.showPrintSectionDialogForNewReconciliation,
    logger: deps.logger
  });

  const { generatePrintHTML } = createPrintHtmlGenerator({
    logger: deps.logger,
    getCurrentPrintReconciliation: deps.getCurrentPrintReconciliation,
    formatDate: deps.formatDate,
    getCurrentDate: deps.getCurrentDate,
    generateBankReceiptsSection: deps.generateBankReceiptsSection,
    generateCashReceiptsSection: deps.generateCashReceiptsSection,
    generatePostpaidSalesSection: deps.generatePostpaidSalesSection,
    generateCustomerReceiptsSection: deps.generateCustomerReceiptsSection,
    generateReturnInvoicesSection: deps.generateReturnInvoicesSection,
    generateSuppliersSection: deps.generateSuppliersSection,
    generateSummarySection: deps.generateSummarySection,
    generateNonColoredPrintStyles: deps.generateNonColoredPrintStyles
  });

  const {
    generatePrintPreview,
    generateAndPrint
  } = createPrintWindowHandlers({
    windowObj: deps.windowObj,
    setTimeoutFn: deps.setTimeoutFn,
    generatePrintHTML,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const {
    showPrintSectionSelectionDialog: showNewPrintSectionSelectionDialog,
    selectAllPrintSections: selectAllSavedPrintSections,
    deselectAllPrintSections: deselectAllSavedPrintSections,
    showPrintPreview: showSavedPrintPreview,
    proceedToPrint: proceedToSavedPrint
  } = createPrintSelectionModalHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    getCurrentPrintReconciliation: deps.getCurrentPrintReconciliation,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    onGeneratePrintPreview: generatePrintPreview,
    onGenerateAndPrint: generateAndPrint,
    logger: deps.logger
  });

  const {
    handleShowDetailedAtmReportModal,
    loadDetailedAtmReportFilters,
    handleGenerateDetailedAtmReport,
    getDetailedAtmReportFilters,
    handleDetailedReportSearch,
    handleDetailedReportSort,
    handleDetailedReportPageSize,
    handleExportDetailedAtmReportExcel,
    getFilteredDetailedReportData
  } = createDetailedAtmReportManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatCurrency: deps.formatCurrency,
    formatDate: deps.formatDate,
    formatDateTime: deps.formatDateTime,
    getBootstrap: deps.getBootstrap,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const {
    handlePrintDetailedAtmReport,
    handlePreviewDetailedAtmReportThermal,
    handlePrintDetailedAtmReportThermal,
    openDetailedAtmReportPrintWindow,
    generateDetailedAtmReportPrintContent
  } = createDetailedAtmReportPrintHandlers({
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    setTimeoutFn: deps.setTimeoutFn,
    getFilteredDetailedReportData,
    getDetailedAtmReportFilters,
    getCompanyName: deps.getCompanyName,
    formatCurrency: deps.formatCurrency,
    getCurrentDateTime: deps.getCurrentDateTime,
    getDialogUtils: deps.getDialogUtils,
    logger: deps.logger
  });

  const {
    handleNewReconciliation
  } = createNewReconciliationHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    setCurrentReconciliation: deps.setCurrentReconciliation,
    updateButtonStates: deps.updateButtonStates,
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
    updateSummary: deps.updateSummary,
    logger: deps.logger
  });

  const {
    printSavedReconciliation,
    loadReconciliationForPrint
  } = createSavedReconciliationPrintHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    setCurrentPrintReconciliation: deps.setCurrentPrintReconciliation,
    onShowPrintSectionSelectionDialog: showNewPrintSectionSelectionDialog,
    logger: deps.logger
  });

  const {
    closePrintPreview
  } = createSavedPrintToolsHandlers({
    document: deps.document,
    windowObj: deps.windowObj,
    ipcRenderer: deps.ipcRenderer,
    setTimeoutFn: deps.setTimeoutFn,
    getDialogUtils: deps.getDialogUtils,
    getCurrentPrintReconciliation: deps.getCurrentPrintReconciliation,
    setCurrentPrintReconciliation: deps.setCurrentPrintReconciliation,
    loadReconciliationForPrint,
    printSavedReconciliation,
    selectAllSavedPrintSections,
    deselectAllSavedPrintSections,
    showPrintSectionSelectionDialog: showNewPrintSectionSelectionDialog,
    showSavedPrintPreview,
    proceedToSavedPrint,
    showThermalPrintSectionDialog: deps.showThermalPrintSectionDialog,
    selectAllThermalSections: deps.selectAllThermalSections,
    deselectAllThermalSections: deps.deselectAllThermalSections,
    getSelectedThermalSections: deps.getSelectedThermalSections,
    proceedWithThermalPrint: deps.proceedWithThermalPrint,
    generateAndPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    generatePrintHTML,
    generatePrintPreview,
    formatCurrency: deps.formatCurrency,
    formatNumber: deps.formatNumber,
    printReconciliationAdvanced: deps.printReconciliationAdvanced,
    logger: deps.logger
  });

  const {
    updateSummary,
    handlePrintReport,
    handleQuickPrint,
    handleSavePdf,
    handleCancelFilter,
    handleCashierChange,
    handleAtmChange,
    loadReportFilters
  } = createReconciliationUiActions({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils: deps.getDialogUtils,
    formatCurrency: deps.formatCurrency,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    getBankReceipts: deps.getBankReceipts,
    getCashReceipts: deps.getCashReceipts,
    getPostpaidSales: deps.getPostpaidSales,
    getCustomerReceipts: deps.getCustomerReceipts,
    getReturnInvoices: deps.getReturnInvoices,
    getSuppliers: deps.getSuppliers,
    showPrintSectionDialogForNewReconciliation: deps.showPrintSectionDialogForNewReconciliation,
    prepareReconciliationData: deps.prepareReconciliationData,
    preparePrintData: deps.preparePrintData,
    clearAllReconciliationData: deps.clearAllReconciliationData,
    resetSystemToNewReconciliationState: deps.resetSystemToNewReconciliationState,
    loadSearchFilters: deps.loadSearchFilters,
    logger: deps.logger
  });

  createLegacyDebugToolsHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    getDialogUtils: deps.getDialogUtils,
    editReconciliationNew: deps.editReconciliationNew,
    loadReconciliationForPrint,
    transformDataForPDFGenerator: deps.transformDataForPDFGenerator,
    getCurrentReconciliation: deps.getCurrentReconciliation,
    setCurrentReconciliation: deps.setCurrentReconciliation,
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
    updateSummary,
    setTimeoutFn: deps.setTimeoutFn,
    logger: deps.logger
  });

  return {
    generatePrintHTML,
    generatePrintPreview,
    generateAndPrint,
    showNewPrintSectionSelectionDialog,
    selectAllSavedPrintSections,
    deselectAllSavedPrintSections,
    showSavedPrintPreview,
    proceedToSavedPrint,
    handleShowDetailedAtmReportModal,
    loadDetailedAtmReportFilters,
    handleGenerateDetailedAtmReport,
    getDetailedAtmReportFilters,
    handleDetailedReportSearch,
    handleDetailedReportSort,
    handleDetailedReportPageSize,
    handleExportDetailedAtmReportExcel,
    getFilteredDetailedReportData,
    handlePrintDetailedAtmReport,
    handlePreviewDetailedAtmReportThermal,
    handlePrintDetailedAtmReportThermal,
    openDetailedAtmReportPrintWindow,
    generateDetailedAtmReportPrintContent,
    handleNewReconciliation,
    printSavedReconciliation,
    loadReconciliationForPrint,
    closePrintPreview,
    updateSummary,
    handlePrintReport,
    handleQuickPrint,
    handleSavePdf,
    handleCancelFilter,
    handleCashierChange,
    handleAtmChange,
    loadReportFilters
  };
}

module.exports = {
  initializeAppReconciliationUiBootstrap
};
