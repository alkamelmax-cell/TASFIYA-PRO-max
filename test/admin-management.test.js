const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminManagementHandlers } = require('../src/app/admin-management');

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
      if (selector === '#addAdminForm button[type="submit"]') {
        return elements.submitBtn;
      }
      return null;
    }
  };
}

test('handleAddAdmin validates required fields', async () => {
  const elements = {
    adminNameInput: createElement({ value: '' }),
    adminUsernameInput: createElement({ value: '' }),
    adminPasswordInput: createElement({ value: '' }),
    addAdminForm: createElement(),
    submitBtn: createElement(),
    adminsListTable: createElement()
  };

  const dialog = {
    validations: [],
    showValidationError(msg) { this.validations.push(msg); },
    showSuccessToast() {},
    showErrorToast() {},
    showToggleConfirm: async () => true
  };

  const handlers = createAdminManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => null },
    formatDate: (v) => v,
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.handleAddAdmin({ preventDefault() {} });
  assert.equal(dialog.validations.length, 1);
});

test('editAdmin populates form and switches submit label', async () => {
  const elements = {
    adminNameInput: createElement(),
    adminUsernameInput: createElement(),
    adminPasswordInput: createElement(),
    addAdminForm: createElement(),
    submitBtn: createElement({ textContent: 'إضافة المسؤول' }),
    adminsListTable: createElement()
  };

  const handlers = createAdminManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return { name: 'Root', username: 'admin', password: 'secret' };
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

  await handlers.editAdmin(2);
  assert.equal(elements.adminNameInput.value, 'Root');
  assert.equal(elements.adminUsernameInput.value, 'admin');
  assert.equal(elements.adminPasswordInput.value, '');
  assert.equal(elements.submitBtn.textContent, 'تحديث المسؤول');
});

test('handleAddAdmin hashes password before insert', async () => {
  const calls = [];
  const elements = {
    adminNameInput: createElement({ value: 'Root' }),
    adminUsernameInput: createElement({ value: 'admin' }),
    adminPasswordInput: createElement({ value: 'secret123' }),
    addAdminForm: createElement(),
    submitBtn: createElement(),
    adminsListTable: createElement()
  };

  const handlers = createAdminManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, sql, params) => {
        calls.push([channel, sql, params]);
        if (channel === 'auth-hash-secret') {
          return 'scrypt$test$hashed-secret';
        }
        if (channel === 'db-query') {
          return [];
        }
        return { lastInsertRowid: 1 };
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

  await handlers.handleAddAdmin({ preventDefault() {} });

  const insertCall = calls.find((entry) => entry[0] === 'db-run');
  assert.ok(insertCall);
  assert.equal(insertCall[2][0], 'Root');
  assert.equal(insertCall[2][1], 'admin');
  assert.match(insertCall[2][2], /^scrypt\$/);
});

test('loadAdminsList renders row actions', async () => {
  const elements = {
    adminNameInput: createElement(),
    adminUsernameInput: createElement(),
    adminPasswordInput: createElement(),
    addAdminForm: createElement(),
    submitBtn: createElement(),
    adminsListTable: createElement()
  };

  const handlers = createAdminManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [{
            id: 5,
            name: 'Manager',
            username: 'mgr',
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

  await handlers.loadAdminsList();
  assert.equal(elements.adminsListTable.children.length, 1);
  assert.ok(elements.adminsListTable.children[0].innerHTML.includes('editAdmin(5)'));
  assert.ok(elements.adminsListTable.children[0].innerHTML.includes('toggleAdminStatus(5'));
});
