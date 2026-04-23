const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutocompleteHelpers } = require('../src/app/autocomplete-helpers');

function createDoc() {
  const body = {
    children: [],
    appendCount: 0,
    appendChild(node) {
      node.parentNode = this;
      this.children.push(node);
      this.appendCount += 1;
    },
    removeChild(node) {
      this.children = this.children.filter((child) => child !== node);
      node.parentNode = null;
    }
  };

  return {
    body,
    createElement() {
      return { style: {}, textContent: '', className: '', parentNode: null };
    }
  };
}

test('initializeAutocomplete wires edit modal fields', () => {
  const doc = createDoc();
  const initialized = [];
  const autocompleteSystem = {
    initialize(id, config) {
      initialized.push([id, config.placeholder]);
    }
  };

  const helpers = createAutocompleteHelpers({
    document: doc,
    ipcRenderer: { invoke: async () => [] },
    getAutocompleteSystem: () => autocompleteSystem,
    formatDecimal: (value) => String(value),
    logger: { log() {}, error() {} }
  });

  helpers.initializeAutocomplete();
  assert.equal(initialized.length, 2);
  assert.equal(initialized[0][0], 'postpaidSaleCustomerName');
  assert.equal(initialized[1][0], 'customerReceiptEditCustomerName');
});

test('showCustomerQuickStats renders quick tooltip when stats exist', async () => {
  const doc = createDoc();
  const helpers = createAutocompleteHelpers({
    document: doc,
    ipcRenderer: {
      invoke: async () => ({
        totalTransactions: 2,
        postpaidSales: { count: 1, totalAmount: 10 },
        customerReceipts: { count: 1, totalAmount: 5 }
      })
    },
    getAutocompleteSystem: () => null,
    formatDecimal: (value) => Number(value).toFixed(2),
    logger: { log() {}, error() {} },
    setTimeoutFn: (fn) => fn()
  });

  await helpers.showCustomerQuickStats('عميل', 'postpaid');
  assert.equal(doc.body.appendCount, 1);
  assert.equal(doc.body.children.length, 0);
});
