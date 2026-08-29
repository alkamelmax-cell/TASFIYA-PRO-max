const { createEditModalLoaders } = require('./edit-modal-population-loaders');
const { createEditModalFormFieldHandlers } = require('./edit-modal-population-form-fields');

function createEditModalPopulationHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const EventCtor = deps.EventCtor || Event;
  const populateEditBankReceiptsTable = deps.populateEditBankReceiptsTable;
  const populateEditCashReceiptsTable = deps.populateEditCashReceiptsTable;
  const populateEditPostpaidSalesTable = deps.populateEditPostpaidSalesTable;
  const populateEditCustomerReceiptsTable = deps.populateEditCustomerReceiptsTable;
  const populateEditReturnInvoicesTable = deps.populateEditReturnInvoicesTable;
  const populateEditSuppliersTable = deps.populateEditSuppliersTable;
  const updateEditTotals = deps.updateEditTotals;
  const updateEditProgress = deps.updateEditProgress;
  const logger = deps.logger || console;

  const loaderHandlers = createEditModalLoaders({
    document: doc,
    ipcRenderer: ipc,
    logger
  });

  const formFieldHandlers = createEditModalFormFieldHandlers({
    document: doc,
    ipcRenderer: ipc,
    EventCtor,
    ensureCashiersAndAccountantsLoaded: loaderHandlers.ensureCashiersAndAccountantsLoaded,
    loadEditCashiersByBranch: loaderHandlers.loadEditCashiersByBranch,
    logger
  });

  function runTablePopulation(label, handler, rows) {
    try {
      handler(rows || []);
      logger.log(`✅ [POPULATE] تم تعبئة ${label}`);
    } catch (error) {
      logger.error(`❌ [POPULATE] خطأ في تعبئة ${label}:`, error);
    }
  }

  async function populateEditModal(data) {
    logger.log('📝 [POPULATE] بدء تعبئة نافذة التعديل بالبيانات...');
    logger.log('📊 [POPULATE] البيانات المستلمة:', {
      hasReconciliation: !!data?.reconciliation,
      reconciliationId: data?.reconciliation?.id,
      bankReceiptsCount: data?.bankReceipts?.length || 0,
      cashReceiptsCount: data?.cashReceipts?.length || 0,
      postpaidSalesCount: data?.postpaidSales?.length || 0,
      customerReceiptsCount: data?.customerReceipts?.length || 0,
      returnInvoicesCount: data?.returnInvoices?.length || 0,
      suppliersCount: data?.suppliers?.length || 0
    });

    try {
      if (!data) {
        throw new Error('لا توجد بيانات للتعبئة');
      }

      if (!data.reconciliation) {
        throw new Error('بيانات التصفية الأساسية مفقودة');
      }

      const {
        reconciliation,
        bankReceipts,
        cashReceipts,
        postpaidSales,
        customerReceipts,
        returnInvoices,
        suppliers
      } = data;

      const modal = doc.getElementById('editReconciliationModal');
      if (!modal) {
        throw new Error('نافذة التعديل غير موجودة في الصفحة');
      }

      logger.log('📋 [POPULATE] تعبئة المعلومات الأساسية...');
      const reconciliationIdElement = doc.getElementById('editReconciliationId');
      if (reconciliationIdElement) {
        reconciliationIdElement.textContent = `#${reconciliation.reconciliation_number || reconciliation.id}`;
        logger.log('✅ [POPULATE] تم تعبئة معرف التصفية:', reconciliation.id);
      } else {
        logger.warn('⚠️ [POPULATE] عنصر معرف التصفية غير موجود');
      }

      logger.log('📅 [POPULATE] تعبئة التواريخ...');
      try {
        const createdDate = formatDate(reconciliation.created_at);
        const lastModified = reconciliation.last_modified_date
          ? formatDate(reconciliation.last_modified_date)
          : 'لم يتم التعديل';

        const createdDateElement = doc.getElementById('editCreatedDate');
        const lastModifiedElement = doc.getElementById('editLastModified');

        if (createdDateElement) {
          createdDateElement.textContent = createdDate;
          logger.log('✅ [POPULATE] تم تعبئة تاريخ الإنشاء:', createdDate);
        }

        if (lastModifiedElement) {
          lastModifiedElement.textContent = lastModified;
          logger.log('✅ [POPULATE] تم تعبئة تاريخ آخر تعديل:', lastModified);
        }
      } catch (dateError) {
        logger.warn('⚠️ [POPULATE] خطأ في تنسيق التواريخ:', dateError.message);
      }

      logger.log('📝 [POPULATE] تعبئة حقول النموذج...');
      await formFieldHandlers.populateEditFormFields(reconciliation);

      logger.log('📊 [POPULATE] تعبئة الجداول...');
      runTablePopulation('جدول المقبوضات البنكية', populateEditBankReceiptsTable, bankReceipts);
      runTablePopulation('جدول المقبوضات النقدية', populateEditCashReceiptsTable, cashReceipts);
      runTablePopulation('جدول المبيعات الآجلة', populateEditPostpaidSalesTable, postpaidSales);
      runTablePopulation('جدول مقبوضات العملاء', populateEditCustomerReceiptsTable, customerReceipts);
      runTablePopulation('جدول فواتير المرتجع', populateEditReturnInvoicesTable, returnInvoices);
      runTablePopulation('جدول الموردين', populateEditSuppliersTable, suppliers);

      logger.log('🧮 [POPULATE] حساب المجاميع...');
      try {
        updateEditTotals();
        logger.log('✅ [POPULATE] تم حساب المجاميع');
      } catch (error) {
        logger.error('❌ [POPULATE] خطأ في حساب المجاميع:', error);
      }

      logger.log('📈 [POPULATE] تحديث مؤشر التقدم...');
      try {
        updateEditProgress();
        logger.log('✅ [POPULATE] تم تحديث مؤشر التقدم');
      } catch (error) {
        logger.error('❌ [POPULATE] خطأ في تحديث مؤشر التقدم:', error);
      }

      logger.log('✅ [POPULATE] تم تعبئة نافذة التعديل بنجاح');
    } catch (error) {
      logger.error('❌ [POPULATE] خطأ في تعبئة نافذة التعديل:', error);
      logger.error('❌ [POPULATE] تفاصيل الخطأ:', {
        message: error.message,
        stack: error.stack,
        data
      });
      throw new Error(`فشل في تعبئة البيانات: ${error.message}`);
    }
  }

  return {
    populateEditModal,
    populateEditFormFields: formFieldHandlers.populateEditFormFields,
    ensureCashiersAndAccountantsLoaded: loaderHandlers.ensureCashiersAndAccountantsLoaded,
    loadEditATMs: loaderHandlers.loadEditATMs,
    loadEditCashiersByBranch: loaderHandlers.loadEditCashiersByBranch
  };
}

module.exports = {
  createEditModalPopulationHandlers
};
