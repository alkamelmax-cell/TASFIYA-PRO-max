const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationHandlers } = require('../src/app/reconciliation-handlers');

function createElement() {
  return {
    disabled: false,
    value: '',
    required: false,
    innerHTML: '',
    style: { display: '' },
    textContent: '',
    setAttribute(name) {
      if (name === 'required') this.required = true;
    },
    removeAttribute(name) {
      if (name === 'required') this.required = false;
    },
    appendChild() {}
  };
}

test('operation handlers toggle atm required state', () => {
  const elements = {
    atmSelect: createElement(),
    bankName: createElement(),
    editAtmSelect: createElement(),
    editBankName: createElement()
  };

  const handlers = createReconciliationHandlers({
    ipcRenderer: { invoke: async () => [] },
    document: {
      getElementById(id) {
        return elements[id];
      },
      createElement() {
        return createElement();
      }
    },
    getDialogUtils: () => ({ showErrorToast() {} }),
    logger: { log() {}, error() {} }
  });

  handlers.handleOperationTypeChange({ target: { value: 'تحويل' } });
  assert.equal(elements.atmSelect.disabled, true);
  assert.equal(elements.atmSelect.required, false);

  handlers.handleOperationTypeChange({ target: { value: 'مدى' } });
  assert.equal(elements.atmSelect.disabled, false);
  assert.equal(elements.atmSelect.required, true);
});
