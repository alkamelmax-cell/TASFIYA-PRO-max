const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPerformanceComprehensivePdfContent,
  generatePerformanceSummaryHtml,
  generateCashiersPerformanceHtml
} = require('../src/app/performance-pdf-builders');

test('generatePerformanceSummaryHtml renders summary numbers', () => {
  const html = generatePerformanceSummaryHtml(
    {
      totalCashiers: 2,
      bestPerformer: { cashier_name: 'A' },
      averageRating: '4.2',
      totalSales: 300,
      totalDeficit: 10
    },
    [{ total_reconciliations: 3 }, { total_reconciliations: 2 }],
    (v) => String(v)
  );

  assert.ok(html.includes('عدد الكاشيرين'));
  assert.ok(html.includes('A'));
  assert.ok(html.includes('300'));
});

test('generateCashiersPerformanceHtml renders cashier cards', () => {
  const html = generateCashiersPerformanceHtml(
    [
      {
        cashier_name: 'A',
        cashier_number: '001',
        total_reconciliations: 3,
        total_sales: 200,
        total_deficit: 5,
        accuracy_score: 90,
        star_rating: 4,
        overall_rating: 4.1,
        branch_name: 'Main',
        performance_badge: { text: 'ممتاز', class: 'badge-excellent' }
      }
    ],
    (v) => String(v)
  );

  assert.ok(html.includes('A (001)'));
  assert.ok(html.includes('المرتبة 1'));
  assert.ok(html.includes('badge-excellent'));
});

test('buildPerformanceComprehensivePdfContent injects report metadata', () => {
  const html = buildPerformanceComprehensivePdfContent({
    dateFrom: '2026-02-01',
    dateTo: '2026-02-24',
    branchName: 'Main',
    reportDate: '24/02/2026',
    formatCurrency: (v) => String(v),
    performanceData: {
      summary: {
        totalCashiers: 1,
        bestPerformer: { cashier_name: 'A' },
        averageRating: '4.0',
        totalSales: 100,
        totalDeficit: 0
      },
      cashiers: [
        {
          cashier_name: 'A',
          cashier_number: '001',
          total_reconciliations: 1,
          total_sales: 100,
          total_deficit: 0,
          accuracy_score: 100,
          star_rating: 5,
          overall_rating: 5,
          branch_name: 'Main',
          performance_badge: { text: 'ممتاز', class: 'badge-excellent' }
        }
      ]
    }
  });

  assert.ok(html.includes('2026-02-01'));
  assert.ok(html.includes('Main'));
  assert.ok(html.includes('24/02/2026'));
});
