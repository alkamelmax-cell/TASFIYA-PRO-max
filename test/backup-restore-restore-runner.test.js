const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBackupRestoreRestoreRunnerHandlers
} = require('../src/app/backup-restore-restore-runner');

function createDialogTracker() {
  return {
    loading: 0,
    closed: 0,
    errors: [],
    successes: [],
    showLoading() {
      this.loading += 1;
    },
    close() {
      this.closed += 1;
    },
    showError(message) {
      this.errors.push(message);
    },
    showSuccess(message) {
      this.successes.push(message);
    },
    showConfirm: async () => true
  };
}

test('handleRestoreBackup repairs and validates backup references before restore', async () => {
  const dialog = createDialogTracker();
  let repairCalled = 0;
  let validateConsistencyCalled = 0;
  let restoredPayload = null;
  let reloaded = 0;

  const handlers = createBackupRestoreRestoreRunnerHandlers({
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'show-open-dialog') {
          return ['backup.json'];
        }

        if (channel === 'load-backup-file') {
          return {
            success: true,
            data: {
              metadata: { app_name: 'نظام تصفية الكاشير' },
              data: {
                branches: [],
                cashiers: [],
                accountants: [],
                atms: []
              }
            }
          };
        }

        throw new Error(`Unexpected IPC channel: ${channel}`);
      }
    },
    windowObj: {
      location: {
        reload() {
          reloaded += 1;
        }
      }
    },
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => dialog,
    ensureRequiredTablesExist: async () => {},
    validateBackupData: () => ({ valid: true }),
    repairBackupForeignKeyReferences: async (data) => {
      repairCalled += 1;
      data.branches.push({ id: 1, branch_name: 'تم الإصلاح' });
    },
    validateDataConsistency: (data) => {
      validateConsistencyCalled += 1;
      assert.equal(data.branches.length, 1);
      return { valid: true };
    },
    restoreDatabaseData: async (data) => {
      restoredPayload = data;
      return { success: true, recordCount: 1, tableCount: 1 };
    },
    performDatabaseIntegrityCheck: async () => ({ valid: true })
  });

  await handlers.handleRestoreBackup();

  assert.equal(repairCalled, 1);
  assert.equal(validateConsistencyCalled, 1);
  assert.ok(restoredPayload);
  assert.equal(restoredPayload.data.branches.length, 1);
  assert.equal(dialog.errors.length, 0);
  assert.equal(dialog.successes.length, 1);
  assert.equal(reloaded, 1);
});
