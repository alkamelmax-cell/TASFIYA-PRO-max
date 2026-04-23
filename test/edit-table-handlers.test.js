const test = require('node:test');
const assert = require('node:assert/strict');

const { createEditTableHandlers } = require('../src/app/edit-table-handlers');

function createElement(initial = {}) {
  const listeners = {};
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    title: '',
    children: [],
    className: '',
    classList: {
      classes: new Set(),
      add(...items) {
        items.forEach((item) => this.classes.add(item));
      },
      remove(...items) {
        items.forEach((item) => this.classes.delete(item));
      }
    },
    ...initial,
    appendChild(child) {
      this.children.push(child);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    trigger(event, payload = {}) {
      if (listeners[event]) {
        listeners[event](payload);
      }
    }
  };
}

function buildContext() {
  const elements = new Map();
  const calls = {
    editBank: 0,
    reset: 0
  };

  const document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    createElement() {
      return createElement();
    }
  };

  [
    'editBankReceiptsTotal',
    'editCashReceiptsTotal',
    'editPostpaidSalesTotal',
    'editCustomerReceiptsTotal',
    'editReturnInvoicesTotal',
    'editSuppliersTotal'
  ].forEach((id) => elements.set(id, createElement({ textContent: '0' })));
  elements.set('editSystemSales', createElement({ value: '0' }));
  elements.set('editTotalReceipts', createElement());
  elements.set('editSurplusDeficit', createElement());
  elements.set('editCashReceiptsTable', createElement());
  elements.set('editReconciliationModal', createElement());
  elements.set('editSystemSales', createElement({ value: '100' }));

  const handlers = createEditTableHandlers({
    document,
    formatCurrency: (v) => Number(v).toFixed(2),
    getDialogUtils: () => ({ showError() {} }),
    isEditModeActive: () => true,
    getCurrentEditingReconciliationId: () => 10,
    getEditMode: () => ({ originalData: {} }),
    onEditBankReceipt: () => { calls.editBank += 1; },
    onEditCashReceipt: () => {},
    onEditPostpaidSale: () => {},
    onEditCustomerReceipt: () => {},
    onEditReturnInvoice: () => {},
    onEditSupplier: () => {},
    onDeleteBankReceipt: () => {},
    onDeleteCashReceipt: () => {},
    onDeletePostpaidSale: () => {},
    onDeleteCustomerReceipt: () => {},
    onDeleteReturnInvoice: () => {},
    onDeleteSupplier: () => {},
    onResetEditMode: () => { calls.reset += 1; }
  });

  return { handlers, elements, calls };
}

test('handleEditAction routes bank receipt edit callback', () => {
  const ctx = buildContext();
  ctx.handlers.handleEditAction('bankReceipt', 0);
  assert.equal(ctx.calls.editBank, 1);
});

test('populateEditCashReceiptsTable updates totals and summary values', () => {
  const ctx = buildContext();
  const rows = [
    { denomination: 100, quantity: 2, total_amount: 200 },
    { denomination: 50, quantity: 1, total_amount: 50 }
  ];

  ctx.handlers.populateEditCashReceiptsTable(rows);

  assert.equal(ctx.elements.get('editCashReceiptsTotal').textContent, '250.00');
  assert.equal(ctx.elements.get('editTotalReceipts').textContent, '250.00 ريال');
  assert.equal(ctx.elements.get('editSurplusDeficit').textContent, '150.00 ريال');
});

test('initializeEditModeEventListeners resets state on modal hidden', () => {
  const ctx = buildContext();
  ctx.handlers.initializeEditModeEventListeners();

  ctx.elements.get('editReconciliationModal').trigger('hidden.bs.modal');
  assert.equal(ctx.calls.reset, 1);
});
