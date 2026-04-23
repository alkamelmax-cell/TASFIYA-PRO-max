const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppEditRuntimeBootstrap } = require('../src/app/app-edit-runtime-bootstrap');

function createElementMock() {
  return {
    addEventListener() {},
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    reset() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    value: '',
    checked: false,
    innerHTML: '',
    textContent: ''
  };
}

function createDocumentMock() {
  return {
    getElementById() { return createElementMock(); },
    querySelector() { return createElementMock(); },
    querySelectorAll() { return []; },
    createElement() { return createElementMock(); }
  };
}

test('initializeAppEditRuntimeBootstrap composes edit runtime handlers', () => {
  const documentMock = createDocumentMock();
  const windowMock = { addEventListener() {}, localStorage: { getItem() { return null; }, setItem() {} } };

  let currentReconciliation = null;

  const result = initializeAppEditRuntimeBootstrap({
    document: documentMock,
    ipcRenderer: { invoke: async () => [] },
    windowObj: windowMock,
    getBootstrap: () => ({
      Modal: class {
        show() {}
        hide() {}
        static getInstance() { return { hide() {} }; }
      }
    }),
    getDialogUtils: () => ({
      showError() {},
      showValidationError() {},
      showSuccessToast() {},
      showSuccess() {},
      showLoading() {},
      close() {}
    }),
    validateEditForm: () => ({ isValid: true }),
    collectEditFormData: () => ({}),
    getLoadSavedReconciliations: () => (() => {}),
    updateEditTotals() {},
    populateEditBankReceiptsTable() {},
    populateEditCashReceiptsTable() {},
    populateEditPostpaidSalesTable() {},
    populateEditCustomerReceiptsTable() {},
    populateEditReturnInvoicesTable() {},
    populateEditSuppliersTable() {},
    isExistingCustomer: () => false,
    getCurrentUser: () => ({ id: 1 }),
    getCurrentReconciliation: () => currentReconciliation,
    setCurrentReconciliation: (value) => { currentReconciliation = value; },
    setBankReceipts() {},
    setCashReceipts() {},
    setPostpaidSales() {},
    setCustomerReceipts() {},
    setReturnInvoices() {},
    setSuppliers() {},
    setTimeoutFn: (fn) => fn(),
    getEditMode: () => ({ isActive: false }),
    formatDate: () => '2026-02-25',
    EventCtor: Event,
    getUpdateButtonStates: () => (() => {}),
    getApplyTheme: () => (() => {}),
    logger: { log() {}, error() {}, warn() {} }
  });

  assert.equal(typeof result.sessionHandlers, 'object');
  assert.equal(typeof result.editReconciliationNew, 'function');
  assert.equal(typeof result.fetchReconciliationForEdit, 'function');
  assert.equal(typeof result.loadAllSettings, 'function');
  assert.equal(typeof windowMock.editReconciliationNew, 'function');
});
