const test = require('node:test');
const assert = require('node:assert/strict');

const { createEditSessionDataHelpers } = require('../src/app/edit-session-data-helpers');

function createClassList() {
  const classes = new Set();
  return {
    add(...items) {
      items.forEach((item) => classes.add(item));
    },
    remove(...items) {
      items.forEach((item) => classes.delete(item));
    },
    contains(item) {
      return classes.has(item);
    }
  };
}

test('data helper operations update edit arrays and progress badge', () => {
  const mode = {
    originalData: {
      bankReceipts: [],
      cashReceipts: [],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: []
    }
  };

  const progressBadge = {
    textContent: '',
    classList: createClassList()
  };

  const handlers = createEditSessionDataHelpers({
    document: {
      getElementById(id) {
        if (id === 'editProgressBadge') return progressBadge;
        return null;
      }
    },
    getEditMode: () => mode,
    setTimeoutFn: (cb) => cb(),
    logger: { log() {}, error() {} }
  });

  handlers.addOrUpdateEditData('bankReceipts', { amount: 10 });
  handlers.addOrUpdateEditData('cashReceipts', { amount: 20 });
  assert.equal(handlers.getCurrentEditData('bankReceipts', 0).amount, 10);

  handlers.updateEditProgress();
  assert.equal(progressBadge.textContent, '2/6 مكتمل');
  assert.equal(progressBadge.classList.contains('bg-warning'), true);

  handlers.deleteItemFromEditData('cashReceipts', 0);
  assert.equal(mode.originalData.cashReceipts.length, 0);
});

test('ui helper operations toggle highlight and loading states', () => {
  const row = { classList: createClassList() };
  const button = { disabled: false, innerHTML: 'حفظ', dataset: {} };

  const handlers = createEditSessionDataHelpers({
    document: {
      getElementById(id) {
        if (id === 'row-1') return row;
        return null;
      }
    },
    getEditMode: () => ({ originalData: {} }),
    setTimeoutFn: (cb) => cb(),
    logger: { log() {}, error() {} }
  });

  handlers.addSuccessHighlight('row-1');
  assert.equal(row.classList.contains('table-success'), false);

  handlers.setButtonLoading(button, true);
  assert.equal(button.disabled, true);
  assert.equal(button.innerHTML.includes('جاري المعالجة'), true);

  handlers.setButtonLoading(button, false);
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'حفظ');
});
