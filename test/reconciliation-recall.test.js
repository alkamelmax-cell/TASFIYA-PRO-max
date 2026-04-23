const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationRecallHandlers } = require('../src/app/reconciliation-recall');

function createElement(initialValue = '') {
  return {
    value: initialValue,
    textContent: '',
    style: {},
    title: '',
    disabled: true,
    innerHTML: ''
  };
}

function buildContext(overrides = {}) {
  const elements = {
    cashierSelect: createElement(),
    accountantSelect: createElement(),
    reconciliationDate: createElement(),
    systemSales: createElement(),
    timeRangeStart: createElement(),
    timeRangeEnd: createElement(),
    filterNotes: createElement(),
    currentReconciliationInfo: createElement(),
    currentReconciliationDetails: createElement(),
    reconciliationListModal: createElement(),
    recallReconciliationNumber: createElement(),
    saveReconciliationBtn: createElement()
  };

  let modalHidden = false;
  const ipcCalls = [];

  const state = {
    currentReconciliation: null,
    bankReceipts: [],
    cashReceipts: [],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: [],
    tableRefreshCount: 0,
    summaryRefreshCount: 0,
    modalHidden: () => modalHidden,
    ipcCalls
  };

  const dialog = {
    confirms: [],
    errors: [],
    validationErrors: [],
    successToasts: [],
    async showConfirm() {
      return this.confirms.length > 0 ? this.confirms.shift() : true;
    },
    showError(message) {
      this.errors.push(message);
    },
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showSuccessToast(message) {
      this.successToasts.push(message);
    }
  };

  const baseDeps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    ipcRenderer: {
      async invoke(channel, query, params = []) {
        ipcCalls.push([channel, query, params]);

        if (channel === 'db-get') {
          if (String(query).includes('WHERE r.id = ?')) {
            return {
              id: params[0],
              reconciliation_number: 'R-100',
              cashier_id: 10,
              accountant_id: 20,
              cashier_name: 'Ali',
              cashier_number: '001',
              accountant_name: 'Mona',
              reconciliation_date: '2026-02-25',
              system_sales: 500,
              time_range_start: '08:00',
              time_range_end: '16:00',
              filter_notes: 'note'
            };
          }

          return {
            id: 33,
            reconciliation_number: params[0],
            cashier_id: 11,
            accountant_id: 21,
            cashier_name: 'Sara',
            cashier_number: '009',
            accountant_name: 'Nour',
            reconciliation_date: '2026-02-25',
            system_sales: 900,
            time_range_start: '',
            time_range_end: '',
            filter_notes: ''
          };
        }

        if (channel === 'db-query') {
          const sql = String(query);
          if (sql.includes('bank_receipts')) return [{ id: 1 }];
          if (sql.includes('cash_receipts')) return [{ id: 2 }];
          if (sql.includes('postpaid_sales')) return [{ id: 3 }];
          if (sql.includes('customer_receipts')) return [{ id: 4 }];
          if (sql.includes('return_invoices')) return [{ id: 5 }];
          if (sql.includes('suppliers')) return [{ id: 6 }];
        }

        return [];
      }
    },
    getDialogUtils: () => dialog,
    getBootstrap: () => ({
      Modal: {
        getInstance(modalEl) {
          if (modalEl === elements.reconciliationListModal) {
            return {
              hide() {
                modalHidden = true;
              }
            };
          }

          return null;
        }
      }
    }),
    getCurrentReconciliation: () => state.currentReconciliation,
    setCurrentReconciliation(value) {
      state.currentReconciliation = value;
    },
    clearAllReconciliationData: async () => {
      state.currentReconciliation = null;
      state.bankReceipts = [];
      state.cashReceipts = [];
      state.postpaidSales = [];
      state.customerReceipts = [];
      state.returnInvoices = [];
      state.suppliers = [];
    },
    setBankReceipts(value) {
      state.bankReceipts = value;
    },
    setCashReceipts(value) {
      state.cashReceipts = value;
    },
    setPostpaidSales(value) {
      state.postpaidSales = value;
    },
    setCustomerReceipts(value) {
      state.customerReceipts = value;
    },
    setReturnInvoices(value) {
      state.returnInvoices = value;
    },
    setSuppliers(value) {
      state.suppliers = value;
    },
    updateBankReceiptsTable() {
      state.tableRefreshCount += 1;
    },
    updateCashReceiptsTable() {
      state.tableRefreshCount += 1;
    },
    updatePostpaidSalesTable() {
      state.tableRefreshCount += 1;
    },
    updateCustomerReceiptsTable() {
      state.tableRefreshCount += 1;
    },
    updateReturnInvoicesTable() {
      state.tableRefreshCount += 1;
    },
    updateSuppliersTable() {
      state.tableRefreshCount += 1;
    },
    updateSummary() {
      state.summaryRefreshCount += 1;
    },
    logger: { log() {}, error() {} }
  };

  const deps = { ...baseDeps, ...overrides };
  const handlers = createReconciliationRecallHandlers(deps);

  return { handlers, dialog, state, elements };
}

test('handleRecallFromList loads data and updates UI state', async () => {
  const { handlers, state, dialog, elements } = buildContext();

  await handlers.handleRecallFromList(15);

  assert.equal(state.currentReconciliation.id, 15);
  assert.equal(state.bankReceipts.length, 1);
  assert.equal(state.cashReceipts.length, 1);
  assert.equal(state.postpaidSales.length, 1);
  assert.equal(state.tableRefreshCount, 6);
  assert.equal(state.summaryRefreshCount, 1);
  assert.equal(state.modalHidden(), true);
  assert.equal(elements.cashierSelect.value, 10);
  assert.equal(elements.currentReconciliationInfo.style.display, 'block');
  assert.equal(dialog.successToasts.length, 1);
  assert.equal(dialog.errors.length, 0);
});

test('handleRecallReconciliation validates missing reconciliation number', async () => {
  const { handlers, dialog } = buildContext();

  await handlers.handleRecallReconciliation();

  assert.equal(dialog.validationErrors.length, 1);
  assert.equal(dialog.errors.length, 0);
});

test('handleRecallReconciliation respects cancel confirmation', async () => {
  const { handlers, dialog, state, elements } = buildContext();
  state.currentReconciliation = { id: 1 };
  elements.recallReconciliationNumber.value = 'R-1';
  dialog.confirms.push(false);

  await handlers.handleRecallReconciliation();

  const dbGetCalls = state.ipcCalls.filter((call) => call[0] === 'db-get');
  assert.equal(dbGetCalls.length, 0);
});

test('handleRecallReconciliation loads by number and enables save button', async () => {
  const { handlers, elements, state, dialog } = buildContext();
  elements.recallReconciliationNumber.value = 'R-500';

  await handlers.handleRecallReconciliation();

  assert.equal(state.currentReconciliation.reconciliation_number, 'R-500');
  assert.equal(elements.recallReconciliationNumber.value, '');
  assert.equal(elements.saveReconciliationBtn.disabled, false);
  assert.match(elements.saveReconciliationBtn.innerHTML, /حفظ التعديلات/);
  assert.equal(dialog.successToasts.length, 1);
});
