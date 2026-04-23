const test = require('node:test');
const assert = require('node:assert/strict');
const { createSavedReconciliationsHandlers } = require('../src/app/saved-reconciliations');

function createElement(initial = {}) {
  return {
    id: '',
    innerHTML: '',
    textContent: '',
    value: '',
    children: [],
    style: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
    }
  };
}

function createDocument(elements) {
  return {
    head: createElement(),
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tag) {
      const el = createElement({ tagName: tag });
      return el;
    },
    querySelector(selector) {
      if (selector === '#saved-reconciliations-section .card-body') {
        return elements.savedSectionBody || null;
      }
      return null;
    }
  };
}

test('loadSavedReconciliations renders rows and pagination controls', async () => {
  const elements = {};
  elements.savedReconciliationsTable = createElement();
  elements.savedSectionBody = createElement();
  elements.savedSectionBody.appendChild = function appendChild(child) {
    this.children.push(child);
    if (child.id) {
      elements[child.id] = child;
    }
  };

  const dbCalls = [];
  const windowObj = {};
  const handlers = createSavedReconciliationsHandlers({
    document: createDocument(elements),
    windowObj,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        assert.equal(channel, 'db-query');
        dbCalls.push([query, params]);
        if (query.includes('COUNT(*)')) {
          return [{ total: 60 }];
        }
        return [{
          id: 9,
          reconciliation_number: 111,
          status: 'completed',
          branch_name: 'Main',
          cashier_name: 'Ali',
          cashier_number: '001',
          accountant_name: 'Mona',
          reconciliation_date: '2026-02-24',
          total_receipts: 100,
          system_sales: 95,
          surplus_deficit: 5
        }];
      }
    },
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    populateSelect() {},
    getDialogUtils: () => ({ showErrorToast() {} }),
    logger: { error() {} }
  });

  await handlers.loadSavedReconciliations(1);
  assert.equal(elements.savedReconciliationsTable.children.length, 1);
  assert.ok(elements.savedReconciliationsTable.children[0].innerHTML.includes('#111'));
  assert.ok(elements.savedRecPaginationContainer.innerHTML.includes('window.loadSavedReconciliations(2)'));
  assert.equal(typeof windowObj.loadSavedReconciliations, 'function');
  assert.deepEqual(dbCalls[1][1], [50, 0]);
});

test('handleSearchReconciliations applies filters and updates table', async () => {
  const elements = {
    searchBranchFilter: createElement({ value: '3' }),
    searchCashierFilter: createElement({ value: '7' }),
    searchDateFrom: createElement({ value: '2026-02-01' }),
    searchDateTo: createElement({ value: '2026-02-20' }),
    searchStatus: createElement({ value: 'completed' }),
    savedReconciliationsTable: createElement(),
    savedSectionBody: createElement()
  };

  let capturedParams = null;
  const handlers = createSavedReconciliationsHandlers({
    document: createDocument(elements),
    windowObj: {},
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        assert.equal(channel, 'db-query');
        if (query.includes('WHERE 1=1')) {
          capturedParams = params;
          return [{
            id: 15,
            reconciliation_number: 200,
            status: 'completed',
            branch_name: 'B1',
            cashier_name: 'Nada',
            cashier_number: '099',
            accountant_name: 'Sara',
            reconciliation_date: '2026-02-10',
            total_receipts: 75,
            system_sales: 75,
            surplus_deficit: 0
          }];
        }
        return [];
      }
    },
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    populateSelect() {},
    getDialogUtils: () => ({ showErrorToast() {} }),
    logger: { error() {} }
  });

  await handlers.handleSearchReconciliations();
  assert.deepEqual(capturedParams, ['3', '7', '2026-02-01', '2026-02-20', 'completed']);
  assert.equal(elements.savedReconciliationsTable.children.length, 1);
  assert.ok(elements.savedReconciliationsTable.children[0].innerHTML.includes('Nada'));
});
