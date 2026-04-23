const test = require('node:test');
const assert = require('node:assert/strict');
const { createReconciliationListHandlers } = require('../src/app/reconciliation-list');

function createElement(initial = {}) {
  return {
    id: '',
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    className: '',
    title: '',
    children: [],
    listeners: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
    querySelector(selector) {
      if (selector === 'tbody') {
        return this.tbody || null;
      }
      if (selector === '.modal-body') {
        return this.modalBody || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tag) {
      const el = createElement();
      el.tagName = tag;
      return el;
    },
    querySelectorAll(selector) {
      if (selector === '#reconciliationsListTable tbody tr') {
        return elements.reconciliationsTbody.children;
      }
      return [];
    }
  };
}

test('loadReconciliationsList populates table and pagination', async () => {
  const elements = {};
  elements.reconciliationsTbody = createElement();
  elements.reconciliationsTbody.appendChild = function appendChild(child) {
    this.children.push(child);
  };
  elements.reconciliationsListTable = createElement({ tbody: elements.reconciliationsTbody });
  elements.reconciliationSearchInput = createElement();

  const modalBody = createElement();
  modalBody.appendChild = function appendChild(child) {
    this.children.push(child);
    if (child.id) {
      elements[child.id] = child;
    }
  };
  elements.reconciliationListModal = createElement({ modalBody });

  const recallCalls = [];
  const handlers = createReconciliationListHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query) => {
        assert.equal(channel, 'db-query');
        if (query.includes('COUNT(*)')) {
          return [{ total: 2 }];
        }
        return [
          {
            id: 10,
            reconciliation_number: 100,
            reconciliation_date: '2026-02-24',
            cashier_name: 'A',
            cashier_number: '001',
            accountant_name: 'B',
            total_receipts: 55.5,
            status: 'completed'
          },
          {
            id: 11,
            reconciliation_number: null,
            reconciliation_date: '2026-02-23',
            cashier_name: 'C',
            cashier_number: '002',
            accountant_name: 'D',
            total_receipts: 10,
            status: 'draft'
          }
        ];
      }
    },
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    dialogUtils: { showError() {} },
    onRecall: (id) => recallCalls.push(id),
    logger: { log() {}, error() {} }
  });

  await handlers.loadReconciliationsList(1);
  assert.equal(elements.reconciliationsTbody.children.length, 2);
  assert.ok(elements.reconciliationsTbody.children[0].innerHTML.includes('100'));
  elements.reconciliationsTbody.children[0].listeners.dblclick();
  assert.deepEqual(recallCalls, [10]);

  assert.ok(elements.recListPaginationContainer.innerHTML.includes('المجموع: 2 تصفية'));
});

test('filterReconciliationsList hides non-matching rows', () => {
  const elements = {};
  elements.reconciliationsTbody = createElement();
  elements.reconciliationsListTable = createElement({ tbody: elements.reconciliationsTbody });
  elements.reconciliationSearchInput = createElement({ value: 'ahmed' });
  elements.reconciliationListModal = createElement({ modalBody: createElement() });

  const row1 = createElement({ textContent: 'Ahmed 001', style: {} });
  const row2 = createElement({ textContent: 'Sara 002', style: {} });
  elements.reconciliationsTbody.children = [row1, row2];

  const handlers = createReconciliationListHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    dialogUtils: { showError() {} },
    onRecall() {},
    logger: { log() {}, error() {} }
  });

  handlers.filterReconciliationsList();
  assert.equal(row1.style.display, '');
  assert.equal(row2.style.display, 'none');
});
