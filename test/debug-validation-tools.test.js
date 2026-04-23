const test = require('node:test');
const assert = require('node:assert/strict');
const { createDebugValidationToolsHandlers } = require('../src/app/debug-validation-tools');

function buildContext(overrides = {}) {
  const elements = {
    customerReceiptName: {},
    customerReceiptAmount: {},
    customerReceiptPaymentType: {},
    customerReceiptsTable: {},
    customerReceiptsTotal: {},
    saveReconciliationBtn: {},
    createReconciliationBtn: {},
    systemSales: {},
    totalReceipts: {}
  };

  const dialog = {
    successes: [],
    warnings: [],
    errors: [],
    validationErrors: [],
    showSuccess(message) {
      this.successes.push(message);
    },
    showWarning(message) {
      this.warnings.push(message);
    },
    showError(message) {
      this.errors.push(message);
    },
    showValidationError(message) {
      this.validationErrors.push(message);
    }
  };

  const state = {
    currentReconciliation: { id: 11 },
    dbGetCalls: 0
  };

  const deps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-get') {
          state.dbGetCalls += 1;
          return { count: 3 };
        }
        return null;
      }
    },
    windowObj: {},
    getDialogUtils: () => dialog,
    getCurrentReconciliation: () => state.currentReconciliation,
    getDataCounts: () => ({
      bankReceipts: 1,
      cashReceipts: 1,
      postpaidSales: 0,
      customerReceipts: 1,
      returnInvoices: 0,
      suppliers: 0
    }),
    handleCustomerReceipt() {},
    updateCustomerReceiptsTable() {},
    removeCustomerReceipt() {},
    validateReconciliationBeforeSave() {
      return { isValid: true };
    },
    clearAllReconciliationData() {},
    clearAllFormFields() {},
    clearAllTables() {},
    resetAllTotalsAndSummaries() {},
    resetSystemToNewReconciliationState() {},
    handlePrintReport() {},
    handleQuickPrint() {},
    handlePrintReportsData() {},
    handlePrintAdvancedReport() {},
    prepareReconciliationData() {},
    preparePrintData() {},
    showPrintSectionDialogForNewReconciliation() {},
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  };

  const handlers = createDebugValidationToolsHandlers(deps);
  return { handlers, dialog, state, deps };
}

test('testCustomerReceiptsFunction returns overall success when dependencies are available', async () => {
  const { handlers, dialog, state } = buildContext();

  const result = await handlers.testCustomerReceiptsFunction();

  assert.equal(result.overall, true);
  assert.equal(state.dbGetCalls, 1);
  assert.equal(dialog.successes.length, 1);
});

test('testEnhancedSaveFunction validates required save dependencies', async () => {
  const { handlers, dialog } = buildContext();

  const result = await handlers.testEnhancedSaveFunction();

  assert.equal(result.overall, true);
  assert.equal(dialog.successes.length, 1);
});

test('testFixedPrintFunctions passes when core print handlers exist and exposes window helpers', async () => {
  const { handlers, dialog, deps } = buildContext();

  const result = await handlers.testFixedPrintFunctions();

  assert.equal(result.overall, true);
  assert.equal(typeof deps.windowObj.testCustomerReceiptsFunction, 'function');
  assert.equal(typeof deps.windowObj.testEnhancedSaveFunction, 'function');
  assert.equal(typeof deps.windowObj.testFixedPrintFunctions, 'function');
  assert.equal(dialog.successes.length, 1);
});
