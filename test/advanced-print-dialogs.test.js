const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdvancedPrintDialogHandlers } = require('../src/app/advanced-print-dialogs');

function createElement(initial = {}) {
  return {
    id: '',
    value: '',
    checked: false,
    removed: false,
    listeners: {},
    ...initial,
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    remove() {
      this.removed = true;
    }
  };
}

function createBootstrapMock() {
  class Modal {
    static instances = new Map();

    constructor(element) {
      this.element = element;
      this.hidden = false;
      this.shown = false;
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
  const elements = {};
  const body = {
    insertAdjacentHTML(position, html) {
      if (html.includes('newReconciliationPrintSectionModal')) {
        elements.newReconciliationPrintSectionModal = createElement({ id: 'newReconciliationPrintSectionModal' });
      }
      if (html.includes('printSectionModal')) {
        elements.printSectionModal = createElement({ id: 'printSectionModal' });
      }
    }
  };

  const doc = {
    body,
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll() {
      return [];
    }
  };

  const dialog = {
    validationErrors: [],
    errors: [],
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showError(message) {
      this.errors.push(message);
    }
  };

  const bootstrap = createBootstrapMock();
  const windowObj = {};
  const deps = {
    document: doc,
    windowObj,
    getBootstrap: () => bootstrap,
    getDialogUtils: () => dialog,
    prepareReconciliationData: async () => ({
      reconciliation: {
        id: 5,
        cashier_name: 'Ali',
        accountant_name: 'Mona'
      },
      bankReceipts: [],
      cashReceipts: [],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: [],
      summary: {}
    }),
    getCurrentReconciliation: () => ({ id: 5 }),
    getCurrentPrintData: () => null,
    setCurrentPrintData() {},
    getAvailablePrinters: () => [],
    initializePrintSystem: async () => {},
    printReconciliationAdvanced: async () => true,
    handlePrintReport() {},
    handleQuickPrint() {},
    preparePrintData() {},
    logger: { log() {}, error() {} },
    ...overrides
  };

  const handlers = createAdvancedPrintDialogHandlers(deps);
  return { handlers, deps, elements, dialog, bootstrap, windowObj };
}

function populateNewPrintForm(elements, sections) {
  elements.newReconciliationPrintSectionModal = createElement({ id: 'newReconciliationPrintSectionModal' });
  elements.newPrintBankReceipts = createElement({ checked: sections.bankReceipts });
  elements.newPrintCashReceipts = createElement({ checked: sections.cashReceipts });
  elements.newPrintPostpaidSales = createElement({ checked: sections.postpaidSales });
  elements.newPrintCustomerReceipts = createElement({ checked: sections.customerReceipts });
  elements.newPrintReturnInvoices = createElement({ checked: sections.returnInvoices });
  elements.newPrintSuppliers = createElement({ checked: sections.suppliers });
  elements.newPrintSummary = createElement({ checked: sections.summary });
  elements.newPageSize = createElement({ value: 'A4' });
  elements.newOrientation = createElement({ value: 'portrait' });
  elements.newFontSize = createElement({ value: 'normal' });
}

test('confirmNewPrintSections validates when no section is selected', () => {
  const ctx = buildContext();
  populateNewPrintForm(ctx.elements, {
    bankReceipts: false,
    cashReceipts: false,
    postpaidSales: false,
    customerReceipts: false,
    returnInvoices: false,
    suppliers: false,
    summary: false
  });
  new ctx.bootstrap.Modal(ctx.elements.newReconciliationPrintSectionModal);

  let resolved = false;
  ctx.windowObj.newPrintSectionResolve = () => {
    resolved = true;
  };

  ctx.handlers.confirmNewPrintSections();

  assert.equal(ctx.dialog.validationErrors.length, 1);
  assert.equal(resolved, false);
});

test('confirmNewPrintSections resolves selected options and hides modal', () => {
  const ctx = buildContext();
  populateNewPrintForm(ctx.elements, {
    bankReceipts: true,
    cashReceipts: false,
    postpaidSales: false,
    customerReceipts: false,
    returnInvoices: false,
    suppliers: false,
    summary: true
  });
  const modal = new ctx.bootstrap.Modal(ctx.elements.newReconciliationPrintSectionModal);

  let resolvedOptions = null;
  ctx.windowObj.newPrintSectionResolve = (value) => {
    resolvedOptions = value;
  };

  ctx.handlers.confirmNewPrintSections();

  assert.equal(modal.hidden, true);
  assert.equal(resolvedOptions.sections.bankReceipts, true);
  assert.equal(resolvedOptions.sections.summary, true);
  assert.equal(resolvedOptions.pageSize, 'A4');
});

test('testPrintDataStructure returns true when required reconciliation fields exist', async () => {
  const ctx = buildContext();

  const result = await ctx.handlers.testPrintDataStructure();

  assert.equal(result, true);
});
