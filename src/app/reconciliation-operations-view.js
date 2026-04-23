const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationOperationsViewHandlers(context) {
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const formatDate = context.formatDate;
  const formatCurrency = context.formatCurrency;
  const logger = context.logger || console;

  async function viewReconciliation(id) {
    logger.log('👁️ [VIEW] بدء عرض التصفية - معرف:', id);

    if (!id) {
      logger.error('❌ [VIEW] معرف التصفية مفقود');
      getDialogUtils().showValidationError('معرف التصفية مطلوب');
      return;
    }

    try {
      logger.log('📡 [VIEW] تحميل بيانات التصفية...');
      getDialogUtils().showLoading('جاري تحميل بيانات التصفية...', 'يرجى الانتظار');

      const reconciliation = await ipc.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [id]);

      getDialogUtils().close();

      if (!reconciliation) {
        logger.error('❌ [VIEW] لم يتم العثور على التصفية - معرف:', id);
        getDialogUtils().showError('لم يتم العثور على التصفية المطلوبة', 'تصفية غير موجودة');
        return;
      }

      const missingFields = [];
      if (!reconciliation.cashier_name) missingFields.push('اسم الكاشير');
      if (!reconciliation.accountant_name) missingFields.push('اسم المحاسب');
      if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');
      if (reconciliation.total_receipts === null || reconciliation.total_receipts === undefined) missingFields.push('إجمالي المقبوضات');
      if (reconciliation.system_sales === null || reconciliation.system_sales === undefined) missingFields.push('مبيعات النظام');

      if (missingFields.length > 0) {
        logger.warn('⚠️ [VIEW] بيانات مفقودة في التصفية:', missingFields);
        getDialogUtils().showError(`البيانات التالية مفقودة في التصفية: ${missingFields.join(', ')}`, 'بيانات غير مكتملة');
        return;
      }

      const detailedData = await ipc.invoke('get-reconciliation-for-edit', id);

      let additionalInfo = '';
      if (detailedData) {
        const counts = {
          bankReceipts: detailedData.bankReceipts?.length || 0,
          cashReceipts: detailedData.cashReceipts?.length || 0,
          postpaidSales: detailedData.postpaidSales?.length || 0,
          customerReceipts: detailedData.customerReceipts?.length || 0,
          returnInvoices: detailedData.returnInvoices?.length || 0,
          suppliers: detailedData.suppliers?.length || 0
        };

        additionalInfo = `

تفاصيل إضافية:
• المقبوضات البنكية: ${counts.bankReceipts} عنصر
• المقبوضات النقدية: ${counts.cashReceipts} عنصر
• المبيعات الآجلة: ${counts.postpaidSales} عنصر
• مقبوضات العملاء: ${counts.customerReceipts} عنصر
• فواتير المرتجع: ${counts.returnInvoices} عنصر
• الموردين: ${counts.suppliers} عنصر`;
      }

      const summary = `
تفاصيل التصفية #${reconciliation.id}

الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})
المحاسب: ${reconciliation.accountant_name}
التاريخ: ${formatDate(reconciliation.reconciliation_date)}

إجمالي المقبوضات: ${formatCurrency(reconciliation.total_receipts)} ريال
مبيعات النظام: ${formatCurrency(reconciliation.system_sales)} ريال
الفائض/العجز: ${formatCurrency(reconciliation.surplus_deficit)} ريال
الحالة: ${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}${additionalInfo}
        `;

      getDialogUtils().showAlert(summary, 'تفاصيل التصفية', 'info');
    } catch (error) {
      getDialogUtils().close();
      logger.error('❌ [VIEW] خطأ في عرض التصفية:', {
        id,
        error: error.message,
        stack: error.stack
      });
      const friendly = mapDbErrorMessage(error, {
        context: 'reconciliation',
        foreignKeyMessage: 'بيانات التصفية مرتبطة بسجلات غير متاحة.',
        fallback: 'حدث خطأ أثناء عرض التصفية.'
      });
      getDialogUtils().showError(friendly, 'خطأ في النظام');
    }
  }

  return {
    viewReconciliation
  };
}

module.exports = {
  createReconciliationOperationsViewHandlers
};
