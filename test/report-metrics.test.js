const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePerformanceScore,
  formatPeriodLabel,
  getReportTypeLabel,
  getDaysBetween,
  generateAdvancedReportSummary,
  calculateAccuracyScore,
  calculateVolumeScore,
  calculateConsistencyScore,
  calculateOverallRating,
  getPerformanceBadge,
  generatePerformanceSummary,
  generateStarRating,
  determineReportType
} = require('../src/app/report-metrics');

test('basic report metrics helpers work', () => {
  assert.equal(getReportTypeLabel('daily'), 'اليومي');
  assert.equal(getDaysBetween('2026-02-01', '2026-02-03'), 3);
  assert.equal(formatPeriodLabel('2026-W05', 'weekly'), 'الأسبوع 05 من 2026');
  assert.equal(determineReportType([{ period_label: 'x', active_cashiers: 1 }]), 'time');
  assert.equal(determineReportType([{ atm_name: 'A', total_transactions: 2 }]), 'atm');
});

test('advanced summary calculations return expected structure', () => {
  const timeSummary = generateAdvancedReportSummary(
    [
      { total_reconciliations: 2, total_receipts: 100, accuracy_rate: '50' },
      { total_reconciliations: 3, total_receipts: 300, accuracy_rate: '100' }
    ],
    'time'
  );

  assert.equal(timeSummary.totalPeriods, 2);
  assert.equal(timeSummary.totalReconciliations, 5);
  assert.equal(timeSummary.totalReceipts, 400);
  assert.equal(timeSummary.avgDailyReceipts, '200.00');
});

test('cashier performance helpers calculate bounded values', () => {
  const cashier = {
    balanced_count: 4,
    surplus_count: 1,
    total_reconciliations: 5,
    avg_surplus_deficit: 10,
    avg_deficit: 20,
    positive_days: 4,
    negative_days: 1,
    total_sales: 200,
    total_deficit: 50
  };

  assert.equal(typeof calculatePerformanceScore(cashier), 'string');
  assert.ok(calculateAccuracyScore(cashier) >= 0 && calculateAccuracyScore(cashier) <= 100);
  assert.ok(calculateVolumeScore(cashier, [cashier, { total_sales: 400 }]) >= 0);
  assert.ok(calculateConsistencyScore(cashier) >= 0 && calculateConsistencyScore(cashier) <= 100);
  assert.ok(calculateOverallRating(90, 80, 70) >= 1 && calculateOverallRating(90, 80, 70) <= 5);
  assert.equal(typeof getPerformanceBadge(4.7).text, 'string');

  const summary = generatePerformanceSummary([{ ...cashier, overall_rating: 4.2 }]);
  assert.equal(summary.totalCashiers, 1);
  assert.equal(summary.averageRating, '4.2');
  assert.ok(generateStarRating(3).includes('⭐'));
});
