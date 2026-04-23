const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncControl } = require('../src/app/sync-control');

function createClassList() {
  return {
    values: new Set(),
    add(name) {
      this.values.add(name);
    },
    remove(name) {
      this.values.delete(name);
    },
    has(name) {
      return this.values.has(name);
    }
  };
}

function createElement(initial = {}) {
  return {
    className: '',
    textContent: '',
    disabled: false,
    classList: createClassList(),
    listeners: {},
    ...initial,
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

test('isSyncEnabled returns true when status is enabled', async () => {
  const control = createSyncControl({
    document: createDocument({}),
    ipcRenderer: {
      invoke: async () => ({ success: true, isEnabled: true })
    },
    Swal: { fire: async () => {} },
    logger: { log() {}, error() {} }
  });

  const result = await control.isSyncEnabled();
  assert.equal(result, true);
});

test('updateSyncUI updates badge/button state', async () => {
  const elements = {
    syncStatusBadge: createElement(),
    toggleSyncBtn: createElement(),
    syncBtnText: createElement(),
    syncLastUpdate: createElement()
  };

  const control = createSyncControl({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async () => ({ success: true, isRunning: false, isEnabled: false })
    },
    Swal: { fire: async () => {} },
    logger: { log() {}, error() {} }
  });

  await control.updateSyncUI();
  assert.equal(elements.syncStatusBadge.className, 'badge bg-warning text-dark');
  assert.equal(elements.syncStatusBadge.textContent, '⏸️ متوقفة');
  assert.equal(elements.toggleSyncBtn.className, 'btn btn-lg w-100 btn-success');
  assert.equal(elements.syncBtnText.textContent, '▶️ تفعيل المزامنة');
  assert.match(elements.syncLastUpdate.textContent, /^آخر تحديث:/);
});

test('toggleSync calls toggle-sync and restores button state', async () => {
  const elements = {
    syncStatusBadge: createElement(),
    toggleSyncBtn: createElement(),
    syncBtnText: createElement(),
    syncBtnSpinner: createElement(),
    syncLastUpdate: createElement()
  };

  const calls = [];
  const control = createSyncControl({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, value) => {
        calls.push([channel, value]);
        if (channel === 'get-sync-status') {
          return { success: true, isEnabled: false, isRunning: true };
        }
        if (channel === 'toggle-sync') {
          return { success: true };
        }
        return { success: false };
      }
    },
    Swal: { fire: async () => {} },
    logger: { log() {}, error() {} }
  });

  await control.toggleSync();
  assert.deepEqual(calls[1], ['toggle-sync', true]);
  assert.equal(elements.toggleSyncBtn.disabled, false);
  assert.equal(elements.syncBtnSpinner.classList.has('d-none'), true);
});

test('initializeSyncControls wires click and interval updater', async () => {
  const elements = {
    syncStatusBadge: createElement(),
    toggleSyncBtn: createElement(),
    syncBtnText: createElement(),
    syncLastUpdate: createElement(),
    'system-tab': createElement()
  };

  const timers = [];
  const intervals = [];
  const control = createSyncControl({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async () => ({ success: true, isEnabled: true, isRunning: true })
    },
    Swal: { fire: async () => {} },
    logger: { log() {}, error() {} },
    setTimeoutFn: (fn, ms) => {
      timers.push(ms);
      fn();
      return 1;
    },
    setIntervalFn: (fn, ms) => {
      intervals.push(ms);
      return 1;
    }
  });

  control.initializeSyncControls();
  assert.equal(typeof elements.toggleSyncBtn.listeners.click, 'function');
  assert.equal(typeof elements['system-tab'].listeners.click, 'function');
  elements['system-tab'].listeners.click();
  assert.equal(timers[0], 100);
  assert.equal(intervals[0], 30000);
});
