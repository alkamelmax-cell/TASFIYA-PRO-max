const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppApi } = require('../src/app/app-api');

function createElement(initial = {}) {
  return {
    value: '',
    listeners: {},
    ...initial,
    dispatchEvent(event) {
      this.lastEvent = event;
    },
    click() {
      this.clicked = true;
    }
  };
}

function createContext() {
  const arrays = {
    bankReceipts: [],
    cashReceipts: [],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: []
  };

  const elements = {
    systemSales: createElement(),
    filterNotes: createElement()
  };

  let currentReconciliation = { id: 7 };
  const callLog = [];

  const api = createAppApi({
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      querySelector() {
        return createElement();
      }
    },
    ipcRenderer: {
      async invoke(channel, ...args) {
        callLog.push([channel, ...args]);
        if (channel === 'db-run') {
          return { lastInsertRowid: 99 };
        }
        if (channel === 'db-get') {
          return { id: 123 };
        }
        return {};
      }
    },
    getCurrentReconciliation: () => currentReconciliation,
    setCurrentReconciliation: (value) => { currentReconciliation = value; },
    getBankReceipts: () => arrays.bankReceipts,
    setBankReceipts: (value) => { arrays.bankReceipts = value; },
    getCashReceipts: () => arrays.cashReceipts,
    setCashReceipts: (value) => { arrays.cashReceipts = value; },
    getPostpaidSales: () => arrays.postpaidSales,
    setPostpaidSales: (value) => { arrays.postpaidSales = value; },
    getCustomerReceipts: () => arrays.customerReceipts,
    setCustomerReceipts: (value) => { arrays.customerReceipts = value; },
    getReturnInvoices: () => arrays.returnInvoices,
    setReturnInvoices: (value) => { arrays.returnInvoices = value; },
    getSuppliers: () => arrays.suppliers,
    setSuppliers: (value) => { arrays.suppliers = value; },
    updateBankReceiptsTable() { callLog.push(['updateBankReceiptsTable']); },
    updateCashReceiptsTable() { callLog.push(['updateCashReceiptsTable']); },
    updatePostpaidSalesTable() { callLog.push(['updatePostpaidSalesTable']); },
    updateCustomerReceiptsTable() { callLog.push(['updateCustomerReceiptsTable']); },
    updateReturnInvoicesTable() { callLog.push(['updateReturnInvoicesTable']); },
    updateSuppliersTable() { callLog.push(['updateSuppliersTable']); },
    updateSummary() { callLog.push(['updateSummary']); },
    logger: { log() {}, error() {}, warn() {} },
    EventCtor: class EventCtor {
      constructor(type) { this.type = type; }
    }
  });

  return { api, arrays, elements, callLog, setCurrentReconciliation: (v) => { currentReconciliation = v; } };
}

test('setSystemSales writes value and dispatches input event', () => {
  const { api, elements } = createContext();
  api.setSystemSales('150');
  assert.equal(elements.systemSales.value, '150');
  assert.equal(elements.systemSales.lastEvent.type, 'input');
});

test('addCashReceipt inserts record and updates totals', async () => {
  const { api, arrays, callLog } = createContext();
  await api.addCashReceipt(10, 3);
  assert.equal(arrays.cashReceipts.length, 1);
  assert.equal(arrays.cashReceipts[0].total_amount, 30);
  assert.equal(callLog[0][0], 'db-run');
});

test('resetReconciliationForm clears arrays and fields', async () => {
  const { api, arrays, elements } = createContext();
  arrays.bankReceipts.push({ amount: 1 });
  arrays.cashReceipts.push({ total_amount: 1 });
  elements.systemSales.value = '10';
  elements.filterNotes.value = 'note';

  await api.resetReconciliationForm();
  assert.equal(arrays.bankReceipts.length, 0);
  assert.equal(arrays.cashReceipts.length, 0);
  assert.equal(elements.systemSales.value, '');
  assert.equal(elements.filterNotes.value, '');
});
