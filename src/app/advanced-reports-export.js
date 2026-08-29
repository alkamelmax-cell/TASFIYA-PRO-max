const { mapDbErrorMessage } = require('./db-error-messages');

function createAdvancedReportsExportHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const prepareAdvancedReportExcelData = context.prepareAdvancedReportExcelData;
  const determineReportType = context.determineReportType;
  const getCompanyName = context.getCompanyName;
  const getCurrentDate = context.getCurrentDate;
  const generateAdvancedReportTableHtml = context.generateAdvancedReportTableHtml;
  const buildAdvancedReportHtml = context.buildAdvancedReportHtml;
  const state = context.state;
  const logger = context.logger || console;

  async function handleExportAdvancedReportPdf() {
    if (!state.currentAdvancedReportData || state.currentAdvancedReportData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تصدير التقرير إلى PDF...', 'يرجى الانتظار');

      const reportTitle = doc.getElementById('advancedReportTitle').textContent;
      const reportHtml = await generateAdvancedReportHtml(state.currentAdvancedReportData, reportTitle);

      const result = await ipc.invoke('export-pdf', {
        html: reportHtml,
        filename: `advanced-report-${new Date().toISOString().split('T')[0]}.pdf`
      });

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم تصدير التقرير إلى PDF بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر تصدير التقرير المتقدم إلى PDF.'
        });
        getDialogUtils().showError(`فشل في تصدير PDF: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error exporting advanced report PDF:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تصدير PDF.'
        })
      );
    }
  }

  async function handleExportAdvancedReportExcel() {
    if (!state.currentAdvancedReportData || state.currentAdvancedReportData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للتصدير');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');

      const reportTitle = doc.getElementById('advancedReportTitle').textContent;
      const excelData = prepareAdvancedReportExcelData(state.currentAdvancedReportData, reportTitle);

      const result = await ipc.invoke('export-excel', {
        data: excelData,
        filename: `advanced-report-${new Date().toISOString().split('T')[0]}.xlsx`
      });

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر تصدير التقرير المتقدم إلى Excel.'
        });
        getDialogUtils().showError(`فشل في تصدير Excel: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error exporting advanced report Excel:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تصدير Excel.'
        })
      );
    }
  }

  async function handlePrintAdvancedReport() {
    if (!state.currentAdvancedReportData || state.currentAdvancedReportData.length === 0) {
      getDialogUtils().showValidationError('لا توجد بيانات تقرير للطباعة');
      return;
    }

    try {
      const printSettings = await ipc.invoke('get-print-settings');
      const reportTitle = doc.getElementById('advancedReportTitle').textContent;
      const reportHtml = await generateAdvancedReportHtml(state.currentAdvancedReportData, reportTitle);

      const result = await ipc.invoke('create-print-preview', {
        html: reportHtml,
        title: reportTitle,
        isColorPrint: printSettings.color !== false
      });

      if (result.success) {
        getDialogUtils().showSuccessToast('تم فتح نافذة معاينة الطباعة');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح معاينة طباعة التقرير المتقدم.'
        });
        getDialogUtils().showError(`فشل في فتح معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      logger.error('Error printing advanced report:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء طباعة التقرير.'
        })
      );
    }
  }

  async function generateAdvancedReportHtml(data, title, companyName = null) {
    const reportType = determineReportType(data);
    let selectedCompanyName = companyName;

    if (!selectedCompanyName) {
      selectedCompanyName = await getCompanyName();
    }

    return buildAdvancedReportHtml({
      title,
      companyName: selectedCompanyName,
      reportDate: getCurrentDate(),
      tableHtml: generateAdvancedReportTableHtml(data, reportType)
    });
  }

  return {
    handleExportAdvancedReportPdf,
    handleExportAdvancedReportExcel,
    handlePrintAdvancedReport,
    generateAdvancedReportHtml
  };
}

module.exports = {
  createAdvancedReportsExportHandlers
};
