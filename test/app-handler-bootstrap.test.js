const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppState } = require('../src/app/app-state');
const { createAppHandlerBootstrap } = require('../src/app/app-handler-bootstrap');

function createElementMock() {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    checked: false,
    disabled: false,
    style: {},
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    removeAttribute() {},
    setAttribute() {},
    querySelector() {
      return createElementMock();
    },
    querySelectorAll() {
      return [];
    },
    reset() {},
    focus() {}
  };
}

function createDocumentMock() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElementMock());
      }
      return elements.get(id);
    },
    querySelector() {
      return createElementMock();
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return createElementMock();
    }
  };
}

function createDialogUtilsMock() {
  return {
    showValidationError() {},
    showErrorToast() {},
    showSuccessToast() {},
    showError() {},
    showDeleteConfirm: async () => false
  };
}

test('createAppHandlerBootstrap prepares shell, edit, and table/data handlers', () => {
  const state = createAppState();
  const documentMock = createDocumentMock();
  const windowMock = {};

  const handlers = createAppHandlerBootstrap({
    document: documentMock,
    windowObj: windowMock,
    ipcRenderer: { invoke: async () => [] },
    formNavigation: { focusFirstField() {} },
    formatting: { formatCurrency: (value) => String(value ?? 0) },
    state,
    getDialogUtils: () => createDialogUtilsMock(),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(typeof handlers.shellDeps.loadCustomersForDropdowns, 'function');
  assert.equal(typeof handlers.shellDeps.handleBranchChange, 'function');
  assert.equal(typeof handlers.editDeps.validateEditForm, 'function');
  assert.equal(typeof handlers.editDeps.collectEditFormData, 'function');
  assert.equal(typeof handlers.dataEntryHandlers.updateBankReceiptsTable, 'function');
  assert.equal(typeof handlers.editTableHandlers.initializeEditModeEventListeners, 'function');

  handlers.editDeps.setEditSessionHandlers({
    isEditModeActive: () => false,
    getCurrentEditingReconciliationId: () => null,
    editEditBankReceipt() {},
    editEditCashReceipt() {},
    editEditPostpaidSale() {},
    editEditCustomerReceipt() {},
    editEditReturnInvoice() {},
    editEditSupplier() {},
    deleteEditBankReceipt() {},
    deleteEditCashReceipt() {},
    deleteEditPostpaidSale() {},
    deleteEditCustomerReceipt() {},
    deleteEditReturnInvoice() {},
    deleteEditSupplier() {},
    resetEditMode() {}
  });

  handlers.setAppModules({
    reconciliationUiHandlers: {
      updateSummary() {}
    }
  });

  assert.equal(handlers.editDeps.getEditMode().isActive, false);
});
