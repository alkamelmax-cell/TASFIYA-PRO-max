const test = require('node:test');
const assert = require('node:assert/strict');
const { createThermalPrintSections } = require('../src/app/thermal-print-sections');

function createDialogTracker() {
  return {
    calls: [],
    showValidationError(message) { this.calls.push(['validation', message]); },
    showLoading(message) { this.calls.push(['loading', message]); },
    close() { this.calls.push(['close']); },
    showSuccessToast(message) { this.calls.push(['success', message]); },
    showError(message, title) { this.calls.push(['error', message, title]); }
  };
}

function createBaseDoc(checkboxValues) {
  const elements = {
    thermalPrintSectionModal: { id: 'thermalPrintSectionModal' },
    thermalBankReceipts: { checked: checkboxValues.bankReceipts },
    thermalCashReceipts: { checked: checkboxValues.cashReceipts },
    thermalPostpaidSales: { checked: checkboxValues.postpaidSales },
    thermalCustomerReceipts: { checked: checkboxValues.customerReceipts },
    thermalReturnInvoices: { checked: checkboxValues.returnInvoices },
    thermalSuppliers: { checked: checkboxValues.suppliers },
    thermalSummary: { checked: checkboxValues.summary }
  };

  const checkboxList = [
    elements.thermalBankReceipts,
    elements.thermalCashReceipts,
    elements.thermalPostpaidSales,
    elements.thermalCustomerReceipts,
    elements.thermalReturnInvoices,
    elements.thermalSuppliers,
    elements.thermalSummary
  ];

  return {
    elements,
    doc: {
      body: {
        insertAdjacentHTML() {}
      },
      getElementById(id) {
        return elements[id] || null;
      },
      querySelectorAll(selector) {
        if (selector === '.thermal-section-checkbox') {
          return checkboxList;
        }
        return [];
      }
    }
  };
}

test('thermal section helpers select and deselect all checkboxes', () => {
  const { doc, elements } = createBaseDoc({
    bankReceipts: false,
    cashReceipts: false,
    postpaidSales: false,
    customerReceipts: false,
    returnInvoices: false,
    suppliers: false,
    summary: false
  });

  const handlers = createThermalPrintSections({
    document: doc,
    ipcRenderer: { invoke: async () => ({ success: true }) },
    windowObj: {},
    getBootstrap: () => ({ Modal: { getInstance: () => ({ hide() {} }) } }),
    getDialogUtils: () => createDialogTracker(),
    logger: { log() {}, error() {} },
    postActionDelayMs: 0
  });

  handlers.selectAllThermalSections();
  assert.equal(elements.thermalBankReceipts.checked, true);
  assert.equal(elements.thermalSummary.checked, true);

  handlers.deselectAllThermalSections();
  assert.equal(elements.thermalCashReceipts.checked, false);
  assert.equal(elements.thermalSuppliers.checked, false);
});

test('proceedWithThermalPrint validates at least one selected section', async () => {
  const { doc } = createBaseDoc({
    bankReceipts: false,
    cashReceipts: false,
    postpaidSales: false,
    customerReceipts: false,
    returnInvoices: false,
    suppliers: false,
    summary: false
  });

  const dialog = createDialogTracker();
  let invoked = false;
  const handlers = createThermalPrintSections({
    document: doc,
    ipcRenderer: { invoke: async () => { invoked = true; return { success: true }; } },
    windowObj: {
      thermalPreviewMode: true,
      currentThermalReconciliationData: {
        reconciliation: {},
        bankReceipts: [],
        cashReceipts: [],
        postpaidSales: [],
        customerReceipts: [],
        returnInvoices: [],
        suppliers: []
      }
    },
    getBootstrap: () => ({ Modal: { getInstance: () => ({ hide() {} }) } }),
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    postActionDelayMs: 0
  });

  await handlers.proceedWithThermalPrint();
  assert.equal(invoked, false);
  assert.equal(dialog.calls[0][0], 'validation');
});

test('proceedWithThermalPrint sends selected sections and clears state', async () => {
  const { doc } = createBaseDoc({
    bankReceipts: true,
    cashReceipts: false,
    postpaidSales: false,
    customerReceipts: false,
    returnInvoices: false,
    suppliers: false,
    summary: true
  });

  const dialog = createDialogTracker();
  const windowObj = {
    thermalPreviewMode: true,
    currentThermalReconciliationData: {
      reconciliation: { id: 1 },
      bankReceipts: [{ amount: 1 }],
      cashReceipts: [],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: [],
      companySettings: {}
    }
  };

  const invocations = [];
  const handlers = createThermalPrintSections({
    document: doc,
    ipcRenderer: {
      invoke: async (endpoint, payload) => {
        invocations.push([endpoint, payload]);
        return { success: true };
      }
    },
    windowObj,
    getBootstrap: () => ({ Modal: { getInstance: () => ({ hide() {} }) } }),
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} },
    postActionDelayMs: 0
  });

  await handlers.proceedWithThermalPrint();
  assert.equal(invocations[0][0], 'thermal-printer-preview');
  assert.equal(invocations[0][1].selectedSections.bankReceipts, true);
  assert.equal(invocations[0][1].selectedSections.summary, true);
  assert.equal(windowObj.currentThermalReconciliationData, null);
  assert.equal(windowObj.thermalPreviewMode, null);
});
