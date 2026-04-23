const { createCashierPerformanceDisplayHandlers } = require('./cashier-performance-display');
const { createCashierPerformanceExportHandlers } = require('./cashier-performance-export');
const { mapDbErrorMessage } = require('./db-error-messages');
const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

function createCashierPerformanceComparisonHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const calculateAccuracyScore = deps.calculateAccuracyScore;
  const calculateVolumeScore = deps.calculateVolumeScore;
  const calculateConsistencyScore = deps.calculateConsistencyScore;
  const calculateOverallRating = deps.calculateOverallRating;
  const getPerformanceBadge = deps.getPerformanceBadge;
  const generatePerformanceSummary = deps.generatePerformanceSummary;
  const generateStarRating = deps.generateStarRating;
  const buildPerformanceComprehensivePdfContent = deps.buildPerformanceComprehensivePdfContent;
  const formatNumber = deps.formatNumber;
  const formatCurrency = deps.formatCurrency;
  const getCurrentDate = deps.getCurrentDate;
  const logger = deps.logger || console;

  const displayHandlers = createCashierPerformanceDisplayHandlers({
    document,
    windowObj,
    generateStarRating,
    formatNumber,
    formatCurrency,
    logger
  });

  const exportHandlers = createCashierPerformanceExportHandlers({
    document,
    ipcRenderer,
    windowObj,
    getDialogUtils,
    buildPerformanceComprehensivePdfContent,
    formatCurrency,
    getCurrentDate,
    logger
  });

  async function loadCashierPerformanceFilters() {
    try {
      const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
      if (fiscalYearRange) {
        document.getElementById('performanceDateFrom').value = fiscalYearRange.from;
        document.getElementById('performanceDateTo').value = fiscalYearRange.to;
      } else {
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

        document.getElementById('performanceDateFrom').value = lastMonth.toISOString().split('T')[0];
        document.getElementById('performanceDateTo').value = today.toISOString().split('T')[0];
      }

      const branches = await ipcRenderer.invoke('db-query', 'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name');
      const branchSelect = document.getElementById('performanceBranch');
      branchSelect.innerHTML = '<option value="">جميع الفروع</option>';

      branches.forEach((branch) => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.branch_name;
        branchSelect.appendChild(option);
      });

      logger.log('✅ [PERFORMANCE] تم تحميل فلاتر مقارنة الأداء');
    } catch (error) {
      logger.error('❌ [PERFORMANCE] خطأ في تحميل الفلاتر:', error);
    }
  }

  async function handleGeneratePerformanceComparison() {
    logger.log('🚀 [PERFORMANCE] بدء مقارنة أداء الكاشيرين...');

    try {
      const dateFrom = document.getElementById('performanceDateFrom').value;
      const dateTo = document.getElementById('performanceDateTo').value;
      const branchId = document.getElementById('performanceBranch').value;

      if (!dateFrom || !dateTo) {
        getDialogUtils().showValidationError('يرجى تحديد نطاق التواريخ');
        return;
      }

      if (new Date(dateFrom) > new Date(dateTo)) {
        getDialogUtils().showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
      }

      displayHandlers.showPerformanceLoading(true);
      displayHandlers.hidePerformanceResults();

      const performanceData = await generateCashierPerformanceData(dateFrom, dateTo, branchId);

      if (performanceData.cashiers.length === 0) {
        displayHandlers.showPerformanceLoading(false);
        getDialogUtils().showInfo('لا توجد بيانات كاشيرين في النطاق الزمني المحدد', 'لا توجد نتائج');
        return;
      }

      displayHandlers.displayPerformanceResults(performanceData);
      displayHandlers.showPerformanceLoading(false);
      displayHandlers.showPerformanceResults();

      logger.log('✅ [PERFORMANCE] تم إنشاء مقارنة الأداء بنجاح');
    } catch (error) {
      displayHandlers.showPerformanceLoading(false);
      logger.error('❌ [PERFORMANCE] خطأ في مقارنة الأداء:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء مقارنة الأداء.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء مقارنة الأداء: ${friendly}`, 'خطأ في المقارنة');
    }
  }

  async function generateCashierPerformanceData(dateFrom, dateTo, branchId) {
    logger.log('📊 [PERFORMANCE] جمع بيانات الأداء من قاعدة البيانات...');

    let branchFilter = '';
    const queryParams = [dateFrom, dateTo];

    if (branchId) {
      branchFilter = 'AND c.branch_id = ?';
      queryParams.push(branchId);
    }

    const cashierQuery = `
        SELECT
            c.id as cashier_id,
            c.name as cashier_name,
            c.cashier_number,
            b.branch_name,
            COUNT(r.id) as total_reconciliations,
            SUM(r.total_receipts) as total_sales,
            SUM(r.system_sales) as expected_sales,
            SUM(r.surplus_deficit) as total_deficit,
            AVG(r.surplus_deficit) as avg_deficit,
            SUM(CASE WHEN r.surplus_deficit >= 0 THEN 1 ELSE 0 END) as positive_days,
            SUM(CASE WHEN r.surplus_deficit < 0 THEN 1 ELSE 0 END) as negative_days,
            MIN(r.reconciliation_date) as first_date,
            MAX(r.reconciliation_date) as last_date
        FROM cashiers c
        LEFT JOIN branches b ON c.branch_id = b.id
        LEFT JOIN reconciliations r ON c.id = r.cashier_id
            AND DATE(r.reconciliation_date) BETWEEN ? AND ?
        WHERE c.active = 1 ${branchFilter}
        GROUP BY c.id, c.name, c.cashier_number, b.branch_name
        HAVING total_reconciliations > 0
        ORDER BY total_deficit DESC, total_sales DESC
    `;

    const cashiers = await ipcRenderer.invoke('db-query', cashierQuery, queryParams);

    const processedCashiers = cashiers.map((cashier) => {
      const accuracy = calculateAccuracyScore(cashier);
      const volume = calculateVolumeScore(cashier, cashiers);
      const consistency = calculateConsistencyScore(cashier);
      const overallRating = calculateOverallRating(accuracy, volume, consistency);

      return {
        ...cashier,
        accuracy_score: accuracy,
        volume_score: volume,
        consistency_score: consistency,
        overall_rating: overallRating,
        star_rating: Math.round(overallRating),
        performance_badge: getPerformanceBadge(overallRating),
        total_sales: parseFloat(cashier.total_sales) || 0,
        total_deficit: parseFloat(cashier.total_deficit) || 0,
        avg_deficit: parseFloat(cashier.avg_deficit) || 0
      };
    });

    processedCashiers.sort((a, b) => b.overall_rating - a.overall_rating);
    logger.log(`📊 [PERFORMANCE] تم معالجة ${processedCashiers.length} كاشير`);

    return {
      cashiers: processedCashiers,
      summary: generatePerformanceSummary(processedCashiers),
      dateRange: { from: dateFrom, to: dateTo }
    };
  }

  return {
    loadCashierPerformanceFilters,
    handleGeneratePerformanceComparison,
    generateCashierPerformanceData,
    displayPerformanceResults: displayHandlers.displayPerformanceResults,
    displayPerformanceSummary: displayHandlers.displayPerformanceSummary,
    displayCashierRanking: displayHandlers.displayCashierRanking,
    displayCashierCards: displayHandlers.displayCashierCards,
    showPerformanceLoading: displayHandlers.showPerformanceLoading,
    showPerformanceResults: displayHandlers.showPerformanceResults,
    hidePerformanceResults: displayHandlers.hidePerformanceResults,
    handleExportPerformancePdf: exportHandlers.handleExportPerformancePdf,
    generatePerformanceComprehensivePdfContent: exportHandlers.generatePerformanceComprehensivePdfContent
  };
}

module.exports = {
  createCashierPerformanceComparisonHandlers
};
