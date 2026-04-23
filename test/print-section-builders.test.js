const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrintSectionBuilders } = require('../src/app/print-section-builders');

function createBuilders() {
  return createPrintSectionBuilders({
    formatCurrency: (value) => `SAR ${Number(value || 0).toFixed(2)}`,
    formatNumber: (value) => String(value),
    formatDate: (value) => `DATE:${value}`,
    logger: { log() {} }
  });
}

test('safe helpers return fallback values', () => {
  const builders = createBuilders();
  assert.equal(builders.safeFieldValue({}, 'name'), 'غير محدد');
  assert.equal(builders.safeDateFormat('2026-02-24'), 'DATE:2026-02-24');
});

test('generateBankReceiptsSection renders data and totals', () => {
  const builders = createBuilders();
  const html = builders.generateBankReceiptsSection([
    {
      operation_type: 'ATM',
      atm_name: 'ATM-1',
      bank_name: 'Bank-1',
      amount: 10,
      created_at: '2026-02-24'
    },
    {
      operation_type: 'تحويل',
      atm_name: '',
      bank_name: 'Bank-2',
      amount: 5.5,
      created_at: '2026-02-24'
    }
  ]);

  assert.ok(html.includes('المقبوضات البنكية (2)'));
  assert.ok(html.includes('ATM-1'));
  assert.ok(html.includes('SAR 15.50'));
  assert.ok(html.includes('DATE:2026-02-24'));
});

test('generateCashReceiptsSection sorts by denomination and summary contains signatures', () => {
  const builders = createBuilders();
  const cashHtml = builders.generateCashReceiptsSection([
    { denomination: 50, quantity: 1, total_amount: 50, created_at: '2026-02-24' },
    { denomination: 500, quantity: 1, total_amount: 500, created_at: '2026-02-24' }
  ]);

  assert.ok(cashHtml.indexOf('500 ريال') < cashHtml.indexOf('50 ريال'));

  const summaryHtml = builders.generateSummarySection({
    total_receipts: 1000,
    system_sales: 850,
    surplus_deficit: 150,
    status: 'completed'
  });

  assert.ok(summaryHtml.includes('فائض'));
  assert.ok(summaryHtml.includes('مكتملة'));
  assert.ok(summaryHtml.includes('التوقيعات'));
});
