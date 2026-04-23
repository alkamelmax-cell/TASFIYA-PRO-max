const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppPrintReportBootstrap } = require('../src/app/app-print-report-bootstrap');

function createElementMock() {
  return {
    addEventListener() {},
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
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
    getElementById() { return createElementMock(); },
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    createElement() { return createElementMock(); }
  };
}

test('initializeAppPrintReportBootstrap composes print and report handlers', () => {
  const documentMock = createDocumentMock();
  const windowMock = { addEventListener() {}, localStorage: { getItem() { return null; }, setItem() {} } };

  let availablePrinters = [];
  let currentPrintData = null;
  let currentReconciliation = null;
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const handlers = initializeAppPrintReportBootstrap({
    document: documentMock,
    ipcRenderer: { invoke: async () => [] },
    windowObj: windowMock,
    Swal: { fire() {} },
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => ({
      showError() {},
      showValidationError() {},
      showLoading() {},
      showSuccess() {},
      showSuccessToast() {},
      close() {}
    }),
    getBootstrap: () => ({
      Modal: class {
        show() {}
        hide() {}
        static getInstance() { return { hide() {} }; }
      }
    }),
    getAvailablePrinters: () => availablePrinters,
    setAvailablePrinters: (value) => { availablePrinters = value; },
    getCurrentPrintData: () => currentPrintData,
    setCurrentPrintData: (value) => { currentPrintData = value; },
    defaultCompanyName: 'Tasfiya',
    formatDate() { return '2026-02-25'; },
    formatCurrency(value) { return String(value ?? 0); },
    getCompanyName() { return 'Tasfiya'; },
    getCurrentDate() { return '2026-02-25'; },
    generateReportSummary() { return {}; },
    prepareExcelData() { return []; },
    buildReconciliationReportHtml() { return '<html></html>'; },
    loadSavedReconciliations() {},
    loadReconciliationForPrint() { return {}; },
    transformDataForPDFGenerator() { return {}; },
    getCurrentReconciliation: () => currentReconciliation,
    getBankReceipts: () => bankReceipts,
    getCashReceipts: () => cashReceipts,
    getPostpaidSales: () => postpaidSales,
    getCustomerReceipts: () => customerReceipts,
    getReturnInvoices: () => returnInvoices,
    getSuppliers: () => suppliers,
    handlePrintReport() {},
    handleQuickPrint() {},
    logger: { log() {}, error() {}, warn() {} }
  });

  assert.equal(typeof handlers.initializePrintSystem, 'function');
  assert.equal(typeof handlers.showAdvancedPrintDialog, 'function');
  assert.equal(typeof handlers.prepareReconciliationData, 'function');
  assert.equal(typeof handlers.handleThermalPrinterPreview, 'function');
  assert.equal(typeof handlers.handleGenerateReport, 'function');
  assert.equal(typeof handlers.showPrintSectionDialogForNewReconciliation, 'function');
  assert.equal(typeof handlers.testPrintDataStructure, 'function');
});
