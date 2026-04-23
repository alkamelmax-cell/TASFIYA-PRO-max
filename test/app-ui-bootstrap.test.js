const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppUiBootstrap } = require('../src/app/app-ui-bootstrap');

function createDocumentMock() {
  const listeners = new Map();

  return {
    listeners,
    getElementById(id) {
      return {
        addEventListener(event, callback) {
          listeners.set(`${id}:${event}`, callback);
        },
        reset() {},
        querySelector() {
          return { textContent: '' };
        },
        value: '',
        innerHTML: ''
      };
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return { addEventListener() {}, textContent: '' };
    }
  };
}

test('initializeAppUiBootstrap composes management handlers and setup listeners', () => {
  const documentMock = createDocumentMock();
  const dialogUtils = {
    showValidationError() {},
    showSuccessToast() {},
    showError() {}
  };

  const handlers = initializeAppUiBootstrap({
    document: documentMock,
    ipcRenderer: {
      invoke: async () => []
    },
    windowObj: {
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {}
      },
      addEventListener() {}
    },
    localStorageObj: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    formatDate() {
      return '2026-02-25';
    },
    populateSelect() {},
    loadDropdownData() {},
    getDialogUtils: () => dialogUtils,
    eventHandlers: {},
    logger: { log() {}, error() {} }
  });

  assert.equal(typeof handlers.toggleSidebar, 'function');
  assert.equal(typeof handlers.handleAddCashier, 'function');
  assert.equal(typeof handlers.handleAddAdmin, 'function');
  assert.equal(typeof handlers.handleAddAccountant, 'function');
  assert.equal(typeof handlers.handleAddAtm, 'function');
  assert.equal(typeof handlers.handleBranchForm, 'function');
  assert.equal(typeof handlers.setupEventListeners, 'function');

  handlers.setupEventListeners();

  assert.equal(documentMock.listeners.get('sidebarToggle:click'), handlers.toggleSidebar);
  assert.equal(documentMock.listeners.get('addCashierForm:submit'), handlers.handleAddCashier);
  assert.equal(documentMock.listeners.get('addAdminForm:submit'), handlers.handleAddAdmin);
  assert.equal(documentMock.listeners.get('addAccountantForm:submit'), handlers.handleAddAccountant);
  assert.equal(documentMock.listeners.get('addAtmForm:submit'), handlers.handleAddAtm);
  assert.equal(documentMock.listeners.get('branchForm:submit'), handlers.handleBranchForm);
});
