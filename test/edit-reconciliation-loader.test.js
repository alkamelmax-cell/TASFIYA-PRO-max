const test = require('node:test');
const assert = require('node:assert/strict');

const { createEditReconciliationLoader } = require('../src/app/edit-reconciliation-loader');

function createElement(initial = {}) {
  return {
    classList: {
      contains() {
        return true;
      }
    },
    ...initial
  };
}

function buildContext(overrides = {}) {
  const editMode = { isActive: false, reconciliationId: null, originalData: null };
  const state = {
    currentReconciliation: null,
    updateCalls: [],
    modalShown: 0,
    populated: null,
    errors: [],
    loadingCount: 0,
    closeCount: 0
  };

  const deps = {
    document: {
      getElementById(id) {
        if (id === 'editReconciliationModal') return createElement();
        return null;
      }
    },
    ipcRenderer: {
      async invoke() {
        return {
          reconciliation: { id: 5, reconciliation_number: 'R-5' },
          bankReceipts: [],
          cashReceipts: [],
          postpaidSales: [],
          customerReceipts: [],
          returnInvoices: [],
          suppliers: []
        };
      }
    },
    getBootstrap: () => ({
      Modal: class Modal {
        show() {
          state.modalShown += 1;
        }
      }
    }),
    getDialogUtils: () => ({
      showError(message) {
        state.errors.push(message);
      },
      showLoading() {
        state.loadingCount += 1;
      },
      close() {
        state.closeCount += 1;
      }
    }),
    getEditMode: () => editMode,
    setCurrentReconciliation(value) {
      state.currentReconciliation = value;
    },
    updateButtonStates(flag) {
      state.updateCalls.push(flag);
    },
    populateEditModal: async (payload) => {
      state.populated = payload;
    },
    handleEditError: () => {},
    setTimeoutFn: (cb) => cb(),
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  };

  const handlers = createEditReconciliationLoader(deps);
  return { handlers, state, editMode };
}

test('editReconciliationNew validates invalid reconciliation id', async () => {
  const ctx = buildContext();
  await ctx.handlers.editReconciliationNew(0);
  assert.equal(ctx.state.errors.length, 1);
});

test('editReconciliationNew loads data and opens edit modal', async () => {
  const ctx = buildContext();
  await ctx.handlers.editReconciliationNew(5);

  assert.equal(ctx.editMode.isActive, true);
  assert.equal(ctx.editMode.reconciliationId, 5);
  assert.equal(ctx.state.modalShown, 1);
  assert.equal(ctx.state.updateCalls[0], 'LOAD-RECONCILIATION');
  assert.ok(ctx.state.currentReconciliation);
  assert.equal(ctx.state.currentReconciliation.id, 5);
});

test('fetchReconciliationForEdit returns null when no payload found', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return null;
      }
    }
  });

  const result = await ctx.handlers.fetchReconciliationForEdit(8);
  assert.equal(result, null);
});
