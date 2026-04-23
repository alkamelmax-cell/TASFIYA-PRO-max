const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppUiRuntimeBootstrap } = require('../src/app/app-ui-runtime-bootstrap');

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

test('initializeAppUiRuntimeBootstrap builds merged event handlers with deferred save callback', () => {
  const documentMock = createDocumentMock();
  let saveCalls = 0;

  const handlers = initializeAppUiRuntimeBootstrap({
    document: documentMock,
    ipcRenderer: { invoke: async () => [] },
    windowObj: { addEventListener() {} },
    localStorageObj: { getItem() { return null; }, setItem() {} },
    formatDate: () => '2026-02-25',
    populateSelect() {},
    loadDropdownData() {},
    getDialogUtils: () => ({
      showValidationError() {},
      showSuccessToast() {},
      showError() {}
    }),
    shellHandlers: {},
    dataEntryHandlers: {},
    preUiHandlers: {},
    printReportHandlers: {},
    reconciliationUiHandlers: {},
    handleBranchChange() {},
    handleOperationTypeChange() {},
    handleEditOperationTypeChange() {},
    getHandleSaveReconciliation: () => () => { saveCalls += 1; },
    logger: { log() {}, error() {} }
  });

  handlers.setupEventListeners();
  const saveListener = documentMock.listeners.get('saveReconciliationBtn:click');

  assert.equal(typeof saveListener, 'function');
  saveListener();
  assert.equal(saveCalls, 1);
});
