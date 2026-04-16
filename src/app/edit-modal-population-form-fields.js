function createEditModalFormFieldHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const EventCtor = deps.EventCtor || Event;
  const ensureCashiersAndAccountantsLoaded = deps.ensureCashiersAndAccountantsLoaded;
  const loadEditCashiersByBranch = deps.loadEditCashiersByBranch || (async () => {});
  const logger = deps.logger || console;

  function normalizeOptionalBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }
      return value !== 0;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
    return null;
  }

  async function resolveCashboxPostingPreference(reconciliation) {
    const explicitPreference = normalizeOptionalBoolean(reconciliation?.cashbox_posting_enabled);
    if (explicitPreference !== null) {
      return explicitPreference;
    }

    try {
      const settingRow = await ipc.invoke(
        'db-get',
        `SELECT setting_value
         FROM system_settings
         WHERE category = ?
           AND setting_key = ?
         LIMIT 1`,
        ['cashboxes', 'auto_post_reconciliation_vouchers']
      );
      return normalizeOptionalBoolean(settingRow?.setting_value) === true;
    } catch (_error) {
      return false;
    }
  }

  async function populateEditFormFields(reconciliation) {
    logger.log('📋 [FORM-FIELDS] تعبئة حقول النموذج...');
    logger.log('📊 [FORM-FIELDS] بيانات التصفية:', {
      id: reconciliation.id,
      cashier_id: reconciliation.cashier_id,
      accountant_id: reconciliation.accountant_id,
      reconciliation_date: reconciliation.reconciliation_date,
      system_sales: reconciliation.system_sales
    });

    try {
      logger.log('👥 [FORM-FIELDS] تحميل الفروع والكاشيرين والمحاسبين...');
      await ensureCashiersAndAccountantsLoaded();

      let selectedBranchId = null;
      try {
        const cashier = await ipc.invoke(
          'db-get',
          'SELECT branch_id FROM cashiers WHERE id = ?',
          [reconciliation.cashier_id]
        );
        if (cashier && cashier.branch_id) {
          selectedBranchId = cashier.branch_id;
          logger.log('📍 [FORM-FIELDS] تم الحصول على الفرع من الكاشير:', selectedBranchId);
        }
      } catch (branchError) {
        logger.warn('⚠️ [FORM-FIELDS] تعذر الحصول على الفرع من الكاشير:', branchError);
      }

      logger.log('🏢 [FORM-FIELDS] تعبئة الفرع...');
      const editBranchSelect = doc.getElementById('editBranchSelect');
      if (editBranchSelect && selectedBranchId) {
        editBranchSelect.value = selectedBranchId;
        await loadEditCashiersByBranch(selectedBranchId, reconciliation.cashier_id);
        logger.log('✅ [FORM-FIELDS] تم تعبئة الفرع:', selectedBranchId);
      } else if (reconciliation.cashier_id) {
        await loadEditCashiersByBranch(null, reconciliation.cashier_id);
      } else if (!editBranchSelect) {
        logger.error('❌ [FORM-FIELDS] عنصر اختيار الفرع غير موجود');
      }

      logger.log('👤 [FORM-FIELDS] تعبئة الكاشير...');
      const editCashierSelect = doc.getElementById('editCashierSelect');
      if (editCashierSelect) {
        if (reconciliation.cashier_id) {
          editCashierSelect.value = reconciliation.cashier_id;
          editCashierSelect.dispatchEvent(new EventCtor('change'));
          logger.log('✅ [FORM-FIELDS] تم تعبئة الكاشير:', reconciliation.cashier_id);
        } else {
          logger.warn('⚠️ [FORM-FIELDS] معرف الكاشير مفقود');
        }
      } else {
        logger.error('❌ [FORM-FIELDS] عنصر اختيار الكاشير غير موجود');
      }

      logger.log('📋 [FORM-FIELDS] تعبئة المحاسب...');
      const editAccountantSelect = doc.getElementById('editAccountantSelect');
      if (editAccountantSelect) {
        if (reconciliation.accountant_id) {
          editAccountantSelect.value = reconciliation.accountant_id;
          logger.log('✅ [FORM-FIELDS] تم تعبئة المحاسب:', reconciliation.accountant_id);
        } else {
          logger.warn('⚠️ [FORM-FIELDS] معرف المحاسب مفقود');
        }
      } else {
        logger.error('❌ [FORM-FIELDS] عنصر اختيار المحاسب غير موجود');
      }

      logger.log('📅 [FORM-FIELDS] تعبئة تاريخ التصفية...');
      const editReconciliationDate = doc.getElementById('editReconciliationDate');
      if (editReconciliationDate) {
        if (reconciliation.reconciliation_date) {
          editReconciliationDate.value = reconciliation.reconciliation_date;
          logger.log('✅ [FORM-FIELDS] تم تعبئة تاريخ التصفية:', reconciliation.reconciliation_date);
        } else {
          logger.warn('⚠️ [FORM-FIELDS] تاريخ التصفية مفقود');
        }
      } else {
        logger.error('❌ [FORM-FIELDS] عنصر تاريخ التصفية غير موجود');
      }

      logger.log('⏰ [FORM-FIELDS] تعبئة النطاق الزمني...');
      const editTimeRangeStart = doc.getElementById('editTimeRangeStart');
      const editTimeRangeEnd = doc.getElementById('editTimeRangeEnd');

      if (editTimeRangeStart) {
        editTimeRangeStart.value = reconciliation.time_range_start || '';
        logger.log('✅ [FORM-FIELDS] تم تعبئة وقت البداية:', reconciliation.time_range_start || 'فارغ');
      } else {
        logger.warn('⚠️ [FORM-FIELDS] عنصر وقت البداية غير موجود');
      }

      if (editTimeRangeEnd) {
        editTimeRangeEnd.value = reconciliation.time_range_end || '';
        logger.log('✅ [FORM-FIELDS] تم تعبئة وقت النهاية:', reconciliation.time_range_end || 'فارغ');
      } else {
        logger.warn('⚠️ [FORM-FIELDS] عنصر وقت النهاية غير موجود');
      }

      logger.log('📝 [FORM-FIELDS] تعبئة ملاحظات التصفية...');
      const editFilterNotes = doc.getElementById('editFilterNotes');
      if (editFilterNotes) {
        editFilterNotes.value = reconciliation.filter_notes || '';
        logger.log('✅ [FORM-FIELDS] تم تعبئة ملاحظات التصفية:', reconciliation.filter_notes || 'فارغ');
      } else {
        logger.warn('⚠️ [FORM-FIELDS] عنصر ملاحظات التصفية غير موجود');
      }

      logger.log('💰 [FORM-FIELDS] تعبئة مبيعات النظام...');
      const editSystemSales = doc.getElementById('editSystemSales');
      if (editSystemSales) {
        const systemSales = reconciliation.system_sales || 0;
        editSystemSales.value = systemSales;
        logger.log('✅ [FORM-FIELDS] تم تعبئة مبيعات النظام:', systemSales);
      } else {
        logger.error('❌ [FORM-FIELDS] عنصر مبيعات النظام غير موجود');
      }

      logger.log('🧾 [FORM-FIELDS] تعبئة خيار ترحيل الصندوق...');
      const editCashboxPostingEnabled = doc.getElementById('editCashboxPostingEnabled');
      if (editCashboxPostingEnabled) {
        const postingEnabled = await resolveCashboxPostingPreference(reconciliation);
        editCashboxPostingEnabled.checked = postingEnabled;
        logger.log('✅ [FORM-FIELDS] تم تعبئة خيار ترحيل الصندوق:', postingEnabled);
      } else {
        logger.warn('⚠️ [FORM-FIELDS] عنصر خيار ترحيل الصندوق غير موجود');
      }

      logger.log('✅ [FORM-FIELDS] تم تعبئة حقول النموذج بنجاح');
    } catch (error) {
      logger.error('❌ [FORM-FIELDS] خطأ في تعبئة حقول النموذج:', error);
      logger.error('❌ [FORM-FIELDS] تفاصيل الخطأ:', {
        message: error.message,
        stack: error.stack,
        reconciliation
      });
      throw error;
    }
  }

  return {
    populateEditFormFields
  };
}

module.exports = {
  createEditModalFormFieldHandlers
};
