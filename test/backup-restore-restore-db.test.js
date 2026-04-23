const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBackupRestoreRestoreDbHandlers
} = require('../src/app/backup-restore-restore-db');

test('restoreDatabaseData reenables foreign keys after commit', async () => {
  const calls = [];

  const handlers = createBackupRestoreRestoreDbHandlers({
    ipcRenderer: {
      invoke: async (channel, sql, params = []) => {
        calls.push({ channel, sql, params });

        if (channel === 'db-query' && sql === 'PRAGMA foreign_key_check') {
          return [];
        }

        return { changes: 1 };
      }
    }
  });

  const result = await handlers.restoreDatabaseData({
    metadata: { app_name: 'نظام تصفية الكاشير' },
    data: {
      branches: [],
      cashiers: [],
      accountants: [],
      atms: []
    }
  });

  assert.equal(result.success, true);

  const commitIndex = calls.findIndex(
    (call) => call.channel === 'db-run' && call.sql === 'COMMIT'
  );
  const foreignKeysOnIndex = calls.findIndex(
    (call, index) => index > commitIndex && call.channel === 'db-run' && call.sql === 'PRAGMA foreign_keys = ON'
  );

  assert.ok(commitIndex >= 0);
  assert.ok(foreignKeysOnIndex > commitIndex);
});

test('restoreDatabaseData clears auto-created branch cashboxes before restoring backup cashboxes', async () => {
  const calls = [];

  const handlers = createBackupRestoreRestoreDbHandlers({
    ipcRenderer: {
      invoke: async (channel, sql, params = []) => {
        calls.push({ channel, sql, params });

        if (channel === 'db-query' && sql === 'PRAGMA foreign_key_check') {
          return [];
        }

        return { changes: 1 };
      }
    }
  });

  const result = await handlers.restoreDatabaseData({
    metadata: { app_name: 'نظام تصفية الكاشير' },
    data: {
      branches: [
        { id: 1, branch_name: 'الفرع الرئيسي', is_active: 1 }
      ],
      branch_cashboxes: [
        { id: 4, branch_id: 1, cashbox_name: 'صندوق الفرع الرئيسي', opening_balance: 50, is_active: 1 }
      ],
      cashiers: [],
      accountants: [],
      atms: []
    }
  });

  assert.equal(result.success, true);

  const branchInsertIndex = calls.findIndex(
    (call) => call.channel === 'db-run' && typeof call.sql === 'string' && call.sql.includes('INSERT INTO branches')
  );
  const cleanupIndex = calls.findIndex(
    (call, index) => index > branchInsertIndex && call.channel === 'db-run' && call.sql === 'DELETE FROM branch_cashboxes'
  );
  const cashboxInsertIndex = calls.findIndex(
    (call, index) => index > cleanupIndex && call.channel === 'db-run' && typeof call.sql === 'string' && call.sql.includes('INSERT INTO branch_cashboxes')
  );

  assert.ok(branchInsertIndex >= 0);
  assert.ok(cleanupIndex > branchInsertIndex);
  assert.ok(cashboxInsertIndex > cleanupIndex);
});
