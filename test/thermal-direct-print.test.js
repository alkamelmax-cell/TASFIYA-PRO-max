const test = require('node:test');
const assert = require('node:assert/strict');
const { createThermalDirectPrintHandlers } = require('../src/app/thermal-direct-print');

function buildContext(overrides = {}) {
  const dialog = {
    validationErrors: [],
    loadingCalls: 0,
    closeCalls: 0,
    successToasts: [],
    successes: [],
    errors: [],
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showLoading() {
      this.loadingCalls += 1;
    },
    close() {
      this.closeCalls += 1;
    },
    showSuccessToast(message) {
      this.successToasts.push(message);
    },
    showSuccess(message) {
      this.successes.push(message);
    },
    showError(message) {
      this.errors.push(message);
    }
  };

  const state = {
    currentReconciliation: { id: 1 },
    ipcCalls: []
  };

  const deps = {
    document: {
      getElementById() {
        return { checked: true, onclick: null };
      }
    },
    Swal: {
      fire() {},
      close() {}
    },
    ipcRenderer: {
      async invoke(channel) {
        state.ipcCalls.push(channel);

        if (channel === 'thermal-printer-preview') {
          return { success: true };
        }

        if (channel === 'thermal-printer-settings-get') {
          return { success: true, settings: { printerName: 'POS-80' } };
        }

        if (channel === 'thermal-printer-print') {
          return { success: true };
        }

        return { success: true };
      }
    },
    setTimeoutFn(fn) {
      fn();
    },
    getDialogUtils: () => dialog,
    getCurrentReconciliation: () => state.currentReconciliation,
    getBankReceipts: () => [{ id: 1 }],
    getCashReceipts: () => [],
    getPostpaidSales: () => [],
    getCustomerReceipts: () => [],
    getReturnInvoices: () => [],
    getSuppliers: () => [],
    prepareReconciliationData: async () => ({ reconciliation: { id: 1 } }),
    getSectionPrintOptions: async () => ({
      includeBankDetails: true,
      includeCashDetails: false,
      includePostpaidDetails: false,
      includeCustomerDetails: false,
      includeReturnsDetails: false,
      includeSuppliersDetails: false
    }),
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  };

  const handlers = createThermalDirectPrintHandlers(deps);
  return { handlers, dialog, state };
}

test('handleThermalPrinterPreview validates missing reconciliation', async () => {
  const { handlers, dialog } = buildContext({
    getCurrentReconciliation: () => null
  });

  await handlers.handleThermalPrinterPreview();
  assert.equal(dialog.validationErrors.length, 1);
});

test('handleThermalPrinterPreview stops when user cancels section options', async () => {
  const { handlers, state, dialog } = buildContext({
    getSectionPrintOptions: async () => null
  });

  await handlers.handleThermalPrinterPreview();
  assert.equal(state.ipcCalls.includes('thermal-printer-preview'), false);
  assert.equal(dialog.loadingCalls, 0);
});

test('handleThermalPrinterPreview sends preview payload and shows toast', async () => {
  const { handlers, state, dialog } = buildContext();

  await handlers.handleThermalPrinterPreview();
  assert.equal(state.ipcCalls.includes('thermal-printer-preview'), true);
  assert.equal(dialog.loadingCalls, 1);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.successToasts.length, 1);
});

test('handleThermalPrinterPrint reads settings and prints successfully', async () => {
  const { handlers, state, dialog } = buildContext();

  await handlers.handleThermalPrinterPrint();
  assert.equal(state.ipcCalls.includes('thermal-printer-settings-get'), true);
  assert.equal(state.ipcCalls.includes('thermal-printer-print'), true);
  assert.equal(dialog.successes.length, 1);
});
