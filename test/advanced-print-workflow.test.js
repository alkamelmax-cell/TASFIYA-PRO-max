const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdvancedPrintWorkflowHandlers } = require('../src/app/advanced-print-workflow');

function createElement(initial = {}) {
  return {
    id: '',
    value: '',
    checked: false,
    ...initial
  };
}

function createBootstrapMock() {
  class Modal {
    static instances = new Map();

    constructor(element) {
      this.element = element;
      this.shown = false;
      this.hidden = false;
      Modal.instances.set(element, this);
    }

    show() {
      this.shown = true;
    }

    hide() {
      this.hidden = true;
    }

    static getInstance(element) {
      return Modal.instances.get(element) || null;
    }
  }

  return { Modal };
}

function buildContext(overrides = {}) {
  const elements = {
    printOptionsModal: createElement({ id: 'printOptionsModal' })
  };
  const bootstrap = createBootstrapMock();

  const state = {
    currentPrintData: null,
    availablePrinters: [],
    initCalls: 0,
    invokeCalls: []
  };

  const dialog = {
    errorToasts: [],
    successToasts: [],
    validationErrors: [],
    errors: [],
    loadingCalls: 0,
    closeCalls: 0,
    showErrorToast(message) {
      this.errorToasts.push(message);
    },
    showSuccessToast(message) {
      this.successToasts.push(message);
    },
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showError(message) {
      this.errors.push(message);
    },
    showLoading() {
      this.loadingCalls += 1;
    },
    close() {
      this.closeCalls += 1;
    }
  };

  const deps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    windowObj: {},
    ipcRenderer: {
      async invoke(channel, ...args) {
        state.invokeCalls.push({ channel, args });
        if (channel === 'print-direct') {
          return { success: true };
        }
        if (channel === 'get-print-settings') {
          return { color: true };
        }
        if (channel === 'get-reconciliation-for-edit') {
          return {
            reconciliation: { id: 9, cashier_name: 'Ali', accountant_name: 'Mona', reconciliation_date: '2026-02-25' },
            bankReceipts: [],
            cashReceipts: [],
            postpaidSales: [],
            customerReceipts: [],
            returnInvoices: [],
            suppliers: []
          };
        }
        if (channel === 'create-print-preview') {
          return { success: true };
        }
        return { success: true };
      }
    },
    getDialogUtils: () => dialog,
    getBootstrap: () => bootstrap,
    initializePrintSystem: async () => {
      state.initCalls += 1;
    },
    getPrintSettings: () => ({
      printerName: 'Printer',
      copies: 1,
      paperSize: 'A4',
      orientation: 'portrait',
      color: true,
      fontSize: 'normal',
      fontFamily: 'Cairo'
    }),
    getAvailablePrinters: () => state.availablePrinters,
    getCurrentPrintData: () => state.currentPrintData,
    setCurrentPrintData: (value) => {
      state.currentPrintData = value;
    },
    defaultCompanyName: 'Default Company',
    logger: { log() {}, error() {} },
    ...overrides
  };

  const handlers = createAdvancedPrintWorkflowHandlers(deps);
  return { handlers, state, dialog, bootstrap, elements, deps };
}

test('showAdvancedPrintDialog initializes print system and opens modal', async () => {
  const ctx = buildContext();

  await ctx.handlers.showAdvancedPrintDialog({ reconciliation: { id: 1 } });

  const modal = ctx.bootstrap.Modal.getInstance(ctx.elements.printOptionsModal);
  assert.equal(ctx.state.initCalls, 1);
  assert.equal(ctx.state.currentPrintData.reconciliation.id, 1);
  assert.equal(modal.shown, true);
});

test('preparePrintData builds sections and applies company name', () => {
  const ctx = buildContext({
    windowObj: { currentCompanyName: 'ACME' }
  });

  const data = ctx.handlers.preparePrintData({
    reconciliation: { id: 4, cashier_name: 'Ali' },
    bankReceipts: [{ id: 1 }],
    cashReceipts: [{ id: 2 }],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: [{ id: 3 }]
  }, {
    sections: { cashReceipts: false, suppliers: true },
    color: false
  });

  assert.equal(data.reconciliation.company_name, 'ACME');
  assert.equal(Array.isArray(data.sections.bankReceipts), true);
  assert.equal(data.sections.cashReceipts, undefined);
  assert.equal(Array.isArray(data.sections.suppliers), true);
  assert.equal(data.isColorPrint, false);
});

test('handleDirectPrint validates missing current data', async () => {
  const ctx = buildContext();

  await ctx.handlers.handleDirectPrint();

  assert.equal(ctx.dialog.errorToasts.length, 1);
  assert.equal(ctx.state.invokeCalls.length, 0);
});

test('printReconciliationAdvanced validates missing reconciliation id', async () => {
  const ctx = buildContext();

  const result = await ctx.handlers.printReconciliationAdvanced(null);

  assert.equal(result, false);
  assert.equal(ctx.dialog.validationErrors.length, 1);
});

test('handleDirectPrint stops loading and reports timeout when print hangs', async () => {
  const ctx = buildContext({
    directPrintTimeoutMs: 20,
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'print-direct') {
          return new Promise(() => {});
        }
        return { success: true };
      }
    }
  });

  ctx.state.currentPrintData = {
    reconciliation: { id: 12, cashier_name: 'Ali', accountant_name: 'Mona', reconciliation_date: '2026-02-25' },
    bankReceipts: [],
    cashReceipts: [],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: []
  };

  await ctx.handlers.handleDirectPrint();

  assert.equal(ctx.dialog.closeCalls, 1);
  assert.equal(ctx.dialog.successToasts.length, 0);
  assert.equal(ctx.dialog.errorToasts.length, 1);
  assert.equal(
    ctx.dialog.errorToasts[0],
    'استغرقت الطباعة وقتًا أطول من المتوقع. تحقق من الطابعة ثم أعد المحاولة.'
  );
});
