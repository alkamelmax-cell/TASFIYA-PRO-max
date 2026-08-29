const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationUiMiscActions(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const DialogUtils = context.DialogUtils;
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const clearAllReconciliationData = context.clearAllReconciliationData;
  const resetSystemToNewReconciliationState = context.resetSystemToNewReconciliationState;
  const loadSearchFilters = context.loadSearchFilters;
  const state = context.state;
  const logger = context.logger || console;

  async function handleCancelFilter() {
    logger.log('❌ [FILTER] بدء إلغاء التصفية...');

    try {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation) {
        logger.warn('⚠️ [FILTER] لا توجد تصفية حالية للإلغاء');
        DialogUtils.showInfo('لا توجد تصفية حالية للإلغاء');
        return;
      }

      const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من إلغاء التصفية؟\nسيتم حذف التصفية من المسودات.',
        'تأكيد إلغاء التصفية'
      );

      if (!confirmed) {
        logger.log('ℹ️ [FILTER] تم إلغاء العملية من قبل المستخدم');
        return;
      }

      logger.log('🗑️ [FILTER] حذف التصفية من قاعدة البيانات...');
      await ipcRenderer.invoke(
        'db-run',
        'DELETE FROM cashbox_vouchers WHERE source_reconciliation_id = ? AND COALESCE(is_auto_generated, 0) = 1',
        [currentReconciliation.id]
      );
      await ipcRenderer.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [currentReconciliation.id]);

      state.isResetting = true;
      await clearAllReconciliationData();
      resetSystemToNewReconciliationState();
      state.isResetting = false;

      const infoDiv = document.getElementById('currentReconciliationInfo');
      if (infoDiv) {
        infoDiv.style.display = 'none';
      }

      logger.log('✅ [FILTER] تم إلغاء التصفية بنجاح');
      DialogUtils.showSuccess('تم إلغاء التصفية وحذفها من المسودات بنجاح');
    } catch (error) {
      state.isResetting = false;
      logger.error('❌ [FILTER] خطأ في إلغاء التصفية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء إلغاء التصفية.'
      });
      DialogUtils.showError(`حدث خطأ أثناء إلغاء التصفية: ${friendly}`, 'خطأ في إلغاء التصفية');
    }
  }

  async function handleCashierChange(event) {
    const cashierId = event.target.value;
    if (!cashierId) {
      document.getElementById('cashierNumber').value = '';
      return;
    }

    try {
      const cashier = await ipcRenderer.invoke('db-get', 'SELECT cashier_number FROM cashiers WHERE id = ?', [cashierId]);
      document.getElementById('cashierNumber').value = cashier ? cashier.cashier_number : '';
    } catch (error) {
      logger.error('Error loading cashier details:', error);
    }
  }

  async function handleAtmChange(event) {
    const atmId = event.target.value;
    if (!atmId) {
      document.getElementById('bankName').value = '';
      return;
    }

    try {
      const atm = await ipcRenderer.invoke('db-get', 'SELECT bank_name FROM atms WHERE id = ?', [atmId]);
      document.getElementById('bankName').value = atm ? atm.bank_name : '';
    } catch (error) {
      logger.error('Error loading ATM details:', error);
    }
  }

  async function loadReportFilters() {
    await loadSearchFilters();
  }

  return {
    handleCancelFilter,
    handleCashierChange,
    handleAtmChange,
    loadReportFilters
  };
}

module.exports = {
  createReconciliationUiMiscActions
};
