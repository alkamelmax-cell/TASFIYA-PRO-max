const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppShellHandlers } = require('../src/app/app-shell-handlers');

function createElement(initial = {}) {
  const element = {
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    classList: {
      add() {},
      remove() {}
    },
    children: [],
    appendChild(child) {
      this.children.push(child);
      this.lastChild = this.children[this.children.length - 1];
    },
    removeChild() {
      this.children.pop();
      this.lastChild = this.children[this.children.length - 1] || null;
    },
    reset() {
      this.value = '';
    },
    ...initial
  };

  if (!element.lastChild && element.children.length > 0) {
    element.lastChild = element.children[element.children.length - 1];
  }

  return element;
}

function createHandlers(overrides = {}) {
  const elements = {
    branchSelect: createElement({ children: [createElement({ value: '', textContent: 'اختر' })] }),
    mainApp: createElement({ style: { display: 'flex' } }),
    loginScreen: createElement({ style: { display: 'none' } }),
    currentReconciliationInfo: createElement({ style: { display: 'block' } })
  };

  const state = {
    currentUser: { id: 1 },
    currentReconciliation: { id: 2 },
    bankReceipts: [1],
    cashReceipts: [1],
    postpaidSales: [1],
    customerReceipts: [1],
    returnInvoices: [1],
    suppliers: [1]
  };

  let formResetCount = 0;

  const handlers = createAppShellHandlers({
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      createElement() {
        return createElement();
      },
      querySelectorAll(selector) {
        if (selector === 'form') {
          return [
            createElement({ reset() { formResetCount += 1; } }),
            createElement({ reset() { formResetCount += 1; } })
          ];
        }
        return [];
      }
    },
    localStorageObj: { getItem() { return null; }, setItem() {} },
    setTimeoutFn: (fn) => fn(),
    keyboardShortcuts: { register() {}, showHelp() {}, getAllShortcuts() { return []; } },
    Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
    bootstrap: { Modal: { getInstance() { return null; } } },
    ipcRenderer: { async invoke() { return []; } },
    getDialogUtils: () => ({ showInfo() {}, showConfirm: async () => false, showSuccessToast() {}, showError() {} }),
    logger: { log() {}, warn() {}, error() {} },
    getCurrentReconciliation: () => state.currentReconciliation,
    setCurrentReconciliation: (value) => { state.currentReconciliation = value; },
    setCurrentUser: (value) => { state.currentUser = value; },
    setBankReceipts: (value) => { state.bankReceipts = value; },
    setCashReceipts: (value) => { state.cashReceipts = value; },
    setPostpaidSales: (value) => { state.postpaidSales = value; },
    setCustomerReceipts: (value) => { state.customerReceipts = value; },
    setReturnInvoices: (value) => { state.returnInvoices = value; },
    setSuppliers: (value) => { state.suppliers = value; },
    showError() {},
    ...overrides
  });

  return { handlers, elements, state, getFormResetCount: () => formResetCount };
}

test('populateSelect يضيف خيارات جديدة مع الحفاظ على الخيار الأول', () => {
  const ctx = createHandlers();

  ctx.handlers.populateSelect('branchSelect', [
    { id: 10, branch_name: 'الرياض' },
    { id: 11, branch_name: 'جدة' }
  ], 'id', 'branch_name');

  assert.equal(ctx.elements.branchSelect.children.length, 3);
  assert.equal(ctx.elements.branchSelect.children[1].value, 10);
  assert.equal(ctx.elements.branchSelect.children[2].textContent, 'جدة');
});

test('handleLogout يعيد الحالة ويظهر شاشة الدخول', () => {
  const ctx = createHandlers();

  ctx.handlers.handleLogout();

  assert.equal(ctx.state.currentUser, null);
  assert.equal(ctx.state.currentReconciliation, null);
  assert.deepEqual(ctx.state.bankReceipts, []);
  assert.deepEqual(ctx.state.suppliers, []);
  assert.equal(ctx.elements.mainApp.style.display, 'none');
  assert.equal(ctx.elements.loginScreen.style.display, 'flex');
  assert.equal(ctx.elements.currentReconciliationInfo.style.display, 'none');
  assert.equal(ctx.getFormResetCount(), 2);
});
