const test = require('node:test');
const assert = require('node:assert/strict');

const { composeAppModules } = require('../src/app/app-composition');

function createElementMock() {
  return {
    addEventListener() {},
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    appendChild() {},
    removeChild() {},
    remove() {},
    reset() {},
    focus() {},
    scrollIntoView() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    value: '',
    checked: false,
    children: [],
    innerHTML: '',
    textContent: ''
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

test('composeAppModules wires runtime modules and returns handler groups', () => {
  const documentMock = createDocumentMock();
  const windowMock = {
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
    matchMedia() { return { matches: false }; }
  };

  global.document = documentMock;
  global.window = windowMock;
  global.navigator = { onLine: true };

  let editSessionHandlers = null;
  let currentReconciliation = null;
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const reconciliationStateDeps = {
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
    })
  };

  const reconciliationTableUpdateDeps = {
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {}
  };

  const printRuntimeStateDeps = {
    getCurrentPrintReconciliation: () => null,
    setCurrentPrintReconciliation() {},
    getAvailablePrinters: () => [],
    setAvailablePrinters() {},
    getCurrentPrintData: () => null,
    setCurrentPrintData() {}
  };

  const result = composeAppModules({
    core: {
      document: documentMock,
      windowObj: windowMock,
      localStorageObj: windowMock.localStorage,
      sessionStorage: windowMock.sessionStorage,
      ipcRenderer: { invoke: async () => [] },
      Swal: { fire() {} },
      bootstrap: {
        Modal: class {
          show() {}
          hide() {}
          static getInstance() { return { hide() {} }; }
        }
      },
      dialogUtils: {
        showInfo() {},
        showError() {},
        showValidationError() {},
        showSuccess() {},
        showSuccessToast() {},
        showLoading() {},
        close() {},
        showConfirm: async () => false
      },
      setTimeoutFn: (fn) => fn(),
      FormDataCtor: FormData,
      FileReaderCtor: class { readAsDataURL() {} },
      EventCtor: Event,
      fetchFn: async () => ({ ok: true }),
      logger: { log() {}, warn() {}, error() {} }
    },
    shared: {
      reconciliationStateDeps,
      reconciliationTableUpdateDeps,
      printRuntimeStateDeps
    },
    shell: {
      keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
      setCurrentUser() {},
      loadCustomersForDropdowns() {},
      handleBranchChange() {},
      handleOperationTypeChange() {},
      handleEditOperationTypeChange() {},
      showError() {}
    },
    edit: {
      validateEditForm: () => ({ isValid: true }),
      collectEditFormData: () => ({}),
      getCurrentUser: () => ({ id: 1 }),
      getEditMode: () => ({ isActive: false }),
      setEditSessionHandlers: (value) => { editSessionHandlers = value; }
    },
    dataEntryHandlers: {
      isExistingCustomer: () => false,
      handleCustomerReceipt() {},
      removeCustomerReceipt() {},
      ...reconciliationTableUpdateDeps
    },
    editTableHandlers: {
      initializeEditModeEventListeners() {},
      updateEditTotals() {},
      populateEditBankReceiptsTable() {},
      populateEditCashReceiptsTable() {},
      populateEditPostpaidSalesTable() {},
      populateEditCustomerReceiptsTable() {},
      populateEditReturnInvoicesTable() {},
      populateEditSuppliersTable() {}
    },
    formatting: {
      formatDate: () => '2026-02-25',
      formatCurrency: (value) => String(value ?? 0),
      formatDateTime: () => '2026-02-25 00:00',
      formatNumber: (value) => String(value ?? 0),
      formatDecimal: (value) => String(value ?? 0),
      getCurrentDate: () => '2026-02-25',
      getCurrentDateTime: () => '2026-02-25 00:00'
    },
    report: {
      getReportTypeLabel: () => 'time',
      formatPeriodLabel: () => 'period',
      getDaysBetween: () => 1,
      generateAdvancedReportSummary: () => ({}),
      determineReportType: () => 'time',
      generateAdvancedReportTableHtml: () => '<table></table>',
      buildAdvancedReportHtml: () => '<html></html>',
      calculateAccuracyScore: () => 100,
      calculateVolumeScore: () => 100,
      calculateConsistencyScore: () => 100,
      calculateOverallRating: () => 100,
      getPerformanceBadge: () => 'A',
      generatePerformanceSummary: () => ({}),
      generateStarRating: () => '*****',
      buildPerformanceComprehensivePdfContent: () => ({}),
      generateReportSummary: () => ({}),
      prepareExcelData: () => [],
      buildReconciliationReportHtml: () => '<html></html>',
      prepareAdvancedReportExcelData: () => []
    },
    printStyleDeps: {
      generateNonColoredPrintStyles: () => ''
    },
    defaultCompanyName: 'Tasfiya',
    getAutocompleteSystem: () => null,
    matchMediaFn: () => ({ matches: false })
  });

  assert.equal(typeof result.shellHandlers.initializeApp, 'function');
  assert.equal(typeof result.preUiHandlers.updateButtonStates, 'function');
  assert.equal(typeof result.editRuntimeHandlers.editReconciliationNew, 'function');
  assert.equal(typeof result.printReportHandlers.initializePrintSystem, 'function');
  assert.equal(typeof result.reconciliationUiHandlers.updateSummary, 'function');
  assert.equal(typeof result.finalizationHandlers.handleSaveReconciliation, 'function');
  assert.equal(typeof editSessionHandlers, 'object');

  delete global.document;
  delete global.window;
  delete global.navigator;
});
