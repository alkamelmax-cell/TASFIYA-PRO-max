const { createAdvancedPrintDataPrepHandlers } = require('./advanced-print-data-prep');
const { mapDbErrorMessage } = require('./db-error-messages');

function createAdvancedPrintWorkflowHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getBootstrap = deps.getBootstrap;
  const initializePrintSystem = deps.initializePrintSystem;
  const getPrintSettings = deps.getPrintSettings;
  const getAvailablePrinters = deps.getAvailablePrinters || (() => []);
  const getCurrentPrintData = deps.getCurrentPrintData || (() => null);
  const setCurrentPrintData = deps.setCurrentPrintData || (() => {});
  const logger = deps.logger || console;
  const parsedDirectPrintTimeout = Number.parseInt(deps.directPrintTimeoutMs, 10);
  const directPrintTimeoutMs = Number.isFinite(parsedDirectPrintTimeout) && parsedDirectPrintTimeout > 0
    ? parsedDirectPrintTimeout
    : 30000;

  const dataPrepHandlers = createAdvancedPrintDataPrepHandlers({
    windowObj: deps.windowObj || globalThis,
    logger,
    defaultCompanyName: deps.defaultCompanyName || 'نظام تصفية الكاشير'
  });

  async function invokeWithTimeout(channel, args = [], timeoutMs = 45000) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error('انتهت مهلة استجابة الطباعة');
        timeoutError.code = 'DIRECT_PRINT_TIMEOUT';
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        ipcRenderer.invoke(channel, ...args),
        timeoutPromise
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function showAdvancedPrintDialog(reconciliationData) {
    try {
      setCurrentPrintData(reconciliationData);

      if (getAvailablePrinters().length === 0) {
        await initializePrintSystem();
      }

      const modal = new (getBootstrap().Modal)(document.getElementById('printOptionsModal'));
      modal.show();
    } catch (error) {
      logger.error('Error showing print dialog:', error);
      getDialogUtils().showErrorToast('حدث خطأ في عرض خيارات الطباعة');
    }
  }

  async function handleDirectPrint() {
    const currentPrintData = getCurrentPrintData();
    if (!currentPrintData) {
      getDialogUtils().showErrorToast('لا توجد بيانات للطباعة');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري الطباعة...', 'يرجى الانتظار');

      const printSettings = getPrintSettings();
      await ipcRenderer.invoke('update-print-settings', printSettings);

      const printData = dataPrepHandlers.preparePrintData(currentPrintData, {
        sections: dataPrepHandlers.getAllSectionsEnabled(),
        pageSize: printSettings.paperSize || 'A4',
        orientation: printSettings.orientation || 'portrait',
        fontSize: printSettings.fontSize || 'normal',
        fontFamily: printSettings.fontFamily || 'Cairo',
        color: printSettings.color || false
      });

      const result = await invokeWithTimeout(
        'print-direct',
        [printData, printSettings],
        directPrintTimeoutMs
      );
      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم إرسال المستند للطباعة بنجاح');

        const modal = getBootstrap().Modal.getInstance(document.getElementById('printOptionsModal'));
        if (modal) {
          modal.hide();
        }
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'خطأ غير معروف'
        });
        getDialogUtils().showError(`فشل في الطباعة: ${friendly}`);
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Direct print error:', error);
      if (error && error.code === 'DIRECT_PRINT_TIMEOUT') {
        getDialogUtils().showErrorToast('استغرقت الطباعة وقتًا أطول من المتوقع. تحقق من الطابعة ثم أعد المحاولة.');
        return;
      }
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء الطباعة.'
        })
      );
    }
  }

  async function handlePrintPreview() {
    logger.log('🖨️ [PREVIEW] بدء معاينة الطباعة...');

    const currentPrintData = getCurrentPrintData();
    if (!currentPrintData) {
      logger.error('❌ [PREVIEW] لا توجد بيانات للطباعة');
      getDialogUtils().showErrorToast('لا توجد بيانات للطباعة');
      return;
    }

    logger.log('📊 [PREVIEW] فحص بيانات الطباعة:', {
      hasReconciliation: !!currentPrintData.reconciliation,
      reconciliationId: currentPrintData.reconciliation?.id,
      dataStructure: Object.keys(currentPrintData)
    });

    if (!currentPrintData.reconciliation) {
      logger.error('❌ [PREVIEW] بيانات التصفية الأساسية مفقودة');
      getDialogUtils().showError('بيانات التصفية الأساسية مفقودة', 'بيانات غير مكتملة');
      return;
    }

    const reconciliation = currentPrintData.reconciliation;
    const missingFields = [];

    if (!reconciliation.id) missingFields.push('معرف التصفية');
    if (!reconciliation.cashier_name) missingFields.push('اسم الكاشير');
    if (!reconciliation.accountant_name) missingFields.push('اسم المحاسب');
    if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');

    if (missingFields.length > 0) {
      logger.error('❌ [PREVIEW] حقول مفقودة في بيانات التصفية:', missingFields);
      getDialogUtils().showError(`الحقول التالية مفقودة في بيانات التصفية: ${missingFields.join(', ')}`, 'بيانات غير مكتملة');
      return;
    }

    try {
      logger.log('⚙️ [PREVIEW] تحضير إعدادات الطباعة...');
      getDialogUtils().showLoading('جاري تحضير المعاينة...', 'يرجى الانتظار');

      const printSettings = getPrintSettings();
      if (!printSettings) {
        throw new Error('إعدادات الطباعة غير صحيحة');
      }

      logger.log('📋 [PREVIEW] إعدادات الطباعة:', {
        printerName: printSettings.printerName,
        copies: printSettings.copies,
        paperSize: printSettings.paperSize,
        orientation: printSettings.orientation
      });

      const dbPrintSettings = await ipcRenderer.invoke('get-print-settings');

      const printData = dataPrepHandlers.preparePrintData(currentPrintData, {
        sections: dataPrepHandlers.getAllSectionsEnabled(),
        pageSize: printSettings.paperSize || 'A4',
        orientation: printSettings.orientation || 'portrait',
        fontSize: printSettings.fontSize || 'normal',
        fontFamily: printSettings.fontFamily || 'Cairo',
        color: dbPrintSettings.color !== false
      });

      logger.log('✅ [PREVIEW] البيانات المحضرة للطباعة:', {
        reconciliation: !!printData.reconciliation.id,
        sectionsCount: Object.keys(printData.sections).length,
        hasOptions: !!printData.options
      });

      logger.log('🖼️ [PREVIEW] إنشاء نافذة معاينة الطباعة...');
      const result = await ipcRenderer.invoke('create-print-preview', printData);

      getDialogUtils().close();

      if (result && result.success) {
        logger.log('✅ [PREVIEW] تم فتح نافذة المعاينة بنجاح');
        getDialogUtils().showSuccessToast('تم فتح نافذة المعاينة');

        const modal = getBootstrap().Modal.getInstance(document.getElementById('printOptionsModal'));
        if (modal) {
          modal.hide();
        }
      } else {
        logger.error('❌ [PREVIEW] فشل في عرض المعاينة:', result?.error);
        const friendly = mapDbErrorMessage(result?.error, {
          fallback: 'خطأ غير معروف'
        });
        getDialogUtils().showError(`فشل في عرض المعاينة: ${friendly}`, 'خطأ في المعاينة');
      }
    } catch (error) {
      getDialogUtils().close();
      const rawMessage = String(error && error.message ? error.message : '');
      logger.error('❌ [PREVIEW] خطأ في معاينة الطباعة:', {
        error: rawMessage,
        stack: error.stack,
        currentPrintData: !!currentPrintData
      });

      if (rawMessage.includes('print-manager')) {
        getDialogUtils().showError('خطأ في وحدة إدارة الطباعة. يرجى المحاولة مرة أخرى.', 'خطأ في الطباعة');
      } else if (rawMessage.includes('HTML')) {
        getDialogUtils().showError('خطأ في إنتاج محتوى الطباعة. تحقق من اكتمال البيانات.', 'خطأ في المحتوى');
      } else {
        const friendly = mapDbErrorMessage(error, {
          fallback: 'خطأ غير معروف'
        });
        getDialogUtils().showError(`حدث خطأ في عرض المعاينة: ${friendly}`, 'خطأ في النظام');
      }
    }
  }

  async function printReconciliationAdvanced(reconciliationId, options = {}) {
    logger.log('🖨️ [PRINT] بدء الطباعة المتقدمة للتصفية - معرف:', reconciliationId);

    try {
      if (!reconciliationId) {
        logger.error('❌ [PRINT] معرف التصفية مطلوب');
        getDialogUtils().showValidationError('معرف التصفية مطلوب للطباعة');
        return false;
      }

      getDialogUtils().showLoading('جاري تحضير بيانات الطباعة...', 'يرجى الانتظار');

      logger.log('📊 [PRINT] تحميل بيانات التصفية للطباعة...');
      const reconciliationData = await ipcRenderer.invoke('get-reconciliation-for-edit', reconciliationId);

      if (!reconciliationData || !reconciliationData.reconciliation) {
        getDialogUtils().close();
        logger.error('❌ [PRINT] فشل في تحميل بيانات التصفية');
        getDialogUtils().showError('فشل في تحميل بيانات التصفية للطباعة', 'خطأ في البيانات');
        return false;
      }

      const printSettings = await ipcRenderer.invoke('get-print-settings');
      const mergedOptions = {
        ...options,
        color: printSettings.color !== undefined ? printSettings.color : (options.color !== false)
      };

      const printData = dataPrepHandlers.preparePrintData(reconciliationData, mergedOptions);

      logger.log('📄 [PRINT] بيانات الطباعة جاهزة:', {
        reconciliationId: printData.reconciliation.id,
        sectionsCount: Object.keys(printData.sections).length,
        hasOptions: !!printData.options
      });

      getDialogUtils().close();

      logger.log('🖨️ [PRINT] إنشاء نافذة معاينة الطباعة...');
      const result = await ipcRenderer.invoke('create-print-preview', printData);

      if (result.success) {
        logger.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة بنجاح');
        getDialogUtils().showSuccessToast('تم فتح نافذة معاينة الطباعة');
        return true;
      }

      logger.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
      const friendly = mapDbErrorMessage(result.error, {
        fallback: 'تعذر فتح نافذة معاينة الطباعة.'
      });
      getDialogUtils().showError(`فشل في إنشاء نافذة معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      return false;
    } catch (error) {
      getDialogUtils().close();
      logger.error('❌ [PRINT] خطأ في الطباعة المتقدمة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ عملية الطباعة.'
      });
      getDialogUtils().showError(`خطأ في الطباعة: ${friendly}`, 'خطأ في النظام');
      return false;
    }
  }

  return {
    showAdvancedPrintDialog,
    handleDirectPrint,
    handlePrintPreview,
    printReconciliationAdvanced,
    preparePrintData: dataPrepHandlers.preparePrintData
  };
}

module.exports = {
  createAdvancedPrintWorkflowHandlers
};
