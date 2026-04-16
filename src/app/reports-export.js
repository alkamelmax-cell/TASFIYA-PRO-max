const { mapDbErrorMessage } = require('./db-error-messages');

function createReportsExportHandlers(context) {
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const getCompanyName = context.getCompanyName;
  const getCurrentDate = context.getCurrentDate;
  const generateReportSummary = context.generateReportSummary;
  const prepareExcelData = context.prepareExcelData;
  const buildReconciliationReportHtml = context.buildReconciliationReportHtml;
  const getReportSettings = context.getReportSettings;
  const getReportOutputData = context.getReportOutputData;
  const getReportSortMeta = context.getReportSortMeta;
  const formatDate = context.formatDate;
  const formatCurrency = context.formatCurrency;
  const state = context.state;
  const logger = context.logger || console;
  const REPORT_SORT_LABELS = {
    reconciliation_number: 'رقم التصفية',
    reconciliation_date: 'التاريخ',
    branch_name: 'الفرع',
    cashier_name: 'الكاشير',
    accountant_name: 'المحاسب',
    total_receipts: 'إجمالي المقبوضات',
    system_sales: 'مبيعات النظام',
    surplus_deficit: 'الفائض/العجز',
    status: 'الحالة'
  };

  function createFallbackReportSettings() {
    return {
      include_summary: true,
      include_details: true,
      auto_open_reports: false,
      save_report_history: true,
      compress_reports: false
    };
  }

  async function readReportSettings() {
    try {
      if (typeof getReportSettings === 'function') {
        return await getReportSettings();
      }
    } catch (error) {
      logger.warn('⚠️ [REPORTS] تعذر قراءة إعدادات التقارير أثناء التصدير', error);
    }

    return createFallbackReportSettings();
  }

  function resolveReportDataForOutput() {
    if (typeof getReportOutputData === 'function') {
      const resolvedRows = getReportOutputData();
      if (Array.isArray(resolvedRows)) {
        return resolvedRows;
      }
    }

    return Array.isArray(state.currentReportData) ? state.currentReportData : [];
  }

  function resolveReportSortMeta() {
    if (typeof getReportSortMeta === 'function') {
      const sortMeta = getReportSortMeta();
      if (sortMeta && typeof sortMeta === 'object') {
        return sortMeta;
      }
    }

    const fallbackKey = state?.reportSort?.key || 'reconciliation_date';
    const fallbackDirection = state?.reportSort?.direction === 'asc' ? 'asc' : 'desc';
    const columnLabel = REPORT_SORT_LABELS[fallbackKey] || 'التاريخ';
    const directionLabel = fallbackDirection === 'asc' ? 'تصاعدي' : 'تنازلي';

    return {
      key: fallbackKey,
      direction: fallbackDirection,
      columnLabel,
      directionLabel,
      displayText: `${columnLabel} (${directionLabel})`
    };
  }

  async function handleExportReportPdf() {
    const reportRows = resolveReportDataForOutput();
    if (reportRows.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تصدير التقرير إلى PDF...', 'يرجى الانتظار');
      const reportSettings = await readReportSettings();

      const reportHtml = await generateReportHtml(reportRows, null, reportSettings);
      const result = await ipc.invoke('export-pdf', {
        html: reportHtml,
        filename: `reconciliation-report-${new Date().toISOString().split('T')[0]}.pdf`,
        autoOpen: reportSettings.auto_open_reports === true,
        saveHistory: reportSettings.save_report_history !== false,
        reportType: 'reconciliation',
        reportTitle: 'تقرير التصفيات'
      });

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم تصدير التقرير إلى PDF بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر تصدير التقرير إلى PDF.'
        });
        getDialogUtils().showError(`فشل في تصدير PDF: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error exporting PDF:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تصدير PDF.'
        })
      );
    }
  }

  async function handleExportReportExcel() {
    const reportRows = resolveReportDataForOutput();
    if (reportRows.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');
      const reportSettings = await readReportSettings();

      const excelData = prepareExcelData(reportRows, {
        includeDetails: reportSettings.include_details !== false
      });
      const result = await ipc.invoke('export-excel', {
        data: excelData,
        filename: `reconciliation-report-${new Date().toISOString().split('T')[0]}.xlsx`,
        autoOpen: reportSettings.auto_open_reports === true,
        saveHistory: reportSettings.save_report_history !== false,
        compress: reportSettings.compress_reports === true,
        reportType: 'reconciliation',
        reportTitle: 'تقرير التصفيات'
      });

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر تصدير التقرير إلى Excel.'
        });
        getDialogUtils().showError(`فشل في تصدير Excel: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error exporting Excel:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تصدير Excel.'
        })
      );
    }
  }

  async function handlePrintReportsData() {
    const reportRows = resolveReportDataForOutput();
    if (reportRows.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للطباعة');
      return;
    }

    try {
      const printSettings = await ipc.invoke('get-print-settings');
      const reportSettings = await readReportSettings();

      const reportHtml = await generateReportHtml(reportRows, null, reportSettings);
      const result = await ipc.invoke('create-print-preview', {
        html: reportHtml,
        title: 'تقرير التصفيات',
        isColorPrint: printSettings.color !== false
      });

      if (result.success) {
        getDialogUtils().showSuccessToast('تم فتح نافذة معاينة الطباعة');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح معاينة الطباعة للتقرير.'
        });
        getDialogUtils().showError(`فشل في فتح معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      logger.error('Error printing report:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء طباعة التقرير.'
        })
      );
    }
  }

  async function generateReportHtml(reconciliations, companyName = null, reportSettings = null) {
    const reportRows = Array.isArray(reconciliations) ? reconciliations : resolveReportDataForOutput();
    const summary = generateReportSummary(reportRows);
    const sortMeta = resolveReportSortMeta();
    let selectedCompanyName = companyName;
    const resolvedReportSettings = reportSettings || createFallbackReportSettings();

    if (!selectedCompanyName) {
      selectedCompanyName = await getCompanyName();
    }

    return buildReconciliationReportHtml({
      reconciliations: reportRows,
      companyName: selectedCompanyName,
      summary,
      reportDate: getCurrentDate(),
      sortMeta,
      includeSummary: resolvedReportSettings.include_summary !== false,
      includeDetails: resolvedReportSettings.include_details !== false,
      formatCurrency,
      formatDate
    });
  }

  return {
    handleExportReportPdf,
    handleExportReportExcel,
    handlePrintReportsData,
    generateReportHtml
  };
}

module.exports = {
  createReportsExportHandlers
};
