const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountantManagementHandlers } = require('../src/app/accountant-management');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    ...initial,
    appendChild(child) {
      this.children.push(child);
    },
    reset() {}
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
      if (selector === '#addAccountantForm button[type="submit"]') {
        return elements.submitBtn;
      }
      return null;
    }
  };
}

test('handleAddAccountant validates empty name', async () => {
  const elements = {
    accountantNameInput: createElement({ value: '' }),
    addAccountantForm: createElement(),
    submitBtn: createElement({ textContent: 'إضافة المحاسب' }),
    accountantsListTable: createElement()
  };

  const dialog = {
    validations: [],
    showValidationError(msg) { this.validations.push(msg); },
    showSuccessToast() {},
    showErrorToast() {},
    showToggleConfirm: async () => true
  };

  const handlers = createAccountantManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => null },
    formatDate: (v) => v,
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.handleAddAccountant({ preventDefault() {} });
  assert.equal(dialog.validations.length, 1);
});

test('editAccountant populates form and updates submit label', async () => {
  const elements = {
    accountantNameInput: createElement(),
    addAccountantForm: createElement(),
    submitBtn: createElement({ textContent: 'إضافة المحاسب' }),
    accountantsListTable: createElement()
  };

  const handlers = createAccountantManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return { name: 'محاسب 1' };
        }
        return null;
      }
    },
    formatDate: (v) => v,
    getDialogUtils: () => ({
      showErrorToast() {},
      showToggleConfirm: async () => true
    }),
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.editAccountant(3);
  assert.equal(elements.accountantNameInput.value, 'محاسب 1');
  assert.equal(elements.submitBtn.textContent, 'تحديث المحاسب');
});

test('loadAccountantsList renders inline action handlers', async () => {
  const elements = {
    accountantNameInput: createElement(),
    addAccountantForm: createElement(),
    submitBtn: createElement(),
    accountantsListTable: createElement()
  };

  const handlers = createAccountantManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [{
            id: 8,
            name: 'محاسب 2',
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
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.loadAccountantsList();
  assert.equal(elements.accountantsListTable.children.length, 1);
  assert.ok(elements.accountantsListTable.children[0].innerHTML.includes('editAccountant(8)'));
  assert.ok(elements.accountantsListTable.children[0].innerHTML.includes('toggleAccountantStatus(8'));
});
