const { createPostpaidSalesReportDataHelpers } = require('./postpaid-sales-report-data');
const { createPostpaidSalesReportFilters } = require('./postpaid-sales-report-filters');
const { createPostpaidSalesReportRenderHelpers } = require('./postpaid-sales-report-render');
const { createPostpaidSalesReportExportBuilders } = require('./postpaid-sales-report-export-builders');
const { mapDbErrorMessage } = require('./db-error-messages');

function createPostpaidSalesReportHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const getDialogUtils = deps.getDialogUtils;
  const getCompanyName = deps.getCompanyName;
  const getCurrentDate = deps.getCurrentDate;
  const formatDecimal = deps.formatDecimal;
  const formatDate = deps.formatDate;
  const logger = deps.logger || console;
  const itemsPerPage = deps.itemsPerPage || 20;

  const state = {
    currentData: [],
    currentPage: 1
  };

  function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function calculateReportSummary(data) {
    return {
      totalCustomers: data.length,
      totalPostpaid: data.reduce((sum, item) => sum + normalizeNumber(item.total_postpaid), 0),
      totalReceipts: data.reduce((sum, item) => sum + normalizeNumber(item.total_receipts), 0),
      totalNetBalance: data.reduce((sum, item) => sum + normalizeNumber(item.net_balance), 0)
    };
  }

  function getSelectedFilterLabel(selectId, fallbackLabel) {
    const select = doc.getElementById(selectId);
    if (!select || !Array.isArray(select.options) || select.options.length === 0) {
      return fallbackLabel;
    }

    const selectedIndex = Number.isFinite(Number(select.selectedIndex))
      ? Number(select.selectedIndex)
      : 0;
    const selectedOption = select.options[selectedIndex];
    const optionText = selectedOption && typeof selectedOption.text === 'string'
      ? selectedOption.text.trim()
      : '';
    return optionText || fallbackLabel;
  }

  function buildNetBalancesStructuredStatement({
    data,
    summary,
    companyName,
    reportDate,
    branchLabel,
    cashierLabel,
    filterInfo
  }) {
    const rows = data.map((item, index) => ({
      rowNumber: index + 1,
      customerName: item.customer_name || 'غير محدد',
      netBalance: normalizeNumber(item.net_balance),
      totalPostpaid: normalizeNumber(item.total_postpaid),
      totalReceipts: normalizeNumber(item.total_receipts),
      branchLabel: item.branch_label || 'غير محدد',
      movementsCount: normalizeNumber(item.movements_count),
      lastTxDate: item.last_tx_date ? formatDate(item.last_tx_date) : 'غير محدد'
    }));

    return JSON.stringify({
      isStructuredStatement: true,
      statementType: 'postpaid_net_balances',
      title: 'تقرير صافي أرصدة العملاء الآجلة',
      companyName: companyName || 'تصفية برو',
      printDate: reportDate,
      branchLabel,
      cashierLabel,
      filterInfo: filterInfo || '',
      tableData: rows,
      summary: {
        totalCustomers: normalizeNumber(summary.totalCustomers),
        totalPostpaid: normalizeNumber(summary.totalPostpaid),
        totalReceipts: normalizeNumber(summary.totalReceipts),
        totalNetBalance: normalizeNumber(summary.totalNetBalance)
      }
    });
  }

  async function buildPostpaidSalesThermalPayload() {
    const data = Array.isArray(state.currentData) ? state.currentData : [];
    const summary = calculateReportSummary(data);
    const filters = filterHelpers.getPostpaidSalesReportFilters();
    const filterInfo = filterHelpers.buildFilterInfo(filters);
    const companyName = await getCompanyName();
    const reportDate = getCurrentDate();
    const branchLabel = filters.branchFilter
      ? getSelectedFilterLabel('postpaidSalesBranchFilter', 'فرع محدد')
      : 'جميع الفروع';
    const cashierLabel = filters.cashierFilter
      ? getSelectedFilterLabel('postpaidSalesCashierFilter', 'كاشير محدد')
      : 'جميع الكاشير';

    return {
      reconciliation: {
        id: Date.now(),
        reconciliation_number: `POSTPAID-NET-${Date.now().toString().slice(-6)}`,
        reconciliation_date: reportDate,
        cashier_name: cashierLabel,
        branch_name: branchLabel,
        system_sales: summary.totalPostpaid,
        total_receipts: summary.totalReceipts,
        surplus_deficit: summary.totalNetBalance
      },
      branch: {
        branch_name: branchLabel,
        branch_address: '',
        branch_phone: ''
      },
      customText: buildNetBalancesStructuredStatement({
        data,
        summary,
        companyName,
        reportDate,
        branchLabel,
        cashierLabel,
        filterInfo
      }),
      isCustomerStatement: true,
      customerName: 'صافي أرصدة العملاء',
      totalPostpaid: summary.totalPostpaid,
      totalReceipts: summary.totalReceipts,
      balance: summary.totalNetBalance
    };
  }

  const filterHelpers = createPostpaidSalesReportFilters({
    document: doc,
    ipcRenderer: ipc,
    state,
    logger
  });

  const dataHelpers = createPostpaidSalesReportDataHelpers({
    ipcRenderer: ipc,
    logger
  });

  const renderHelpers = createPostpaidSalesReportRenderHelpers({
    document: doc,
    formatDecimal,
    formatDate,
    state,
    itemsPerPage,
    logger
  });

  const exportBuilders = createPostpaidSalesReportExportBuilders({
    getCompanyName,
    getCurrentDate,
    formatDecimal,
    formatDate,
    getPostpaidSalesReportFilters: filterHelpers.getPostpaidSalesReportFilters,
    buildFilterInfo: filterHelpers.buildFilterInfo,
    buildExcelFilterInfo: filterHelpers.buildExcelFilterInfo
  });

  async function handleGeneratePostpaidSalesReport() {
    logger.log('📊 [POSTPAID-SALES] إنشاء تقرير صافي أرصدة العملاء الآجلة...');
    const dialogUtils = getDialogUtils();

    try {
      const filters = filterHelpers.getPostpaidSalesReportFilters();
      logger.log('🔍 [POSTPAID-SALES] مرشحات التقرير:', filters);

      if (
        filters.reportMode === 'period_activity'
        && (!filters.dateFrom || !filters.dateTo)
      ) {
        dialogUtils.showValidationError('يرجى تحديد من وإلى تاريخ في وضع حركة الفترة');
        return;
      }

      if (filters.dateFrom && filters.dateTo && new Date(filters.dateFrom) > new Date(filters.dateTo)) {
        dialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
      }

      dialogUtils.showLoading('جاري إنشاء تقرير صافي أرصدة العملاء الآجلة...', 'يرجى الانتظار');
      const reportData = await dataHelpers.generatePostpaidSalesReportData(filters);
      dialogUtils.close();

      if (!reportData || reportData.length === 0) {
        dialogUtils.showInfo('لا توجد أرصدة آجلة للعملاء ضمن المعايير المحددة', 'لا توجد نتائج');
        doc.getElementById('postpaidSalesReportResultsCard').style.display = 'none';
        return;
      }

      state.currentData = reportData;
      state.currentPage = 1;
      renderHelpers.displayPostpaidSalesReportResults(reportData);
      logger.log('✅ [POSTPAID-SALES] تم إنشاء التقرير بنجاح');
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في إنشاء التقرير:', error);
      dialogUtils.close();
      dialogUtils.showError('حدث خطأ أثناء إنشاء تقرير صافي أرصدة العملاء الآجلة', 'خطأ');
    }
  }

  async function handleExportPostpaidSalesReportPdf() {
    if (!state.currentData || state.currentData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    const dialogUtils = getDialogUtils();
    try {
      dialogUtils.showLoading('جاري تصدير تقرير صافي أرصدة العملاء الآجلة إلى PDF...', 'يرجى الانتظار');
      const reportHtml = await exportBuilders.generatePostpaidSalesReportHtml(state.currentData);
      const filename = `تقرير_أرصدة_العملاء_الآجلة_${new Date().toISOString().split('T')[0]}.pdf`;
      const result = await ipc.invoke('export-pdf', { html: reportHtml, filename });
      dialogUtils.close();
      if (result.success) {
        dialogUtils.showSuccess(`تم تصدير التقرير بنجاح في:\n${result.filePath}`, 'تصدير ناجح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'فشل في تصدير التقرير'
        });
        dialogUtils.showError(friendly, 'خطأ في التصدير');
      }
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في تصدير PDF:', error);
      dialogUtils.close();
      dialogUtils.showError('حدث خطأ أثناء تصدير التقرير', 'خطأ');
    }
  }

  async function handleExportPostpaidSalesReportExcel() {
    if (!state.currentData || state.currentData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    const dialogUtils = getDialogUtils();
    try {
      dialogUtils.showLoading('جاري تصدير تقرير صافي أرصدة العملاء الآجلة إلى Excel...', 'يرجى الانتظار');
      const excelData = exportBuilders.preparePostpaidSalesReportExcelData(state.currentData);
      const filename = `تقرير_أرصدة_العملاء_الآجلة_${new Date().toISOString().split('T')[0]}.xlsx`;
      const result = await ipc.invoke('export-excel', { data: excelData, filename });
      dialogUtils.close();
      if (result.success) {
        dialogUtils.showSuccess(`تم تصدير التقرير بنجاح في:\n${result.filePath}`, 'تصدير ناجح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'فشل في تصدير التقرير'
        });
        dialogUtils.showError(friendly, 'خطأ في التصدير');
      }
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في تصدير Excel:', error);
      dialogUtils.close();
      dialogUtils.showError('حدث خطأ أثناء تصدير التقرير', 'خطأ');
    }
  }

  async function handlePrintPostpaidSalesReport() {
    if (!state.currentData || state.currentData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للطباعة');
      return;
    }

    try {
      const printSettings = await ipc.invoke('get-print-settings');
      const reportHtml = await exportBuilders.generatePostpaidSalesReportHtml(state.currentData);
      const result = await ipc.invoke('create-print-preview', {
        html: reportHtml,
        title: 'تقرير صافي أرصدة العملاء الآجلة',
        isColorPrint: printSettings.color !== false
      });

      if (result.success) {
        logger.log('✅ [POSTPAID-SALES] تم فتح معاينة الطباعة بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'فشل في فتح معاينة الطباعة'
        });
        getDialogUtils().showError(friendly, 'خطأ في الطباعة');
      }
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في الطباعة:', error);
      getDialogUtils().showError('حدث خطأ أثناء طباعة التقرير', 'خطأ');
    }
  }

  async function handlePreviewPostpaidSalesReportThermal() {
    if (!state.currentData || state.currentData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للمعاينة الحرارية');
      return;
    }

    const dialogUtils = getDialogUtils();
    try {
      dialogUtils.showLoading('جاري فتح المعاينة الحرارية...', 'يرجى الانتظار');
      const thermalPayload = await buildPostpaidSalesThermalPayload();
      const result = await ipc.invoke('thermal-printer-preview', thermalPayload);
      dialogUtils.close();

      if (result.success) {
        if (typeof dialogUtils.showSuccessToast === 'function') {
          dialogUtils.showSuccessToast('تم فتح المعاينة الحرارية لتقرير صافي الأرصدة');
        }
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح المعاينة الحرارية للتقرير'
        });
        dialogUtils.showError(friendly, 'خطأ في الطباعة الحرارية');
      }
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في المعاينة الحرارية:', error);
      dialogUtils.close();
      dialogUtils.showError('حدث خطأ أثناء المعاينة الحرارية للتقرير', 'خطأ');
    }
  }

  async function handlePrintPostpaidSalesReportThermal() {
    if (!state.currentData || state.currentData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للطباعة الحرارية');
      return;
    }

    const dialogUtils = getDialogUtils();
    try {
      dialogUtils.showLoading('جاري الإرسال إلى الطابعة الحرارية...', 'يرجى الانتظار');
      const thermalPayload = await buildPostpaidSalesThermalPayload();
      const settingsResult = await ipc.invoke('thermal-printer-settings-get');
      const printerSettings = settingsResult && settingsResult.success ? settingsResult.settings : {};
      const result = await ipc.invoke('thermal-printer-print', thermalPayload, printerSettings);
      dialogUtils.close();

      if (result.success) {
        if (typeof dialogUtils.showSuccess === 'function') {
          dialogUtils.showSuccess('تم إرسال تقرير صافي الأرصدة إلى الطابعة الحرارية بنجاح', 'نجاح الطباعة');
        }
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر إرسال التقرير إلى الطابعة الحرارية'
        });
        dialogUtils.showError(friendly, 'خطأ في الطباعة الحرارية');
      }
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في الطباعة الحرارية:', error);
      dialogUtils.close();
      dialogUtils.showError('حدث خطأ أثناء الطباعة الحرارية للتقرير', 'خطأ');
    }
  }

  return {
    getPostpaidSalesReportFilters: filterHelpers.getPostpaidSalesReportFilters,
    clearPostpaidSalesReportFilters: filterHelpers.clearPostpaidSalesReportFilters,
    loadPostpaidSalesReportFilters: filterHelpers.loadPostpaidSalesReportFilters,
    handlePostpaidSalesReportModeChange: filterHelpers.handlePostpaidSalesReportModeChange,
    generatePostpaidSalesReportData: dataHelpers.generatePostpaidSalesReportData,
    applyPostpaidSalesFilters: filterHelpers.applyPostpaidSalesFilters,
    handleGeneratePostpaidSalesReport,
    displayPostpaidSalesReportResults: renderHelpers.displayPostpaidSalesReportResults,
    displayPostpaidSalesReportSummary: renderHelpers.displayPostpaidSalesReportSummary,
    displayPostpaidSalesReportTable: renderHelpers.displayPostpaidSalesReportTable,
    setupPostpaidSalesReportPagination: renderHelpers.setupPostpaidSalesReportPagination,
    changePostpaidSalesReportPage: renderHelpers.changePostpaidSalesReportPage,
    handleExportPostpaidSalesReportPdf,
    handleExportPostpaidSalesReportExcel,
    handlePrintPostpaidSalesReport,
    handlePreviewPostpaidSalesReportThermal,
    handlePrintPostpaidSalesReportThermal,
    generatePostpaidSalesReportHtml: exportBuilders.generatePostpaidSalesReportHtml,
    preparePostpaidSalesReportExcelData: exportBuilders.preparePostpaidSalesReportExcelData,
    buildPostpaidSalesThermalPayload
  };
}

module.exports = {
  createPostpaidSalesReportHandlers
};
