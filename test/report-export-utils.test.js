const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReportSummary,
  prepareExcelData,
  generateAdvancedReportTableHtml,
  prepareAdvancedReportExcelData
} = require('../src/app/report-export-utils');

test('generateReportSummary returns aggregates', () => {
  const input = [
    {
      total_receipts: 100,
      system_sales: 80,
      surplus_deficit: 20,
      status: 'completed',
      cashier_name: 'A'
    },
    {
      total_receipts: 50,
      system_sales: 70,
      surplus_deficit: -20,
      status: 'draft',
      cashier_name: 'A'
    }
  ];

  const summary = generateReportSummary(input);
  assert.equal(summary.totalReconciliations, 2);
  assert.equal(summary.totalReceipts, 150);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.draftCount, 1);
  assert.equal(summary.cashierStats.A.count, 2);
});

test('prepareExcelData builds rows and headers', () => {
  const data = [
    {
      id: 1,
      reconciliation_date: '2026-02-24',
      cashier_name: 'A',
      cashier_number: '001',
      accountant_name: 'B',
      total_receipts: 100,
      system_sales: 90,
      surplus_deficit: 10,
      status: 'completed'
    }
  ];

  const result = prepareExcelData(data);
  assert.equal(result.headers.length, 9);
  assert.equal(result.rows.length, 1);
  assert.equal(result.title, 'تقرير التصفيات');
});

test('advanced report export helpers work for time and atm', () => {
  const timeData = [
    {
      period_label: '2026-02-24',
      total_reconciliations: 2,
      active_cashiers: 1,
      total_receipts: 120,
      avg_receipts: 60,
      total_surplus_deficit: -5,
      accuracy_rate: '90'
    }
  ];

  const atmData = [
    {
      atm_name: 'ATM1',
      atm_branch_name: 'Main',
      atm_location: 'L1',
      total_transactions: 5,
      total_amount: 300,
      avg_transaction_amount: 60,
      daily_avg: '100.00',
      utilization_rate: '80.00'
    }
  ];

  assert.ok(generateAdvancedReportTableHtml(timeData, 'time').includes('الفترة'));
  assert.ok(generateAdvancedReportTableHtml(atmData, 'atm').includes('اسم الجهاز'));
  assert.equal(prepareAdvancedReportExcelData(timeData, 'T').headers.length, 7);
  assert.equal(prepareAdvancedReportExcelData(atmData, 'A').headers.length, 8);
});
