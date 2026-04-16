const { createDetailedAtmReportDataHandlers } = require('./detailed-atm-report-data');
const { createDetailedAtmReportDisplayHandlers } = require('./detailed-atm-report-display');
const { createDetailedAtmReportExportHandlers } = require('./detailed-atm-report-export');
const { mapDbErrorMessage } = require('./db-error-messages');

function createDetailedAtmReportManagementHandlers(deps) {
  const doc = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const getBootstrap = deps.getBootstrap || (() => globalThis.bootstrap);
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  const state = {
    currentDetailedReportData: [],
    filteredDetailedReportData: [],
    currentDetailedReportPage: 1,
    detailedReportPageSize: 50
  };

  const dataHandlers = createDetailedAtmReportDataHandlers({
    document: doc,
    ipcRenderer: deps.ipcRenderer,
    formatCurrency: deps.formatCurrency,
    formatDate: deps.formatDate,
    formatDateTime: deps.formatDateTime,
    logger
  });

  const displayHandlers = createDetailedAtmReportDisplayHandlers({
    document: doc,
    formatCurrency: deps.formatCurrency,
    state,
    logger
  });

  const exportHandlers = createDetailedAtmReportExportHandlers({
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    getDetailedAtmReportFilters: dataHandlers.getDetailedAtmReportFilters,
    getFilteredDetailedReportData: displayHandlers.getFilteredDetailedReportData,
    logger
  });

  async function handleShowDetailedAtmReportModal() {
    logger.log('📊 [DETAILED-ATM] فتح نافذة التقرير التحليلي المفصل...');

    try {
      await dataHandlers.loadDetailedAtmReportFilters();

      const bootstrapObj = getBootstrap();
      const modal = new bootstrapObj.Modal(doc.getElementById('detailedAtmReportModal'));
      modal.show();
    } catch (error) {
      logger.error('Error showing detailed ATM report modal:', error);
      getDialogUtils().showErrorToast('حدث خطأ أثناء فتح نافذة التقرير');
    }
  }

  async function handleGenerateDetailedAtmReport() {
    logger.log('📊 [DETAILED-ATM] إنشاء التقرير التحليلي المفصل...');

    try {
      const filters = dataHandlers.getDetailedAtmReportFilters();

      if (!filters.dateFrom || !filters.dateTo) {
        getDialogUtils().showValidationError('يرجى تحديد نطاق التواريخ');
        return;
      }

      if (new Date(filters.dateFrom) > new Date(filters.dateTo)) {
        getDialogUtils().showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
      }

      getDialogUtils().showLoading('جاري إنشاء التقرير التحليلي المفصل...', 'يرجى الانتظار');

      const detailedData = await dataHandlers.generateDetailedAtmReportData(filters);

      getDialogUtils().close();

      if (detailedData.length === 0) {
        getDialogUtils().showInfo('لا توجد عمليات في النطاق المحدد', 'لا توجد نتائج');
        doc.getElementById('detailedAtmReportResults').style.display = 'none';
        return;
      }

      state.currentDetailedReportData = detailedData;
      state.filteredDetailedReportData = [...detailedData];
      state.currentDetailedReportPage = 1;

      displayHandlers.displayDetailedAtmReportResults();

      getDialogUtils().showSuccessToast(`تم إنشاء التقرير بنجاح (${detailedData.length} عملية)`);
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error generating detailed ATM report:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء إنشاء التقرير.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء إنشاء التقرير: ${friendly}`, 'خطأ في التقرير');
    }
  }

  async function viewReconciliationDetails(reconciliationId) {
    const id = parseInt(reconciliationId, 10);
    if (!id || id <= 0) {
      getDialogUtils().showValidationError('معرف التصفية غير صالح');
      return;
    }

    if (typeof windowObj.viewReconciliation === 'function') {
      await windowObj.viewReconciliation(id);
      return;
    }

    if (typeof logger.warn === 'function') {
      logger.warn('viewReconciliation is not available for detailed report navigation');
    } else {
      logger.log('viewReconciliation is not available for detailed report navigation');
    }
    getDialogUtils().showInfo('لا يمكن فتح تفاصيل التصفية حالياً');
  }

  windowObj.changeDetailedReportPage = displayHandlers.changeDetailedReportPage;
  windowObj.viewReconciliationDetails = viewReconciliationDetails;

  return {
    handleShowDetailedAtmReportModal,
    loadDetailedAtmReportFilters: dataHandlers.loadDetailedAtmReportFilters,
    handleGenerateDetailedAtmReport,
    getDetailedAtmReportFilters: dataHandlers.getDetailedAtmReportFilters,
    generateDetailedAtmReportData: dataHandlers.generateDetailedAtmReportData,
    displayDetailedAtmReportResults: displayHandlers.displayDetailedAtmReportResults,
    handleDetailedReportSearch: displayHandlers.handleDetailedReportSearch,
    handleDetailedReportSort: displayHandlers.handleDetailedReportSort,
    handleDetailedReportPageSize: displayHandlers.handleDetailedReportPageSize,
    handleExportDetailedAtmReportExcel: exportHandlers.handleExportDetailedAtmReportExcel,
    changeDetailedReportPage: displayHandlers.changeDetailedReportPage,
    viewReconciliationDetails,
    getFilteredDetailedReportData: displayHandlers.getFilteredDetailedReportData
  };
}

module.exports = {
  createDetailedAtmReportManagementHandlers
};
