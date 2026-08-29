const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationOperationsDeleteHandlers(context) {
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const formatDate = context.formatDate;
  const loadSavedReconciliations = context.loadSavedReconciliations || (async () => {});
  const logger = context.logger || console;

  async function deleteReconciliation(reconciliationId) {
    logger.log('🗑️ [DELETE] طلب حذف التصفية - معرف:', reconciliationId);

    try {
      const reconciliation = await ipc.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [reconciliationId]);

      if (!reconciliation) {
        getDialogUtils().showError('التصفية غير موجودة', 'خطأ');
        return;
      }

      const reconciliationDisplay = reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : '(مسودة)';
      const confirmMessage = `هل أنت متأكد من أنك تريد حذف التصفية رقم ${reconciliationDisplay}؟\n\nالكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})\nالتاريخ: ${formatDate(reconciliation.reconciliation_date)}\n\n⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!`;

      const confirmed = await getDialogUtils().showConfirm(confirmMessage, 'تأكيد الحذف');
      if (confirmed) {
        await performSingleDelete(reconciliationId);
      }
    } catch (error) {
      logger.error('Error preparing delete:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'reconciliation',
          fallback: 'حدث خطأ أثناء تحضير الحذف.'
        })
      );
    }
  }

  async function performSingleDelete(reconciliationId) {
    logger.log('🗑️ [DELETE] تنفيذ حذف التصفية:', reconciliationId);

    try {
      getDialogUtils().showLoading('جاري حذف التصفية...', 'يرجى الانتظار');

      await ipc.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke(
        'db-run',
        'DELETE FROM cashbox_vouchers WHERE source_reconciliation_id = ? AND COALESCE(is_auto_generated, 0) = 1',
        [reconciliationId]
      );
      await ipc.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [reconciliationId]);

      getDialogUtils().close();
      logger.log(`✅ [DELETE] تم حذف التصفية #${reconciliationId} بنجاح`);
      getDialogUtils().showSuccessToast('تم حذف التصفية بنجاح');
      await loadSavedReconciliations();
    } catch (error) {
      getDialogUtils().close();
      logger.error(`❌ [DELETE] فشل في حذف التصفية #${reconciliationId}:`, error);
      const friendly = mapDbErrorMessage(error, {
        context: 'reconciliation',
        foreignKeyMessage: 'لا يمكن حذف التصفية لوجود قيود مرجعية مرتبطة.',
        fallback: 'حدث خطأ أثناء حذف التصفية.'
      });
      getDialogUtils().showError(friendly, 'خطأ في النظام');
    }
  }

  return {
    deleteReconciliation,
    performSingleDelete
  };
}

module.exports = {
  createReconciliationOperationsDeleteHandlers
};
