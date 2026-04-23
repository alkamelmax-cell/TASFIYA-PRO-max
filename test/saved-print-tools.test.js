const test = require('node:test');
const assert = require('node:assert/strict');
const { createSavedPrintToolsHandlers } = require('../src/app/saved-print-tools');

function buildContext(overrides = {}) {
  const dialog = {
    loadingCalls: 0,
    closeCalls: 0,
    errors: [],
    successes: [],
    showLoading() { this.loadingCalls += 1; },
    close() { this.closeCalls += 1; },
    showError(message) { this.errors.push(message); },
    showSuccess(message) { this.successes.push(message); },
    showSuccessToast() {}
  };

  const state = {
    currentPrint: null,
    generatedOptions: null,
    thermalDialogData: null,
    previewOptions: null,
    ipcCalls: []
  };

  const windowObj = {};

  const baseDeps = {
    document: {
      getElementById() {
        return null;
      }
    },
    windowObj,
    ipcRenderer: {
      async invoke(channel, payload) {
        state.ipcCalls.push([channel, payload]);

        if (channel === 'generate-pdf') {
          return { success: true, filePath: 'C:/tmp/report.pdf' };
        }

        if (channel === 'close-print-preview') {
          return { success: true };
        }

        if (channel === 'db-query') {
          return [{ id: 123 }];
        }

        return [];
      }
    },
    setTimeoutFn(fn) {
      fn();
    },
    getDialogUtils: () => dialog,
    setCurrentPrintReconciliation(value) {
      state.currentPrint = value;
    },
    loadReconciliationForPrint: async (id) => ({
      reconciliation: { id, cashier_name: 'Ali' },
      bankReceipts: [],
      cashReceipts: [],
      postpaidSales: []
    }),
    printSavedReconciliation: async () => true,
    selectAllSavedPrintSections() {},
    deselectAllSavedPrintSections() {},
    showSavedPrintPreview() {},
    proceedToSavedPrint() {},
    showThermalPrintSectionDialog(data) {
      state.thermalDialogData = data;
    },
    selectAllThermalSections() {},
    deselectAllThermalSections() {},
    getSelectedThermalSections() {
      return {};
    },
    proceedWithThermalPrint() {},
    generateAndPrint(options) {
      state.generatedOptions = options;
    },
    transformDataForPDFGenerator(data) {
      return { reconciliationId: data.reconciliation.id };
    },
    generatePrintHTML() {
      return '<section></section><tr></tr>';
    },
    generatePrintPreview(options) {
      state.previewOptions = options;
    },
    formatCurrency(value) {
      return String(value);
    },
    formatNumber(value) {
      return String(value);
    },
    printReconciliationAdvanced: async () => true
  };

  const deps = { ...baseDeps, ...overrides };
  const handlers = createSavedPrintToolsHandlers(deps);

  return { handlers, dialog, state, windowObj };
}

test('quickPrintSavedReconciliation stores current payload and triggers print', async () => {
  const { handlers, state, windowObj } = buildContext();

  await handlers.quickPrintSavedReconciliation(55);

  assert.equal(state.currentPrint.reconciliation.id, 55);
  assert.equal(state.generatedOptions.sections.summary, true);
  assert.equal(typeof windowObj.quickPrintSavedReconciliation, 'function');
});

test('generatePDFSavedReconciliation transforms payload and reports success', async () => {
  const { handlers, dialog, state } = buildContext();

  await handlers.generatePDFSavedReconciliation(77);

  assert.equal(dialog.loadingCalls, 1);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.errors.length, 0);
  assert.equal(dialog.successes.length, 1);
  assert.deepEqual(state.ipcCalls[0], ['generate-pdf', { reconciliationId: 77 }]);
});

test('thermalPreviewSavedReconciliation sets preview mode and opens section dialog', async () => {
  const { handlers, dialog, state, windowObj } = buildContext();

  await handlers.thermalPreviewSavedReconciliation(88);

  assert.equal(dialog.loadingCalls, 1);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(windowObj.thermalPreviewMode, true);
  assert.equal(state.thermalDialogData.reconciliation.id, 88);
});

test('closePrintPreview resolves true when preview window closes successfully', async () => {
  const { handlers } = buildContext();

  const result = await handlers.closePrintPreview();

  assert.equal(result, true);
});
