const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationUiPrintActions(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const DialogUtils = context.DialogUtils;
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const getBankReceipts = context.getBankReceipts;
  const getCashReceipts = context.getCashReceipts;
  const getPostpaidSales = context.getPostpaidSales;
  const getCustomerReceipts = context.getCustomerReceipts;
  const getReturnInvoices = context.getReturnInvoices;
  const getSuppliers = context.getSuppliers;
  const showPrintSectionDialogForNewReconciliation = context.showPrintSectionDialogForNewReconciliation;
  const prepareReconciliationData = context.prepareReconciliationData;
  const preparePrintData = context.preparePrintData;
  const logger = context.logger || console;
  const PDF_REQUEST_TIMEOUT_MS = 90000;

  function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  async function handlePrintReport() {
    if (!getCurrentReconciliation()) {
      DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
      return;
    }

    try {
      logger.log('🖨️ [PRINT] بدء طباعة التصفية الجديدة مع خيارات الأقسام...');
      const selectedSections = await showPrintSectionDialogForNewReconciliation();

      if (!selectedSections) {
        logger.log('⚠️ [PRINT] تم إلغاء الطباعة من قبل المستخدم');
        return;
      }

      const reconciliationData = await prepareReconciliationData();
      const printSettings = await ipcRenderer.invoke('get-print-settings');
      const printData = preparePrintData(reconciliationData, {
        ...selectedSections,
        color: printSettings.color !== false
      });

      logger.log('📊 [PRINT] بيانات الطباعة جاهزة:', {
        reconciliationId: printData.reconciliation.id,
        sectionsCount: Object.keys(printData.sections).length,
        selectedSections: selectedSections.sections
      });

      const result = await ipcRenderer.invoke('create-print-preview', printData);
      if (result.success) {
        logger.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة بنجاح');
        DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
      } else {
        logger.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح نافذة معاينة الطباعة.'
        });
        DialogUtils.showError(`فشل في إنشاء نافذة معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      logger.error('Error preparing print:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تحضير الطباعة.'
        })
      );
    }
  }

  async function handleQuickPrint() {
    logger.log('⚡ [PRINT] طباعة سريعة للتصفية الجديدة...');

    const currentReconciliation = getCurrentReconciliation();
    if (!currentReconciliation) {
      logger.error('❌ [PRINT] لا توجد تصفية حالية للطباعة السريعة');
      DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
      return;
    }

    try {
      const bankReceipts = getBankReceipts();
      const cashReceipts = getCashReceipts();
      const postpaidSales = getPostpaidSales();
      const customerReceipts = getCustomerReceipts();
      const returnInvoices = getReturnInvoices();
      const suppliers = getSuppliers();

      logger.log('📊 [PRINT] فحص البيانات للطباعة السريعة:', {
        currentReconciliation: !!currentReconciliation,
        reconciliationId: currentReconciliation.id,
        bankReceipts: bankReceipts.length,
        cashReceipts: cashReceipts.length,
        postpaidSales: postpaidSales.length,
        customerReceipts: customerReceipts.length,
        returnInvoices: returnInvoices.length,
        suppliers: suppliers.length
      });

      const hasData = bankReceipts.length > 0 ||
        cashReceipts.length > 0 ||
        postpaidSales.length > 0 ||
        customerReceipts.length > 0 ||
        returnInvoices.length > 0 ||
        suppliers.length > 0;

      if (!hasData) {
        logger.warn('⚠️ [PRINT] لا توجد بيانات للطباعة السريعة');
        DialogUtils.showValidationError('لا توجد بيانات مقبوضات أو مبيعات للطباعة. يرجى إضافة بعض البيانات أولاً.');
        return;
      }

      const reconciliationData = await prepareReconciliationData();
      const printSettings = await ipcRenderer.invoke('get-print-settings');
      const printData = preparePrintData(reconciliationData, {
        sections: {
          bankReceipts: true,
          cashReceipts: true,
          postpaidSales: true,
          customerReceipts: true,
          returnInvoices: true,
          suppliers: true,
          summary: true
        },
        pageSize: 'A4',
        orientation: 'portrait',
        fontSize: printSettings.fontSize || 'normal',
        fontFamily: printSettings.fontFamily || 'Cairo',
        color: printSettings.color !== false
      });

      logger.log('📊 [PRINT] بيانات الطباعة السريعة جاهزة:', {
        reconciliationId: printData.reconciliation.id,
        sectionsCount: Object.keys(printData.sections).length,
        totalReceipts: reconciliationData.summary.totalReceipts
      });

      const result = await ipcRenderer.invoke('create-print-preview', printData);
      if (result.success) {
        logger.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة السريعة بنجاح');
        DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
      } else {
        logger.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح نافذة معاينة الطباعة السريعة.'
        });
        DialogUtils.showError(`فشل في إنشاء نافذة معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      logger.error('❌ [PRINT] خطأ في الطباعة السريعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء الطباعة السريعة.'
      });
      DialogUtils.showError(`حدث خطأ أثناء الطباعة السريعة: ${friendly}`, 'خطأ في الطباعة');
    }
  }

  async function handleSavePdf() {
    if (!getCurrentReconciliation()) {
      DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
      return;
    }

    const pdfBtn = document.getElementById('savePdfBtn');
    const originalText = pdfBtn ? pdfBtn.innerHTML : '<i class="icon">📄</i> حفظ PDF';

    try {
      const reconciliationData = await prepareReconciliationData();
      if (pdfBtn) {
        pdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري إنشاء PDF...';
        pdfBtn.disabled = true;
      }

      const result = await withTimeout(
        ipcRenderer.invoke('generate-pdf', reconciliationData),
        PDF_REQUEST_TIMEOUT_MS,
        'انتهت مهلة إنشاء PDF. حاول مرة أخرى.'
      );

      if (result.success) {
        DialogUtils.showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
      } else {
        const friendly = mapDbErrorMessage(result.message || result.error, {
          fallback: 'تعذر إنشاء ملف PDF للتصفية.'
        });
        DialogUtils.showError(`فشل في إنشاء التقرير: ${friendly}`, 'خطأ في إنشاء التقرير');
      }
    } catch (error) {
      logger.error('Error generating PDF:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء إنشاء ملف PDF.'
        })
      );
    } finally {
      if (pdfBtn) {
        pdfBtn.innerHTML = originalText;
        pdfBtn.disabled = false;
      }
    }
  }

  return {
    handlePrintReport,
    handleQuickPrint,
    handleSavePdf
  };
}

module.exports = {
  createReconciliationUiPrintActions
};
