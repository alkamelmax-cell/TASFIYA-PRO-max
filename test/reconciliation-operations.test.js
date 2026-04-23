const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationOperationsHandlers } = require('../src/app/reconciliation-operations');

function createElement(initial = {}) {
  return {
    value: '',
    ...initial
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

test('prepareReconciliationData builds summary and requests reconciliation number', async () => {
  const elements = {
    systemSales: createElement({ value: '100' })
  };

  const calls = [];
  const handlers = createReconciliationOperationsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query) => {
        calls.push(channel);
        if (channel === 'db-get' && query.includes('FROM cashiers')) {
          return { name: 'Cashier', cashier_number: 'C-1' };
        }
        if (channel === 'db-get' && query.includes('FROM accountants')) {
          return { name: 'Accountant' };
        }
        if (channel === 'get-next-reconciliation-number') {
          return 'R-10';
        }
        return null;
      }
    },
    getDialogUtils: () => ({
      showError() {},
      showErrorToast() {},
      showValidationError() {},
      showConfirm: async () => true,
      showLoading() {},
      close() {},
      showSuccessToast() {},
      showAlert() {},
      showSuccess() {}
    }),
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    loadSavedReconciliations: async () => {},
    showAdvancedPrintDialog: async () => {},
    loadReconciliationForPrint: async () => null,
    transformDataForPDFGenerator: (v) => v,
    getCurrentReconciliation: () => ({
      id: 1,
      cashier_id: 2,
      accountant_id: 3,
      reconciliation_number: null,
      reconciliation_date: '2026-02-25',
      time_range_start: '08:00',
      time_range_end: '14:00',
      filter_notes: 'note'
    }),
    getBankReceipts: () => [{ amount: 120 }],
    getCashReceipts: () => [{ total_amount: 30 }],
    getPostpaidSales: () => [{ amount: 20 }],
    getCustomerReceipts: () => [{ amount: 10 }],
    getReturnInvoices: () => [{ amount: 5 }],
    getSuppliers: () => [],
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  const data = await handlers.prepareReconciliationData();
  assert.equal(data.reconciliation.reconciliation_number, 'R-10');
  assert.equal(data.summary.totalReceipts, 165);
  assert.equal(data.summary.systemSales, 100);
  assert.equal(data.summary.surplusDeficit, 65);
  assert.ok(calls.includes('get-next-reconciliation-number'));
});

test('deleteReconciliation shows error when record is missing', async () => {
  const dialog = {
    errors: [],
    showError(message) { this.errors.push(message); },
    showErrorToast() {},
    showValidationError() {},
    showConfirm: async () => true,
    showLoading() {},
    close() {},
    showSuccessToast() {},
    showAlert() {},
    showSuccess() {}
  };

  const handlers = createReconciliationOperationsHandlers({
    document: createDocument({ systemSales: createElement({ value: '0' }) }),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return null;
        }
        return null;
      }
    },
    getDialogUtils: () => dialog,
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    loadSavedReconciliations: async () => {},
    showAdvancedPrintDialog: async () => {},
    loadReconciliationForPrint: async () => null,
    transformDataForPDFGenerator: (v) => v,
    getCurrentReconciliation: () => null,
    getBankReceipts: () => [],
    getCashReceipts: () => [],
    getPostpaidSales: () => [],
    getCustomerReceipts: () => [],
    getReturnInvoices: () => [],
    getSuppliers: () => [],
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.deleteReconciliation(10);
  assert.equal(dialog.errors.length, 1);
});

test('module exposes window actions and validates view id', async () => {
  const dialog = {
    validations: [],
    showValidationError(message) { this.validations.push(message); },
    showError() {},
    showErrorToast() {},
    showConfirm: async () => true,
    showLoading() {},
    close() {},
    showSuccessToast() {},
    showAlert() {},
    showSuccess() {}
  };

  const windowObj = {};
  const handlers = createReconciliationOperationsHandlers({
    document: createDocument({ systemSales: createElement({ value: '0' }) }),
    ipcRenderer: { invoke: async () => null },
    getDialogUtils: () => dialog,
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    loadSavedReconciliations: async () => {},
    showAdvancedPrintDialog: async () => {},
    loadReconciliationForPrint: async () => null,
    transformDataForPDFGenerator: (v) => v,
    getCurrentReconciliation: () => null,
    getBankReceipts: () => [],
    getCashReceipts: () => [],
    getPostpaidSales: () => [],
    getCustomerReceipts: () => [],
    getReturnInvoices: () => [],
    getSuppliers: () => [],
    logger: { log() {}, error() {} },
    windowObj
  });

  assert.equal(typeof windowObj.viewReconciliation, 'function');
  assert.equal(typeof windowObj.deleteReconciliation, 'function');
  await handlers.viewReconciliation(null);
  assert.equal(dialog.validations.length, 1);
});

test('prepareReconciliationDataById returns reconciliation payload required for advanced printing', async () => {
  const handlers = createReconciliationOperationsHandlers({
    document: createDocument({ systemSales: createElement({ value: '0' }) }),
    ipcRenderer: {
      invoke: async (channel, query) => {
        if (channel === 'db-get' && query.includes('FROM reconciliations r')) {
          return {
            id: 42,
            reconciliation_number: 1580,
            cashier_name: 'أحمد',
            cashier_number: '204',
            accountant_name: 'عبدالحميد',
            reconciliation_date: '2026-02-26',
            system_sales: 5000,
            total_receipts: 5050,
            surplus_deficit: 50,
            status: 'completed',
            created_at: '2026-02-26T08:00:00.000Z',
            last_modified_date: '2026-02-26T09:00:00.000Z',
            time_range_start: '08:00',
            time_range_end: '16:00',
            filter_notes: 'ملاحظة'
          };
        }
        if (channel === 'db-query') {
          return [];
        }
        return null;
      }
    },
    getDialogUtils: () => ({
      showError() {},
      showErrorToast() {},
      showValidationError() {},
      showConfirm: async () => true,
      showLoading() {},
      close() {},
      showSuccessToast() {},
      showAlert() {},
      showSuccess() {}
    }),
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    loadSavedReconciliations: async () => {},
    showAdvancedPrintDialog: async () => {},
    loadReconciliationForPrint: async () => null,
    transformDataForPDFGenerator: (v) => v,
    getCurrentReconciliation: () => null,
    getBankReceipts: () => [],
    getCashReceipts: () => [],
    getPostpaidSales: () => [],
    getCustomerReceipts: () => [],
    getReturnInvoices: () => [],
    getSuppliers: () => [],
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  const data = await handlers.prepareReconciliationDataById(42);

  assert.ok(data.reconciliation);
  assert.equal(data.reconciliation.id, 42);
  assert.equal(data.reconciliation.cashier_name, 'أحمد');
  assert.equal(data.reconciliation.reconciliation_date, '2026-02-26');
  assert.equal(data.reconciliation.total_receipts, 5050);
});
