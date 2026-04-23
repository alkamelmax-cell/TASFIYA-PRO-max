const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppState } = require('../src/app/app-state');

test('createAppState initializes defaults and updates data counters', () => {
  const state = createAppState();

  assert.equal(state.getCurrentUser(), null);
  assert.equal(state.getCurrentReconciliation(), null);
  assert.deepEqual(state.getBankReceipts(), []);
  assert.deepEqual(state.getCashReceipts(), []);

  state.setCurrentUser({ id: 7 });
  state.setCurrentReconciliation({ id: 99 });
  state.setBankReceipts([1, 2]);
  state.setCashReceipts([1]);
  state.setPostpaidSales([1, 2, 3]);
  state.setCustomerReceipts([1]);
  state.setReturnInvoices([1, 2]);
  state.setSuppliers([1, 2, 3, 4]);
  state.setCurrentPrintReconciliation({ id: 'print-1' });
  state.setAvailablePrinters(['A4']);
  state.setCurrentPrintData({ total: 10 });

  assert.deepEqual(state.getCurrentUser(), { id: 7 });
  assert.deepEqual(state.getCurrentReconciliation(), { id: 99 });
  assert.deepEqual(state.getCurrentPrintReconciliation(), { id: 'print-1' });
  assert.deepEqual(state.getAvailablePrinters(), ['A4']);
  assert.deepEqual(state.getCurrentPrintData(), { total: 10 });
  assert.deepEqual(state.getDataCounts(), {
    bankReceipts: 2,
    cashReceipts: 1,
    postpaidSales: 3,
    customerReceipts: 1,
    returnInvoices: 2,
    suppliers: 4
  });
});
