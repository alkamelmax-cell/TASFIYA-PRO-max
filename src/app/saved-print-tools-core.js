const { mapDbErrorMessage } = require('./db-error-messages');

function createSavedPrintToolsCoreHandlers(context) {
  const windowObj = context.windowObj || globalThis;
  const ipcRenderer = context.ipcRenderer;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const setCurrentPrintReconciliation = context.setCurrentPrintReconciliation || (() => {});
  const loadReconciliationForPrint = context.loadReconciliationForPrint;
  const showPrintSectionSelectionDialog = context.showPrintSectionSelectionDialog;
  const showThermalPrintSectionDialog = context.showThermalPrintSectionDialog;
  const generateAndPrint = context.generateAndPrint;
  const transformDataForPDFGenerator = context.transformDataForPDFGenerator;
  const printReconciliationAdvanced = context.printReconciliationAdvanced;

  async function quickPrintSavedReconciliation(reconciliationId) {
    console.log('⚡ [NEW-PRINT] طباعة سريعة للتصفية المحفوظة:', reconciliationId);

    try {
      const reconciliationData = await loadReconciliationForPrint(reconciliationId);

      if (!reconciliationData) {
        getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      setCurrentPrintReconciliation(reconciliationData);

      const printOptions = {
        sections: {
          bankReceipts: true,
          cashReceipts: true,
          postpaidSales: true,
          customerReceipts: true,
          returnInvoices: true,
          suppliers: true,
          summary: true
        },
        options: {
          pageSize: 'A4',
          orientation: 'portrait',
          fontSize: 'normal',
          colors: true
        }
      };

      generateAndPrint(printOptions);
    } catch (error) {
      console.error('❌ [NEW-PRINT] خطأ في الطباعة السريعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الطباعة السريعة.'
      });
      getDialogUtils().showError(`خطأ في الطباعة السريعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function generatePDFSavedReconciliation(reconciliationId) {
    console.log('📄 [NEW-PRINT] إنشاء PDF للتصفية المحفوظة:', reconciliationId);

    try {
      getDialogUtils().showLoading('جاري إنشاء ملف PDF...', 'يرجى الانتظار');
      const printData = await loadReconciliationForPrint(reconciliationId);

      if (!printData) {
        getDialogUtils().close();
        getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      const pdfData = transformDataForPDFGenerator(printData);
      const result = await ipcRenderer.invoke('generate-pdf', pdfData);

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
      console.error('❌ [NEW-PRINT] خطأ في إنشاء PDF:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إنشاء ملف PDF للتصفية.'
      });
      getDialogUtils().showError(`خطأ في إنشاء PDF: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function thermalPreviewSavedReconciliation(reconciliationId) {
    console.log('🔥 [THERMAL] معاينة الطباعة الحرارية للتصفية:', reconciliationId);

    try {
      getDialogUtils().showLoading('جاري تحضير البيانات...');
      const reconciliationData = await loadReconciliationForPrint(reconciliationId);

      if (!reconciliationData) {
        getDialogUtils().close();
        getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      windowObj.currentThermalReconciliationData = reconciliationData;
      windowObj.thermalPreviewMode = true;

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      getDialogUtils().close();
      showThermalPrintSectionDialog(reconciliationData);
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [THERMAL] خطأ في معاينة الطباعة الحرارية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر فتح معاينة الطباعة الحرارية.'
      });
      getDialogUtils().showError(`خطأ في معاينة الطباعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function thermalPrintSavedReconciliation(reconciliationId) {
    console.log('🔥 [THERMAL] طباعة حرارية للتصفية:', reconciliationId);

    try {
      getDialogUtils().showLoading('جاري تحضير البيانات...');
      const reconciliationData = await loadReconciliationForPrint(reconciliationId);

      if (!reconciliationData) {
        getDialogUtils().close();
        getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      windowObj.currentThermalReconciliationData = reconciliationData;
      windowObj.thermalPreviewMode = false;

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      getDialogUtils().close();
      showThermalPrintSectionDialog(reconciliationData);
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [THERMAL] خطأ في الطباعة الحرارية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الطباعة الحرارية.'
      });
      getDialogUtils().showError(`خطأ في الطباعة: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function quickPrintReconciliation(reconciliationId) {
    console.log('⚡ [PRINT] طباعة سريعة للتصفية - معرف:', reconciliationId);

    try {
      return await printReconciliationAdvanced(reconciliationId, {
        sections: {
          bankReceipts: true,
          cashReceipts: true,
          postpaidSales: true,
          customerReceipts: true,
          returnInvoices: true,
          suppliers: true,
          summary: true
        }
      });
    } catch (error) {
      console.error('❌ [PRINT] خطأ في الطباعة السريعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الطباعة السريعة.'
      });
      getDialogUtils().showError(`خطأ في الطباعة السريعة: ${friendly}`, 'خطأ في النظام');
      return false;
    }
  }

  function openPrintDialogWithData(reconciliationData) {
    if (!reconciliationData || !reconciliationData.reconciliation) {
      getDialogUtils().showError('لا توجد بيانات تصفية للطباعة', 'خطأ في البيانات');
      return false;
    }

    if (typeof showPrintSectionSelectionDialog !== 'function') {
      getDialogUtils().showError('ميزة طباعة A4 غير متاحة حالياً.', 'غير متاحة');
      return false;
    }

    setCurrentPrintReconciliation(reconciliationData);
    showPrintSectionSelectionDialog();
    return true;
  }

  async function closePrintPreview() {
    console.log('🖨️ [PRINT] إغلاق نافذة معاينة الطباعة...');

    try {
      const result = await ipcRenderer.invoke('close-print-preview');

      if (result.success) {
        console.log('✅ [PRINT] تم إغلاق نافذة معاينة الطباعة');
        return true;
      }

      console.log('⚠️ [PRINT] نافذة معاينة الطباعة غير موجودة');
      return true;
    } catch (error) {
      console.error('❌ [PRINT] خطأ في إغلاق نافذة معاينة الطباعة:', error);
      return false;
    }
  }

  return {
    quickPrintSavedReconciliation,
    generatePDFSavedReconciliation,
    thermalPreviewSavedReconciliation,
    thermalPrintSavedReconciliation,
    quickPrintReconciliation,
    openPrintDialogWithData,
    closePrintPreview
  };
}

module.exports = {
  createSavedPrintToolsCoreHandlers
};
