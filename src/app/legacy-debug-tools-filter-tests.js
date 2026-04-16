function createLegacyDebugToolsFilterTestHandlers(context) {
  const document = context.document;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const ipcRenderer = context.ipcRenderer;
  const getCurrentReconciliation = context.getCurrentReconciliation || (() => null);
  const logger = context.logger || console;

  async function testFilterEnhancements() {
    logger.log('🧪 [TEST-FILTER] بدء اختبار الميزات الجديدة للتصفية...');

    try {
      logger.log('🔍 [TEST-FILTER] فحص وجود الحقول الجديدة...');

      const timeRangeStart = document.getElementById('timeRangeStart');
      const timeRangeEnd = document.getElementById('timeRangeEnd');
      const filterNotes = document.getElementById('filterNotes');
      const editTimeRangeStart = document.getElementById('editTimeRangeStart');
      const editTimeRangeEnd = document.getElementById('editTimeRangeEnd');
      const editFilterNotes = document.getElementById('editFilterNotes');

      const fieldsCheck = {
        newReconciliation: {
          timeRangeStart: !!timeRangeStart,
          timeRangeEnd: !!timeRangeEnd,
          filterNotes: !!filterNotes
        },
        editReconciliation: {
          editTimeRangeStart: !!editTimeRangeStart,
          editTimeRangeEnd: !!editTimeRangeEnd,
          editFilterNotes: !!editFilterNotes
        }
      };

      logger.log('📋 [TEST-FILTER] نتائج فحص الحقول:', fieldsCheck);

      logger.log('🗄️ [TEST-FILTER] فحص مخطط قاعدة البيانات...');
      const tableInfo = await ipcRenderer.invoke('db-all', 'PRAGMA table_info(reconciliations)');
      const hasTimeRangeStart = tableInfo.some((col) => col.name === 'time_range_start');
      const hasTimeRangeEnd = tableInfo.some((col) => col.name === 'time_range_end');
      const hasFilterNotes = tableInfo.some((col) => col.name === 'filter_notes');

      const dbCheck = {
        time_range_start: hasTimeRangeStart,
        time_range_end: hasTimeRangeEnd,
        filter_notes: hasFilterNotes
      };

      logger.log('🗄️ [TEST-FILTER] نتائج فحص قاعدة البيانات:', dbCheck);
      logger.log('✨ [TEST-FILTER] اختبار إنشاء تصفية مع الحقول الجديدة...');

      if (timeRangeStart && timeRangeEnd && filterNotes) {
        timeRangeStart.value = '09:00';
        timeRangeEnd.value = '17:00';
        filterNotes.value = 'اختبار الميزات الجديدة - تصفية تجريبية';
        logger.log('✅ [TEST-FILTER] تم تعبئة الحقول الجديدة بقيم تجريبية');
      }

      const testResults = {
        fieldsExist: Object.values(fieldsCheck.newReconciliation).every(Boolean) &&
          Object.values(fieldsCheck.editReconciliation).every(Boolean),
        databaseReady: Object.values(dbCheck).every(Boolean),
        overallStatus: 'success'
      };

      if (!testResults.fieldsExist) {
        testResults.overallStatus = 'warning';
        logger.warn('⚠️ [TEST-FILTER] بعض الحقول مفقودة في واجهة المستخدم');
      }

      if (!testResults.databaseReady) {
        testResults.overallStatus = 'error';
        logger.error('❌ [TEST-FILTER] قاعدة البيانات غير جاهزة للميزات الجديدة');
      }

      const message = `
نتائج اختبار الميزات الجديدة:

📋 حقول التصفية الجديدة:
• النطاق الزمني (من): ${fieldsCheck.newReconciliation.timeRangeStart ? '✅' : '❌'}
• النطاق الزمني (إلى): ${fieldsCheck.newReconciliation.timeRangeEnd ? '✅' : '❌'}
• ملاحظات التصفية: ${fieldsCheck.newReconciliation.filterNotes ? '✅' : '❌'}

✏️ حقول التعديل:
• النطاق الزمني (من): ${fieldsCheck.editReconciliation.editTimeRangeStart ? '✅' : '❌'}
• النطاق الزمني (إلى): ${fieldsCheck.editReconciliation.editTimeRangeEnd ? '✅' : '❌'}
• ملاحظات التصفية: ${fieldsCheck.editReconciliation.editFilterNotes ? '✅' : '❌'}

🗄️ قاعدة البيانات:
• عمود time_range_start: ${dbCheck.time_range_start ? '✅' : '❌'}
• عمود time_range_end: ${dbCheck.time_range_end ? '✅' : '❌'}
• عمود filter_notes: ${dbCheck.filter_notes ? '✅' : '❌'}

الحالة العامة: ${testResults.overallStatus === 'success' ? '✅ جاهز' :
    testResults.overallStatus === 'warning' ? '⚠️ يحتاج مراجعة' : '❌ يحتاج إصلاح'}
      `;

      if (testResults.overallStatus === 'success') {
        getDialogUtils().showSuccess(message, 'اختبار الميزات الجديدة');
      } else if (testResults.overallStatus === 'warning') {
        getDialogUtils().showAlert(message, 'اختبار الميزات الجديدة', 'warning');
      } else {
        getDialogUtils().showError(message, 'اختبار الميزات الجديدة');
      }

      logger.log('✅ [TEST-FILTER] تم إكمال اختبار الميزات الجديدة');
      return testResults;
    } catch (error) {
      logger.error('❌ [TEST-FILTER] خطأ في اختبار الميزات الجديدة:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
      return { overallStatus: 'error', error: error.message };
    }
  }

  async function quickTestFilterFields() {
    logger.log('🧪 [QUICK-TEST] اختبار سريع للحقول الجديدة...');

    try {
      const formFields = {
        timeRangeStart: !!document.getElementById('timeRangeStart'),
        timeRangeEnd: !!document.getElementById('timeRangeEnd'),
        filterNotes: !!document.getElementById('filterNotes'),
        editTimeRangeStart: !!document.getElementById('editTimeRangeStart'),
        editTimeRangeEnd: !!document.getElementById('editTimeRangeEnd'),
        editFilterNotes: !!document.getElementById('editFilterNotes')
      };

      logger.log('📋 [QUICK-TEST] نتائج فحص الحقول:', formFields);

      const timeRangeStart = document.getElementById('timeRangeStart');
      const timeRangeEnd = document.getElementById('timeRangeEnd');
      const filterNotes = document.getElementById('filterNotes');

      if (timeRangeStart && timeRangeEnd && filterNotes) {
        timeRangeStart.value = '09:00';
        timeRangeEnd.value = '17:00';
        filterNotes.value = `اختبار سريع للميزات الجديدة - ${new Date().toLocaleString('ar-SA')}`;

        logger.log('✅ [QUICK-TEST] تم تعبئة الحقول بقيم تجريبية');
        logger.log('💡 [QUICK-TEST] يمكنك الآن إنشاء تصفية جديدة واختبار الطباعة');

        getDialogUtils().showSuccess(`
تم تعبئة الحقول الجديدة بنجاح:
• النطاق الزمني: من 09:00 إلى 17:00
• الملاحظات: اختبار سريع للميزات الجديدة

يمكنك الآن:
1. إنشاء تصفية جديدة
2. طباعة التقرير للتحقق من ظهور الحقول الجديدة
                `, 'اختبار الميزات الجديدة');
      } else {
        logger.warn('⚠️ [QUICK-TEST] بعض الحقول مفقودة');
      }

      const currentReconciliation = getCurrentReconciliation();
      if (currentReconciliation) {
        logger.log('🔍 [QUICK-TEST] فحص التصفية الحالية:', {
          id: currentReconciliation.id,
          time_range_start: currentReconciliation.time_range_start,
          time_range_end: currentReconciliation.time_range_end,
          filter_notes: currentReconciliation.filter_notes
        });
      } else {
        logger.log('ℹ️ [QUICK-TEST] لا توجد تصفية حالية');
      }

      return {
        success: true,
        formFields,
        hasCurrentReconciliation: !!currentReconciliation
      };
    } catch (error) {
      logger.error('❌ [QUICK-TEST] خطأ في الاختبار السريع:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async function testPrintWithNewFields() {
    logger.log('🖨️ [PRINT-TEST] اختبار شامل للطباعة مع الحقول الجديدة...');

    try {
      const timeRangeStart = document.getElementById('timeRangeStart');
      const timeRangeEnd = document.getElementById('timeRangeEnd');
      const filterNotes = document.getElementById('filterNotes');

      if (!timeRangeStart || !timeRangeEnd || !filterNotes) {
        throw new Error('الحقول الجديدة غير موجودة في النموذج');
      }

      timeRangeStart.value = '08:30';
      timeRangeEnd.value = '18:00';
      filterNotes.value = 'اختبار شامل للطباعة - تم إضافة النطاق الزمني وملاحظات التصفية للتأكد من ظهورها في التقرير المطبوع';

      logger.log('✅ [PRINT-TEST] تم تعبئة الحقول بقيم الاختبار');

      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation) {
        logger.log('ℹ️ [PRINT-TEST] لا توجد تصفية حالية - يجب إنشاء تصفية أولاً');

        getDialogUtils().showAlert(`
تم تعبئة الحقول الجديدة بقيم الاختبار:
• النطاق الزمني: من 08:30 إلى 18:00
• الملاحظات: اختبار شامل للطباعة...

الخطوة التالية:
1. املأ البيانات الأساسية (الكاشير، المحاسب، التاريخ)
2. اضغط "ابدأ التصفية"
3. اضغط "طباعة" لاختبار ظهور الحقول الجديدة
                `, 'اختبار الطباعة', 'info');

        return {
          success: true,
          message: 'تم تعبئة الحقول - يجب إنشاء تصفية أولاً',
          fieldsReady: true,
          reconciliationReady: false
        };
      }

      logger.log('🖨️ [PRINT-TEST] اختبار وظيفة الطباعة...');

      currentReconciliation.time_range_start = timeRangeStart.value;
      currentReconciliation.time_range_end = timeRangeEnd.value;
      currentReconciliation.filter_notes = filterNotes.value;

      logger.log('🔍 [PRINT-TEST] بيانات التصفية المحدثة:', {
        id: currentReconciliation.id,
        time_range_start: currentReconciliation.time_range_start,
        time_range_end: currentReconciliation.time_range_end,
        filter_notes: currentReconciliation.filter_notes
      });

      getDialogUtils().showSuccess(`
✅ تم إعداد اختبار الطباعة بنجاح!

البيانات المحدثة:
• النطاق الزمني: من ${timeRangeStart.value} إلى ${timeRangeEnd.value}
• الملاحظات: ${filterNotes.value.substring(0, 50)}...

الآن يمكنك:
1. اضغط "طباعة" لاختبار ظهور الحقول الجديدة
2. تحقق من ظهور النطاق الزمني والملاحظات في التقرير
            `, 'جاهز للاختبار');

      return {
        success: true,
        message: 'جاهز لاختبار الطباعة',
        fieldsReady: true,
        reconciliationReady: true,
        testData: {
          timeRangeStart: timeRangeStart.value,
          timeRangeEnd: timeRangeEnd.value,
          filterNotes: filterNotes.value
        }
      };
    } catch (error) {
      logger.error('❌ [PRINT-TEST] خطأ في اختبار الطباعة:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  return {
    testFilterEnhancements,
    quickTestFilterFields,
    testPrintWithNewFields
  };
}

module.exports = {
  createLegacyDebugToolsFilterTestHandlers
};
