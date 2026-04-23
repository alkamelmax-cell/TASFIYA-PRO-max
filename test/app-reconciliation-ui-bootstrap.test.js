const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppReconciliationUiBootstrap } = require('../src/app/app-reconciliation-ui-bootstrap');

function createElementMock() {
  return {
    addEventListener() {},
    querySelector() {
      return createElementMock();
    },
    querySelectorAll() {
      return [];
    },
    appendChild() {},
    remove() {},
    reset() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    value: '',
    checked: false,
    innerHTML: '',
    textContent: ''
  };
}

function createDocumentMock() {
  return {
    getElementById() {
      return createElementMock();
    },
    querySelector() {
      return createElementMock();
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return createElementMock();
    }
  };
}

test('initializeAppReconciliationUiBootstrap returns composed handlers', () => {
  const documentMock = createDocumentMock();
  const windowMock = { addEventListener() {}, localStorage: { getItem() { return null; }, setItem() {} } };
  const dialogUtils = {
    showError() {},
    showValidationError() {},
    showSuccessToast() {},
    showLoading() {},
    close() {},
    showSuccess() {}
  };

  let currentReconciliation = null;
  let currentPrintReconciliation = null;
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const result = initializeAppReconciliationUiBootstrap({
    document: documentMock,
    ipcRenderer: {
      invoke: async () => []
    },
    windowObj: windowMock,
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => dialogUtils,
    getBootstrap: () => ({
      Modal: class {
        show() {}
        hide() {}
        static getInstance() {
          return { hide() {} };
        }
      }
    }),
    getCurrentReconciliation: () => currentReconciliation,
    setCurrentReconciliation: (value) => { currentReconciliation = value; },
    getBankReceipts: () => bankReceipts,
    setBankReceipts: (value) => { bankReceipts = value; },
    getCashReceipts: () => cashReceipts,
    setCashReceipts: (value) => { cashReceipts = value; },
    getPostpaidSales: () => postpaidSales,
    setPostpaidSales: (value) => { postpaidSales = value; },
    getCustomerReceipts: () => customerReceipts,
    setCustomerReceipts: (value) => { customerReceipts = value; },
    getReturnInvoices: () => returnInvoices,
    setReturnInvoices: (value) => { returnInvoices = value; },
    getSuppliers: () => suppliers,
    setSuppliers: (value) => { suppliers = value; },
    getDataCounts: () => ({
      bankReceipts: bankReceipts.length,
      cashReceipts: cashReceipts.length,
      postpaidSales: postpaidSales.length,
      customerReceipts: customerReceipts.length,
      returnInvoices: returnInvoices.length,
      suppliers: suppliers.length
    }),
    getCurrentPrintReconciliation: () => currentPrintReconciliation,
    setCurrentPrintReconciliation: (value) => { currentPrintReconciliation = value; },
    handleCustomerReceipt() {},
    updateCustomerReceiptsTable() {},
    removeCustomerReceipt() {},
    validateReconciliationBeforeSave() {},
    clearAllReconciliationData() {},
    clearAllFormFields() {},
    clearAllTables() {},
    resetAllTotalsAndSummaries() {},
    resetSystemToNewReconciliationState() {},
    handlePrintReport() {},
    handleQuickPrint() {},
    handlePrintReportsData() {},
    handlePrintAdvancedReport() {},
    prepareReconciliationData() { return {}; },
    preparePrintData() { return {}; },
    showPrintSectionDialogForNewReconciliation() {},
    formatDate() { return '2026-02-25'; },
    formatCurrency(value) { return String(value ?? '0'); },
    formatDateTime() { return '2026-02-25 00:00'; },
    formatNumber(value) { return String(value ?? '0'); },
    getCurrentDate() { return '2026-02-25'; },
    getCurrentDateTime() { return '2026-02-25 00:00'; },
    generateBankReceiptsSection() { return ''; },
    generateCashReceiptsSection() { return ''; },
    generatePostpaidSalesSection() { return ''; },
    generateCustomerReceiptsSection() { return ''; },
    generateReturnInvoicesSection() { return ''; },
    generateSuppliersSection() { return ''; },
    generateSummarySection() { return ''; },
    generateNonColoredPrintStyles() { return ''; },
    getCompanyName() { return 'Tasfiya'; },
    updateButtonStates() {},
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    showThermalPrintSectionDialog() {},
    selectAllThermalSections() {},
    deselectAllThermalSections() {},
    getSelectedThermalSections() { return []; },
    proceedWithThermalPrint() {},
    printReconciliationAdvanced() {},
    transformDataForPDFGenerator() { return {}; },
    loadSearchFilters() {},
    editReconciliationNew() {},
    logger: { log() {}, error() {}, warn() {} }
  });

  assert.equal(typeof result.updateSummary, 'function');
  assert.equal(typeof result.handlePrintReport, 'function');
  assert.equal(typeof result.handleNewReconciliation, 'function');
  assert.equal(typeof result.loadReconciliationForPrint, 'function');
  assert.equal(typeof result.closePrintPreview, 'function');
  assert.equal(typeof windowMock.quickPrintSavedReconciliation, 'function');
});
