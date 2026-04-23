const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationStateControls } = require('../src/app/reconciliation-state-controls');

function createClassList() {
  return {
    values: new Set(),
    add(name) {
      this.values.add(name);
    },
    remove(name) {
      this.values.delete(name);
    },
    has(name) {
      return this.values.has(name);
    }
  };
}

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    className: '',
    disabled: false,
    style: {},
    classList: createClassList(),
    ...initial,
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelectorAll() {
      return [];
    }
  };
}

test('updateButtonStates toggles save button by reconciliation existence', () => {
  const elements = {
    createReconciliationBtn: createElement(),
    saveReconciliationBtn: createElement()
  };
  let currentReconciliation = null;

  const controls = createReconciliationStateControls({
    document: {
      getElementById(id) { return elements[id] || null; },
      querySelectorAll() { return []; }
    },
    sessionStorage: null,
    getCurrentReconciliation: () => currentReconciliation,
    getDataCounts: () => ({ bankReceipts: 0, cashReceipts: 0, postpaidSales: 0, customerReceipts: 0, returnInvoices: 0, suppliers: 0 }),
    logger: { log() {}, error() {} }
  });

  controls.updateButtonStates('TEST');
  assert.equal(elements.saveReconciliationBtn.disabled, true);

  currentReconciliation = { id: 1 };
  controls.updateButtonStates('TEST');
  assert.equal(elements.saveReconciliationBtn.disabled, false);
});

test('validateReconciliationBeforeSave returns errors for invalid data', () => {
  const elements = {
    cashierSelect: createElement({ value: '' }),
    accountantSelect: createElement({ value: '' }),
    reconciliationDate: createElement({ value: '' }),
    systemSales: createElement({ value: '-1' })
  };

  const controls = createReconciliationStateControls({
    document: {
      getElementById(id) { return elements[id] || null; },
      querySelectorAll() { return []; }
    },
    sessionStorage: null,
    getCurrentReconciliation: () => null,
    getDataCounts: () => ({ bankReceipts: 0, cashReceipts: 0, postpaidSales: 0, customerReceipts: 0, returnInvoices: 0, suppliers: 0 }),
    logger: { log() {}, error() {} }
  });

  const result = controls.validateReconciliationBeforeSave();
  assert.equal(result.isValid, false);
  assert.ok(result.errors.length >= 5);
});

test('resetSystemToNewReconciliationState resets ui artifacts and session keys', () => {
  const statusElement = createElement({ textContent: 'x', className: 'reconciliation-status warning' });
  const invalidInput = createElement();
  invalidInput.classList.add('is-invalid');
  const form = createElement();
  form.querySelectorAll = (selector) => {
    if (selector === '.is-invalid') {
      return [invalidInput];
    }
    return [];
  };
  form.classList.add('was-validated');

  const progressBar = createElement({ style: { width: '85%' } });
  const removedKeys = [];
  const sessionStorage = {
    removeItem(key) {
      removedKeys.push(key);
    }
  };

  const controls = createReconciliationStateControls({
    document: {
      getElementById() { return null; },
      querySelectorAll(selector) {
        if (selector === '.reconciliation-status') return [statusElement];
        if (selector === 'form') return [form];
        if (selector === '.progress-bar') return [progressBar];
        return [];
      }
    },
    sessionStorage,
    getCurrentReconciliation: () => ({ id: 1 }),
    getDataCounts: () => ({ bankReceipts: 1, cashReceipts: 0, postpaidSales: 0, customerReceipts: 0, returnInvoices: 0, suppliers: 0 }),
    logger: { log() {}, error() {} }
  });

  controls.resetSystemToNewReconciliationState();
  assert.equal(statusElement.textContent, '');
  assert.equal(statusElement.className, 'reconciliation-status');
  assert.equal(form.classList.has('was-validated'), false);
  assert.equal(invalidInput.classList.has('is-invalid'), false);
  assert.equal(progressBar.style.width, '0%');
  assert.deepEqual(removedKeys, ['currentReconciliationData', 'tempReconciliationData']);
});
