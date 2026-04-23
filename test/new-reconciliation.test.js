const test = require('node:test');
const assert = require('node:assert/strict');
const { createNewReconciliationHandlers } = require('../src/app/new-reconciliation');

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    style: {},
    ...initial
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

function createBaseDeps(overrides = {}) {
  const elements = {
    cashierSelect: createElement({ value: '' }),
    accountantSelect: createElement({ value: '' }),
    reconciliationDate: createElement({ value: '' }),
    timeRangeStart: createElement({ value: '' }),
    timeRangeEnd: createElement({ value: '' }),
    filterNotes: createElement({ value: '' }),
    currentReconciliationInfo: createElement({ style: {} }),
    currentReconciliationDetails: createElement(),
    systemSales: createElement({ value: '' })
  };

  const dialog = {
    validations: [],
    success: [],
    errors: [],
    showValidationError(msg) { this.validations.push(msg); },
    showSuccessToast(msg) { this.success.push(msg); },
    showErrorToast(msg) { this.errors.push(msg); }
  };

  const calls = [];
  const state = { current: null };
  const deps = {
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query) => {
        calls.push([channel, query]);
        if (query.includes('INSERT INTO reconciliations')) {
          return { lastInsertRowid: 77 };
        }
        if (query.includes('FROM cashiers')) {
          return { name: 'Ali', cashier_number: '001' };
        }
        if (query.includes('FROM accountants')) {
          return { name: 'Mona' };
        }
        return null;
      }
    },
    windowObj: { pendingReconciliationData: null, appAPI: null },
    getDialogUtils: () => dialog,
    setCurrentReconciliation: (value) => { state.current = value; },
    updateButtonStates: () => calls.push(['updateButtonStates']),
    setBankReceipts: () => calls.push(['setBankReceipts']),
    setCashReceipts: () => calls.push(['setCashReceipts']),
    setPostpaidSales: () => calls.push(['setPostpaidSales']),
    setCustomerReceipts: () => calls.push(['setCustomerReceipts']),
    setReturnInvoices: () => calls.push(['setReturnInvoices']),
    setSuppliers: () => calls.push(['setSuppliers']),
    updateBankReceiptsTable: () => calls.push(['updateBankReceiptsTable']),
    updateCashReceiptsTable: () => calls.push(['updateCashReceiptsTable']),
    updatePostpaidSalesTable: () => calls.push(['updatePostpaidSalesTable']),
    updateCustomerReceiptsTable: () => calls.push(['updateCustomerReceiptsTable']),
    updateReturnInvoicesTable: () => calls.push(['updateReturnInvoicesTable']),
    updateSuppliersTable: () => calls.push(['updateSuppliersTable']),
    updateSummary: () => calls.push(['updateSummary']),
    logger: { log() {}, error() {} },
    ...overrides
  };

  return { deps, elements, dialog, calls, state };
}

test('handleNewReconciliation validates required fields', async () => {
  const { deps, dialog, calls } = createBaseDeps();
  const handlers = createNewReconciliationHandlers(deps);

  await handlers.handleNewReconciliation({ preventDefault() {} });
  assert.equal(dialog.validations.length, 1);
  assert.equal(calls.some((entry) => entry[0] === 'db-run'), false);
});

test('handleNewReconciliation creates reconciliation and clears pending data', async () => {
  const ctx = createBaseDeps();
  ctx.elements.cashierSelect.value = '1';
  ctx.elements.accountantSelect.value = '2';
  ctx.elements.reconciliationDate.value = '2026-02-25';
  ctx.elements.timeRangeStart.value = '08:00';
  ctx.elements.timeRangeEnd.value = '12:00';
  ctx.elements.filterNotes.value = '  note ';
  ctx.deps.windowObj = {
    pendingReconciliationData: {
      requestId: 901,
      systemSales: 123,
      details: {
        cash_breakdown: [],
        bank_items: []
      },
      total_bank: 0
    },
    appAPI: {}
  };

  const handlers = createNewReconciliationHandlers(ctx.deps);
  await handlers.handleNewReconciliation({ preventDefault() {} });

  assert.equal(ctx.state.current.id, 77);
  assert.equal(ctx.state.current.originRequestId, 901);
  assert.equal(ctx.deps.windowObj.pendingReconciliationData, null);
  assert.equal(ctx.elements.currentReconciliationInfo.style.display, 'block');
  assert.ok(ctx.elements.currentReconciliationDetails.textContent.includes('Ali'));
  assert.equal(ctx.dialog.success.length, 1);
});

test('handleNewReconciliation works when updateSummary dependency is missing', async () => {
  const ctx = createBaseDeps({ updateSummary: undefined });
  ctx.elements.cashierSelect.value = '1';
  ctx.elements.accountantSelect.value = '2';
  ctx.elements.reconciliationDate.value = '2026-02-25';

  const handlers = createNewReconciliationHandlers(ctx.deps);
  await handlers.handleNewReconciliation({ preventDefault() {} });

  assert.equal(ctx.state.current.id, 77);
  assert.equal(ctx.dialog.errors.length, 0);
});

test('handleNewReconciliation prefers stored reconciliation formula settings from DB', async () => {
  const ctx = createBaseDeps();
  ctx.elements.cashierSelect.value = '1';
  ctx.elements.accountantSelect.value = '2';
  ctx.elements.reconciliationDate.value = '2026-02-25';

  // UI starts with default signs, but DB should override these values.
  ctx.elements.formulaBankReceipts = createElement({ value: '1' });
  ctx.elements.formulaCashReceipts = createElement({ value: '1' });
  ctx.elements.formulaPostpaidSales = createElement({ value: '1' });
  ctx.elements.formulaCustomerReceipts = createElement({ value: '-1' });
  ctx.elements.formulaReturnInvoices = createElement({ value: '1' });
  ctx.elements.formulaSuppliers = createElement({ value: '0' });

  const originalInvoke = ctx.deps.ipcRenderer.invoke;
  ctx.deps.ipcRenderer.invoke = async (channel, query, params) => {
    if (
      channel === 'db-query'
      && typeof query === 'string'
      && query.includes('FROM system_settings')
      && Array.isArray(params)
      && params[0] === 'reconciliation_formula'
    ) {
      return [
        { setting_key: 'bank_receipts_sign', setting_value: '1' },
        { setting_key: 'cash_receipts_sign', setting_value: '1' },
        { setting_key: 'postpaid_sales_sign', setting_value: '1' },
        { setting_key: 'customer_receipts_sign', setting_value: '1' },
        { setting_key: 'return_invoices_sign', setting_value: '0' },
        { setting_key: 'suppliers_sign', setting_value: '-1' }
      ];
    }

    return originalInvoke(channel, query, params);
  };

  const handlers = createNewReconciliationHandlers(ctx.deps);
  await handlers.handleNewReconciliation({ preventDefault() {} });

  assert.equal(ctx.state.current.formula_settings.customer_receipts_sign, 1);
  assert.equal(ctx.state.current.formula_settings.return_invoices_sign, 0);
  assert.equal(ctx.state.current.formula_settings.suppliers_sign, -1);
  assert.equal(ctx.elements.formulaCustomerReceipts.value, '1');
  assert.equal(ctx.elements.formulaSuppliers.value, '-1');
});
