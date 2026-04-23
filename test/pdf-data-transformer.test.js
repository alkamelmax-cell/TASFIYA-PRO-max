const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfDataTransformer } = require('../src/app/pdf-data-transformer');

test('transformDataForPDFGenerator calculates totals and summary', () => {
  const transformer = createPdfDataTransformer({
    logger: { log() {}, error() {} },
    getCurrentCompanyName: () => 'الشركة الحالية'
  });

  const result = transformer.transformDataForPDFGenerator({
    reconciliation: {
      id: 7,
      cashier_name: 'Cashier',
      cashier_number: 'C-1',
      accountant_name: 'Accountant',
      reconciliation_date: '2026-02-24',
      system_sales: 100,
      time_range_start: '08:00',
      time_range_end: '16:00',
      filter_notes: 'note'
    },
    bankReceipts: [{ amount: 30 }],
    cashReceipts: [{ total_amount: 40 }],
    postpaidSales: [{ amount: 20 }],
    customerReceipts: [{ amount: 10 }],
    returnInvoices: [{ amount: 5 }],
    suppliers: [{ amount: 7 }]
  });

  assert.equal(result.reconciliationId, 7);
  assert.equal(result.companyName, 'الشركة الحالية');
  assert.equal(result.summary.totalReceipts, 85);
  assert.equal(result.summary.surplusDeficit, -15);
  assert.equal(result.summary.supplierTotal, 7);
});

test('transformDataForPDFGenerator prefers reconciliation company name', () => {
  const transformer = createPdfDataTransformer({
    logger: { log() {}, error() {} },
    getCurrentCompanyName: () => 'fallback'
  });

  const result = transformer.transformDataForPDFGenerator({
    reconciliation: {
      id: 1,
      company_name: 'Company From Data',
      system_sales: 0
    }
  });

  assert.equal(result.companyName, 'Company From Data');
  assert.equal(result.summary.totalReceipts, 0);
});
