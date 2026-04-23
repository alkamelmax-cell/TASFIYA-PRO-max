const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationSaveResetHandlers } = require('../src/app/reconciliation-save-reset');

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    className: '',
    ...initial,
    reset() {},
    click() {},
    querySelectorAll() {
      return [];
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector() {
      return { classList: { contains() { return true; } }, click() {} };
    }
  };
}

test('clearAllReconciliationData clears state arrays and pending data', async () => {
  let currentReconciliation = { id: 1 };
  let bankReceipts = [{ amount: 1 }];
  let cashReceipts = [{ total_amount: 2 }];
  let postpaidSales = [{ amount: 3 }];
  let customerReceipts = [{ amount: 4 }];
  let returnInvoices = [{ amount: 5 }];
  let suppliers = [{ amount: 6 }];

  const elements = {
    systemSales: createElement({ value: '100' }),
    reconciliationDate: createElement({ value: '2026-02-24' }),
    bankReceiptsTable: createElement({ innerHTML: 'x' }),
    cashReceiptsTable: createElement({ innerHTML: 'x' }),
    postpaidSalesTable: createElement({ innerHTML: 'x' }),
    customerReceiptsTable: createElement({ innerHTML: 'x' }),
    returnInvoicesTable: createElement({ innerHTML: 'x' }),
    suppliersTable: createElement({ innerHTML: 'x' }),
    bankReceiptsTotal: createElement({ textContent: '9' }),
    cashReceiptsTotal: createElement({ textContent: '9' }),
    postpaidSalesTotal: createElement({ textContent: '9' }),
    customerReceiptsTotal: createElement({ textContent: '9' }),
    returnInvoicesTotal: createElement({ textContent: '9' }),
    suppliersTotal: createElement({ textContent: '9' }),
    summaryBankTotal: createElement({ textContent: '9' }),
    summaryCashTotal: createElement({ textContent: '9' }),
    summaryPostpaidTotal: createElement({ textContent: '9' }),
    summaryCustomerTotal: createElement({ textContent: '9' }),
    summaryReturnTotal: createElement({ textContent: '9' }),
    totalReceipts: createElement({ textContent: '9' }),
    surplusDeficit: createElement({ textContent: '9', className: 'bad' })
  };

  let resetFormCalls = 0;
  const windowObj = {
    pendingReconciliationData: { id: 999 },
    appAPI: {
      resetReconciliationForm() {
        resetFormCalls += 1;
      }
    }
  };

  const handlers = createReconciliationSaveResetHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => ({}) },
    dialogUtils: { showError() {}, showLoading() {}, close() {}, showSuccess() {}, showSuccessToast() {}, showConfirm: async () => true, showValidationError() {} },
    windowObj,
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
    formatCurrency: (v) => String(v),
    isSyncEnabled: async () => false,
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    updateSummary() {},
    getResetSystemToNewReconciliationState: () => () => {}
  });

  await handlers.clearAllReconciliationData();
  assert.equal(bankReceipts.length, 0);
  assert.equal(cashReceipts.length, 0);
  assert.equal(postpaidSales.length, 0);
  assert.equal(customerReceipts.length, 0);
  assert.equal(returnInvoices.length, 0);
  assert.equal(suppliers.length, 0);
  assert.equal(currentReconciliation, null);
  assert.equal(windowObj.pendingReconciliationData, null);
  assert.equal(resetFormCalls, 1);
  assert.equal(elements.surplusDeficit.className, 'summary-value');
});

test('handleSaveReconciliation persists reconciliation and triggers reset', async () => {
  let currentReconciliation = { id: 11, cashbox_posting_enabled: 0 };
  let bankReceipts = [];
  let cashReceipts = [];
  let postpaidSales = [];
  let customerReceipts = [];
  let returnInvoices = [];
  let suppliers = [];

  const elements = {
    systemSales: createElement({ value: '100' }),
    totalReceipts: createElement({ textContent: '120' }),
    cashierSelect: createElement({ value: '1' }),
    accountantSelect: createElement({ value: '2' }),
    reconciliationDate: createElement({ value: '2026-02-26' }),
    timeRangeStart: createElement({ value: '' }),
    timeRangeEnd: createElement({ value: '' }),
    filterNotes: createElement({ value: '' })
  };

  const calls = [];
  let resetCalled = false;
  const handlers = createReconciliationSaveResetHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, ...args) => {
        calls.push([channel, ...args]);
        if (channel === 'get-next-reconciliation-number') {
          return 55;
        }
        return {};
      }
    },
    dialogUtils: {
      showError() {},
      showLoading() {},
      close() {},
      showSuccess: async () => {},
      showSuccessToast() {},
      showConfirm: async () => true,
      showValidationError() {}
    },
    windowObj: {},
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
    formatCurrency: (v) => String(v),
    isSyncEnabled: async () => false,
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {},
    updateSummary() {},
    getResetSystemToNewReconciliationState: () => () => { resetCalled = true; }
  });

  await handlers.handleSaveReconciliation();
  assert.equal(resetCalled, true);
  assert.equal(calls[0][0], 'get-next-reconciliation-number');
  assert.equal(calls[1][0], 'complete-reconciliation');
  assert.equal(calls[1][5], 55);
  assert.equal(currentReconciliation, null);
});
