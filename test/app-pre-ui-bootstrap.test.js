const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppPreUiBootstrap } = require('../src/app/app-pre-ui-bootstrap');

function createElementMock() {
  return {
    addEventListener() {},
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    reset() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    focus() {}
  };
}

function createDocumentMock() {
  return {
    getElementById() { return createElementMock(); },
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    createElement() { return createElementMock(); },
    addEventListener() {}
  };
}

test('initializeAppPreUiBootstrap composes pre-ui handlers', () => {
  const documentMock = createDocumentMock();
  const windowMock = {
    addEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
  };

  let currentReconciliation = null;
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const handlers = initializeAppPreUiBootstrap({
    document: documentMock,
    ipcRenderer: { invoke: async () => [] },
    windowObj: windowMock,
    localStorageObj: windowMock.localStorage,
    sessionStorage: windowMock.sessionStorage,
    dialogUtils: {
      showError() {},
      showValidationError() {},
      showSuccess() {},
      showSuccessToast() {},
      showLoading() {},
      close() {}
    },
    Swal: { fire() {} },
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => ({
      showError() {},
      showValidationError() {},
      showSuccess() {},
      showSuccessToast() {},
      showLoading() {},
      close() {}
    }),
    getBootstrap: () => ({
      Modal: class {
        show() {}
        hide() {}
        static getInstance() { return { hide() {} }; }
      }
    }),
    getCurrentCompanyName: () => 'Tasfiya',
    defaultCompanyName: 'Tasfiya',
    getAutocompleteSystem: () => null,
    matchMediaFn: () => ({ matches: false }),
    FormDataCtor: FormData,
    FileReaderCtor: class { readAsDataURL() {} },
    getCurrentReconciliation: () => currentReconciliation,
    setCurrentReconciliation: (value) => { currentReconciliation = value; },
    getDataCounts: () => ({
      bankReceipts: bankReceipts.length,
      cashReceipts: cashReceipts.length,
      postpaidSales: postpaidSales.length,
      customerReceipts: customerReceipts.length,
      returnInvoices: returnInvoices.length,
      suppliers: suppliers.length
    }),
    getClearAllReconciliationData: () => (() => {}),
    getUpdateSummary: () => (() => {}),
    setBankReceipts: (value) => { bankReceipts = value; },
    setCashReceipts: (value) => { cashReceipts = value; },
    setPostpaidSales: (value) => { postpaidSales = value; },
    setCustomerReceipts: (value) => { customerReceipts = value; },
    setReturnInvoices: (value) => { returnInvoices = value; },
    setSuppliers: (value) => { suppliers = value; },
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    populateSelect() {},
    formatDate() { return '2026-02-25'; },
    formatCurrency(value) { return String(value ?? 0); },
    formatDateTime() { return '2026-02-25 00:00'; },
    formatNumber(value) { return String(value ?? 0); },
    formatDecimal(value) { return String(value ?? 0); },
    getCurrentDate() { return '2026-02-25'; },
    getCurrentDateTime() { return '2026-02-25 00:00'; },
    getReportTypeLabel() { return 'time'; },
    formatPeriodLabel() { return 'period'; },
    getDaysBetween() { return 1; },
    generateAdvancedReportSummary() { return {}; },
    determineReportType() { return 'time'; },
    generateAdvancedReportTableHtml() { return '<table></table>'; },
    buildAdvancedReportHtml() { return '<html></html>'; },
    calculateAccuracyScore() { return 100; },
    calculateVolumeScore() { return 100; },
    calculateConsistencyScore() { return 100; },
    calculateOverallRating() { return 100; },
    getPerformanceBadge() { return 'A'; },
    generatePerformanceSummary() { return {}; },
    generateStarRating() { return '*****'; },
    buildPerformanceComprehensivePdfContent() { return {}; },
    generateReportSummary() { return {}; },
    prepareExcelData() { return []; },
    buildReconciliationReportHtml() { return '<html></html>'; },
    prepareAdvancedReportExcelData() { return []; },
    logger: { log() {}, error() {}, warn() {} }
  });

  assert.equal(typeof handlers.updateButtonStates, 'function');
  assert.equal(typeof handlers.handleRecallReconciliation, 'function');
  assert.equal(typeof handlers.loadReconciliationsList, 'function');
  assert.equal(typeof handlers.loadSavedReconciliations, 'function');
  assert.equal(typeof handlers.initializeSyncControls, 'function');
  assert.equal(typeof handlers.handleSaveGeneralSettings, 'function');
  assert.equal(typeof handlers.changePostpaidSalesReportPage, 'function');
});
