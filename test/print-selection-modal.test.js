const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrintSelectionModalHandlers } = require('../src/app/print-selection-modal');

function createElement(initial = {}) {
  return {
    id: '',
    value: '',
    checked: false,
    removed: false,
    ...initial,
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

function buildContext() {
  const elements = {};
  const body = {
    html: '',
    insertAdjacentHTML(position, html) {
      this.html = html;
      const modal = createElement({ id: 'newPrintSectionModal' });
      elements.newPrintSectionModal = modal;
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
    errors: [],
    validations: [],
    showError(msg) { this.errors.push(msg); },
    showValidationError(msg) { this.validations.push(msg); }
  };

  const windowObj = {};
  const bootstrap = createBootstrapMock();
  const previewCalls = [];
  const printCalls = [];

  const handlers = createPrintSelectionModalHandlers({
    document: doc,
    windowObj,
    getCurrentPrintReconciliation: () => ({
      reconciliation: {
        id: 10,
        cashier_name: 'Ali',
        cashier_number: '001',
        accountant_name: 'Mona',
        reconciliation_date: '2026-02-25',
        total_receipts: 123.45
      },
      bankReceipts: [1],
      cashReceipts: [1, 2],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: []
    }),
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    getBootstrap: () => bootstrap,
    getDialogUtils: () => dialog,
    onGeneratePrintPreview: (opts) => previewCalls.push(opts),
    onGenerateAndPrint: (opts) => printCalls.push(opts),
    logger: { log() {} }
  });

  return { elements, body, dialog, windowObj, handlers, previewCalls, printCalls, bootstrap };
}

test('showPrintSectionSelectionDialog renders modal and exposes window handlers', () => {
  const ctx = buildContext();
  ctx.handlers.showPrintSectionSelectionDialog();

  assert.ok(ctx.body.html.includes('newPrintSectionModal'));
  assert.equal(typeof ctx.windowObj.selectAllPrintSections, 'function');
  assert.equal(typeof ctx.windowObj.showPrintPreview, 'function');
});

test('showPrintPreview validates when no sections selected', () => {
  const ctx = buildContext();
  ctx.handlers.showPrintSectionSelectionDialog();

  ctx.elements.printBankReceipts = createElement({ checked: false });
  ctx.elements.printCashReceipts = createElement({ checked: false });
  ctx.elements.printPostpaidSales = createElement({ checked: false });
  ctx.elements.printCustomerReceipts = createElement({ checked: false });
  ctx.elements.printReturnInvoices = createElement({ checked: false });
  ctx.elements.printSuppliers = createElement({ checked: false });
  ctx.elements.printSummary = createElement({ checked: false });
  ctx.elements.printPageSize = createElement({ value: 'A4' });
  ctx.elements.printOrientation = createElement({ value: 'portrait' });
  ctx.elements.printFontSize = createElement({ value: 'normal' });
  ctx.elements.printColors = createElement({ checked: true });

  ctx.handlers.showPrintPreview();
  assert.equal(ctx.dialog.validations.length, 1);
  assert.equal(ctx.previewCalls.length, 0);
});

test('proceedToPrint hides modal and calls print callback with selected options', () => {
  const ctx = buildContext();
  ctx.handlers.showPrintSectionSelectionDialog();

  ctx.elements.printBankReceipts = createElement({ checked: true });
  ctx.elements.printCashReceipts = createElement({ checked: false });
  ctx.elements.printPostpaidSales = createElement({ checked: false });
  ctx.elements.printCustomerReceipts = createElement({ checked: false });
  ctx.elements.printReturnInvoices = createElement({ checked: false });
  ctx.elements.printSuppliers = createElement({ checked: false });
  ctx.elements.printSummary = createElement({ checked: true });
  ctx.elements.printPageSize = createElement({ value: 'A4' });
  ctx.elements.printOrientation = createElement({ value: 'portrait' });
  ctx.elements.printFontSize = createElement({ value: 'large' });
  ctx.elements.printColors = createElement({ checked: false });

  ctx.handlers.proceedToPrint();
  assert.equal(ctx.printCalls.length, 1);
  assert.equal(ctx.printCalls[0].options.fontSize, 'large');
  assert.equal(ctx.printCalls[0].sections.summary, true);
  assert.equal(ctx.bootstrap.Modal.getInstance(ctx.elements.newPrintSectionModal).hidden, true);
});
