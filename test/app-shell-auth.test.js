const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppShellAuthHandlers } = require('../src/app/app-shell-auth');

function createElement(initial = {}) {
  return {
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    reset() {},
    ...initial
  };
}

function createAuthContext(overrides = {}) {
  const timeoutCalls = [];
  const eventBindings = [];
  let activeUser = { id: 101, username: 'tester' };

  const context = {
    document: {
      addEventListener(eventName) {
        eventBindings.push(eventName);
      },
      removeEventListener() {},
      getElementById() {
        return createElement();
      },
      querySelectorAll() {
        return [];
      }
    },
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-query') {
          return [];
        }
        return [];
      }
    },
    windowObj: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
      }
    },
    setTimeoutFn(fn, timeoutMs) {
      timeoutCalls.push(timeoutMs);
      return { fn, timeoutMs };
    },
    clearTimeoutFn() {},
    getDialogUtils: () => ({
      showWarning() {},
      showInfo() {},
      showErrorToast() {},
      showConfirm: async () => false
    }),
    logger: { log() {}, warn() {}, error() {} },
    getCurrentUser: () => activeUser,
    getCurrentReconciliation: () => null,
    setCurrentReconciliation() {},
    setCurrentUser(value) {
      activeUser = value;
    },
    setBankReceipts() {},
    setCashReceipts() {},
    setPostpaidSales() {},
    setCustomerReceipts() {},
    setReturnInvoices() {},
    setSuppliers() {},
    loadSystemSettings: async () => {},
    normalizeUser: (user) => user,
    applyPermissionsToDocument() {},
    getDefaultSectionForUser: () => 'reconciliation',
    showSection() {},
    highlightMenuItem() {},
    resetUIOnly: async () => {},
    clearAllReconciliationData: async () => {},
    resetSystemToNewReconciliationState() {},
    showError() {},
    ...overrides
  };

  return {
    handlers: createAppShellAuthHandlers(context),
    timeoutCalls,
    eventBindings
  };
}

test('applyRuntimeSecuritySettings respects disabled session timeout stored as numeric zero', async () => {
  const ctx = createAuthContext({
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-query') {
          return [
            { setting_key: 'session_timeout', setting_value: 0 },
            { setting_key: 'auto_lock', setting_value: 'disabled' }
          ];
        }
        return [];
      }
    }
  });

  await ctx.handlers.applyRuntimeSecuritySettings();

  assert.deepEqual(ctx.timeoutCalls, []);
  assert.equal(ctx.eventBindings.length, 0);
});

test('applyRuntimeSecuritySettings keeps auto lock active when session timeout is disabled explicitly', async () => {
  const ctx = createAuthContext({
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-query') {
          return [
            { setting_key: 'session_timeout', setting_value: '0' },
            { setting_key: 'auto_lock', setting_value: '10' }
          ];
        }
        return [];
      }
    }
  });

  await ctx.handlers.applyRuntimeSecuritySettings();

  assert.deepEqual(ctx.timeoutCalls, [10 * 60 * 1000]);
  assert.ok(ctx.eventBindings.includes('mousemove'));
});
