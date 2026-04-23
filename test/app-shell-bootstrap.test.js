const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppShellBootstrapHandlers } = require('../src/app/app-shell-bootstrap');

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

function createElement(initial = {}) {
  const element = {
    value: '',
    textContent: '',
    innerHTML: '',
    children: [],
    style: {
      removeProperty() {}
    },
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      this.lastChild = this.children[this.children.length - 1] || null;
      child.parentElement = this;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      this.lastChild = this.children[this.children.length - 1] || null;
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    scrollIntoView() {}
  };

  Object.defineProperty(element, 'options', {
    get() {
      return this.children;
    }
  });

  return Object.assign(element, initial);
}

function createSelectElement() {
  const select = createElement();
  select.appendChild(createElement({ value: '' }));
  return select;
}

test('initializeApp restores the reconciliation requests tab when it is the last saved dynamic section', () => {
  const elements = new Map();
  const showSectionCalls = [];
  const highlightMenuItemCalls = [];
  let ensureSectionCalls = 0;

  const ensureElement = (id, element = createElement()) => {
    elements.set(id, element);
    return element;
  };

  ensureElement('reconciliationDate', createElement());
  ensureElement('currentFiscalYear', createElement());
  ensureElement('fiscalYear', createSelectElement());
  ensureElement('fiscalYearSwitch', createSelectElement());
  ensureElement('reportDateFrom', createElement());
  ensureElement('reportDateTo', createElement());
  ensureElement('timeReportFrom', createElement());
  ensureElement('timeReportTo', createElement());
  ensureElement('atmReportFrom', createElement());
  ensureElement('atmReportTo', createElement());
  ensureElement('detailedDateFrom', createElement());
  ensureElement('detailedDateTo', createElement());
  ensureElement('performanceDateFrom', createElement());
  ensureElement('performanceDateTo', createElement());
  ensureElement('postpaidSalesDateFrom', createElement());
  ensureElement('postpaidSalesDateTo', createElement());
  ensureElement('searchDateFrom', createElement());
  ensureElement('searchDateTo', createElement());
  ensureElement('supplierMainName', createElement());
  ensureElement('supplierEditName', createElement());
  ensureElement('customerName', createElement());
  ensureElement('customerReceiptName', createElement());
  ensureElement('branchSelect', createSelectElement());
  ensureElement('cashierBranchSelect', createSelectElement());
  ensureElement('cashierSelect', createSelectElement());
  ensureElement('accountantSelect', createSelectElement());
  ensureElement('atmSelect', createSelectElement());

  const documentMock = {
    body: createElement(),
    addEventListener() {},
    createElement() {
      return createElement();
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  const previousRequestsApi = globalThis.reconciliationRequests;
  globalThis.reconciliationRequests = {
    ensureSection() {
      ensureSectionCalls += 1;
      ensureElement('reconciliation-requests-section', createElement());
    }
  };

  try {
    const handlers = createAppShellBootstrapHandlers({
      document: documentMock,
      localStorageObj: {
        getItem(key) {
          if (key === 'lastSection') return 'reconciliation-requests';
          if (key === 'theme') return 'light';
          return null;
        },
        setItem() {},
        removeItem() {}
      },
      setTimeoutFn: (fn) => fn(),
      keyboardShortcuts: { register() {}, getAllShortcuts() { return []; }, showHelp() {} },
      Swal: { fire() { return Promise.resolve({ isConfirmed: false }); } },
      bootstrap: { Modal: { getInstance() { return null; } } },
      ipcRenderer: {
        invoke: async (_channel, sql) => {
          if (typeof sql === 'string' && sql.includes('FROM reconciliations')) {
            return [];
          }
          return [];
        }
      },
      logger: { log() {}, warn() {}, error() {} },
      getCurrentReconciliation: () => null,
      applyTheme() {},
      setupEventListeners() {},
      updateButtonStates() {},
      initializeSidebarToggle() {},
      loadSystemSettings() {},
      handleBranchSelectionChange() {},
      initializePrintSystem() {},
      initializeThermalPrinterSettings() {},
      initializeEditModeEventListeners() {},
      initializeAutocomplete() {},
      initializeSyncControls() {},
      initializeReconciliationsListModal() {},
      loadCustomersForDropdowns: async () => {},
      loadSuppliersForDropdowns: async () => {},
      loadEnhancedReportFilters: async () => {},
      loadPostpaidSalesReportFilters: async () => {},
      loadBranchesForAtms: async () => {},
      showSection(sectionName) {
        showSectionCalls.push(sectionName);
      },
      highlightMenuItem(sectionName) {
        highlightMenuItemCalls.push(sectionName);
      }
    });

    handlers.initializeApp();

    assert.equal(ensureSectionCalls, 1);
    assert.deepEqual(showSectionCalls, ['reconciliation-requests']);
    assert.deepEqual(highlightMenuItemCalls, ['reconciliation-requests']);
  } finally {
    globalThis.reconciliationRequests = previousRequestsApi;
  }
});
