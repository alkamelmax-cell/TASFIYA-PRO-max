const test = require('node:test');
const assert = require('node:assert/strict');
const { createBranchManagementHandlers } = require('../src/app/branch-management');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    className: '',
    children: [],
    attributes: {},
    listeners: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(eventName, handler) {
      this.listeners[eventName] = handler;
    },
    querySelector(selector) {
      if (this.querySelectorMap && this.querySelectorMap[selector]) {
        return this.querySelectorMap[selector];
      }
      return null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    reset() {
      this.wasReset = true;
    },
    scrollIntoView() {}
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createElement();
    }
  };
}

function createDialogStub() {
  return {
    validations: [],
    errors: [],
    successToasts: [],
    showValidationError(message) {
      this.validations.push(message);
    },
    showError(message) {
      this.errors.push(message);
    },
    showSuccessToast(message) {
      this.successToasts.push(message);
    },
    showConfirm: async () => true,
    showSuccess() {}
  };
}

test('loadBranches populates table/dropdowns and exposes window handlers', async () => {
  const placeholder = createElement({ value: '' });
  const branchSelect = createElement({
    querySelectorMap: { 'option[value=""]': placeholder }
  });
  const cashierBranchSelect = createElement({
    querySelectorMap: { 'option[value=""]': createElement({ value: '' }) }
  });
  const searchBranchFilter = createElement({
    querySelectorMap: { 'option[value=""]': createElement({ value: '' }) }
  });

  const elements = {
    branchesTable: createElement(),
    branchSelect,
    cashierBranchSelect,
    searchBranchFilter
  };
  const windowObj = {};

  const handlers = createBranchManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-query') {
          return [
            { id: 1, branch_name: 'الرئيسي', is_active: 1, created_at: '2026-02-25' },
            { id: 2, branch_name: 'المغلق', is_active: 0, created_at: '2026-02-25' }
          ];
        }
        return [];
      }
    },
    formatDate: (value) => value,
    populateSelect() {},
    refreshDropdownData() {},
    getDialogUtils: createDialogStub,
    logger: { log() {}, error() {} },
    windowObj
  });

  const branches = await handlers.loadBranches();
  assert.equal(branches.length, 2);
  assert.ok(elements.branchesTable.innerHTML.includes('editBranch(1)'));
  assert.equal(branchSelect.children.length, 2);
  assert.equal(branchSelect.children[1].value, 1);
  assert.equal(typeof windowObj.editBranch, 'function');
  assert.equal(typeof windowObj.toggleBranchStatus, 'function');
  assert.equal(typeof windowObj.deleteBranch, 'function');
});

test('handleBranchForm inserts branch and refreshes data', async () => {
  const branchForm = createElement();
  const elements = {
    branchForm,
    branchName: createElement({ value: 'فرع جديد' }),
    branchAddress: createElement({ value: 'عنوان' }),
    branchPhone: createElement({ value: '123' }),
    branchStatus: createElement({ value: '1' })
  };

  const dialog = createDialogStub();
  const calls = [];
  let refreshCalls = 0;
  const handlers = createBranchManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        calls.push({ channel, query, params });
        if (channel === 'db-run') {
          return { changes: 1 };
        }
        if (channel === 'db-query') {
          return [];
        }
        return null;
      }
    },
    formatDate: (value) => value,
    populateSelect() {},
    refreshDropdownData() {
      refreshCalls += 1;
    },
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  await handlers.handleBranchForm({ preventDefault() {} });
  assert.equal(branchForm.wasReset, true);
  assert.equal(dialog.successToasts.length, 1);
  assert.equal(refreshCalls, 1);
  assert.ok(calls.some((call) => call.channel === 'db-run' && call.query.includes('INSERT INTO branches')));
});

test('handleBranchSelectionChange filters cashiers and clears current selection', async () => {
  const branchSelect = createElement();
  const cashierSelect = createElement({ value: '77' });
  const cashierNumber = createElement({ value: 'C-77' });
  const elements = {
    branchSelect,
    cashierSelect,
    cashierNumber
  };

  const populateCalls = [];
  const dbCalls = [];
  const handlers = createBranchManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        dbCalls.push({ channel, query, params });
        if (channel === 'db-query') {
          return [{ id: 1, name: 'Cashier 1' }];
        }
        return [];
      }
    },
    formatDate: (value) => value,
    populateSelect(...args) {
      populateCalls.push(args);
    },
    refreshDropdownData() {},
    getDialogUtils: createDialogStub,
    logger: { log() {}, error() {} },
    windowObj: {}
  });

  handlers.handleBranchSelectionChange();
  await branchSelect.listeners.change.call({ value: '5' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(populateCalls.length, 1);
  assert.equal(populateCalls[0][0], 'cashierSelect');
  assert.ok(dbCalls.some((call) => call.channel === 'db-query' && call.params[0] === '5'));
  assert.equal(cashierSelect.value, '');
  assert.equal(cashierNumber.value, '');
});
