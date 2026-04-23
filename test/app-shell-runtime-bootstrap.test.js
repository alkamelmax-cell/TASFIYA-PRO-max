const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAppShellRuntimeBootstrap } = require('../src/app/app-shell-runtime-bootstrap');

function createClassList() {
  const classes = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => classes.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => classes.delete(token));
    },
    contains(token) {
      return classes.has(token);
    }
  };
}

test('initializeAppShellRuntimeBootstrap forwards runtime handlers to shell module', () => {
  let loadBranchesCalls = 0;

  const localStorageObj = {
    getItem() { return null; },
    setItem() {}
  };

  const documentMock = {
    querySelectorAll(selector) {
      if (selector === '.content-section' || selector === '.menu-item') {
        return [{ classList: createClassList(), dataset: { section: 'branches' } }];
      }
      return [];
    },
    getElementById(id) {
      if (id === 'branches-section') {
        return { classList: createClassList() };
      }
      return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
    },
    createElement() {
      return { appendChild() {}, textContent: '', value: '' };
    }
  };

  const shellHandlers = initializeAppShellRuntimeBootstrap({
    document: documentMock,
    localStorageObj,
    setTimeoutFn: (fn) => fn(),
    keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
    Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
    bootstrap: { Modal: { getInstance() { return null; } } },
    ipcRenderer: { invoke: async () => [] },
    getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
    logger: { log() {}, warn() {}, error() {} },
    reconciliationStateDeps: {
      getCurrentReconciliation: () => null,
      setCurrentReconciliation() {},
      setBankReceipts() {},
      setCashReceipts() {},
      setPostpaidSales() {},
      setCustomerReceipts() {},
      setReturnInvoices() {},
      setSuppliers() {}
    },
    setCurrentUser() {},
    getRuntimeHandlers: () => ({
      loadBranches: () => { loadBranchesCalls += 1; }
    })
  });

  shellHandlers.showSection('branches');
  assert.equal(loadBranchesCalls, 1);
});

test('initializeAppShellRuntimeBootstrap keeps optional handlers safe when missing', () => {
  const documentMock = {
    querySelectorAll(selector) {
      if (selector === '.content-section' || selector === '.menu-item') {
        return [{ classList: createClassList(), dataset: { section: 'banks' } }];
      }
      return [];
    },
    getElementById() {
      return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
    },
    createElement() {
      return { appendChild() {}, textContent: '', value: '' };
    }
  };

  const shellHandlers = initializeAppShellRuntimeBootstrap({
    document: documentMock,
    localStorageObj: { getItem() { return null; }, setItem() {} },
    setTimeoutFn: (fn) => fn(),
    keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
    Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
    bootstrap: { Modal: { getInstance() { return null; } } },
    ipcRenderer: { invoke: async () => [] },
    getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
    logger: { log() {}, warn() {}, error() {} },
    reconciliationStateDeps: {
      getCurrentReconciliation: () => null,
      setCurrentReconciliation() {},
      setBankReceipts() {},
      setCashReceipts() {},
      setPostpaidSales() {},
      setCustomerReceipts() {},
      setReturnInvoices() {},
      setSuppliers() {}
    },
    setCurrentUser() {},
    getRuntimeHandlers: () => ({})
  });

  assert.doesNotThrow(() => shellHandlers.showSection('banks'));
});

test('initializeAppShellRuntimeBootstrap forwards cashboxes runtime handlers safely', () => {
  let loadCashboxesCalls = 0;
  let loadCashboxFiltersCalls = 0;

  const shellHandlers = initializeAppShellRuntimeBootstrap({
    document: {
      querySelectorAll(selector) {
        if (selector === '.content-section' || selector === '.menu-item') {
          return [{ classList: createClassList(), dataset: { section: 'cashboxes' } }];
        }
        return [];
      },
      getElementById(id) {
        if (id === 'cashboxes-section') {
          return { classList: createClassList() };
        }
        return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
      },
      createElement() {
        return { appendChild() {}, textContent: '', value: '' };
      }
    },
    localStorageObj: { getItem() { return null; }, setItem() {} },
    setTimeoutFn: (fn) => fn(),
    keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
    Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
    bootstrap: { Modal: { getInstance() { return null; } } },
    ipcRenderer: { invoke: async () => [] },
    getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
    logger: { log() {}, warn() {}, error() {} },
    reconciliationStateDeps: {
      getCurrentReconciliation: () => null,
      setCurrentReconciliation() {},
      setBankReceipts() {},
      setCashReceipts() {},
      setPostpaidSales() {},
      setCustomerReceipts() {},
      setReturnInvoices() {},
      setSuppliers() {}
    },
    setCurrentUser() {},
    getRuntimeHandlers: () => ({
      loadCashboxes: () => { loadCashboxesCalls += 1; },
      loadCashboxFilters: () => { loadCashboxFiltersCalls += 1; }
    })
  });

  shellHandlers.showSection('cashboxes');
  assert.equal(loadCashboxesCalls, 1);
  assert.equal(loadCashboxFiltersCalls, 1);
});

test('initializeAppShellRuntimeBootstrap skips reloading an already active section', async () => {
  let loadBranchesCalls = 0;
  const branchesSectionClassList = createClassList();
  branchesSectionClassList.add('active');

  const shellHandlers = initializeAppShellRuntimeBootstrap({
    document: {
      querySelectorAll(selector) {
        if (selector === '.content-section') {
          return [{ classList: branchesSectionClassList }];
        }
        if (selector === '.menu-item') {
          return [{ classList: createClassList(), dataset: { section: 'branches' } }];
        }
        return [];
      },
      getElementById(id) {
        if (id === 'branches-section') {
          return { classList: branchesSectionClassList };
        }
        return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
      },
      createElement() {
        return { appendChild() {}, textContent: '', value: '' };
      }
    },
    localStorageObj: { getItem() { return null; }, setItem() {} },
    setTimeoutFn: (fn) => fn(),
    keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
    Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
    bootstrap: { Modal: { getInstance() { return null; } } },
    ipcRenderer: { invoke: async () => [] },
    getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
    logger: { log() {}, warn() {}, error() {} },
    reconciliationStateDeps: {
      getCurrentReconciliation: () => null,
      setCurrentReconciliation() {},
      setBankReceipts() {},
      setCashReceipts() {},
      setPostpaidSales() {},
      setCustomerReceipts() {},
      setReturnInvoices() {},
      setSuppliers() {}
    },
    setCurrentUser() {},
    getRuntimeHandlers: () => ({
      loadBranches: () => { loadBranchesCalls += 1; }
    })
  });

  shellHandlers.showSection('branches');
  shellHandlers.showSection('branches');
  assert.equal(loadBranchesCalls, 1);
});

test('initializeAppShellRuntimeBootstrap loads reconciliation requests through the shared navigator', async () => {
  let loadRequestsCalls = 0;
  const previousRequestsApi = globalThis.reconciliationRequests;
  globalThis.reconciliationRequests = {
    loadRequests() {
      loadRequestsCalls += 1;
    }
  };

  try {
    const shellHandlers = initializeAppShellRuntimeBootstrap({
      document: {
        querySelectorAll(selector) {
          if (selector === '.content-section' || selector === '.menu-item') {
            return [{ classList: createClassList(), dataset: { section: 'reconciliation-requests' } }];
          }
          return [];
        },
        getElementById(id) {
          if (id === 'reconciliation-requests-section') {
            return { classList: createClassList() };
          }
          return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
        },
        createElement() {
          return { appendChild() {}, textContent: '', value: '' };
        }
      },
      localStorageObj: { getItem() { return null; }, setItem() {} },
      setTimeoutFn: (fn) => fn(),
      keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
      Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
      bootstrap: { Modal: { getInstance() { return null; } } },
      ipcRenderer: { invoke: async () => [] },
      getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
      logger: { log() {}, warn() {}, error() {} },
      reconciliationStateDeps: {
        getCurrentReconciliation: () => null,
        setCurrentReconciliation() {},
        setBankReceipts() {},
        setCashReceipts() {},
        setPostpaidSales() {},
        setCustomerReceipts() {},
        setReturnInvoices() {},
        setSuppliers() {}
      },
      setCurrentUser() {},
      getRuntimeHandlers: () => ({})
    });

    shellHandlers.showSection('reconciliation-requests');
    await Promise.resolve();
    assert.equal(loadRequestsCalls, 1);
  } finally {
    globalThis.reconciliationRequests = previousRequestsApi;
  }
});

test('initializeAppShellRuntimeBootstrap materializes reconciliation requests section on first navigation', async () => {
  let loadRequestsCalls = 0;
  let ensureSectionCalls = 0;
  let sectionExists = false;
  const sectionClassList = createClassList();
  const previousRequestsApi = globalThis.reconciliationRequests;
  globalThis.reconciliationRequests = {
    ensureSection() {
      ensureSectionCalls += 1;
      sectionExists = true;
    },
    loadRequests() {
      loadRequestsCalls += 1;
    }
  };

  try {
    const shellHandlers = initializeAppShellRuntimeBootstrap({
      document: {
        querySelectorAll(selector) {
          if (selector === '.content-section') {
            return sectionExists ? [{ classList: sectionClassList, style: {} }] : [];
          }
          if (selector === '.menu-item') {
            return [{ classList: createClassList(), dataset: { section: 'reconciliation-requests' } }];
          }
          return [];
        },
        getElementById(id) {
          if (id === 'reconciliation-requests-section') {
            return sectionExists ? { classList: sectionClassList, style: {} } : null;
          }
          return { classList: createClassList(), style: {}, value: '', appendChild() {}, removeChild() {}, children: [] };
        },
        createElement() {
          return { appendChild() {}, textContent: '', value: '' };
        }
      },
      localStorageObj: { getItem() { return null; }, setItem() {} },
      setTimeoutFn: (fn) => fn(),
      keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
      Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
      bootstrap: { Modal: { getInstance() { return null; } } },
      ipcRenderer: { invoke: async () => [] },
      getDialogUtils: () => ({ showInfo() {}, showError() {}, showSuccessToast() {}, showConfirm: async () => false }),
      logger: { log() {}, warn() {}, error() {} },
      reconciliationStateDeps: {
        getCurrentReconciliation: () => null,
        setCurrentReconciliation() {},
        setBankReceipts() {},
        setCashReceipts() {},
        setPostpaidSales() {},
        setCustomerReceipts() {},
        setReturnInvoices() {},
        setSuppliers() {}
      },
      setCurrentUser() {},
      getRuntimeHandlers: () => ({})
    });

    shellHandlers.showSection('reconciliation-requests');
    await Promise.resolve();
    assert.equal(ensureSectionCalls, 1);
    assert.equal(loadRequestsCalls, 1);
    assert.equal(sectionClassList.contains('active'), true);
  } finally {
    globalThis.reconciliationRequests = previousRequestsApi;
  }
});
