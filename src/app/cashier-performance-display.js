function createCashierPerformanceDisplayHandlers(context) {
  const document = context.document;
  const windowObj = context.windowObj || globalThis;
  const generateStarRating = context.generateStarRating;
  const formatNumber = context.formatNumber;
  const formatCurrency = context.formatCurrency;
  const logger = context.logger || console;

function displayPerformanceResults(data) {
  logger.log('🎨 [PERFORMANCE] عرض نتائج المقارنة...');

  windowObj.currentPerformanceData = data;
  logger.log('💾 [PERFORMANCE] تم حفظ بيانات الأداء للتصدير');

  displayPerformanceSummary(data.summary);
  displayCashierRanking(data.cashiers.slice(0, 5));
  displayCashierCards(data.cashiers);

  document.getElementById('exportPerformancePdfBtn').style.display = 'inline-block';
}

function displayPerformanceSummary(summary) {
  const container = document.getElementById('performanceSummary');

  const summaryHtml = `
      <div class="col-md-3">
          <div class="card bg-primary text-white">
              <div class="card-body text-center">
                  <h4 class="mb-1">${summary.totalCashiers}</h4>
                  <p class="mb-0">إجمالي الكاشيرين</p>
              </div>
          </div>
      </div>
      <div class="col-md-3">
          <div class="card bg-success text-white">
              <div class="card-body text-center">
                  <h4 class="mb-1">${formatNumber(summary.totalSales)}</h4>
                  <p class="mb-0">إجمالي المبيعات</p>
              </div>
          </div>
      </div>
      <div class="col-md-3">
          <div class="card bg-warning text-white">
              <div class="card-body text-center">
                  <h4 class="mb-1">${summary.averageRating} ⭐</h4>
                  <p class="mb-0">متوسط التقييم</p>
              </div>
          </div>
      </div>
      <div class="col-md-3">
          <div class="card ${summary.totalDeficit >= 0 ? 'bg-info' : 'bg-danger'} text-white">
              <div class="card-body text-center">
                  <h4 class="mb-1">${formatCurrency(summary.totalDeficit)}</h4>
                  <p class="mb-0">صافي النتيجة</p>
              </div>
          </div>
      </div>
  `;

  container.innerHTML = summaryHtml;
}

function displayCashierRanking(topCashiers) {
  const container = document.getElementById('cashierRankingList');

  let rankingHtml = '';
  topCashiers.forEach((cashier, index) => {
    const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

    rankingHtml += `
          <div class="col-12 mb-2">
              <div class="d-flex align-items-center p-2 border rounded">
                  <div class="me-3">
                      <span class="fs-4">${rankIcon}</span>
                  </div>
                  <div class="flex-grow-1">
                      <div class="fw-bold">${cashier.cashier_name}</div>
                      <small class="text-muted">رقم: ${cashier.cashier_number}</small>
                  </div>
                  <div class="text-end">
                      <div>${generateStarRating(cashier.star_rating)}</div>
                      <small class="text-muted">${cashier.overall_rating.toFixed(1)}/5</small>
                  </div>
              </div>
          </div>
      `;
  });

  container.innerHTML = rankingHtml;
}

function displayCashierCards(cashiers) {
  const container = document.getElementById('cashierPerformanceCards');

  let cardsHtml = '';
  cashiers.forEach((cashier) => {
    const badge = cashier.performance_badge;
    const deficitClass = cashier.total_deficit >= 0 ? 'text-success' : 'text-danger';

    cardsHtml += `
          <div class="col-md-6 col-lg-4 mb-4">
              <div class="card h-100 shadow-sm">
                  <div class="card-header d-flex justify-content-between align-items-center">
                      <h6 class="mb-0">${cashier.cashier_name}</h6>
                      <span class="badge ${badge.class}">${badge.icon} ${badge.text}</span>
                  </div>
                  <div class="card-body">
                      <div class="text-center mb-3">
                          <div class="fs-4">${generateStarRating(cashier.star_rating)}</div>
                          <small class="text-muted">${cashier.overall_rating.toFixed(1)}/5.0</small>
                      </div>

                      <div class="row text-center mb-3">
                          <div class="col-6">
                              <div class="fw-bold text-primary">${formatNumber(cashier.total_sales)}</div>
                              <small class="text-muted">إجمالي المبيعات</small>
                          </div>
                          <div class="col-6">
                              <div class="fw-bold ${deficitClass}">${formatCurrency(cashier.total_deficit)}</div>
                              <small class="text-muted">صافي النتيجة</small>
                          </div>
                      </div>

                      <div class="mb-2">
                          <small class="text-muted">الدقة:</small>
                          <div class="progress" style="height: 6px;">
                              <div class="progress-bar bg-success" style="width: ${cashier.accuracy_score}%"></div>
                          </div>
                          <small class="text-muted">${cashier.accuracy_score.toFixed(0)}%</small>
                      </div>

                      <div class="mb-2">
                          <small class="text-muted">حجم المبيعات:</small>
                          <div class="progress" style="height: 6px;">
                              <div class="progress-bar bg-info" style="width: ${cashier.volume_score}%"></div>
                          </div>
                          <small class="text-muted">${cashier.volume_score.toFixed(0)}%</small>
                      </div>

                      <div class="mb-3">
                          <small class="text-muted">الاستقرار:</small>
                          <div class="progress" style="height: 6px;">
                              <div class="progress-bar bg-warning" style="width: ${cashier.consistency_score}%"></div>
                          </div>
                          <small class="text-muted">${cashier.consistency_score.toFixed(0)}%</small>
                      </div>

                      <div class="row text-center">
                          <div class="col-4">
                              <div class="fw-bold text-success">${cashier.positive_days}</div>
                              <small class="text-muted">أيام إيجابية</small>
                          </div>
                          <div class="col-4">
                              <div class="fw-bold text-danger">${cashier.negative_days}</div>
                              <small class="text-muted">أيام سلبية</small>
                          </div>
                          <div class="col-4">
                              <div class="fw-bold text-primary">${cashier.total_reconciliations}</div>
                              <small class="text-muted">إجمالي الأيام</small>
                          </div>
                      </div>
                  </div>
                  <div class="card-footer text-muted">
                      <small>
                          ${cashier.branch_name || 'غير محدد'} |
                          رقم الكاشير: ${cashier.cashier_number}
                      </small>
                  </div>
              </div>
          </div>
      `;
  });

  container.innerHTML = cardsHtml;
}

function showPerformanceLoading(show) {
  document.getElementById('performanceLoading').style.display = show ? 'block' : 'none';
}

function showPerformanceResults() {
  document.getElementById('performanceResults').style.display = 'block';
}

function hidePerformanceResults() {
  document.getElementById('performanceResults').style.display = 'none';
}

  return {
    displayPerformanceResults,
    displayPerformanceSummary,
    displayCashierRanking,
    displayCashierCards,
    showPerformanceLoading,
    showPerformanceResults,
    hidePerformanceResults
  };
}

module.exports = {
  createCashierPerformanceDisplayHandlers
};
