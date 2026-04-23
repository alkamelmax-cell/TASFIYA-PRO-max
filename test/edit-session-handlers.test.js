const test = require('node:test');
const assert = require('node:assert/strict');

const { createEditSessionHandlers } = require('../src/app/edit-session-handlers');

function createElement(initial = {}) {
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {}
    },
    ...initial
  };
}

function buildContext() {
  const elements = new Map();
  const state = {
    currentUser: { name: 'Tester' },
    currentReconciliation: { id: 99 },
    editMode: {
      isActive: true,
      reconciliationId: 99,
      originalData: {
        bankReceipts: [],
        cashReceipts: [],
        postpaidSales: [],
        customerReceipts: [],
        returnInvoices: [],
        suppliers: []
      }
    },
    bankReceipts: [1],
    cashReceipts: [1],
    postpaidSales: [1],
    customerReceipts: [1],
    returnInvoices: [1],
    suppliers: [1]
  };

  const document = {
    getElementById(id) {
      return elements.get(id) || null;
    }
  };

  const bootstrap = {
    Modal: class Modal {
      show() {}
      hide() {}
      static getInstance() {
        return { hide() {} };
      }
    }
  };

  const DialogUtils = {
    showError() {},
    showLoading() {},
    close() {},
    showSuccessToast() {},
    showConfirm: async () => true
  };

  const handlers = createEditSessionHandlers({
    document,
    ipcRenderer: { invoke: async () => [] },
    getBootstrap: () => bootstrap,
    getDialogUtils: () => DialogUtils,
    validateEditForm: () => ({ isValid: true }),
    collectEditFormData: () => ({}),
    loadSavedReconciliations: async () => {},
    updateEditTotals: () => {},
    populateEditBankReceiptsTable: () => {},
    populateEditCashReceiptsTable: () => {},
    populateEditPostpaidSalesTable: () => {},
    populateEditCustomerReceiptsTable: () => {},
    populateEditReturnInvoicesTable: () => {},
    populateEditSuppliersTable: () => {},
    isExistingCustomer: async () => true,
    getCurrentUser: () => state.currentUser,
    getCurrentReconciliation: () => state.currentReconciliation,
    setCurrentReconciliation: (value) => { state.currentReconciliation = value; },
    setBankReceipts: (value) => { state.bankReceipts = value; },
    setCashReceipts: (value) => { state.cashReceipts = value; },
    setPostpaidSales: (value) => { state.postpaidSales = value; },
    setCustomerReceipts: (value) => { state.customerReceipts = value; },
    setReturnInvoices: (value) => { state.returnInvoices = value; },
    setSuppliers: (value) => { state.suppliers = value; },
    setTimeoutFn: (cb) => cb(),
    getEditMode: () => state.editMode
  });

  return { handlers, elements, state };
}

test('resetEditMode clears state and UI fields', () => {
  const ctx = buildContext();
  const form = createElement({ resetCalled: false, reset() { this.resetCalled = true; } });
  ctx.elements.set('editReconciliationForm', form);
  [
    'editBankReceiptsTable',
    'editCashReceiptsTable',
    'editPostpaidSalesTable',
    'editCustomerReceiptsTable',
    'editReturnInvoicesTable',
    'editSuppliersTable'
  ].forEach((id) => ctx.elements.set(id, createElement({ innerHTML: 'data' })));
  [
    'editBankReceiptsTotal',
    'editCashReceiptsTotal',
    'editPostpaidSalesTotal',
    'editCustomerReceiptsTotal',
    'editReturnInvoicesTotal',
    'editSuppliersTotal'
  ].forEach((id) => ctx.elements.set(id, createElement({ textContent: '55' })));
  ctx.elements.set('editTotalReceipts', createElement({ textContent: '55 ريال' }));
  ctx.elements.set('editSurplusDeficit', createElement({ textContent: '3 ريال', className: 'x' }));

  ctx.handlers.resetEditMode();

  assert.equal(ctx.state.currentReconciliation, null);
  assert.equal(ctx.state.editMode.isActive, false);
  assert.equal(ctx.state.editMode.reconciliationId, null);
  assert.deepEqual(ctx.state.bankReceipts, []);
  assert.deepEqual(ctx.state.suppliers, []);
  assert.equal(form.resetCalled, true);
});

test('validateEditModalState checks modal and edit status', () => {
  const ctx = buildContext();
  let result = ctx.handlers.validateEditModalState();
  assert.equal(result.isValid, false);

  ctx.elements.set('editReconciliationModal', createElement());
  result = ctx.handlers.validateEditModalState();
  assert.equal(result.isValid, true);
});

test('addOrUpdateEditData adds and updates edit arrays', () => {
  const ctx = buildContext();
  ctx.state.editMode.originalData.bankReceipts = [];

  ctx.handlers.addOrUpdateEditData('bankReceipts', { amount: 10 });
  assert.equal(ctx.state.editMode.originalData.bankReceipts.length, 1);
  assert.equal(ctx.state.editMode.originalData.bankReceipts[0].amount, 10);

  ctx.handlers.addOrUpdateEditData('bankReceipts', { amount: 25 }, 0);
  assert.equal(ctx.state.editMode.originalData.bankReceipts.length, 1);
  assert.equal(ctx.state.editMode.originalData.bankReceipts[0].amount, 25);
});
