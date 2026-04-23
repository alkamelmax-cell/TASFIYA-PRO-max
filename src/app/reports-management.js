const { createReportsFilterHandlers } = require('./reports-filters');
const { createReportsDisplayHandlers } = require('./reports-display');
const { createReportsExportHandlers } = require('./reports-export');
const { mapDbErrorMessage } = require('./db-error-messages');

function createReportsManagementHandlers(deps) {
  const ipc = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  const defaultReportSettings = {
    default_format: 'pdf',
    default_date_range: 'week',
    reports_path: '',
    include_charts: true,
    include_summary: true,
    include_details: true,
    auto_open_reports: false,
    save_report_history: true,
    compress_reports: false
  };

  const state = {
    currentReportData: null,
    currentReportPage: 1,
    reportSort: {
      key: 'reconciliation_date',
      direction: 'desc'
    },
    reportSettings: { ...defaultReportSettings }
  };

  function parseBooleanSetting(value, fallbackValue) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallbackValue;
  }

  async function loadReportSettings() {
    try {
      const rows = await ipc.invoke(
        'db-all',
        'SELECT setting_key, setting_value FROM system_settings WHERE category = ?',
        ['reports']
      );

      const settingsMap = {};
      rows.forEach((row) => {
        settingsMap[row.setting_key] = row.setting_value;
      });

      state.reportSettings = {
        default_format: settingsMap.default_format || defaultReportSettings.default_format,
        default_date_range: settingsMap.default_date_range || defaultReportSettings.default_date_range,
        reports_path: settingsMap.reports_path || settingsMap.default_save_path || '',
        include_charts: parseBooleanSetting(settingsMap.include_charts, defaultReportSettings.include_charts),
        include_summary: parseBooleanSetting(settingsMap.include_summary, defaultReportSettings.include_summary),
        include_details: parseBooleanSetting(settingsMap.include_details, defaultReportSettings.include_details),
        auto_open_reports: parseBooleanSetting(settingsMap.auto_open_reports, defaultReportSettings.auto_open_reports),
        save_report_history: parseBooleanSetting(settingsMap.save_report_history, defaultReportSettings.save_report_history),
        compress_reports: parseBooleanSetting(settingsMap.compress_reports, defaultReportSettings.compress_reports)
      };
    } catch (error) {
      logger.warn('⚠️ [REPORTS] تعذر تحميل إعدادات التقارير، سيتم استخدام الافتراضي', error);
      state.reportSettings = { ...defaultReportSettings };
    }

    return state.reportSettings;
  }

  const filterHandlers = createReportsFilterHandlers({
    document: deps.document,
    ipcRenderer: ipc,
    state,
    getDialogUtils,
    logger
  });

  const displayHandlers = createReportsDisplayHandlers({
    document: deps.document,
    windowObj,
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    generateReportSummary: deps.generateReportSummary,
    state,
    itemsPerPage: deps.itemsPerPage || 20,
    logger
  });

  const exportHandlers = createReportsExportHandlers({
    ipcRenderer: ipc,
    getDialogUtils,
    getCompanyName: deps.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    generateReportSummary: deps.generateReportSummary,
    prepareExcelData: deps.prepareExcelData,
    buildReconciliationReportHtml: deps.buildReconciliationReportHtml,
    getReportSettings: loadReportSettings,
    getReportOutputData: () => displayHandlers.getSortedReportData(state.currentReportData),
    getReportSortMeta: () => displayHandlers.getCurrentReportSortMeta(),
    formatDate: deps.formatDate,
    formatCurrency: deps.formatCurrency,
    state,
    logger
  });

  async function handleGenerateReport() {
    logger.log('📊 [REPORTS] إنشاء تقرير التصفيات...');

    try {
      const filters = filterHandlers.getReportFilters();
      const validation = filterHandlers.validateReportFilters(filters);
      if (!validation.isValid) {
        getDialogUtils().showValidationError(validation.errors.join('\n'));
        return;
      }

      getDialogUtils().showLoading('جاري إنشاء التقرير...', 'يرجى الانتظار');
      const { query, params } = filterHandlers.buildReportQuery(filters);
      const reconciliations = await ipc.invoke('db-all', query, params);
      const reportSettings = await loadReportSettings();

      state.currentReportData = reconciliations;
      state.currentReportPage = 1;
      await displayHandlers.displayReportResults(reconciliations, reportSettings);

      getDialogUtils().close();
      if (reconciliations.length === 0) {
        getDialogUtils().showInfo('لا توجد نتائج مطابقة للمرشحات الحالية', 'لا توجد بيانات');
      } else {
        getDialogUtils().showSuccessToast(`تم إنشاء التقرير بنجاح (${reconciliations.length} تصفية)`);
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('❌ [REPORTS] خطأ في إنشاء التقرير:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء إنشاء التقرير.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء إنشاء التقرير: ${friendly}`, 'خطأ في التقرير');
    }
  }

  windowObj.changeReportPage = displayHandlers.changeReportPage;

  return {
    loadAdvancedReportFilters: filterHandlers.loadAdvancedReportFilters,
    loadEnhancedReportFilters: filterHandlers.loadEnhancedReportFilters,
    handleReportBranchFilterChange: filterHandlers.handleReportBranchFilterChange,
    handleGenerateReport,
    handleExportReportPdf: exportHandlers.handleExportReportPdf,
    handleExportReportExcel: exportHandlers.handleExportReportExcel,
    handlePrintReportsData: exportHandlers.handlePrintReportsData,
    handleClearReportFilters: filterHandlers.handleClearReportFilters,
    toggleSummaryView: displayHandlers.toggleSummaryView,
    toggleChartView: displayHandlers.toggleChartView,
    changeReportPage: displayHandlers.changeReportPage,
    generateReportHtml: exportHandlers.generateReportHtml
  };
}

module.exports = {
  createReportsManagementHandlers
};
