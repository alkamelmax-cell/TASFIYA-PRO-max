const test = require('node:test');
const assert = require('node:assert/strict');

const { finalizeAppInitialization } = require('../src/app/app-finalization');

function createDocumentMock() {
  const listeners = {};
  return {
    listeners,
    addEventListener(event, callback) {
      listeners[event] = callback;
    },
    getElementById() {
      return {
        value: '',
        textContent: '0',
        addEventListener() {},
        reset() {},
        innerHTML: '',
        style: {},
        classList: { add() {}, remove() {} }
      };
    },
    querySelector() {
      return {
        addEventListener() {},
        classList: { add() {}, remove() {} },
        style: {},
        textContent: ''
      };
    },
    querySelectorAll() {
      return [];
    }
  };
}

test('finalizeAppInitialization wires save-reset handlers and runtime appAPI', () => {
  const documentMock = createDocumentMock();
  const windowMock = { addEventListener() {}, localStorage: { getItem() { return null; }, setItem() {} } };

  global.document = documentMock;
  global.window = windowMock;
  global.navigator = { onLine: true };

  let currentReconciliation = null;
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const result = finalizeAppInitialization({
    document: documentMock,
    ipcRenderer: { invoke: async () => ({}) },
    dialogUtils: {
      showError() {},
      showValidationError() {},
      showLoading() {},
      close() {},
      showSuccess() {},
      showSuccessToast() {}
    },
    windowObj: windowMock,
    fetchFn: async () => ({}),
    logger: { log() {}, error() {} },
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
    validateReconciliationBeforeSave: () => ({ isValid: true, errors: [] }),
    formatCurrency: (value) => String(value ?? 0),
    isSyncEnabled: async () => false,
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    updateSummary() {},
    getResetSystemToNewReconciliationState: () => (() => {}),
    initializeApp() {},
    testPrintDataStructure() {},
    testPrintDialog() {},
    testNewReconciliationPrintSystem() {},
    resetSystemToNewReconciliationState() {},
    EventCtor: Event
  });

  assert.equal(typeof result.handleSaveReconciliation, 'function');
  assert.equal(typeof result.clearAllReconciliationData, 'function');
  assert.equal(typeof documentMock.listeners.DOMContentLoaded, 'function');
  assert.equal(typeof windowMock.appAPI, 'object');

  delete global.document;
  delete global.window;
  delete global.navigator;
});
