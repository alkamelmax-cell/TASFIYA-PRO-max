function createLegacyDebugToolsSavedPrintTestHandlers(context) {
  const ipcRenderer = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const loadReconciliationForPrint = context.loadReconciliationForPrint;
  const transformDataForPDFGenerator = context.transformDataForPDFGenerator;
  const logger = context.logger || console;

  async function testSavedReconciliationPrint() {
    logger.log('💾 [SAVED-PRINT-TEST] اختبار طباعة التصفيات المحفوظة مع الحقول الجديدة...');

    try {
      const reconciliations = await ipcRenderer.invoke(
        'db-query',
        'SELECT id, cashier_id, accountant_id, reconciliation_date, time_range_start, time_range_end, filter_notes FROM reconciliations ORDER BY created_at DESC LIMIT 5'
      );

      if (reconciliations.length === 0) {
        throw new Error('لا توجد تصفيات محفوظة للاختبار');
      }

      logger.log('📋 [SAVED-PRINT-TEST] التصفيات المتاحة للاختبار:', reconciliations.map((item) => ({
        id: item.id,
        date: item.reconciliation_date,
        timeRange: item.time_range_start && item.time_range_end ? `${item.time_range_start}-${item.time_range_end}` : 'لا يوجد',
        notes: item.filter_notes ? `${item.filter_notes.substring(0, 30)}...` : 'لا توجد'
      })));

      const testReconciliation = reconciliations[0];
      logger.log(`🔍 [SAVED-PRINT-TEST] اختبار تحميل بيانات التصفية معرف: ${testReconciliation.id}`);

      const reconciliationData = await loadReconciliationForPrint(testReconciliation.id);
      if (!reconciliationData) {
        throw new Error('فشل في تحميل بيانات التصفية المحفوظة');
      }

      logger.log('✅ [SAVED-PRINT-TEST] تم تحميل البيانات بنجاح');
      logger.log('🔄 [SAVED-PRINT-TEST] اختبار تحويل البيانات...');

      const pdfData = transformDataForPDFGenerator(reconciliationData);
      logger.log('🔍 [SAVED-PRINT-TEST] البيانات المحولة للطباعة:', {
        reconciliationId: pdfData.reconciliationId,
        timeRangeStart: pdfData.timeRangeStart,
        timeRangeEnd: pdfData.timeRangeEnd,
        filterNotes: pdfData.filterNotes
      });

      const hasTimeRange = pdfData.timeRangeStart || pdfData.timeRangeEnd;
      const hasNotes = pdfData.filterNotes;

      const resultMessage = `
✅ اختبار التصفيات المحفوظة مكتمل!

معرف التصفية: ${pdfData.reconciliationId}
الكاشير: ${pdfData.cashierName}
المحاسب: ${pdfData.accountantName}
التاريخ: ${pdfData.reconciliationDate}

الحقول الجديدة:
• النطاق الزمني: ${hasTimeRange ?
    (pdfData.timeRangeStart && pdfData.timeRangeEnd ?
      `من ${pdfData.timeRangeStart} إلى ${pdfData.timeRangeEnd}` :
      pdfData.timeRangeStart ? `من ${pdfData.timeRangeStart}` :
        `إلى ${pdfData.timeRangeEnd}`) :
    'غير محدد'}
• الملاحظات: ${hasNotes ? `${pdfData.filterNotes.substring(0, 50)}...` : 'لا توجد'}

يمكنك الآن اختبار طباعة هذه التصفية من قائمة "التصفيات المحفوظة"
        `;

      getDialogUtils().showSuccess(resultMessage, 'اختبار التصفيات المحفوظة');

      return {
        success: true,
        reconciliationId: testReconciliation.id,
        hasTimeRange,
        hasNotes,
        data: pdfData
      };
    } catch (error) {
      logger.error('❌ [SAVED-PRINT-TEST] خطأ في اختبار التصفيات المحفوظة:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في اختبار التصفيات المحفوظة');

      return {
        success: false,
        error: error.message
      };
    }
  }

  return {
    testSavedReconciliationPrint
  };
}

module.exports = {
  createLegacyDebugToolsSavedPrintTestHandlers
};
