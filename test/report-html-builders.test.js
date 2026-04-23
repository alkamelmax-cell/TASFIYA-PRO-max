const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReconciliationReportHtml,
  buildAdvancedReportHtml
} = require('../src/app/report-html-builders');

test('buildReconciliationReportHtml returns printable html', () => {
  const html = buildReconciliationReportHtml({
    reconciliations: [
      {
        status: 'completed',
        reconciliation_number: 1,
        reconciliation_date: '2026-02-24',
        cashier_name: 'A',
        cashier_number: '001',
        accountant_name: 'B',
        total_receipts: 120,
        system_sales: 110,
        surplus_deficit: 10
      }
    ],
    companyName: 'Company',
    summary: {
      totalReconciliations: 1,
      totalReceipts: 120,
      totalSystemSales: 110,
      totalSurplusDeficit: 10
    },
    reportDate: '24/02/2026',
    formatCurrency: (v) => String(v),
    formatDate: (v) => String(v)
  });

  assert.ok(html.includes('Company'));
  assert.ok(html.includes('تقرير التصفيات'));
  assert.ok(html.includes('24/02/2026'));
});

test('buildAdvancedReportHtml injects title and table html', () => {
  const html = buildAdvancedReportHtml({
    title: 'Advanced',
    companyName: 'Company',
    reportDate: '24/02/2026',
    tableHtml: '<table><tr><td>x</td></tr></table>'
  });

  assert.ok(html.includes('Advanced'));
  assert.ok(html.includes('Company'));
  assert.ok(html.includes('<table><tr><td>x</td></tr></table>'));
});
