const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackupRestoreManagementHandlers } = require('../src/app/backup-restore-management');

function createElement(initial = {}) {
  return {
    value: '',
    ...initial
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

function createDialogTracker() {
  return {
    loading: 0,
    closed: 0,
    toasts: [],
    errors: [],
    showInfo() {},
    showLoading() { this.loading += 1; },
    close() { this.closed += 1; },
    showSuccessToast(message) { this.toasts.push(message); },
    showSuccess() {},
    showError(message) { this.errors.push(message); },
    showErrorToast(message) { this.errors.push(message); },
    showConfirm: async () => true
  };
}

test('validateBackupData checks required backup structure', () => {
  const handlers = createBackupRestoreManagementHandlers({
    document: createDocument({}),
    ipcRenderer: { invoke: async () => null },
    windowObj: {},
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: createDialogTracker
  });

  const invalid = handlers.validateBackupData(null);
  assert.equal(invalid.valid, false);

  const valid = handlers.validateBackupData({
    metadata: { app_name: 'نظام تصفية الكاشير' },
    data: { branches: [], cashiers: [], accountants: [], atms: [] }
  });
  assert.equal(valid.valid, true);
});

test('validateBackupCompleteness reports missing core tables', () => {
  const handlers = createBackupRestoreManagementHandlers({
    document: createDocument({}),
    ipcRenderer: { invoke: async () => null },
    windowObj: {},
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: createDialogTracker
  });

  const result = handlers.validateBackupCompleteness({
    branches: [],
    cashiers: [],
    accountants: [],
    atms: [],
    reconciliations: []
  });

  assert.equal(result.valid, false);
  assert.ok(result.warnings.length > 0);
});

test('handleCreateBackup closes loading when user cancels save dialog', async () => {
  const dialog = createDialogTracker();
  const handlers = createBackupRestoreManagementHandlers({
    document: createDocument({}),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'show-save-dialog') {
          return null;
        }
        return null;
      }
    },
    windowObj: {},
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => dialog
  });

  await handlers.handleCreateBackup();
  assert.equal(dialog.loading, 1);
  assert.equal(dialog.closed, 1);
});

test('handleAutoBackupChange persists selected frequency', async () => {
  const dialog = createDialogTracker();
  const calls = [];
  const elements = {
    autoBackup: createElement({ value: 'weekly' })
  };

  const handlers = createBackupRestoreManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        calls.push({ channel, query, params });
        return { changes: 1 };
      }
    },
    windowObj: {},
    setTimeoutFn: (fn) => fn(),
    getDialogUtils: () => dialog
  });

  await handlers.handleAutoBackupChange();
  const saveCall = calls.find((item) => item.channel === 'db-run');
  assert.ok(saveCall);
  assert.equal(saveCall.params[2], 'weekly');
  assert.equal(dialog.toasts.length, 1);
});
