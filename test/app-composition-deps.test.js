const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createShellRuntimeDeps,
  createReconciliationRuntimeDeps,
  createFinalizationDeps,
  bindLegacyPreUiHandlers,
  buildComposedHandlers
} = require('../src/app/app-composition-deps');

test('createShellRuntimeDeps forwards runtime handlers safely', () => {
  const runtime = {
    preUiHandlers: {
      resetSystemToNewReconciliationState: () => 'reset'
    },
    printReportHandlers: {},
    reconciliationUiHandlers: {},
    appUiHandlers: {
      loadAtmsList: () => 'atms'
    },
    editRuntimeHandlers: {},
    finalizationHandlers: {
      resetUIOnly: () => 'ui-only',
      clearAllReconciliationData: () => 'clear-data'
    }
  };

  const deps = createShellRuntimeDeps({
    core: {
      document: {},
      localStorageObj: {},
      setTimeoutFn: setTimeout,
      Swal: {},
      bootstrap: {},
      ipcRenderer: {},
      dialogUtils: {},
      logger: {}
    },
    shared: {
      reconciliationStateDeps: {}
    },
    shell: {
      keyboardShortcuts: {},
      setCurrentUser() {},
      handleBranchChange() {},
      showError() {},
      loadCustomersForDropdowns() {}
    },
    editTableHandlers: {
      initializeEditModeEventListeners() {}
    },
    runtime
  });

  const runtimeHandlers = deps.getRuntimeHandlers();
  assert.equal(runtimeHandlers.loadATMsList(), 'atms');
  assert.equal(runtimeHandlers.resetUIOnly(), 'ui-only');
  assert.equal(runtimeHandlers.clearAllReconciliationData(), 'clear-data');
  assert.equal(runtimeHandlers.resetSystemToNewReconciliationState(), 'reset');
  assert.equal(typeof runtimeHandlers.loadBanksList, 'function');
  assert.equal(typeof runtimeHandlers.loadCashboxes, 'function');
  assert.equal(typeof runtimeHandlers.loadCashboxFilters, 'function');
});

test('createFinalizationDeps maps core and runtime dependencies', () => {
  const runtime = {
    preUiHandlers: {
      validateReconciliationBeforeSave() {},
      isSyncEnabled() {},
      resetSystemToNewReconciliationState() {}
    },
    reconciliationUiHandlers: {
      updateSummary() {}
    },
    printReportHandlers: {
      testPrintDataStructure() {},
      testPrintDialog() {},
      testNewReconciliationPrintSystem() {}
    }
  };

  const deps = createFinalizationDeps({
    core: {
      document: {},
      ipcRenderer: {},
      dialogUtils: {},
      windowObj: {},
      fetchFn: () => {},
      logger: {},
      EventCtor: Event
    },
    shared: {
      reconciliationStateDeps: { getCurrentReconciliation() {} },
      reconciliationTableUpdateDeps: { updateBankReceiptsTable() {} }
    },
    formatting: {
      formatCurrency: (value) => value
    },
    shellHandlers: {
      initializeApp() {}
    },
    runtime
  });

  assert.equal(deps.validateReconciliationBeforeSave, runtime.preUiHandlers.validateReconciliationBeforeSave);
  assert.equal(deps.updateSummary, runtime.reconciliationUiHandlers.updateSummary);
  assert.equal(deps.testPrintDialog, runtime.printReportHandlers.testPrintDialog);
  assert.equal(typeof deps.getResetSystemToNewReconciliationState, 'function');
});

test('createReconciliationRuntimeDeps wires updateSummary delegator', () => {
  let updateSummaryCalled = false;
  let receivedArgs = [];

  const noopHandlerProxy = new Proxy({}, {
    get() {
      return () => {};
    }
  });

  const runtime = {
    preUiHandlers: noopHandlerProxy,
    printReportHandlers: noopHandlerProxy,
    finalizationHandlers: noopHandlerProxy,
    editRuntimeHandlers: { editReconciliationNew() {} },
    reconciliationUiHandlers: {
      updateSummary(...args) {
        updateSummaryCalled = true;
        receivedArgs = args;
      }
    }
  };

  const deps = createReconciliationRuntimeDeps({
    core: {
      document: {},
      ipcRenderer: {},
      windowObj: {},
      setTimeoutFn: setTimeout,
      dialogUtils: {},
      bootstrap: {},
      logger: {}
    },
    shared: {
      reconciliationStateDeps: {},
      printRuntimeStateDeps: {},
      reconciliationTableUpdateDeps: {}
    },
    dataEntryHandlers: {
      handleCustomerReceipt() {},
      updateCustomerReceiptsTable() {},
      removeCustomerReceipt() {}
    },
    formatting: {
      formatDate: () => '2026-02-25',
      formatCurrency: () => '0',
      formatDateTime: () => '2026-02-25 00:00',
      formatNumber: () => '0',
      getCurrentDate: () => '2026-02-25',
      getCurrentDateTime: () => '2026-02-25 00:00'
    },
    printStyleDeps: {
      generateNonColoredPrintStyles: () => ''
    },
    runtime
  });

  assert.equal(typeof deps.updateSummary, 'function');
  deps.updateSummary('total', 123);
  assert.equal(updateSummaryCalled, true);
  assert.deepEqual(receivedArgs, ['total', 123]);
});

test('bindLegacyPreUiHandlers and buildComposedHandlers expose expected references', () => {
  const windowObj = {};
  const preUiHandlers = {
    changePostpaidSalesReportPage() {},
    updateButtonStates() {},
    loadReconciliationsList() {}
  };

  bindLegacyPreUiHandlers(windowObj, preUiHandlers);
  assert.equal(windowObj.changePostpaidSalesReportPage, preUiHandlers.changePostpaidSalesReportPage);
  assert.equal(windowObj.updateButtonStates, preUiHandlers.updateButtonStates);
  assert.equal(windowObj.loadReconciliationsList, preUiHandlers.loadReconciliationsList);

  const runtime = {
    preUiHandlers: { id: 1 },
    editRuntimeHandlers: { id: 2 },
    printReportHandlers: { id: 3 },
    reconciliationUiHandlers: { id: 4 },
    appUiHandlers: { id: 5 },
    finalizationHandlers: { id: 6 }
  };
  const shellHandlers = { id: 7 };

  const composed = buildComposedHandlers(shellHandlers, runtime);
  assert.equal(composed.shellHandlers.id, 7);
  assert.equal(composed.finalizationHandlers.id, 6);
});
