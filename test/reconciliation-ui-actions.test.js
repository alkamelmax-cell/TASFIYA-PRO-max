const test = require('node:test');
const assert = require('node:assert/strict');

const { createReconciliationUiActions } = require('../src/app/reconciliation-ui-actions');

function createElement(initial = {}) {
  return {
    textContent: '',
    value: '',
    className: '',
    style: {},
    innerHTML: '',
    ...initial
  };
}

function buildContext(overrides = {}) {
  const elements = {
    summaryBankTotal: createElement(),
    summaryCashTotal: createElement(),
    summaryPostpaidTotal: createElement(),
    summaryCustomerTotal: createElement(),
    summaryReturnTotal: createElement(),
    totalReceipts: createElement(),
    systemSales: createElement({ value: '200' }),
    surplusDeficit: createElement(),
    cashierNumber: createElement(),
    bankName: createElement(),
    savePdfBtn: createElement({ innerHTML: 'save', disabled: false }),
    currentReconciliationInfo: createElement()
  };

  let loadSearchCalled = 0;

  const handlers = createReconciliationUiActions({
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-get') {
          return { cashier_number: 'C-1', bank_name: 'Bank A' };
        }
        return { success: true };
      }
    },
    getDialogUtils: () => ({
      showValidationError() {},
      showSuccessToast() {},
      showError() {},
      showErrorToast() {},
      showInfo() {},
      showConfirm: async () => true,
      showSuccess() {}
    }),
    formatCurrency: (v) => Number(v).toFixed(2),
    getCurrentReconciliation: () => ({ id: 1 }),
    getBankReceipts: () => [{ amount: 100 }],
    getCashReceipts: () => [{ total_amount: 200 }],
    getPostpaidSales: () => [{ amount: 50 }],
    getCustomerReceipts: () => [{ amount: 10 }],
    getReturnInvoices: () => [{ amount: 20 }],
    getSuppliers: () => [],
    showPrintSectionDialogForNewReconciliation: async () => null,
    prepareReconciliationData: async () => ({ reconciliation: { id: 1 }, summary: { totalReceipts: 360 } }),
    preparePrintData: () => ({ reconciliation: { id: 1 }, sections: {} }),
    clearAllReconciliationData: async () => {},
    resetSystemToNewReconciliationState: () => {},
    loadSearchFilters: async () => { loadSearchCalled += 1; },
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  });

  return { handlers, elements, getLoadSearchCalled: () => loadSearchCalled };
}

test('updateSummary computes totals and surplus text', () => {
  const ctx = buildContext();
  ctx.handlers.updateSummary();

  assert.equal(ctx.elements.summaryBankTotal.textContent, '100.00');
  assert.equal(ctx.elements.totalReceipts.textContent, '360.00');
  assert.equal(ctx.elements.surplusDeficit.textContent, 'فائض: 160.00');
});

test('handleCashierChange fills cashier number and handleAtmChange fills bank name', async () => {
  const ctx = buildContext();
  await ctx.handlers.handleCashierChange({ target: { value: '3' } });
  await ctx.handlers.handleAtmChange({ target: { value: '4' } });

  assert.equal(ctx.elements.cashierNumber.value, 'C-1');
  assert.equal(ctx.elements.bankName.value, 'Bank A');
});

test('loadReportFilters delegates to search filters loader', async () => {
  const ctx = buildContext();
  await ctx.handlers.loadReportFilters();
  assert.equal(ctx.getLoadSearchCalled(), 1);
});
