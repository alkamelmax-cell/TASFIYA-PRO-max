const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationOperationsPrintHandlers(context) {
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const showAdvancedPrintDialog = context.showAdvancedPrintDialog || (async () => {});
  const loadReconciliationForPrint = context.loadReconciliationForPrint || (async () => null);
  const transformDataForPDFGenerator = context.transformDataForPDFGenerator || ((value) => value);
  const prepareReconciliationDataById = context.prepareReconciliationDataById;
  const logger = context.logger || console;

  async function printReconciliation(id) {
    try {
      const reconciliationData = await prepareReconciliationDataById(id);
      await showAdvancedPrintDialog(reconciliationData);
    } catch (error) {
      logger.error('Error printing reconciliation:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء طباعة التصفية.'
        })
      );
    }
  }

  async function generatePDFReconciliation(id) {
    logger.log('📄 [LEGACY-PDF] إنشاء PDF للتصفية (دالة قديمة):', id);

    try {
      getDialogUtils().showLoading('جاري إنشاء ملف PDF...', 'يرجى الانتظار');

      const printData = await loadReconciliationForPrint(id);
      if (!printData) {
        getDialogUtils().close();
        getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      const pdfData = transformDataForPDFGenerator(printData);
      const result = await ipc.invoke('generate-pdf', pdfData);

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
      } else {
        const friendly = mapDbErrorMessage(result.message || result.error, {
          fallback: 'تعذر إنشاء ملف PDF للتصفية.'
        });
        getDialogUtils().showError(`فشل في إنشاء التقرير: ${friendly}`, 'خطأ في إنشاء التقرير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('❌ [LEGACY-PDF] خطأ في إنشاء PDF:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إنشاء ملف PDF للتصفية.'
      });
      getDialogUtils().showError(`خطأ في إنشاء PDF: ${friendly}`, 'خطأ في النظام');
    }
  }

  return {
    printReconciliation,
    generatePDFReconciliation
  };
}

module.exports = {
  createReconciliationOperationsPrintHandlers
};
