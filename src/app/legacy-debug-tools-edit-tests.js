function createLegacyDebugToolsEditTestHandlers(context) {
  const ipcRenderer = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const editReconciliationNew = context.editReconciliationNew;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const logger = context.logger || console;

  async function testEditReconciliation() {
    logger.log('🧪 [TEST] بدء اختبار وظيفة تعديل التصفية...');

    try {
      const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

      if (reconciliations.length === 0) {
        logger.log('⚠️ [TEST] لا توجد تصفيات محفوظة للاختبار');
        getDialogUtils().showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
        return;
      }

      const testReconciliation = reconciliations[0];
      logger.log('🎯 [TEST] اختبار التصفية:', testReconciliation.id);

      await editReconciliationNew(testReconciliation.id);

      logger.log('✅ [TEST] تم اختبار وظيفة التعديل بنجاح');
    } catch (error) {
      logger.error('❌ [TEST] خطأ في اختبار وظيفة التعديل:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
  }

  async function testEditButtons() {
    logger.log('🧪 [TEST-BUTTONS] بدء اختبار أزرار التعديل...');

    try {
      const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

      if (reconciliations.length === 0) {
        logger.log('⚠️ [TEST-BUTTONS] لا توجد تصفيات محفوظة للاختبار');
        getDialogUtils().showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
        return;
      }

      const testReconciliation = reconciliations[0];
      logger.log('🎯 [TEST-BUTTONS] اختبار التصفية:', testReconciliation.id);

      await editReconciliationNew(testReconciliation.id);

      setTimeoutFn(() => {
        logger.log('✅ [TEST-BUTTONS] تم فتح نافذة التعديل. يمكنك الآن اختبار أزرار التعديل في الجداول.');
        getDialogUtils().showSuccessToast('تم فتح نافذة التعديل. اختبر أزرار التعديل الآن!');
      }, 1000);
    } catch (error) {
      logger.error('❌ [TEST-BUTTONS] خطأ في اختبار أزرار التعديل:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
  }

  async function testTableStructures() {
    logger.log('🧪 [TEST-STRUCTURE] بدء اختبار هيكل الجداول...');

    try {
      const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

      if (reconciliations.length === 0) {
        logger.log('⚠️ [TEST-STRUCTURE] لا توجد تصفيات محفوظة للاختبار');
        getDialogUtils().showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
        return;
      }

      const testReconciliation = reconciliations[0];
      logger.log('🎯 [TEST-STRUCTURE] اختبار التصفية:', testReconciliation.id);

      const data = await ipcRenderer.invoke('get-reconciliation-for-edit', testReconciliation.id);

      logger.log('📊 [TEST-STRUCTURE] هيكل البيانات المحملة:', {
        bankReceipts: data.bankReceipts?.length || 0,
        cashReceipts: data.cashReceipts?.length || 0,
        postpaidSales: data.postpaidSales?.length || 0,
        customerReceipts: data.customerReceipts?.length || 0,
        returnInvoices: data.returnInvoices?.length || 0,
        suppliers: data.suppliers?.length || 0
      });

      if (data.bankReceipts && data.bankReceipts.length > 0) {
        const bankReceipt = data.bankReceipts[0];
        logger.log('🏦 [TEST-STRUCTURE] هيكل المقبوضات البنكية:', Object.keys(bankReceipt));

        const expectedFields = ['operation_type', 'atm_id', 'amount', 'atm_name', 'bank_name'];
        const hasAllFields = expectedFields.every((field) => Object.hasOwn(bankReceipt, field));
        logger.log(`✅ [TEST-STRUCTURE] المقبوضات البنكية - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
      }

      if (data.cashReceipts && data.cashReceipts.length > 0) {
        const cashReceipt = data.cashReceipts[0];
        logger.log('💵 [TEST-STRUCTURE] هيكل المقبوضات النقدية:', Object.keys(cashReceipt));

        const expectedFields = ['denomination', 'quantity', 'total_amount'];
        const hasAllFields = expectedFields.every((field) => Object.hasOwn(cashReceipt, field));
        logger.log(`✅ [TEST-STRUCTURE] المقبوضات النقدية - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
      }

      if (data.customerReceipts && data.customerReceipts.length > 0) {
        const customerReceipt = data.customerReceipts[0];
        logger.log('👤 [TEST-STRUCTURE] هيكل مقبوضات العملاء:', Object.keys(customerReceipt));

        const expectedFields = ['customer_name', 'amount', 'payment_type'];
        const hasAllFields = expectedFields.every((field) => Object.hasOwn(customerReceipt, field));
        logger.log(`✅ [TEST-STRUCTURE] مقبوضات العملاء - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
      }

      logger.log('✅ [TEST-STRUCTURE] اكتمل اختبار هيكل الجداول');
      getDialogUtils().showSuccessToast('تم اختبار هيكل الجداول بنجاح!');
    } catch (error) {
      logger.error('❌ [TEST-STRUCTURE] خطأ في اختبار هيكل الجداول:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
  }

  return {
    testEditReconciliation,
    testEditButtons,
    testTableStructures
  };
}

module.exports = {
  createLegacyDebugToolsEditTestHandlers
};
