function createLegacyDebugToolsLoaderHandlers(context) {
  const document = context.document;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const setCurrentReconciliation = context.setCurrentReconciliation || (() => {});
  const setBankReceipts = context.setBankReceipts || (() => {});
  const setCashReceipts = context.setCashReceipts || (() => {});
  const setPostpaidSales = context.setPostpaidSales || (() => {});
  const setCustomerReceipts = context.setCustomerReceipts || (() => {});
  const setReturnInvoices = context.setReturnInvoices || (() => {});
  const setSuppliers = context.setSuppliers || (() => {});
  const updateBankReceiptsTable = context.updateBankReceiptsTable || (() => {});
  const updateCashReceiptsTable = context.updateCashReceiptsTable || (() => {});
  const updatePostpaidSalesTable = context.updatePostpaidSalesTable || (() => {});
  const updateCustomerReceiptsTable = context.updateCustomerReceiptsTable || (() => {});
  const updateReturnInvoicesTable = context.updateReturnInvoicesTable || (() => {});
  const updateSuppliersTable = context.updateSuppliersTable || (() => {});
  const updateSummary = context.updateSummary || (() => {});
  const logger = context.logger || console;

  async function loadReconciliationForEditOLD(data) {
    logger.log('📥 [LOAD] بدء تحميل بيانات التصفية للتعديل...');

    try {
      if (!data) {
        logger.error('❌ [LOAD] لا توجد بيانات للتحميل');
        throw new Error('لا توجد بيانات للتحميل');
      }

      if (typeof data !== 'object') {
        logger.error('❌ [LOAD] نوع البيانات غير صحيح:', typeof data);
        throw new Error('نوع البيانات غير صحيح');
      }

      if (!data.reconciliation) {
        logger.error('❌ [LOAD] بيانات التصفية الأساسية مفقودة');
        throw new Error('بيانات التصفية الأساسية مفقودة');
      }

      const {
        reconciliation,
        bankReceipts: bankRec,
        cashReceipts: cashRec,
        postpaidSales: postpaidSal,
        customerReceipts: customerRec,
        returnInvoices: returnInv,
        suppliers: supp
      } = data;

      logger.log('🔍 [LOAD] فحص بيانات التصفية:', {
        id: reconciliation.id,
        cashier_id: reconciliation.cashier_id,
        accountant_id: reconciliation.accountant_id,
        date: reconciliation.reconciliation_date,
        status: reconciliation.status
      });

      const missingFields = [];
      if (!reconciliation.id) missingFields.push('معرف التصفية');
      if (!reconciliation.cashier_id) missingFields.push('معرف الكاشير');
      if (!reconciliation.accountant_id) missingFields.push('معرف المحاسب');
      if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');

      if (missingFields.length > 0) {
        logger.error('❌ [LOAD] حقول أساسية مفقودة:', missingFields);
        throw new Error(`الحقول التالية مفقودة: ${missingFields.join(', ')}`);
      }

      logger.log('🔍 [LOAD] فحص عناصر النموذج...');
      const formElements = {
        cashierSelect: document.getElementById('cashierSelect'),
        accountantSelect: document.getElementById('accountantSelect'),
        reconciliationDate: document.getElementById('reconciliationDate'),
        systemSales: document.getElementById('systemSales')
      };

      const missingElements = Object.entries(formElements)
        .filter(([, element]) => !element)
        .map(([name]) => name);

      if (missingElements.length > 0) {
        logger.error('❌ [LOAD] عناصر النموذج مفقودة:', missingElements);
        throw new Error(`عناصر النموذج التالية مفقودة: ${missingElements.join(', ')}`);
      }

      logger.log('✅ [LOAD] جميع عناصر النموذج موجودة');

      formElements.cashierSelect.value = reconciliation.cashier_id;
      formElements.accountantSelect.value = reconciliation.accountant_id;
      formElements.reconciliationDate.value = reconciliation.reconciliation_date;
      formElements.systemSales.value = reconciliation.system_sales || 0;

      logger.log('✅ [LOAD] تم تعيين قيم النموذج بنجاح');

      setCurrentReconciliation({
        id: reconciliation.id,
        cashier_id: reconciliation.cashier_id,
        accountant_id: reconciliation.accountant_id,
        reconciliation_date: reconciliation.reconciliation_date,
        created_at: reconciliation.created_at
      });

      const nextBankReceipts = Array.isArray(bankRec) ? bankRec : [];
      const nextCashReceipts = Array.isArray(cashRec) ? cashRec : [];
      const nextPostpaidSales = Array.isArray(postpaidSal) ? postpaidSal : [];
      const nextCustomerReceipts = Array.isArray(customerRec) ? customerRec : [];
      const nextReturnInvoices = Array.isArray(returnInv) ? returnInv : [];
      const nextSuppliers = Array.isArray(supp) ? supp : [];

      setBankReceipts(nextBankReceipts);
      setCashReceipts(nextCashReceipts);
      setPostpaidSales(nextPostpaidSales);
      setCustomerReceipts(nextCustomerReceipts);
      setReturnInvoices(nextReturnInvoices);
      setSuppliers(nextSuppliers);

      logger.log('📊 [LOAD] بيانات محملة للتعديل:', {
        reconciliation: reconciliation.id,
        bankReceipts: nextBankReceipts.length,
        cashReceipts: nextCashReceipts.length,
        postpaidSales: nextPostpaidSales.length,
        customerReceipts: nextCustomerReceipts.length,
        returnInvoices: nextReturnInvoices.length,
        suppliers: nextSuppliers.length,
        formElements: {
          cashierSelect: !!formElements.cashierSelect,
          accountantSelect: !!formElements.accountantSelect,
          reconciliationDate: !!formElements.reconciliationDate,
          systemSales: !!formElements.systemSales
        }
      });

      updateBankReceiptsTable();
      updateCashReceiptsTable();
      updatePostpaidSalesTable();
      updateCustomerReceiptsTable();
      updateReturnInvoicesTable();
      updateSuppliersTable();
      updateSummary();
    } catch (error) {
      logger.error('Error loading reconciliation data for edit:', error);
      getDialogUtils().showError(`خطأ في تحميل بيانات التصفية: ${error.message}`, 'خطأ في التحميل');
      throw error;
    }
  }

  return {
    loadReconciliationForEditOLD
  };
}

module.exports = {
  createLegacyDebugToolsLoaderHandlers
};
