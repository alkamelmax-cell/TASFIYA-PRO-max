const test = require('node:test');
const assert = require('node:assert/strict');

const { createBackupRestoreSettingsActions } = require('../src/app/backup-restore-settings-actions');

function createElement(initial = {}) {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    ...initial
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createDialogTracker() {
  return {
    loading: 0,
    closed: 0,
    success: [],
    errors: [],
    showLoading() { this.loading += 1; },
    close() { this.closed += 1; },
    showSuccessToast(message) { this.success.push(message); },
    showError(message) { this.errors.push(message); },
    showErrorToast(message) { this.errors.push(message); }
  };
}

test('handleSaveUserSettings explains when auto lock is disabled but session timeout remains active', async () => {
  const dialog = createDialogTracker();
  const elements = {
    sessionTimeout: createElement({ value: '60' }),
    autoLock: createElement({ value: 'disabled' })
  };
  const dbRunCalls = [];
  const applyRuntimeSecuritySettingsCalls = [];

  const handlers = createBackupRestoreSettingsActions({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return [];
      }
    },
    windowObj: {},
    getDialogUtils: () => dialog,
    applyRuntimeSecuritySettings: async (settings) => {
      applyRuntimeSecuritySettingsCalls.push(settings);
    },
    getCurrentUser: () => null,
    setCurrentUser() {},
    normalizeUser: (user) => user,
    applyPermissionsToDocument() {}
  });

  await handlers.handleSaveUserSettings();

  assert.equal(dbRunCalls.length, 2);
  assert.deepEqual(applyRuntimeSecuritySettingsCalls, [
    { sessionTimeout: '60', autoLock: 'disabled' }
  ]);
  assert.deepEqual(dialog.errors, []);
  assert.equal(dialog.success.length, 1);
  assert.match(dialog.success[0], /القفل التلقائي معطل/);
  assert.match(dialog.success[0], /60 دقيقة/);
});
