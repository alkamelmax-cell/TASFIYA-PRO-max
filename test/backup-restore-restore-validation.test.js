const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBackupRestoreRestoreValidationHandlers
} = require('../src/app/backup-restore-restore-validation');

function createHandlers() {
  return createBackupRestoreRestoreValidationHandlers({
    ipcRenderer: {
      invoke: async () => []
    }
  });
}

test('repairBackupForeignKeyReferences repairs common missing parents before restore', async () => {
  const handlers = createHandlers();
  const data = {
    branches: [{ id: 1, branch_name: 'الفرع الرئيسي' }],
    cashiers: [{ id: 1, name: 'نايف', cashier_number: '101', branch_id: 999 }],
    accountants: [],
    atms: [],
    reconciliations: [{
      id: 10,
      cashier_id: 88,
      accountant_id: 77,
      reconciliation_date: '2026-04-01'
    }],
    bank_receipts: [{
      id: 1,
      reconciliation_id: 10,
      atm_id: 66,
      operation_type: 'deposit',
      amount: 50
    }],
    branch_cashboxes: [{
      id: 5,
      branch_id: 2,
      cashbox_name: 'صندوق 2',
      opening_balance: 100
    }],
    cashbox_vouchers: [{
      id: 20,
      voucher_number: 1,
      voucher_sequence_number: 1,
      voucher_type: 'receipt',
      cashbox_id: 9,
      branch_id: 2,
      counterparty_type: 'cashier',
      counterparty_name: 'اختبار',
      cashier_id: 88,
      amount: 15,
      voucher_date: '2026-04-01'
    }],
    reconciliation_requests: [{
      id: 3,
      cashier_id: 88
    }],
    manual_supplier_transactions: [{
      id: 2,
      branch_id: 999
    }],
    cashbox_voucher_audit_log: [{
      id: 7,
      branch_id: 999,
      voucher_type: 'receipt',
      action_type: 'create'
    }]
  };

  const result = await handlers.repairBackupForeignKeyReferences(data);

  assert.equal(result.repaired, true);
  assert.ok(data.branches.some((branch) => branch.id === 2));
  assert.ok(data.cashiers.some((cashier) => cashier.id === 88));
  assert.ok(data.accountants.some((accountant) => accountant.id === 77));
  assert.ok(data.atms.some((atm) => atm.id === 66));
  assert.ok(data.branch_cashboxes.some((cashbox) => cashbox.id === 9));
  assert.equal(data.cashiers.find((cashier) => cashier.id === 1).branch_id, null);
  assert.equal(data.manual_supplier_transactions[0].branch_id, null);
  assert.equal(data.cashbox_voucher_audit_log[0].branch_id, null);

  const consistency = handlers.validateDataConsistency(data);
  assert.equal(consistency.valid, true);
});
