const { mapDbErrorMessage } = require('./db-error-messages');

function createCashierPerformanceExportHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || globalThis;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const buildPerformanceComprehensivePdfContent = context.buildPerformanceComprehensivePdfContent;
  const formatCurrency = context.formatCurrency;
  const getCurrentDate = context.getCurrentDate;
  const logger = context.logger || console;

async function handleExportPerformancePdf() {
  logger.log('📄 [PERFORMANCE-PDF] بدء تصدير مقارنة أداء الكاشيرين...');

  try {
    const resultsSection = document.getElementById('performanceResults');
    if (!resultsSection || resultsSection.style.display === 'none') {
      getDialogUtils().showValidationError('يرجى إنشاء مقارنة الأداء أولاً');
      return;
    }

    if (!windowObj.currentPerformanceData || !windowObj.currentPerformanceData.cashiers) {
      getDialogUtils().showValidationError('لا توجد بيانات أداء متاحة للتصدير');
      return;
    }

    getDialogUtils().showLoading('جاري إنشاء تقرير PDF...', 'يرجى الانتظار قليلاً');

    const pdfHtmlContent = generatePerformanceComprehensivePdfContent();
    const exportData = {
      html: pdfHtmlContent,
      filename: `مقارنة_أداء_الكاشيرين_${new Date().toISOString().split('T')[0]}.pdf`
    };

    logger.log('📄 [PERFORMANCE-PDF] إرسال البيانات لمعالج PDF...');
    const result = await ipcRenderer.invoke('export-pdf', exportData);

    getDialogUtils().close();

    if (result.success) {
      logger.log('✅ [PERFORMANCE-PDF] تم تصدير PDF بنجاح:', result.filePath);
      getDialogUtils().showSuccess(`تم تصدير التقرير بنجاح في:\n${result.filePath}`, 'تصدير ناجح');
    } else {
      logger.error('❌ [PERFORMANCE-PDF] فشل التصدير:', result.error);
      const friendly = mapDbErrorMessage(result.error, {
        fallback: 'فشل في تصدير التقرير'
      });
      getDialogUtils().showError(friendly, 'خطأ في التصدير');
    }
  } catch (error) {
    getDialogUtils().close();
    logger.error('❌ [PERFORMANCE-PDF] خطأ في تصدير PDF:', error);
    const friendly = mapDbErrorMessage(error, {
      fallback: 'حدث خطأ أثناء تصدير التقرير.'
    });
    getDialogUtils().showError(`حدث خطأ أثناء التصدير: ${friendly}`, 'خطأ في النظام');
  }
}

function generatePerformanceComprehensivePdfContent() {
  logger.log('📄 [PERFORMANCE-PDF] إنشاء محتوى PDF شامل...');

  try {
    const dateFrom = document.getElementById('performanceDateFrom').value;
    const dateTo = document.getElementById('performanceDateTo').value;
    const branchSelect = document.getElementById('performanceBranch');
    const branchName = branchSelect.options[branchSelect.selectedIndex].text;

    const performanceData = windowObj.currentPerformanceData;
    if (!performanceData) {
      throw new Error('لا توجد بيانات أداء متاحة');
    }

    const htmlContent = buildPerformanceComprehensivePdfContent({
      dateFrom,
      dateTo,
      branchName,
      performanceData,
      reportDate: getCurrentDate(),
      formatCurrency
    });

    logger.log('✅ [PERFORMANCE-PDF] تم إنشاء محتوى PDF بنجاح');
    return htmlContent;
  } catch (error) {
    logger.error('❌ [PERFORMANCE-PDF] خطأ في إنشاء محتوى PDF:', error);
    throw error;
  }
}

  return {
    handleExportPerformancePdf,
    generatePerformanceComprehensivePdfContent
  };
}

module.exports = {
  createCashierPerformanceExportHandlers
};
