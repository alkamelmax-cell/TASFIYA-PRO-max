const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppRuntime } = require('../src/app/app-runtime');

function createRuntimeContext() {
  const listeners = {};

  const documentMock = {
    addEventListener(event, callback) {
      listeners[event] = callback;
    },
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    }
  };

  const windowMock = {
    addEventListener() {},
    handleSaveReconciliation: async () => {}
  };

  return { listeners, documentMock, windowMock };
}

test('initializeAppRuntime registers bootstrapping and exposes appAPI helpers', () => {
  const { listeners, documentMock, windowMock } = createRuntimeContext();

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

  const resetSystemFn = () => {};
  const testPrintDataStructure = () => true;
  const testPrintDialog = () => true;
  const testNewReconciliationPrintSystem = () => true;

  initializeAppRuntime({
    document: documentMock,
    windowObj: windowMock,
    ipcRenderer: { invoke: async () => ({ lastInsertRowid: 1 }) },
    initializeApp() {},
    testPrintDataStructure,
    testPrintDialog,
    testNewReconciliationPrintSystem,
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
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    updateSummary() {},
    resetSystemToNewReconciliationState: resetSystemFn,
    EventCtor: Event,
    logger: { log() {} }
  });

  assert.equal(typeof listeners.DOMContentLoaded, 'function');
  assert.equal(windowMock.testPrintDataStructure, testPrintDataStructure);
  assert.equal(windowMock.testPrintDialog, testPrintDialog);
  assert.equal(windowMock.testNewReconciliationPrintSystem, testNewReconciliationPrintSystem);
  assert.equal(typeof windowMock.appAPI, 'object');
  assert.equal(windowMock.appAPI.resetSystem, resetSystemFn);

  delete global.document;
  delete global.window;
  delete global.navigator;
});
