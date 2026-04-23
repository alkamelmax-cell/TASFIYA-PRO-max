const test = require('node:test');
const assert = require('node:assert/strict');
const { createEditModalPopulationHandlers } = require('../src/app/edit-modal-population');

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

function createElement(initial = {}) {
  const listeners = {};
  let internalValue = initial.value || '';

  const element = {
    innerHTML: '',
    textContent: '',
    children: [],
    dataset: {},
    selectedIndex: 0,
    ...initial,
    get options() {
      return this.children;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    dispatchEvent(event) {
      const handler = listeners[event.type];
      if (handler) {
        handler.call(this, event);
      }
    },
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      const match = selector.match(/^option\[value="(.+)"\]$/);
      if (!match) {
        return null;
      }
      const value = match[1];
      return this.children.find((child) => String(child.value) === String(value)) || null;
    },
    reset() {}
  };

  Object.defineProperty(element, 'value', {
    get() {
      return internalValue;
    },
    set(nextValue) {
      internalValue = nextValue;
      const index = this.children.findIndex((child) => String(child.value) === String(nextValue));
      if (index >= 0) {
        this.selectedIndex = index;
      }
    }
  });

  element.value = internalValue;
  return element;
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createElement();
    }
  };
}

function createHandlers(custom = {}) {
  const elements = custom.elements || {};
  const ipcRenderer = custom.ipcRenderer || { invoke: async () => [] };
  const logger = custom.logger || { log() {}, warn() {}, error() {} };

  const handlers = createEditModalPopulationHandlers({
    document: createDocument(elements),
    ipcRenderer,
    formatDate: (value) => value || '',
    EventCtor: FakeEvent,
    populateEditBankReceiptsTable: () => {},
    populateEditCashReceiptsTable: () => {},
    populateEditPostpaidSalesTable: () => {},
    populateEditCustomerReceiptsTable: () => {},
    populateEditReturnInvoicesTable: () => {},
    populateEditSuppliersTable: () => {},
    updateEditTotals: () => {},
    updateEditProgress: () => {},
    logger
  });

  return { handlers, elements };
}

test('populateEditModal rejects when payload is missing', async () => {
  const { handlers } = createHandlers();
  await assert.rejects(
    handlers.populateEditModal(null),
    /لا توجد بيانات للتعبئة/
  );
});

test('ensureCashiersAndAccountantsLoaded fills edit selects', async () => {
  const elements = {
    editBranchSelect: createElement(),
    editCashierSelect: createElement(),
    editAccountantSelect: createElement(),
    editAtmSelect: createElement(),
    editBankName: createElement(),
    editCashierNumber: createElement()
  };

  const ipcRenderer = {
    invoke: async (channel, query) => {
      if (channel !== 'db-all') {
        return [];
      }

      if (query.includes('FROM branches')) {
        return [{ id: 1, branch_name: 'الفرع الرئيسي' }];
      }

      if (query.includes('FROM cashiers')) {
        return [{ id: 2, name: 'كاشير 1', cashier_number: 'C-1', branch_id: 1, active: 1 }];
      }

      if (query.includes('FROM accountants')) {
        return [{ id: 3, name: 'محاسب 1' }];
      }

      if (query.includes('FROM atms')) {
        return [{ id: 4, name: 'ATM-1', branch_name: 'الفرع الرئيسي', bank_name: 'بنك أ' }];
      }

      return [];
    }
  };

  const { handlers } = createHandlers({ elements, ipcRenderer });
  await handlers.ensureCashiersAndAccountantsLoaded();

  assert.equal(elements.editBranchSelect.children.length, 1);
  assert.equal(elements.editCashierSelect.children.length, 1);
  assert.equal(elements.editAccountantSelect.children.length, 1);
  assert.equal(elements.editAtmSelect.children.length, 1);
  assert.equal(elements.editAtmSelect.children[0].dataset.bankName, 'بنك أ');
});

test('populateEditFormFields maps reconciliation data into inputs', async () => {
  const elements = {
    editBranchSelect: createElement(),
    editCashierSelect: createElement(),
    editAccountantSelect: createElement(),
    editAtmSelect: createElement(),
    editBankName: createElement(),
    editCashierNumber: createElement(),
    editReconciliationDate: createElement(),
    editTimeRangeStart: createElement(),
    editTimeRangeEnd: createElement(),
    editFilterNotes: createElement(),
    editSystemSales: createElement()
  };

  const ipcRenderer = {
    invoke: async (channel, query, params = []) => {
      if (channel === 'db-get' && query.includes('SELECT branch_id FROM cashiers')) {
        return { branch_id: 1 };
      }

      if (channel === 'db-all') {
        if (query.includes('FROM branches')) {
          return [{ id: 1, branch_name: 'الفرع الرئيسي' }];
        }
        if (query.includes('FROM cashiers')) {
          return [{ id: 2, name: 'كاشير 1', cashier_number: 'C-1', branch_id: 1, active: 1 }];
        }
        if (query.includes('FROM accountants')) {
          return [{ id: 3, name: 'محاسب 1' }];
        }
        if (query.includes('FROM atms')) {
          return [{ id: 4, name: 'ATM-1', branch_name: 'الفرع الرئيسي', bank_name: 'بنك أ' }];
        }
      }

      if (channel === 'db-all' && params.length > 0) {
        return [{ id: 2, name: 'كاشير 1', cashier_number: 'C-1', branch_id: 1, active: 1 }];
      }

      return [];
    }
  };

  const { handlers } = createHandlers({ elements, ipcRenderer });
  await handlers.populateEditFormFields({
    id: 10,
    cashier_id: 2,
    accountant_id: 3,
    reconciliation_date: '2026-02-25',
    time_range_start: '08:00',
    time_range_end: '14:00',
    filter_notes: 'ملاحظة اختبار',
    system_sales: 123.45
  });

  assert.equal(elements.editCashierSelect.value, 2);
  assert.equal(elements.editAccountantSelect.value, 3);
  assert.equal(elements.editReconciliationDate.value, '2026-02-25');
  assert.equal(elements.editTimeRangeStart.value, '08:00');
  assert.equal(elements.editTimeRangeEnd.value, '14:00');
  assert.equal(elements.editFilterNotes.value, 'ملاحظة اختبار');
  assert.equal(elements.editSystemSales.value, 123.45);
});
