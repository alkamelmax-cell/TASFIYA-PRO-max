const {
  parseStoredFormulaSettings,
  setActiveFormulaSettingsInDocument,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS
} = require('./reconciliation-formula');

function createEditReconciliationLoader(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const bootstrap = deps.getBootstrap();
  const DialogUtils = deps.getDialogUtils();
  const getEditMode = deps.getEditMode;
  const setCurrentReconciliation = deps.setCurrentReconciliation;
  const updateButtonStates = deps.updateButtonStates;
  const populateEditModal = deps.populateEditModal;
  const handleEditError = deps.handleEditError;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const logger = deps.logger || console;

  function cloneData(value) {
    if (value === null || value === undefined) {
      return value;
    }

    return JSON.parse(JSON.stringify(value));
  }

  function buildInitialSnapshot(reconciliationData) {
    return {
      bankReceipts: cloneData(reconciliationData.bankReceipts || []),
      cashReceipts: cloneData(reconciliationData.cashReceipts || []),
      postpaidSales: cloneData(reconciliationData.postpaidSales || []),
      customerReceipts: cloneData(reconciliationData.customerReceipts || []),
      returnInvoices: cloneData(reconciliationData.returnInvoices || []),
      suppliers: cloneData(reconciliationData.suppliers || [])
    };
  }

  async function editReconciliationNew(reconciliationId) {
    logger.log('🔍 [EDIT-NEW] بدء تحميل التصفية للتعديل - معرف:', reconciliationId);

    if (!reconciliationId || Number.isNaN(Number(reconciliationId)) || reconciliationId <= 0) {
      logger.error('❌ [EDIT-NEW] معرف التصفية غير صحيح:', reconciliationId);
      DialogUtils.showError('معرف التصفية غير صحيح', 'خطأ في البيانات');
      return;
    }

    try {
      DialogUtils.showLoading('جاري تحميل بيانات التصفية للتعديل...');
      const reconciliationData = await fetchReconciliationForEdit(reconciliationId);

      if (!reconciliationData) {
        DialogUtils.close();
        DialogUtils.showError('لم يتم العثور على التصفية المطلوبة', 'تصفية غير موجودة');
        return;
      }

      DialogUtils.close();

      const editMode = getEditMode();
      editMode.isActive = true;
      editMode.reconciliationId = reconciliationId;
      const editableData = cloneData(reconciliationData);
      const formulaSettings = parseStoredFormulaSettings(editableData.reconciliation.formula_settings)
        || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      setActiveFormulaSettingsInDocument(document, formulaSettings);
      const formulaProfileIdInput = document.getElementById('activeReconciliationFormulaProfileId');
      if (formulaProfileIdInput) {
        const parsedFormulaProfileId = Number.parseInt(editableData.reconciliation.formula_profile_id, 10);
        formulaProfileIdInput.value = Number.isFinite(parsedFormulaProfileId) && parsedFormulaProfileId > 0
          ? String(parsedFormulaProfileId)
          : '';
      }
      editableData.reconciliation.formula_settings = formulaSettings;
      editMode.originalData = editableData;
      editMode.initialSnapshot = buildInitialSnapshot(editableData);

      setCurrentReconciliation({
        ...editableData.reconciliation,
        reconciliation_number: editableData.reconciliation.reconciliation_number
      });

      updateButtonStates('LOAD-RECONCILIATION');
      logger.log('📝 [EDIT-NEW] بدء تعبئة نافذة التعديل...');
      await populateEditModal(editableData);

      const modalElement = document.getElementById('editReconciliationModal');
      if (!modalElement) {
        throw new Error('نافذة التعديل غير موجودة في الصفحة');
      }

      // Keep modal at document root to avoid stacking-context issues.
      if (modalElement.parentElement !== document.body) {
        document.body.appendChild(modalElement);
      }

      logger.log('🖥️ [EDIT-NEW] عرض نافذة التعديل...');
      const editModal = new bootstrap.Modal(modalElement);
      editModal.show();

      setTimeoutFn(() => {
        if (modalElement.classList.contains('show')) {
          logger.log('✅ [EDIT-NEW] تم فتح نافذة التعديل بنجاح');
        } else {
          logger.warn('⚠️ [EDIT-NEW] نافذة التعديل لم تظهر بشكل صحيح');
        }
      }, 500);
    } catch (error) {
      DialogUtils.close();
      handleEditError(error, 'LOAD-RECONCILIATION', { reconciliationId });
    }
  }

  async function fetchReconciliationForEdit(reconciliationId) {
    logger.log('📡 [FETCH-EDIT] بدء جلب بيانات التصفية من قاعدة البيانات...');

    try {
      const data = await ipcRenderer.invoke('get-reconciliation-for-edit', reconciliationId);

      if (!data) {
        logger.warn('⚠️ [FETCH-EDIT] لم يتم العثور على بيانات للتصفية:', reconciliationId);
        return null;
      }

      if (!data.reconciliation) {
        logger.error('❌ [FETCH-EDIT] بيانات التصفية الأساسية مفقودة');
        throw new Error('بيانات التصفية الأساسية مفقودة');
      }

      logger.log('✅ [FETCH-EDIT] تم جلب البيانات بنجاح:', {
        reconciliationId: data.reconciliation.id,
        bankReceipts: data.bankReceipts?.length || 0,
        cashReceipts: data.cashReceipts?.length || 0,
        postpaidSales: data.postpaidSales?.length || 0,
        customerReceipts: data.customerReceipts?.length || 0,
        returnInvoices: data.returnInvoices?.length || 0,
        suppliers: data.suppliers?.length || 0
      });

      return data;
    } catch (error) {
      logger.error('❌ [FETCH-EDIT] خطأ في جلب البيانات:', error);
      throw new Error(`فشل في جلب بيانات التصفية: ${error.message}`);
    }
  }

  return {
    editReconciliationNew,
    fetchReconciliationForEdit
  };
}

module.exports = {
  createEditReconciliationLoader
};
