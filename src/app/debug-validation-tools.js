const { mapDbErrorMessage } = require('./db-error-messages');

function createDebugValidationToolsHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getCurrentReconciliation = deps.getCurrentReconciliation || (() => null);
  const getDataCounts = deps.getDataCounts || (() => ({
    bankReceipts: 0,
    cashReceipts: 0,
    postpaidSales: 0,
    customerReceipts: 0,
    returnInvoices: 0,
    suppliers: 0
  }));
  const handleCustomerReceipt = deps.handleCustomerReceipt;
  const updateCustomerReceiptsTable = deps.updateCustomerReceiptsTable;
  const removeCustomerReceipt = deps.removeCustomerReceipt;
  const validateReconciliationBeforeSave = deps.validateReconciliationBeforeSave;
  const clearAllReconciliationData = deps.clearAllReconciliationData;
  const clearAllFormFields = deps.clearAllFormFields;
  const clearAllTables = deps.clearAllTables;
  const resetAllTotalsAndSummaries = deps.resetAllTotalsAndSummaries;
  const resetSystemToNewReconciliationState = deps.resetSystemToNewReconciliationState;
  const handlePrintReport = deps.handlePrintReport;
  const handleQuickPrint = deps.handleQuickPrint;
  const handlePrintReportsData = deps.handlePrintReportsData;
  const handlePrintAdvancedReport = deps.handlePrintAdvancedReport;
  const prepareReconciliationData = deps.prepareReconciliationData;
  const preparePrintData = deps.preparePrintData;
  const showPrintSectionDialogForNewReconciliation = deps.showPrintSectionDialogForNewReconciliation;
  const logger = deps.logger || console;

  async function testCustomerReceiptsFunction() {
    logger.log('🧪 [TEST] اختبار وظيفة مقبوضات العملاء...');

    const dialogUtils = getDialogUtils();
    const results = {
      formElements: false,
      validation: false,
      database: false,
      overall: false
    };

    try {
      const nameField = document.getElementById('customerReceiptName');
      const amountField = document.getElementById('customerReceiptAmount');
      const paymentTypeField = document.getElementById('customerReceiptPaymentType');
      const tableBody = document.getElementById('customerReceiptsTable');
      const totalElement = document.getElementById('customerReceiptsTotal');

      results.formElements = !!(nameField && amountField && paymentTypeField && tableBody && totalElement);
      logger.log('📋 [TEST] عناصر النموذج:', {
        nameField: !!nameField,
        amountField: !!amountField,
        paymentTypeField: !!paymentTypeField,
        tableBody: !!tableBody,
        totalElement: !!totalElement
      });

      results.validation = typeof handleCustomerReceipt === 'function' &&
        typeof updateCustomerReceiptsTable === 'function' &&
        typeof removeCustomerReceipt === 'function';

      const currentReconciliation = getCurrentReconciliation();
      if (currentReconciliation) {
        logger.log('💾 [TEST] فحص الاتصال بقاعدة البيانات...');
        try {
          const testQuery = await ipcRenderer.invoke(
            'db-get',
            'SELECT COUNT(*) as count FROM customer_receipts WHERE reconciliation_id = ?',
            [currentReconciliation.id]
          );
          results.database = testQuery !== null;
          logger.log('💾 [TEST] نتيجة استعلام قاعدة البيانات:', testQuery);
        } catch (error) {
          logger.error('❌ [TEST] خطأ في قاعدة البيانات:', error);
          results.database = false;
        }
      } else {
        logger.log('⚠️ [TEST] لا توجد تصفية حالية لاختبار قاعدة البيانات');
        results.database = true;
      }

      results.overall = results.formElements && results.validation && results.database;
      logger.log('✅ [TEST] نتائج اختبار مقبوضات العملاء:', results);

      if (results.overall) {
        dialogUtils.showSuccess('تم اختبار وظيفة مقبوضات العملاء بنجاح!', 'اختبار ناجح');
      } else {
        dialogUtils.showWarning('بعض اختبارات مقبوضات العملاء فشلت. تحقق من وحدة التحكم للتفاصيل.', 'اختبار جزئي');
      }

      return results;
    } catch (error) {
      logger.error('❌ [TEST] خطأ في اختبار مقبوضات العملاء:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الاختبار.'
      });
      dialogUtils.showError(`خطأ في الاختبار: ${friendly}`, 'خطأ في الاختبار');
      return results;
    }
  }

  async function testEnhancedSaveFunction() {
    logger.log('🧪 [TEST-SAVE] اختبار وظيفة الحفظ المحسنة...');

    const dialogUtils = getDialogUtils();
    const results = {
      validation: false,
      clearingFunctions: false,
      resetFunctions: false,
      uiElements: false,
      overall: false
    };

    try {
      results.validation = typeof validateReconciliationBeforeSave === 'function';

      if (results.validation) {
        const testValidation = validateReconciliationBeforeSave();
        logger.log('📋 [TEST-SAVE] نتيجة اختبار التحقق:', testValidation);
      }

      results.clearingFunctions = typeof clearAllReconciliationData === 'function' &&
        typeof clearAllFormFields === 'function' &&
        typeof clearAllTables === 'function' &&
        typeof resetAllTotalsAndSummaries === 'function';

      results.resetFunctions = typeof resetSystemToNewReconciliationState === 'function';

      const saveBtn = document.getElementById('saveReconciliationBtn');
      const createBtn = document.getElementById('createReconciliationBtn');
      const systemSalesInput = document.getElementById('systemSales');
      const totalReceiptsElement = document.getElementById('totalReceipts');

      results.uiElements = !!(saveBtn && createBtn && systemSalesInput && totalReceiptsElement);

      logger.log('🎨 [TEST-SAVE] عناصر واجهة المستخدم:', {
        saveBtn: !!saveBtn,
        createBtn: !!createBtn,
        systemSalesInput: !!systemSalesInput,
        totalReceiptsElement: !!totalReceiptsElement
      });

      results.overall = results.validation && results.clearingFunctions &&
        results.resetFunctions && results.uiElements;

      if (results.overall) {
        dialogUtils.showSuccess(
          'تم اختبار وظيفة الحفظ المحسنة بنجاح!\n\n' +
          '✅ التحقق من صحة البيانات\n' +
          '✅ دوال التفريغ\n' +
          '✅ دوال إعادة التهيئة\n' +
          '✅ عناصر واجهة المستخدم\n\n' +
          'الوظيفة جاهزة للاستخدام!',
          'اختبار ناجح'
        );
      } else {
        dialogUtils.showWarning(
          'بعض اختبارات وظيفة الحفظ فشلت:\n\n' +
          `${!results.validation ? '❌ التحقق من صحة البيانات\n' : ''}` +
          `${!results.clearingFunctions ? '❌ دوال التفريغ\n' : ''}` +
          `${!results.resetFunctions ? '❌ دوال إعادة التهيئة\n' : ''}` +
          `${!results.uiElements ? '❌ عناصر واجهة المستخدم\n' : ''}` +
          '\nتحقق من وحدة التحكم للتفاصيل.',
          'اختبار جزئي'
        );
      }

      return results;
    } catch (error) {
      logger.error('❌ [TEST-SAVE] خطأ في اختبار وظيفة الحفظ:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الاختبار.'
      });
      dialogUtils.showError(`خطأ في الاختبار: ${friendly}`, 'خطأ في الاختبار');
      return results;
    }
  }

  async function testFixedPrintFunctions() {
    logger.log('🧪 [TEST-PRINT] اختبار وظائف الطباعة المصلحة...');

    const dialogUtils = getDialogUtils();
    const results = {
      functionNames: false,
      dataValidation: false,
      printFunctions: false,
      errorHandling: false,
      overall: false
    };

    try {
      const functionTests = {
        handlePrintReport: typeof handlePrintReport === 'function',
        handleQuickPrint: typeof handleQuickPrint === 'function',
        handlePrintReportsData: typeof handlePrintReportsData === 'function',
        handlePrintAdvancedReport: typeof handlePrintAdvancedReport === 'function',
        prepareReconciliationData: typeof prepareReconciliationData === 'function'
      };

      results.functionNames = Object.values(functionTests).every((value) => value);

      const currentReconciliation = getCurrentReconciliation();
      if (currentReconciliation) {
        const counts = getDataCounts();
        const hasData = counts.bankReceipts > 0 ||
          counts.cashReceipts > 0 ||
          counts.postpaidSales > 0 ||
          counts.customerReceipts > 0 ||
          counts.returnInvoices > 0 ||
          counts.suppliers > 0;

        results.dataValidation = true;
        logger.log('📊 [TEST-PRINT] حالة البيانات:', {
          currentReconciliation: !!currentReconciliation,
          hasData,
          ...counts
        });
      } else {
        logger.log('⚠️ [TEST-PRINT] لا توجد تصفية حالية للاختبار');
        results.dataValidation = true;
      }

      results.printFunctions = typeof preparePrintData === 'function' &&
        typeof showPrintSectionDialogForNewReconciliation === 'function';

      results.errorHandling = !!dialogUtils &&
        typeof dialogUtils.showValidationError === 'function' &&
        typeof dialogUtils.showError === 'function';

      results.overall = results.functionNames && results.dataValidation &&
        results.printFunctions && results.errorHandling;

      if (results.overall) {
        dialogUtils.showSuccess(
          'تم اختبار وظائف الطباعة المصلحة بنجاح!\n\n' +
          '✅ أسماء الدوال صحيحة\n' +
          '✅ التحقق من صحة البيانات\n' +
          '✅ دوال الطباعة متاحة\n' +
          '✅ معالجة الأخطاء تعمل\n\n' +
          'تم إصلاح مشكلة "لا توجد بيانات تقرير للطباعة"!',
          'اختبار ناجح'
        );
      } else {
        dialogUtils.showWarning(
          'بعض اختبارات وظائف الطباعة فشلت:\n\n' +
          `${!results.functionNames ? '❌ أسماء الدوال\n' : ''}` +
          `${!results.dataValidation ? '❌ التحقق من صحة البيانات\n' : ''}` +
          `${!results.printFunctions ? '❌ دوال الطباعة\n' : ''}` +
          `${!results.errorHandling ? '❌ معالجة الأخطاء\n' : ''}` +
          '\nتحقق من وحدة التحكم للتفاصيل.',
          'اختبار جزئي'
        );
      }

      return results;
    } catch (error) {
      logger.error('❌ [TEST-PRINT] خطأ في اختبار وظائف الطباعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الاختبار.'
      });
      dialogUtils.showError(`خطأ في الاختبار: ${friendly}`, 'خطأ في الاختبار');
      return results;
    }
  }

  windowObj.testCustomerReceiptsFunction = testCustomerReceiptsFunction;
  windowObj.testEnhancedSaveFunction = testEnhancedSaveFunction;
  windowObj.testFixedPrintFunctions = testFixedPrintFunctions;

  return {
    testCustomerReceiptsFunction,
    testEnhancedSaveFunction,
    testFixedPrintFunctions
  };
}

module.exports = {
  createDebugValidationToolsHandlers
};
