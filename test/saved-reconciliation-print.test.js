const test = require('node:test');
const assert = require('node:assert/strict');
const { createSavedReconciliationPrintHandlers } = require('../src/app/saved-reconciliation-print');

function buildContext(overrides = {}) {
  const dialog = {
    errors: [],
    showError(msg) { this.errors.push(msg); }
  };

  const state = { current: null, shown: 0 };
  const handlers = createSavedReconciliationPrintHandlers({
    ipcRenderer: {
      invoke: async (...args) => {
        const channel = args[0];
        if (channel === 'db-get') {
          if (overrides.noReconciliation) {
            return null;
          }
          return { id: 10, cashier_name: 'Ali', cashier_number: '001', accountant_name: 'Mona' };
        }
        if (channel === 'db-query') {
          return [];
        }
        return null;
      }
    },
    getDialogUtils: () => dialog,
    setCurrentPrintReconciliation: (value) => { state.current = value; },
    onShowPrintSectionSelectionDialog: () => { state.shown += 1; },
    logger: { log() {}, error() {} },
    ...overrides
  });

  return { handlers, dialog, state };
}

test('loadReconciliationForPrint returns combined data payload', async () => {
  const { handlers } = buildContext();
  const result = await handlers.loadReconciliationForPrint(10);

  assert.equal(result.reconciliation.id, 10);
  assert.deepEqual(result.bankReceipts, []);
  assert.deepEqual(result.cashReceipts, []);
});

test('printSavedReconciliation sets current print data and opens section dialog', async () => {
  const { handlers, state, dialog } = buildContext();
  await handlers.printSavedReconciliation(10);

  assert.equal(state.current.reconciliation.id, 10);
  assert.equal(state.shown, 1);
  assert.equal(dialog.errors.length, 0);
});

test('printSavedReconciliation handles missing reconciliation data', async () => {
  const { handlers, dialog, state } = buildContext({ noReconciliation: true });
  await handlers.printSavedReconciliation(99);

  assert.equal(state.current, null);
  assert.equal(state.shown, 0);
  assert.equal(dialog.errors.length, 1);
});
