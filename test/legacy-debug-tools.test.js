const test = require('node:test');
const assert = require('node:assert/strict');
const { createLegacyDebugToolsHandlers } = require('../src/app/legacy-debug-tools');

function createElement(initial = {}) {
  return {
    value: '',
    ...initial
  };
}

function buildContext(overrides = {}) {
  const elements = {
    timeRangeStart: createElement(),
    timeRangeEnd: createElement(),
    filterNotes: createElement(),
    editTimeRangeStart: createElement(),
    editTimeRangeEnd: createElement(),
    editFilterNotes: createElement()
  };

  const dialog = {
    alerts: [],
    successes: [],
    errors: [],
    showAlert(message) {
      this.alerts.push(message);
    },
    showSuccess(message) {
      this.successes.push(message);
    },
    showSuccessToast() {},
    showError(message) {
      this.errors.push(message);
    }
  };

  const state = {
    editCalls: [],
    currentReconciliation: null
  };

  const deps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    ipcRenderer: {
      async invoke() {
        return [];
      }
    },
    windowObj: {},
    getDialogUtils: () => dialog,
    editReconciliationNew: async (id) => {
      state.editCalls.push(id);
    },
    loadReconciliationForPrint: async () => null,
    transformDataForPDFGenerator: () => ({}),
    getCurrentReconciliation: () => state.currentReconciliation,
    setTimeoutFn: (fn) => fn(),
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  };

  const handlers = createLegacyDebugToolsHandlers(deps);
  return { handlers, deps, state, elements, dialog };
}

test('module registers legacy debug tools on window', () => {
  const ctx = buildContext();

  assert.equal(typeof ctx.deps.windowObj.testEditReconciliation, 'function');
  assert.equal(typeof ctx.deps.windowObj.quickTestFilterFields, 'function');
  assert.equal(typeof ctx.handlers.testSavedReconciliationPrint, 'function');
});

test('quickTestFilterFields fills test fields and returns success status', async () => {
  const ctx = buildContext();

  const result = await ctx.handlers.quickTestFilterFields();

  assert.equal(result.success, true);
  assert.equal(ctx.elements.timeRangeStart.value, '09:00');
  assert.equal(ctx.elements.timeRangeEnd.value, '17:00');
  assert.ok(ctx.elements.filterNotes.value.includes('اختبار سريع'));
  assert.equal(ctx.dialog.successes.length, 1);
});

test('testEditReconciliation shows alert when there are no saved reconciliations', async () => {
  const ctx = buildContext();

  await ctx.handlers.testEditReconciliation();

  assert.equal(ctx.dialog.alerts.length, 1);
  assert.equal(ctx.state.editCalls.length, 0);
});

test('loadReconciliationForEditOLD throws and reports error when data is missing', async () => {
  const ctx = buildContext();

  await assert.rejects(async () => {
    await ctx.handlers.loadReconciliationForEditOLD(null);
  });

  assert.equal(ctx.dialog.errors.length, 1);
});
