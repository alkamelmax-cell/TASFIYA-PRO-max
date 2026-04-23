const test = require('node:test');
const assert = require('node:assert/strict');

const { createReconciliationDataEntryShared } = require('../src/app/reconciliation-data-entry-shared');

test('ensureCurrentReconciliation يرجع null ويعرض رسالة عند عدم وجود تصفية حالية', () => {
  const calls = [];
  const shared = createReconciliationDataEntryShared({
    getCurrentReconciliation: () => null,
    DialogUtils: {
      showValidationError(message) {
        calls.push(message);
      }
    },
    ipcRenderer: { invoke: async () => ({ count: 0 }) },
    logger: { error() {} }
  });

  const current = shared.ensureCurrentReconciliation();
  assert.equal(current, null);
  assert.equal(calls[0], 'يرجى إنشاء تصفية جديدة أولاً');
});

test('isExistingCustomer يرجع true عندما يوجد العميل في postpaid_sales', async () => {
  const shared = createReconciliationDataEntryShared({
    getCurrentReconciliation: () => ({ id: 1 }),
    DialogUtils: { showValidationError() {} },
    ipcRenderer: {
      async invoke(channel, sql) {
        if (channel !== 'db-get') return { count: 0 };
        if (sql.includes('postpaid_sales')) return { count: 1 };
        return { count: 0 };
      }
    },
    logger: { error() {} }
  });

  const exists = await shared.isExistingCustomer('عميل');
  assert.equal(exists, true);
});
