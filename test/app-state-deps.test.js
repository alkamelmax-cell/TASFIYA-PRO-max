const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppState } = require('../src/app/app-state');
const {
  createReconciliationStateDeps,
  createPrintRuntimeStateDeps,
  createReconciliationTableUpdateDeps
} = require('../src/app/app-state-deps');

test('createReconciliationStateDeps shares the same app state getters and setters', () => {
  const state = createAppState();
  const deps = createReconciliationStateDeps(state);

  deps.setCurrentReconciliation({ id: 100 });
  deps.setBankReceipts([{ id: 1 }]);
  deps.setCashReceipts([{ id: 2 }, { id: 3 }]);
  deps.setPostpaidSales([1]);
  deps.setCustomerReceipts([1, 2, 3]);
  deps.setReturnInvoices([]);
  deps.setSuppliers([1, 2]);

  assert.deepEqual(state.getCurrentReconciliation(), { id: 100 });
  assert.equal(deps.getCashReceipts().length, 2);
  assert.deepEqual(deps.getDataCounts(), {
    bankReceipts: 1,
    cashReceipts: 2,
    postpaidSales: 1,
    customerReceipts: 3,
    returnInvoices: 0,
    suppliers: 2
  });
});

test('createPrintRuntimeStateDeps maps print state accessors', () => {
  const state = createAppState();
  const deps = createPrintRuntimeStateDeps(state);

  deps.setCurrentPrintReconciliation({ id: 'print-1' });
  deps.setAvailablePrinters(['Office A4']);
  deps.setCurrentPrintData({ reportId: 9 });

  assert.deepEqual(deps.getCurrentPrintReconciliation(), { id: 'print-1' });
  assert.deepEqual(deps.getAvailablePrinters(), ['Office A4']);
  assert.deepEqual(deps.getCurrentPrintData(), { reportId: 9 });
});

test('createReconciliationTableUpdateDeps exposes table update functions', () => {
  const handlers = {
    updateBankReceiptsTable() {},
    updateCashReceiptsTable() {},
    updatePostpaidSalesTable() {},
    updateCustomerReceiptsTable() {},
    updateReturnInvoicesTable() {},
    updateSuppliersTable() {}
  };

  const deps = createReconciliationTableUpdateDeps(handlers);

  assert.equal(deps.updateBankReceiptsTable, handlers.updateBankReceiptsTable);
  assert.equal(deps.updateCashReceiptsTable, handlers.updateCashReceiptsTable);
  assert.equal(deps.updatePostpaidSalesTable, handlers.updatePostpaidSalesTable);
  assert.equal(deps.updateCustomerReceiptsTable, handlers.updateCustomerReceiptsTable);
  assert.equal(deps.updateReturnInvoicesTable, handlers.updateReturnInvoicesTable);
  assert.equal(deps.updateSuppliersTable, handlers.updateSuppliersTable);
});
