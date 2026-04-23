const test = require('node:test');
const assert = require('node:assert/strict');
const { createCashierManagementHandlers } = require('../src/app/cashier-management');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    style: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
      this.lastChild = child;
    },
    removeChild() {
      this.children.pop();
      this.lastChild = this.children[this.children.length - 1] || null;
    },
    resetCalled: false,
    reset() {
      this.resetCalled = true;
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createElement();
    },
    querySelector(selector) {
      if (selector === '#addCashierForm button[type="submit"]') {
        return elements.cashierSubmitBtn;
      }
      return null;
    }
  };
}

test('handleAddCashier validates required fields', async () => {
  const elements = {
    cashierNameInput: createElement({ value: '' }),
    cashierNumberInput: createElement({ value: '' }),
    cashierBranchSelect: createElement({ value: '' }),
    addCashierForm: createElement(),
    cashierSubmitBtn: createElement({ textContent: 'إضافة الكاشير' }),
    cashiersListTable: createElement()
  };

  const dialog = {
    validations: [],
    showValidationError(msg) { this.validations.push(msg); },
    showSuccessToast() {},
    showError() {},
    showErrorToast() {},
    showToggleConfirm: async () => true
  };

  const handlers = createCashierManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => null },
    formatDate: (v) => v,
    getDialogUtils: () => dialog,
    refreshDropdownData() {},
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.handleAddCashier({ preventDefault() {} });
  assert.equal(dialog.validations.length, 1);
});

test('editCashier populates form and update mode label', async () => {
  const elements = {
    cashierNameInput: createElement({ value: '' }),
    cashierNumberInput: createElement({ value: '' }),
    cashierBranchSelect: createElement({ value: '' }),
    addCashierForm: createElement(),
    cashierSubmitBtn: createElement({ textContent: 'إضافة الكاشير' }),
    cashiersListTable: createElement()
  };

  const handlers = createCashierManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return { name: 'Ali', cashier_number: '001', branch_id: '3' };
        }
        return null;
      }
    },
    formatDate: (v) => v,
    getDialogUtils: () => ({
      showErrorToast() {},
      showToggleConfirm: async () => true
    }),
    refreshDropdownData() {},
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.editCashier(10);
  assert.equal(elements.cashierNameInput.value, 'Ali');
  assert.equal(elements.cashierNumberInput.value, '001');
  assert.equal(elements.cashierBranchSelect.value, '3');
  assert.equal(elements.cashierSubmitBtn.textContent, 'تحديث الكاشير');
});

test('loadCashiersList renders rows with action buttons', async () => {
  const elements = {
    addCashierForm: createElement(),
    cashierSubmitBtn: createElement({ textContent: 'إضافة الكاشير' }),
    cashiersListTable: createElement()
  };

  const handlers = createCashierManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [{
            id: 1,
            name: 'Cashier A',
            cashier_number: '10',
            branch_name: 'Main',
            active: 1,
            created_at: '2026-02-25'
          }];
        }
        return [];
      }
    },
    formatDate: (v) => v,
    getDialogUtils: () => ({
      showErrorToast() {},
      showToggleConfirm: async () => true
    }),
    refreshDropdownData() {},
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.loadCashiersList();
  assert.equal(elements.cashiersListTable.children.length, 1);
  assert.ok(elements.cashiersListTable.children[0].innerHTML.includes('editCashier(1)'));
  assert.ok(elements.cashiersListTable.children[0].innerHTML.includes('toggleCashierStatus(1'));
});
