function generatePerformanceSummaryHtml(summary, cashiers, formatCurrency) {
  if (!summary) return '';

  const bestPerformerName = summary.bestPerformer ? summary.bestPerformer.cashier_name : 'غير محدد';
  const totalReconciliations = (cashiers || []).reduce((sum, c) => sum + (c.total_reconciliations || 0), 0);
  const averageRating = summary.averageRating || 0;

  return `
    <div class="summary-section">
        <div class="summary-title">📊 ملخص الأداء العام</div>
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">${summary.totalCashiers || 0}</div>
                <div class="label">عدد الكاشيرين</div>
            </div>
            <div class="summary-card">
                <div class="value">${totalReconciliations}</div>
                <div class="label">إجمالي التصفيات</div>
            </div>
            <div class="summary-card">
                <div class="value">${formatCurrency(summary.totalSales || 0)}</div>
                <div class="label">إجمالي المبيعات</div>
            </div>
            <div class="summary-card">
                <div class="value">${formatCurrency(summary.totalDeficit || 0)}</div>
                <div class="label">إجمالي العجز/الفائض</div>
            </div>
            <div class="summary-card">
                <div class="value">${averageRating}%</div>
                <div class="label">متوسط التقييم</div>
            </div>
            <div class="summary-card">
                <div class="value">${bestPerformerName}</div>
                <div class="label">أفضل كاشير</div>
            </div>
        </div>
    </div>`;
}

function generateCashiersPerformanceHtml(cashiers, formatCurrency) {
  if (!cashiers || !Array.isArray(cashiers)) return '';

  let html = `
    <div class="cashiers-section">
        <div class="section-title">👥 تفاصيل أداء الكاشيرين</div>`;

  cashiers.forEach((cashier, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'text-warning' : rank <= 3 ? 'text-primary' : '';
    const avgPerReconciliation = cashier.total_reconciliations > 0
      ? (cashier.total_sales / cashier.total_reconciliations)
      : 0;

    html += `
        <div class="cashier-card">
            <div class="cashier-header">
                <div class="cashier-name">${cashier.cashier_name} (${cashier.cashier_number})</div>
                <div class="cashier-rank ${rankClass}">المرتبة ${rank}</div>
            </div>
            <div class="cashier-stats">
                <div class="stat-item">
                    <div class="stat-value">${cashier.total_reconciliations || 0}</div>
                    <div class="stat-label">عدد التصفيات</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(cashier.total_sales || 0)}</div>
                    <div class="stat-label">إجمالي المبيعات</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(avgPerReconciliation)}</div>
                    <div class="stat-label">متوسط التصفية</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(cashier.total_deficit || 0)}</div>
                    <div class="stat-label">العجز/الفائض</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${(cashier.accuracy_score || 0).toFixed(1)}%</div>
                    <div class="stat-label">نقاط الدقة</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">
                        <span class="rating">${'★'.repeat(Math.round(cashier.star_rating || 0))}</span>
                    </div>
                    <div class="stat-label">التقييم (${(cashier.overall_rating || 0).toFixed(1)})</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${cashier.branch_name || 'غير محدد'}</div>
                    <div class="stat-label">الفرع</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">
                        <span class="badge ${cashier.performance_badge?.class || ''}">${cashier.performance_badge?.text || 'عادي'}</span>
                    </div>
                    <div class="stat-label">مستوى الأداء</div>
                </div>
            </div>
        </div>`;
  });

  html += '</div>';
  return html;
}

function buildPerformanceComprehensivePdfContent(options) {
  const { dateFrom, dateTo, branchName, performanceData, reportDate, formatCurrency } = options;
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>تقرير مقارنة أداء الكاشيرين</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; line-height: 1.6; color: #333; background: #fff; padding: 20px; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #007bff; padding-bottom: 20px; }
        .header h1 { color: #007bff; font-size: 28px; font-weight: 700; margin-bottom: 10px; }
        .header .subtitle { color: #666; font-size: 16px; margin-bottom: 5px; }
        .summary-section { margin-bottom: 30px; background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; }
        .summary-title { color: #007bff; font-size: 20px; font-weight: 600; margin-bottom: 15px; text-align: center; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .summary-card { background: white; padding: 15px; border-radius: 6px; border: 1px solid #dee2e6; text-align: center; }
        .summary-card .value { font-size: 24px; font-weight: 700; color: #007bff; margin-bottom: 5px; }
        .summary-card .label { font-size: 14px; color: #666; }
        .cashiers-section { margin-bottom: 30px; }
        .section-title { color: #007bff; font-size: 18px; font-weight: 600; margin-bottom: 15px; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
        .cashier-card { background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .cashier-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .cashier-name { font-size: 18px; font-weight: 600; color: #333; }
        .cashier-rank { background: #007bff; color: white; padding: 5px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; }
        .cashier-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .stat-item { text-align: center; padding: 10px; background: #f8f9fa; border-radius: 6px; }
        .stat-value { font-size: 16px; font-weight: 600; color: #007bff; margin-bottom: 3px; }
        .stat-label { font-size: 12px; color: #666; }
        .rating { color: #ffc107; font-size: 18px; }
        .text-success { color: #28a745; }
        .text-danger { color: #dc3545; }
        .text-primary { color: #007bff; }
        .text-warning { color: #ffc107; }
        .badge { display: inline-block; padding: 4px 8px; font-size: 12px; font-weight: 600; border-radius: 4px; color: white; }
        .bg-success { background-color: #28a745; }
        .bg-warning { background-color: #ffc107; color: #212529; }
        .bg-danger { background-color: #dc3545; }
        .bg-info { background-color: #17a2b8; }
        .bg-secondary { background-color: #6c757d; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #dee2e6; padding-top: 15px; }
        @media print { body { padding: 10px; } .cashier-card { break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏆 تقرير مقارنة أداء الكاشيرين</h1>
        <div class="subtitle">الفترة: من ${dateFrom} إلى ${dateTo}</div>
        <div class="subtitle">الفرع: ${branchName}</div>
        <div class="subtitle">تاريخ التقرير: ${reportDate}</div>
    </div>

    ${generatePerformanceSummaryHtml(performanceData.summary, performanceData.cashiers, formatCurrency)}
    ${generateCashiersPerformanceHtml(performanceData.cashiers, formatCurrency)}

    <div class="footer">
        <p>تم إنشاء هذا التقرير بواسطة نظام تصفية برو - جميع الحقوق محفوظة © 2025</p>
    </div>
</body>
</html>`;
}

module.exports = {
  buildPerformanceComprehensivePdfContent,
  generatePerformanceSummaryHtml,
  generateCashiersPerformanceHtml
};
