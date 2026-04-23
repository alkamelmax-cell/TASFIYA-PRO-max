const { mapDbErrorMessage } = require('./db-error-messages');

function createPrintWindowHandlers(deps) {
  const logger = deps.logger || console;
  const windowObj = deps.windowObj || globalThis;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  let printPreviewWindow = null;

  function generatePrintPreview(printOptions) {
    logger.log('🖼️ [NEW-PRINT] إنشاء معاينة الطباعة');

    try {
      const htmlContent = deps.generatePrintHTML(printOptions, true);

      if (printPreviewWindow && !printPreviewWindow.closed) {
        printPreviewWindow.close();
      }

      printPreviewWindow = windowObj.open('', 'printPreview', 'width=900,height=700,scrollbars=yes,resizable=yes');

      if (!printPreviewWindow) {
        deps.getDialogUtils().showError('فشل في فتح نافذة المعاينة. تأكد من السماح للنوافذ المنبثقة.', 'خطأ في المعاينة');
        return;
      }

      printPreviewWindow.document.write(htmlContent);
      printPreviewWindow.document.close();
      printPreviewWindow.focus();

      logger.log('✅ [NEW-PRINT] تم فتح معاينة الطباعة بنجاح');
    } catch (error) {
      logger.error('❌ [NEW-PRINT] خطأ في إنشاء معاينة الطباعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إنشاء نافذة معاينة الطباعة.'
      });
      deps.getDialogUtils().showError(`خطأ في إنشاء المعاينة: ${friendly}`, 'خطأ في النظام');
    }
  }

  function generateAndPrint(printOptions) {
    logger.log('🖨️ [NEW-PRINT] إنشاء المحتوى والطباعة المباشرة');

    try {
      const htmlContent = deps.generatePrintHTML(printOptions, false);
      const printWindow = windowObj.open('', 'printWindow', 'width=800,height=600');

      if (!printWindow) {
        deps.getDialogUtils().showError('فشل في فتح نافذة الطباعة. تأكد من السماح للنوافذ المنبثقة.', 'خطأ في الطباعة');
        return;
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      printWindow.onload = function onloadHandler() {
        setTimeoutFn(() => {
          printWindow.print();
          setTimeoutFn(() => {
            printWindow.close();
          }, 1000);
        }, 500);
      };

      logger.log('✅ [NEW-PRINT] تم إرسال المحتوى للطباعة');
      deps.getDialogUtils().showSuccessToast('تم إرسال التصفية للطباعة');
    } catch (error) {
      logger.error('❌ [NEW-PRINT] خطأ في الطباعة المباشرة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الطباعة المباشرة.'
      });
      deps.getDialogUtils().showError(`خطأ في الطباعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  return {
    generatePrintPreview,
    generateAndPrint
  };
}

module.exports = {
  createPrintWindowHandlers
};
