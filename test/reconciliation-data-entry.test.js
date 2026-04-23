const test = require('node:test');
const assert = require('node:assert/strict');

const { createReconciliationDataEntryHandlers } = require('../src/app/reconciliation-data-entry');

function createElement(initial = {}) {
  const element = {
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    removeChild() {
      this.children.pop();
    },
    reset() {
      this.value = '';
      this.innerHTML = '';
    },
    ...initial
  };

  if (!element.children) {
    element.children = [];
  }

  return element;
}

function buildContext(overrides = {}) {
  const state = {
    currentReconciliation: { id: 10 },
    bankReceipts: [],
    cashReceipts: [],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: []
  };

  const elements = {
    denomination: createElement({ value: '50' }),
    quantity: createElement({ value: '3' }),
    cashTotal: createElement(),
    cashReceiptForm: createElement({ reset() {} }),
    cashReceiptsTable: createElement(),
    cashReceiptsTotal: createElement(),
    supplierMainName: createElement({ value: 'مورد' }),
    supplierMainAmount: createElement({ value: '100' }),
    supplierForm: createElement({ reset() {} }),
    suppliersTable: createElement(),
    suppliersTotal: createElement(),
    customerName: createElement({ value: 'عميل جديد' }),
    postpaidAmount: createElement({ value: '200' })
  };

  const calls = {
    updateSummary: 0,
    focusFirstField: 0,
    showErrorToast: [],
    invoke: []
  };

  const handlers = createReconciliationDataEntryHandlers({
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      createElement() {
        return createElement();
      }
    },
    ipcRenderer: {
      async invoke(channel, sql) {
        calls.invoke.push({ channel, sql });

        if (channel === 'db-run') {
          return { lastInsertRowid: 99 };
        }

        if (channel === 'db-get' && sql.includes('postpaid_sales')) {
          return { count: overrides.postpaidCount ?? 0 };
        }

        if (channel === 'db-get' && sql.includes('customer_receipts')) {
          return { count: overrides.receiptCount ?? 0 };
        }

        return { count: 0 };
      }
    },
    getDialogUtils: () => ({
      showValidationError() {},
      showDeleteConfirm: async () => true,
      showConfirm: async () => true,
      showErrorToast(message) {
        calls.showErrorToast.push(message);
      },
      showSuccessToast() {},
      showError() {}
    }),
    formNavigation: {
      focusFirstField() {
        calls.focusFirstField += 1;
      }
    },
    formatCurrency: (value) => Number(value).toFixed(2),
    getCurrentReconciliation: () => state.currentReconciliation,
    getBankReceipts: () => state.bankReceipts,
    setBankReceipts: (value) => { state.bankReceipts = value; },
    getCashReceipts: () => state.cashReceipts,
    setCashReceipts: (value) => { state.cashReceipts = value; },
    getPostpaidSales: () => state.postpaidSales,
    setPostpaidSales: (value) => { state.postpaidSales = value; },
    getCustomerReceipts: () => state.customerReceipts,
    setCustomerReceipts: (value) => { state.customerReceipts = value; },
    getReturnInvoices: () => state.returnInvoices,
    setReturnInvoices: (value) => { state.returnInvoices = value; },
    getSuppliers: () => state.suppliers,
    setSuppliers: (value) => { state.suppliers = value; },
    updateSummary: () => { calls.updateSummary += 1; },
    windowObj: {},
    logger: {
      log() {},
      warn() {},
      error() {}
    }
  });

  return { handlers, state, elements, calls };
}

test('calculateCashTotal يحسب الإجمالي ويحدث الحقل', () => {
  const ctx = buildContext();
  ctx.handlers.calculateCashTotal();
  assert.equal(ctx.elements.cashTotal.value, '150.00');
});

test('handleCashReceipt يضيف المقبوض النقدي ويحدث الجدول', async () => {
  const ctx = buildContext();
  await ctx.handlers.handleCashReceipt({ preventDefault() {} });

  assert.equal(ctx.state.cashReceipts.length, 1);
  assert.equal(ctx.state.cashReceipts[0].total_amount, 150);
  assert.equal(ctx.elements.cashReceiptsTotal.textContent, '150.00');
  assert.equal(ctx.calls.focusFirstField, 1);
  assert.equal(ctx.calls.updateSummary > 0, true);
});

test('handleSupplier يضيف المورد ويحدث الملخص فورًا', async () => {
  const ctx = buildContext();
  await ctx.handlers.handleSupplier({ preventDefault() {} });

  assert.equal(ctx.state.suppliers.length, 1);
  assert.equal(ctx.state.suppliers[0].amount, 100);
  assert.equal(ctx.elements.suppliersTotal.textContent, '100.00');
  assert.equal(ctx.calls.updateSummary > 0, true);
});

test('updateSuppliersTable يحسب إجمالي الموردين بشكل رقمي حتى مع القيم النصية', () => {
  const ctx = buildContext();
  ctx.state.suppliers = [
    { id: 1, supplier_name: 'A', amount: '100.50' },
    { id: 2, supplier_name: 'B', amount: '20' }
  ];

  const before = ctx.calls.updateSummary;
  ctx.handlers.updateSuppliersTable();

  assert.equal(ctx.elements.suppliersTotal.textContent, '120.50');
  assert.equal(ctx.calls.updateSummary, before + 1);
});

test('isExistingCustomer يرجع true عند وجود العميل في أي جدول', async () => {
  const ctx = buildContext({ postpaidCount: 0, receiptCount: 2 });
  const exists = await ctx.handlers.isExistingCustomer('عميل 1');
  assert.equal(exists, true);
});

test('removeSupplier يتحقق من الفهرس قبل الحذف', async () => {
  const ctx = buildContext();
  await ctx.handlers.removeSupplier(0);

  assert.equal(ctx.calls.showErrorToast[0], 'خطأ في تحديد المورد المراد حذفه');
  assert.equal(ctx.calls.invoke.some((call) => call.sql && call.sql.includes('DELETE FROM suppliers')), false);
});
