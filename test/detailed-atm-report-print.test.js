const test = require('node:test');
const assert = require('node:assert/strict');
const { createDetailedAtmReportPrintHandlers } = require('../src/app/detailed-atm-report-print');

function createDialogTracker() {
  return {
    validation: [],
    loading: [],
    success: [],
    errors: [],
    closed: 0,
    showValidationError(msg) { this.validation.push(msg); },
    showLoading(msg) { this.loading.push(msg); },
    showSuccessToast(msg) { this.success.push(msg); },
    showError(msg) { this.errors.push(msg); },
    close() { this.closed += 1; }
  };
}

function buildHandlers(overrides = {}) {
  const dialog = overrides.dialog || createDialogTracker();
  const base = {
    windowObj: { open: () => null },
    setTimeoutFn: (fn) => fn(),
    getFilteredDetailedReportData: () => [],
    getDetailedAtmReportFilters: () => ({ dateFrom: '2026-02-01', dateTo: '2026-02-20', feesMode: 'without_fees' }),
    getCompanyName: async () => 'شركة الاختبار',
    formatCurrency: (value) => String(value),
    getCurrentDateTime: () => '2026-02-25 10:00:00',
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} }
  };

  return {
    dialog,
    handlers: createDetailedAtmReportPrintHandlers({ ...base, ...overrides })
  };
}

test('handlePrintDetailedAtmReport validates empty data', async () => {
  const { dialog, handlers } = buildHandlers();
  await handlers.handlePrintDetailedAtmReport();
  assert.equal(dialog.validation.length, 1);
  assert.equal(dialog.loading.length, 0);
});

test('openDetailedAtmReportPrintWindow returns success false when popup blocked', async () => {
  const { handlers } = buildHandlers({
    windowObj: { open: () => null }
  });

  const result = await handlers.openDetailedAtmReportPrintWindow('<html></html>');
  assert.equal(result.success, false);
  assert.match(result.error, /فشل في فتح نافذة الطباعة/);
});

test('generateDetailedAtmReportPrintContent includes branding and rows', async () => {
  const data = [
    {
      amount: '10',
      gross_amount: 10,
      fee_amount: 0.15,
      fee_vat_amount: 0.02,
      net_amount: 9.83,
      operation_type: 'مدى',
      formatted_datetime: '2026-02-20 10:00',
      atm_name: 'ATM-1',
      atm_branch_name: 'Branch-1',
      atm_location: 'Loc-1',
      bank_name: 'Bank-1',
      formatted_amount: '10.00',
      formatted_gross_amount: '10.00',
      formatted_fee_amount: '0.15',
      formatted_fee_vat_amount: '0.02',
      formatted_net_amount: '9.83',
      cashier_name: 'Ali',
      cashier_number: '001',
      reconciliation_id: 55
    }
  ];

  const { handlers } = buildHandlers({
    getFilteredDetailedReportData: () => data,
    getDetailedAtmReportFilters: () => ({ dateFrom: '2026-02-01', dateTo: '2026-02-20', feesMode: 'with_fees' })
  });

  const html = await handlers.generateDetailedAtmReportPrintContent();
  assert.ok(html.includes('شركة الاختبار'));
  assert.ok(html.includes('operation-mada'));
  assert.ok(html.includes('ATM-1'));
  assert.ok(html.includes('قبل الرسوم'));
  assert.ok(html.includes('9.83'));
  assert.ok(html.includes('#55'));
});

test('generateDetailedAtmReportPrintContent keeps legacy amount view when fees mode is disabled', async () => {
  const data = [
    {
      amount: '10',
      operation_type: 'مدى',
      formatted_datetime: '2026-02-20 10:00',
      atm_name: 'ATM-1',
      atm_branch_name: 'Branch-1',
      atm_location: 'Loc-1',
      bank_name: 'Bank-1',
      formatted_amount: '10.00',
      cashier_name: 'Ali',
      cashier_number: '001',
      reconciliation_id: 55
    }
  ];

  const { handlers } = buildHandlers({
    getFilteredDetailedReportData: () => data
  });

  const html = await handlers.generateDetailedAtmReportPrintContent();
  assert.ok(html.includes('إجمالي المبلغ'));
  assert.ok(html.includes('10.00'));
  assert.ok(!html.includes('قبل الرسوم'));
  assert.ok(!html.includes('بعد الرسوم'));
});
