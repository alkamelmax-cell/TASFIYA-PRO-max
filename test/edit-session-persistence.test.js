const test = require('node:test');
const assert = require('node:assert/strict');

const { createEditSessionPersistence } = require('../src/app/edit-session-persistence');

test('validateEditModalState checks modal and edit mode state', () => {
  const state = { isActive: false, reconciliationId: null };
  const elements = new Map();
  const handlers = createEditSessionPersistence({
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      }
    },
    ipcRenderer: { invoke: async () => {} },
    getEditMode: () => state,
    getCurrentUser: () => ({ name: 'Tester' }),
    DialogUtils: { showError() {} },
    logger: { log() {}, error() {} }
  });

  let result = handlers.validateEditModalState();
  assert.equal(result.isValid, false);

  elements.set('editReconciliationModal', {});
  result = handlers.validateEditModalState();
  assert.equal(result.isValid, false);

  state.isActive = true;
  state.reconciliationId = 22;
  result = handlers.validateEditModalState();
  assert.equal(result.isValid, true);
});

test('updateReconciliationInDatabase updates header, replaces rows, and inserts details', async () => {
  const calls = [];
  const handlers = createEditSessionPersistence({
    document: { getElementById() { return null; } },
    ipcRenderer: {
      invoke: async (...args) => {
        calls.push(args);
        return {};
      }
    },
    getEditMode: () => ({ isActive: true, reconciliationId: 55 }),
    getCurrentUser: () => ({ name: 'Tester' }),
    DialogUtils: { showError() {} },
    logger: { log() {}, error() {} }
  });

  await handlers.updateReconciliationInDatabase({
    reconciliationId: 55,
    systemSales: 100,
    totalReceipts: 120,
    surplusDeficit: 20,
    cashierId: 1,
    accountantId: 2,
    reconciliationDate: '2026-02-25',
    timeRangeStart: '08:00',
    timeRangeEnd: '09:00',
    filterNotes: 'note',
    bankReceipts: [{ operation_type: 'تحويل', atm_id: null, amount: 10 }],
    cashReceipts: [{ denomination: 50, quantity: 1, total_amount: 50 }],
    postpaidSales: [{ customer_name: 'A', amount: 5 }],
    customerReceipts: [{ customer_name: 'B', amount: 6, payment_type: 'نقدي' }],
    returnInvoices: [{ invoice_number: 'R1', amount: 2 }],
    suppliers: [{ supplier_name: 'S', amount: 3 }]
  });

  assert.equal(calls[0][0], 'update-reconciliation-modified');
  assert.ok(calls.some((call) => String(call[1]).includes('DELETE FROM bank_receipts')));
  assert.ok(calls.some((call) => String(call[1]).includes('INSERT INTO suppliers')));
});

test('handleEditError maps database errors to user-friendly messages', () => {
  let shown = null;
  const handlers = createEditSessionPersistence({
    document: { getElementById() { return null; } },
    ipcRenderer: { invoke: async () => {} },
    getEditMode: () => ({ isActive: true, reconciliationId: 5 }),
    getCurrentUser: () => ({ name: 'Tester' }),
    DialogUtils: {
      showError(message, title) {
        shown = { message, title };
      }
    },
    logger: { log() {}, error() {} }
  });

  handlers.handleEditError(new Error('SQLITE busy'), 'SAVE');
  assert.equal(shown.title, 'خطأ في قاعدة البيانات');
});
