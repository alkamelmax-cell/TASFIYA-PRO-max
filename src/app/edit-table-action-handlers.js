const { mapDbErrorMessage } = require('./db-error-messages');

function createEditTableActionHandlers(deps) {
  const DialogUtils = deps.DialogUtils;
  const isEditModeActive = deps.isEditModeActive;
  const getCurrentEditingReconciliationId = deps.getCurrentEditingReconciliationId;
  const getEditMode = deps.getEditMode;
  const onEditBankReceipt = deps.onEditBankReceipt;
  const onEditCashReceipt = deps.onEditCashReceipt;
  const onEditPostpaidSale = deps.onEditPostpaidSale;
  const onEditCustomerReceipt = deps.onEditCustomerReceipt;
  const onEditReturnInvoice = deps.onEditReturnInvoice;
  const onEditSupplier = deps.onEditSupplier;
  const onDeleteBankReceipt = deps.onDeleteBankReceipt;
  const onDeleteCashReceipt = deps.onDeleteCashReceipt;
  const onDeletePostpaidSale = deps.onDeletePostpaidSale;
  const onDeleteCustomerReceipt = deps.onDeleteCustomerReceipt;
  const onDeleteReturnInvoice = deps.onDeleteReturnInvoice;
  const onDeleteSupplier = deps.onDeleteSupplier;
  const logger = deps.logger || console;

  function addEditButtonListeners(container) {
    const buttons = container.querySelectorAll('.btn-edit-action');
    logger.log(`🔗 [LISTENERS] إضافة مستمعات الأحداث لـ ${buttons.length} زر`);

    buttons.forEach((button, buttonIndex) => {
      button.addEventListener('click', function onEditActionClick(event) {
        event.preventDefault();
        event.stopPropagation();

        const action = this.dataset.action;
        const type = this.dataset.type;
        const index = parseInt(this.dataset.index, 10);

        logger.log(`🔘 [BUTTON-${buttonIndex}] تم الضغط على زر:`, {
          action,
          type,
          index,
          editModeActive: isEditModeActive(),
          reconciliationId: getCurrentEditingReconciliationId(),
          hasOriginalData: !!getEditMode().originalData
        });

        try {
          if (action === 'edit') {
            logger.log('➡️ [BUTTON] توجيه إلى handleEditAction');
            handleEditAction(type, index);
          } else if (action === 'delete') {
            logger.log('➡️ [BUTTON] توجيه إلى handleDeleteAction');
            handleDeleteAction(type, index);
          }
        } catch (error) {
          logger.error('❌ [BUTTON] خطأ في معالجة الزر:', error);
          const friendly = mapDbErrorMessage(error, {
            fallback: 'حدث خطأ أثناء تنفيذ العملية.'
          });
          DialogUtils.showError(`خطأ في العملية: ${friendly}`, 'خطأ في النظام');
        }
      });
    });
  }

  function handleEditAction(type, index) {
    logger.log('✏️ [EDIT-ACTION] معالجة تعديل:', type, 'الفهرس:', index);

    switch (type) {
      case 'bankReceipt':
        onEditBankReceipt(index);
        break;
      case 'cashReceipt':
        onEditCashReceipt(index);
        break;
      case 'postpaidSale':
        onEditPostpaidSale(index);
        break;
      case 'customerReceipt':
        onEditCustomerReceipt(index);
        break;
      case 'returnInvoice':
        onEditReturnInvoice(index);
        break;
      case 'supplier':
        onEditSupplier(index);
        break;
      default:
        logger.error('❌ [EDIT-ACTION] نوع غير معروف:', type);
        DialogUtils.showError('نوع العنصر غير معروف', 'خطأ في النظام');
    }
  }

  function handleDeleteAction(type, index) {
    logger.log('🗑️ [DELETE-ACTION] معالجة حذف:', type, 'الفهرس:', index);

    switch (type) {
      case 'bankReceipt':
        onDeleteBankReceipt(index);
        break;
      case 'cashReceipt':
        onDeleteCashReceipt(index);
        break;
      case 'postpaidSale':
        onDeletePostpaidSale(index);
        break;
      case 'customerReceipt':
        onDeleteCustomerReceipt(index);
        break;
      case 'returnInvoice':
        onDeleteReturnInvoice(index);
        break;
      case 'supplier':
        onDeleteSupplier(index);
        break;
      default:
        logger.error('❌ [DELETE-ACTION] نوع غير معروف:', type);
        DialogUtils.showError('نوع العنصر غير معروف', 'خطأ في النظام');
    }
  }

  return {
    addEditButtonListeners,
    handleEditAction,
    handleDeleteAction
  };
}

module.exports = {
  createEditTableActionHandlers
};
