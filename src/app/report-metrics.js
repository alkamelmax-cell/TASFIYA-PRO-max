const { formatDate, formatDecimal } = require('./formatting');

function calculatePerformanceScore(cashierData) {
  const accuracyWeight = 0.6;
  const surplusWeight = 0.4;
  const accuracyScore =
    ((cashierData.balanced_count + cashierData.surplus_count) / cashierData.total_reconciliations) * 100;
  const surplusScore = Math.max(0, 100 - Math.abs(cashierData.avg_surplus_deficit));
  return formatDecimal((accuracyScore * accuracyWeight) + (surplusScore * surplusWeight));
}

function formatPeriodLabel(period, reportType) {
  switch (reportType) {
    case 'daily':
      return formatDate(period);
    case 'weekly': {
      const [year, week] = period.split('-W');
      return `الأسبوع ${week} من ${year}`;
    }
    case 'monthly': {
      const [monthYear, month] = period.split('-');
      const monthNames = [
        'يناير',
        'فبراير',
        'مارس',
        'أبريل',
        'مايو',
        'يونيو',
        'يوليو',
        'أغسطس',
        'سبتمبر',
        'أكتوبر',
        'نوفمبر',
        'ديسمبر'
      ];
      return `${monthNames[parseInt(month, 10) - 1]} ${monthYear}`;
    }
    default:
      return period;
  }
}

function getReportTypeLabel(reportType) {
  const labels = {
    daily: 'اليومي',
    weekly: 'الأسبوعي',
    monthly: 'الشهري'
  };
  return labels[reportType] || reportType;
}

function getDaysBetween(dateFrom, dateTo) {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

function generateAdvancedReportSummary(data, reportType) {
  switch (reportType) {
    case 'time':
      return {
        totalPeriods: data.length,
        totalReconciliations: data.reduce((sum, item) => sum + item.total_reconciliations, 0),
        totalReceipts: data.reduce((sum, item) => sum + item.total_receipts, 0),
        avgDailyReceipts: formatDecimal(data.reduce((sum, item) => sum + item.total_receipts, 0) / data.length),
        bestPeriod: data.reduce((best, current) => (current.total_receipts > best.total_receipts ? current : best)),
        overallAccuracy: formatDecimal(data.reduce((sum, item) => sum + parseFloat(item.accuracy_rate), 0) / data.length)
      };
    case 'atm':
      return {
        totalAtms: data.length,
        totalTransactions: data.reduce((sum, item) => sum + item.total_transactions, 0),
        totalAmount: data.reduce((sum, item) => sum + item.total_amount, 0),
        avgTransactionAmount: formatDecimal(data.reduce((sum, item) => sum + item.avg_transaction_amount, 0) / data.length),
        mostActiveAtm: data.reduce((best, current) =>
          (current.total_transactions > best.total_transactions ? current : best)),
        highestVolumeAtm: data.reduce((best, current) => (current.total_amount > best.total_amount ? current : best))
      };
    default:
      return {};
  }
}

function calculateAccuracyScore(cashier) {
  if (cashier.total_reconciliations === 0) return 0;
  const avgDeficit = Math.abs(cashier.avg_deficit);
  let accuracy = Math.max(0, 100 - (avgDeficit / 100) * 20);
  const positiveRatio = cashier.positive_days / cashier.total_reconciliations;
  accuracy += positiveRatio * 10;
  return Math.min(100, Math.max(0, accuracy));
}

function calculateVolumeScore(cashier, allCashiers) {
  if (allCashiers.length === 0) return 0;
  const maxSales = Math.max(...allCashiers.map((c) => c.total_sales || 0));
  if (maxSales === 0) return 0;
  const volumeScore = (cashier.total_sales / maxSales) * 100;
  return Math.min(100, Math.max(0, volumeScore));
}

function calculateConsistencyScore(cashier) {
  if (cashier.total_reconciliations === 0) return 0;
  const reconciliationBonus = Math.min(50, cashier.total_reconciliations * 5);
  const negativeRatio = cashier.negative_days / cashier.total_reconciliations;
  const consistencyPenalty = negativeRatio * 30;
  const consistencyScore = reconciliationBonus - consistencyPenalty + 50;
  return Math.min(100, Math.max(0, consistencyScore));
}

function calculateOverallRating(accuracy, volume, consistency) {
  const weightedScore = (accuracy * 0.5) + (volume * 0.3) + (consistency * 0.2);
  const rating = (weightedScore / 100) * 4 + 1;
  return Math.min(5, Math.max(1, rating));
}

function getPerformanceBadge(rating) {
  if (rating >= 4.5) return { text: 'ممتاز', class: 'badge-excellent', icon: '🏆' };
  if (rating >= 4.0) return { text: 'جيد جداً', class: 'badge-very-good', icon: '🥇' };
  if (rating >= 3.5) return { text: 'جيد', class: 'badge-good', icon: '🥈' };
  if (rating >= 3.0) return { text: 'مقبول', class: 'badge-acceptable', icon: '🥉' };
  return { text: 'يحتاج تحسين', class: 'badge-needs-improvement', icon: '📈' };
}

function generatePerformanceSummary(cashiers) {
  if (cashiers.length === 0) {
    return {
      totalCashiers: 0,
      bestPerformer: null,
      averageRating: 0,
      totalSales: 0,
      totalDeficit: 0
    };
  }

  const totalSales = cashiers.reduce((sum, c) => sum + c.total_sales, 0);
  const totalDeficit = cashiers.reduce((sum, c) => sum + c.total_deficit, 0);
  const averageRating = cashiers.reduce((sum, c) => sum + c.overall_rating, 0) / cashiers.length;

  return {
    totalCashiers: cashiers.length,
    bestPerformer: cashiers[0],
    averageRating: averageRating.toFixed(1),
    totalSales,
    totalDeficit
  };
}

function generateStarRating(rating) {
  let starsHtml = '';
  for (let i = 1; i <= 5; i += 1) {
    if (i <= rating) {
      starsHtml += '<span class="text-warning">⭐</span>';
    } else {
      starsHtml += '<span class="text-muted">☆</span>';
    }
  }
  return starsHtml;
}

function determineReportType(data) {
  if (!data || data.length === 0) return 'unknown';

  const firstItem = data[0];
  if (Object.prototype.hasOwnProperty.call(firstItem, 'period_label') &&
      Object.prototype.hasOwnProperty.call(firstItem, 'active_cashiers')) {
    return 'time';
  }
  if (Object.prototype.hasOwnProperty.call(firstItem, 'atm_name') &&
      Object.prototype.hasOwnProperty.call(firstItem, 'total_transactions')) {
    return 'atm';
  }
  return 'unknown';
}

module.exports = {
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
};
