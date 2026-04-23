const test = require('node:test');
const assert = require('node:assert/strict');
const { createAtmManagementHandlers } = require('../src/app/atm-management');

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
      if (selector === '#addAtmForm button[type="submit"]') {
        return elements.submitBtn;
      }
      return null;
    }
  };
}

test('handleAddAtm validates required fields', async () => {
  const elements = {
    atmNameInput: createElement({ value: '' }),
    atmBankInput: createElement({ value: '' }),
    atmBranchSelect: createElement({ value: '' }),
    atmLocationInput: createElement({ value: '' }),
    addAtmForm: createElement(),
    submitBtn: createElement({ textContent: 'إضافة الجهاز' }),
    atmsListTable: createElement()
  };

  const dialog = {
    validations: [],
    showValidationError(msg) { this.validations.push(msg); },
    showSuccessToast() {},
    showErrorToast() {},
    showToggleConfirm: async () => true
  };

  const handlers = createAtmManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => null },
    formatDate: (v) => v,
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.handleAddAtm({ preventDefault() {} });
  assert.equal(dialog.validations.length, 1);
});

test('loadBranchesForAtms populates branch select options', async () => {
  const elements = {
    atmNameInput: createElement(),
    atmBankInput: createElement(),
    atmBranchSelect: createElement(),
    atmLocationInput: createElement(),
    addAtmForm: createElement(),
    submitBtn: createElement(),
    atmsListTable: createElement()
  };

  const handlers = createAtmManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [{ id: 1, branch_name: 'الفرع الرئيسي' }];
        }
        return [];
      }
    },
    formatDate: (v) => v,
    getDialogUtils: () => ({
      showValidationError() {},
      showSuccessToast() {},
      showErrorToast() {},
      showToggleConfirm: async () => true
    }),
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.loadBranchesForAtms();
  assert.equal(elements.atmBranchSelect.children.length, 1);
  assert.equal(elements.atmBranchSelect.children[0].value, 1);
});

test('editAtm fills form and updates submit label', async () => {
  const elements = {
    atmNameInput: createElement(),
    atmBankInput: createElement(),
    atmBranchSelect: createElement(),
    atmLocationInput: createElement(),
    addAtmForm: createElement(),
    submitBtn: createElement({ textContent: 'إضافة الجهاز' }),
    atmsListTable: createElement()
  };

  const handlers = createAtmManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return {
            name: 'ATM 1',
            bank_name: 'بنك A',
            branch_id: 4,
            location: 'المدخل'
          };
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

  await handlers.editAtm(4);
  assert.equal(elements.atmNameInput.value, 'ATM 1');
  assert.equal(elements.atmBankInput.value, 'بنك A');
  assert.equal(elements.atmBranchSelect.value, 4);
  assert.equal(elements.atmLocationInput.value, 'المدخل');
  assert.equal(elements.submitBtn.textContent, 'تحديث الجهاز');
});

test('loadAtmsList renders table action handlers', async () => {
  const elements = {
    atmNameInput: createElement(),
    atmBankInput: createElement(),
    atmBranchSelect: createElement(),
    atmLocationInput: createElement(),
    addAtmForm: createElement(),
    submitBtn: createElement(),
    atmsListTable: createElement()
  };

  const handlers = createAtmManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [{
            id: 9,
            name: 'ATM 9',
            bank_name: 'بنك B',
            branch_name: 'فرع 2',
            location: 'الطابق 1',
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

  await handlers.loadAtmsList();
  assert.equal(elements.atmsListTable.children.length, 1);
  assert.ok(elements.atmsListTable.children[0].innerHTML.includes('editAtm(9)'));
  assert.ok(elements.atmsListTable.children[0].innerHTML.includes('toggleAtmStatus(9'));
});
