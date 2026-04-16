const { clearActiveFormulaSettingsInDocument } = require('./reconciliation-formula');

function createEditSessionCoreActions(deps) {
  const document = deps.document;
  const bootstrap = deps.bootstrap;
  const DialogUtils = deps.DialogUtils;
  const validateEditForm = deps.validateEditForm;
  const collectEditFormData = deps.collectEditFormData;
  const loadSavedReconciliations = deps.loadSavedReconciliations;
  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const setCurrentReconciliation = deps.setCurrentReconciliation;
  const setBankReceipts = deps.setBankReceipts;
  const setCashReceipts = deps.setCashReceipts;
  const setPostpaidSales = deps.setPostpaidSales;
  const setCustomerReceipts = deps.setCustomerReceipts;
  const setReturnInvoices = deps.setReturnInvoices;
  const setSuppliers = deps.setSuppliers;
  const editMode = deps.editMode;
  const persistenceHandlers = deps.persistenceHandlers;

  function mapCashboxSyncSkippedReason(reason) {
    const key = String(reason || '').trim();
    if (!key) {
      return '';
    }

    if (key === 'cashbox_tables_missing') {
      return 'تعذر ترحيل التصفية للصندوق لأن جداول الصناديق غير متوفرة.';
    }
    if (key === 'reconciliation_not_found') {
      return 'تعذر ترحيل التصفية للصندوق لأن التصفية غير موجودة.';
    }
    if (key === 'reconciliation_not_completed') {
      return 'تعذر ترحيل التصفية للصندوق لأن التصفية ليست مكتملة.';
    }
    if (key === 'branch_not_found') {
      return 'تعذر ترحيل التصفية للصندوق لأن الفرع غير محدد للكاشير.';
    }
    if (key === 'cashbox_not_found') {
      return 'تعذر ترحيل التصفية للصندوق لأن صندوق الفرع غير متاح.';
    }
    if (key === 'disabled_for_reconciliation') {
      return 'تم حفظ التصفية بدون ترحيل للصندوق حسب اختيارك.';
    }
    if (key === 'disabled_by_default_setting') {
      return 'تم حفظ التصفية بدون ترحيل للصندوق وفق الإعداد الافتراضي.';
    }
    return `تم حفظ التصفية لكن لم يكتمل ترحيل الصندوق (${key}).`;
  }

  function clearRuntimeCollections() {
    setBankReceipts([]);
    setCashReceipts([]);
    setPostpaidSales([]);
    setCustomerReceipts([]);
    setReturnInvoices([]);
    setSuppliers([]);
  }

  function resetEditFlags() {
    editMode.isActive = false;
    editMode.reconciliationId = null;
    editMode.originalData = null;
    editMode.initialSnapshot = null;
  }

  function resetEditMode() {
    console.log('🔄 [RESET] إعادة تعيين وضع التعديل...');

    if (getCurrentReconciliation()) {
      console.log('🔄 [RESET] إعادة تعيين كائن التصفية الحالية:', getCurrentReconciliation().id);
      setCurrentReconciliation(null);
    }

    resetEditFlags();
    clearRuntimeCollections();
    clearActiveFormulaSettingsInDocument(document);

    const editForm = document.getElementById('editReconciliationForm');
    if (editForm) {
      editForm.reset();
    }

    const tableIds = [
      'editBankReceiptsTable',
      'editCashReceiptsTable',
      'editPostpaidSalesTable',
      'editCustomerReceiptsTable',
      'editReturnInvoicesTable',
      'editSuppliersTable'
    ];

    tableIds.forEach((tableId) => {
      const table = document.getElementById(tableId);
      if (table) {
        table.innerHTML = '';
      }
    });

    const totalIds = [
      'editBankReceiptsTotal',
      'editCashReceiptsTotal',
      'editPostpaidSalesTotal',
      'editCustomerReceiptsTotal',
      'editReturnInvoicesTotal',
      'editSuppliersTotal'
    ];

    totalIds.forEach((totalId) => {
      const element = document.getElementById(totalId);
      if (element) {
        element.textContent = '0.00';
      }
    });

    const editTotalReceipts = document.getElementById('editTotalReceipts');
    const editSurplusDeficit = document.getElementById('editSurplusDeficit');

    if (editTotalReceipts) {
      editTotalReceipts.textContent = '0.00 ريال';
    }

    if (editSurplusDeficit) {
      editSurplusDeficit.textContent = '0.00 ريال';
      editSurplusDeficit.className = 'form-control-plaintext fw-bold text-primary';
    }

    console.log('✅ [RESET] تم إعادة تعيين وضع التعديل بنجاح مع عزل كامل للبيانات');
  }

  function isEditModeActive() {
    return editMode.isActive && editMode.reconciliationId;
  }

  function getCurrentEditingReconciliationId() {
    return editMode.reconciliationId;
  }

  async function saveEditedReconciliation() {
    console.log('💾 [SAVE-EDIT] بدء حفظ تعديلات التصفية...');

    if (!isEditModeActive()) {
      console.error('❌ [SAVE-EDIT] وضع التعديل غير نشط');
      DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
      return;
    }

    try {
      DialogUtils.showLoading('جاري حفظ تعديلات التصفية...');

      const validationResult = validateEditForm();
      if (!validationResult.isValid) {
        DialogUtils.close();
        DialogUtils.showError(validationResult.message, 'خطأ في البيانات');
        return;
      }

      const updatedData = collectEditFormData();
      const updateResult = await updateReconciliationInDatabase(updatedData);

      DialogUtils.close();
      DialogUtils.showSuccessToast('تم حفظ تعديلات التصفية بنجاح');

      const cashboxSyncResult = updateResult?.cashboxSyncResult || null;
      const cashboxSyncError = String(updateResult?.cashboxSyncError || '').trim();
      const cashboxPostingEnabled = updatedData?.cashboxPostingEnabled === true;
      if (cashboxSyncError && typeof DialogUtils.showWarningToast === 'function') {
        DialogUtils.showWarningToast('تم حفظ التعديل ولكن تعذرت مزامنة سندات الصندوق تلقائيًا');
      } else {
        const skippedReasonMessage = mapCashboxSyncSkippedReason(cashboxSyncResult?.skippedReason);
        if (skippedReasonMessage && typeof DialogUtils.showWarningToast === 'function') {
          DialogUtils.showWarningToast(skippedReasonMessage);
        } else if (cashboxPostingEnabled && typeof DialogUtils.showSuccessToast === 'function') {
          const createdCount = Number(cashboxSyncResult?.created || 0);
          const updatedCount = Number(cashboxSyncResult?.updated || 0);
          const deletedCount = Number(cashboxSyncResult?.deleted || 0);
          DialogUtils.showSuccessToast(
            `تم ترحيل التصفية للصندوق (إضافة: ${createdCount}، تعديل: ${updatedCount}، حذف: ${deletedCount})`
          );
        }
      }

      const editModal = bootstrap.Modal.getInstance(document.getElementById('editReconciliationModal'));
      if (editModal) {
        editModal.hide();
      }

      if (typeof loadSavedReconciliations === 'function') {
        await loadSavedReconciliations();
      }

      console.log('🔄 [SAVE-EDIT] إعادة تعيين وضع التعديل بعد حفظ التعديلات');
      resetEditMode();

      console.log('✅ [SAVE-EDIT] تم حفظ التعديلات بنجاح وإعادة تعيين الحالة');
    } catch (error) {
      DialogUtils.close();
      handleEditError(error, 'SAVE-RECONCILIATION', {
        reconciliationId: editMode.reconciliationId,
        operation: 'save'
      });
    }
  }

  async function updateReconciliationInDatabase(data) {
    return persistenceHandlers.updateReconciliationInDatabase(data);
  }

  async function deleteExistingRecords(reconciliationId) {
    return persistenceHandlers.deleteExistingRecords(reconciliationId);
  }

  async function insertUpdatedRecords(data) {
    return persistenceHandlers.insertUpdatedRecords(data);
  }

  function handleEditError(error, operation, context = {}) {
    return persistenceHandlers.handleEditError(error, operation, context);
  }

  function validateEditModalState() {
    return persistenceHandlers.validateEditModalState();
  }

  function logEditOperation(operation, data = {}) {
    return persistenceHandlers.logEditOperation(operation, data);
  }

  return {
    resetEditMode,
    isEditModeActive,
    getCurrentEditingReconciliationId,
    saveEditedReconciliation,
    updateReconciliationInDatabase,
    deleteExistingRecords,
    insertUpdatedRecords,
    handleEditError,
    validateEditModalState,
    logEditOperation
  };
}

module.exports = {
  createEditSessionCoreActions
};
