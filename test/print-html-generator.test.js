const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrintHtmlGenerator } = require('../src/app/print-html-generator');

function createGenerator(overrides = {}) {
  return createPrintHtmlGenerator({
    logger: { log() {} },
    getCurrentPrintReconciliation: () => ({
      reconciliation: {
        id: 1,
        cashier_name: 'Ali',
        cashier_number: '001',
        accountant_name: 'Mona',
        reconciliation_date: '2026-02-24',
        filter_notes: 'ملاحظة',
        ...overrides.reconciliation
      },
      bankReceipts: [{}],
      cashReceipts: [{}],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: [],
      ...overrides.current
    }),
    formatDate: (value) => value,
    getCurrentDate: () => '2026-02-24',
    generateBankReceiptsSection: () => '[BANK]',
    generateCashReceiptsSection: () => '[CASH]',
    generatePostpaidSalesSection: () => '[POSTPAID]',
    generateCustomerReceiptsSection: () => '[CUSTOMER]',
    generateReturnInvoicesSection: () => '[RETURN]',
    generateSuppliersSection: () => '[SUPPLIERS]',
    generateSummarySection: () => '[SUMMARY]',
    generateNonColoredPrintStyles: () => '[NO-COLOR]',
    ...overrides.deps
  });
}

test('generatePrintHTML throws when reconciliation data is missing', () => {
  const generator = createPrintHtmlGenerator({
    logger: { log() {} },
    getCurrentPrintReconciliation: () => null,
    formatDate: (value) => value,
    getCurrentDate: () => '2026-02-24',
    generateBankReceiptsSection: () => '',
    generateCashReceiptsSection: () => '',
    generatePostpaidSalesSection: () => '',
    generateCustomerReceiptsSection: () => '',
    generateReturnInvoicesSection: () => '',
    generateSuppliersSection: () => '',
    generateSummarySection: () => '',
    generateNonColoredPrintStyles: () => ''
  });

  assert.throws(() => {
    generator.generatePrintHTML({
      sections: {},
      options: { fontSize: 'normal', orientation: 'portrait', colors: true }
    });
  }, /لا توجد بيانات تصفية للطباعة/);
});

test('generatePrintHTML renders selected sections and preview controls', () => {
  const { generatePrintHTML } = createGenerator();

  const html = generatePrintHTML({
    sections: {
      bankReceipts: true,
      cashReceipts: true,
      postpaidSales: false,
      customerReceipts: false,
      returnInvoices: false,
      suppliers: false,
      summary: true
    },
    options: {
      fontSize: 'normal',
      orientation: 'portrait',
      colors: false
    }
  }, true);

  assert.ok(html.includes('[BANK]'));
  assert.ok(html.includes('[CASH]'));
  assert.ok(html.includes('[SUMMARY]'));
  assert.ok(html.includes('[NO-COLOR]'));
  assert.ok(html.includes('print-controls'));
  assert.ok(!html.includes('[POSTPAID]'));
});
