const { createReconciliationSaveResetHelpers } = require('./reconciliation-save-reset-helpers');
const { getEffectiveFormulaSettingsFromDocument } = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');
const { getSyncUpdateStatusUrl } = require('./sync-endpoints');

function createReconciliationSaveResetHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const dialogUtils = deps.dialogUtils;
  const windowObj = deps.windowObj || {};
  const fetchFn = deps.fetchFn || fetch;
  const logger = deps.logger || console;

  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const setCurrentReconciliation = deps.setCurrentReconciliation;
  const getBankReceipts = deps.getBankReceipts;
  const setBankReceipts = deps.setBankReceipts;
  const getCashReceipts = deps.getCashReceipts;
  const setCashReceipts = deps.setCashReceipts;
  const getPostpaidSales = deps.getPostpaidSales;
  const setPostpaidSales = deps.setPostpaidSales;
  const getCustomerReceipts = deps.getCustomerReceipts;
  const setCustomerReceipts = deps.setCustomerReceipts;
  const getReturnInvoices = deps.getReturnInvoices;
  const setReturnInvoices = deps.setReturnInvoices;
  const getSuppliers = deps.getSuppliers;
  const setSuppliers = deps.setSuppliers;

  const validateReconciliationBeforeSave = deps.validateReconciliationBeforeSave;
  const formatCurrency = deps.formatCurrency;
  const isSyncEnabled = deps.isSyncEnabled;
  const updateBankReceiptsTable = deps.updateBankReceiptsTable;
  const updateCashReceiptsTable = deps.updateCashReceiptsTable;
  const updatePostpaidSalesTable = deps.updatePostpaidSalesTable;
  const updateCustomerReceiptsTable = deps.updateCustomerReceiptsTable;
  const updateReturnInvoicesTable = deps.updateReturnInvoicesTable;
  const updateSuppliersTable = deps.updateSuppliersTable;
  const updateSummary = deps.updateSummary;
  const getResetSystemToNewReconciliationState = deps.getResetSystemToNewReconciliationState;

  const resetHelpers = createReconciliationSaveResetHelpers({
    document: doc,
    windowObj,
    dialogUtils,
    logger,
    getCurrentReconciliation,
    setCurrentReconciliation,
    setBankReceipts,
    setCashReceipts,
    setPostpaidSales,
    setCustomerReceipts,
    setReturnInvoices,
    setSuppliers,
    updateBankReceiptsTable,
    updateCashReceiptsTable,
    updatePostpaidSalesTable,
    updateCustomerReceiptsTable,
    updateReturnInvoicesTable,
    updateSuppliersTable,
    updateSummary,
    getResetSystemToNewReconciliationState
  });

  const clearAllReconciliationData = resetHelpers.clearAllReconciliationData;
  const resetUIOnly = resetHelpers.resetUIOnly;
  const clearAllFormFields = resetHelpers.clearAllFormFields;
  const clearAllTables = resetHelpers.clearAllTables;
  const resetAllTotalsAndSummaries = resetHelpers.resetAllTotalsAndSummaries;

  function isRecalledReconciliation(reconciliation) {
    return !!(reconciliation && (reconciliation.__mode === 'recalled' || reconciliation.is_recalled === true));
  }

  function parseNumericText(value) {
    if (value === null || value === undefined) {
      return 0;
    }
    const normalized = String(value).replace(/,/g, '').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseFormulaProfileId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeOptionalBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value > 0 : null;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return true;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return false;
    }

    return null;
  }

  function toDbBoolean(value) {
    return value ? 1 : 0;
  }

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

  async function resolveDefaultCashboxPostingChoice(currentReconciliation) {
    const explicitChoice = normalizeOptionalBoolean(currentReconciliation?.cashbox_posting_enabled);
    if (explicitChoice !== null) {
      return explicitChoice;
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

  async function askCashboxPostingChoice(options = {}) {
    const isRecalled = !!options.isRecalled;
    const defaultEnabled = !!options.defaultEnabled;
    const defaultLabel = defaultEnabled ? 'الترحيل للصندوق (افتراضي)' : 'بدون ترحيل للصندوق (افتراضي)';
    const statusLabel = isRecalled ? 'تعديل تصفية' : 'تصفية جديدة';
    const saveButtonLabel = isRecalled ? 'حفظ التعديل' : 'حفظ التصفية';

    // Tests and headless contexts may not have a full DOM to host the modal.
    if (
      !doc
      || typeof doc.createElement !== 'function'
      || !doc.body
      || typeof doc.body.appendChild !== 'function'
    ) {
      return {
        cancelled: false,
        postToCashbox: defaultEnabled
      };
    }

    return new Promise((resolve) => {
      const dialog = doc.createElement('div');
      dialog.className = 'modal fade show';
      dialog.style.display = 'block';
      dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';
      dialog.style.zIndex = '1080';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      dialog.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-info text-white">
              <h5 class="modal-title">${saveButtonLabel}</h5>
            </div>
            <div class="modal-body">
              <p class="mb-2">أنت الآن تحفظ <strong>${statusLabel}</strong>.</p>
              <p class="text-muted mb-0"><small>الافتراضي الحالي: ${defaultLabel}</small></p>
              <div class="form-check form-switch mt-3">
                <input class="form-check-input" type="checkbox" id="cashboxPostingChoiceToggle" ${defaultEnabled ? 'checked' : ''}>
                <label class="form-check-label" for="cashboxPostingChoiceToggle">ترحيل هذه التصفية إلى الصندوق تلقائيًا</label>
              </div>
              <p class="text-muted mt-2 mb-0"><small>عند إلغاء التحديد في التعديل، سيتم حذف السندات التلقائية السابقة المرتبطة بهذه التصفية.</small></p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cashboxPostingChoiceCancelBtn">إلغاء</button>
              <button type="button" class="btn btn-primary" id="cashboxPostingChoiceSaveBtn">${saveButtonLabel}</button>
            </div>
          </div>
        </div>
      `;

      doc.body.appendChild(dialog);

      const toggle = doc.getElementById('cashboxPostingChoiceToggle');
      const saveBtn = doc.getElementById('cashboxPostingChoiceSaveBtn');
      const cancelBtn = doc.getElementById('cashboxPostingChoiceCancelBtn');

      const cleanup = (result) => {
        dialog.remove();
        resolve(result);
      };

      if (saveBtn) {
        saveBtn.onclick = () => cleanup({
          cancelled: false,
          postToCashbox: !!toggle?.checked
        });
      }
      if (cancelBtn) {
        cancelBtn.onclick = () => cleanup({ cancelled: true, postToCashbox: defaultEnabled });
      }

      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          cleanup({ cancelled: true, postToCashbox: defaultEnabled });
        }
      });

      toggle?.focus();
    });
  }

  function updateCurrentReconciliationInfo(currentReconciliation) {
    const infoDiv = doc.getElementById('currentReconciliationInfo');
    const detailsSpan = doc.getElementById('currentReconciliationDetails');
    if (!infoDiv || !detailsSpan) {
      return;
    }

    const cashierSelect = doc.getElementById('cashierSelect');
    const accountantSelect = doc.getElementById('accountantSelect');
    const cashierText = cashierSelect?.selectedOptions?.[0]?.textContent || currentReconciliation.cashier_name || '';
    const accountantText = accountantSelect?.selectedOptions?.[0]?.textContent || currentReconciliation.accountant_name || '';

    let infoText = `الكاشير: ${cashierText} - المحاسب: ${accountantText} - التاريخ: ${currentReconciliation.reconciliation_date || ''}`;
    if (currentReconciliation.time_range_start && currentReconciliation.time_range_end) {
      infoText += ` - النطاق الزمني: ${currentReconciliation.time_range_start} إلى ${currentReconciliation.time_range_end}`;
    }
    if (currentReconciliation.filter_notes) {
      infoText += ` - الملاحظات: ${currentReconciliation.filter_notes}`;
    }

    const reconciliationLabel = currentReconciliation.reconciliation_number || currentReconciliation.id;
    detailsSpan.textContent = `${infoText} (رقم التصفية: ${reconciliationLabel})`;
    infoDiv.style.display = 'block';
  }

async function handleSaveReconciliation() {
  logger.log('💾 [SAVE] بدء حفظ التصفية...');
  const currentReconciliation = getCurrentReconciliation();

  try {
    if (!currentReconciliation) {
      dialogUtils.showError('لا توجد تصفية حالية للحفظ', 'خطأ في الحفظ');
      return;
    }

    const isRecalled = isRecalledReconciliation(currentReconciliation);

    const validation = validateReconciliationBeforeSave();
    if (!validation.isValid) {
      logger.error('❌ [SAVE] فشل في التحقق من صحة البيانات:', validation.errors);
      dialogUtils.showValidationError(
        `يرجى تصحيح الأخطاء التالية قبل الحفظ:\n\n• ${validation.errors.join('\n• ')}`
      );
      return;
    }

    const defaultCashboxPostingEnabled = await resolveDefaultCashboxPostingChoice(currentReconciliation);
    const postingChoice = await askCashboxPostingChoice({
      isRecalled,
      defaultEnabled: defaultCashboxPostingEnabled
    });
    if (postingChoice.cancelled) {
      logger.log('ℹ️ [SAVE] تم إلغاء حفظ التصفية من نافذة اختيار ترحيل الصندوق.');
      return;
    }
    const cashboxPostingEnabled = postingChoice.postToCashbox === true;

    dialogUtils.showLoading('جاري حفظ التصفية...', 'يرجى الانتظار');

    const systemSales = parseNumericText(doc.getElementById('systemSales').value);
    const totalReceipts = parseNumericText(doc.getElementById('totalReceipts').textContent);
    const surplusDeficit = totalReceipts - systemSales;
    const formulaSettings = getEffectiveFormulaSettingsFromDocument(doc);
    const formulaSettingsJson = JSON.stringify(formulaSettings);
    const profileInput = doc.getElementById('activeReconciliationFormulaProfileId');
    const formulaProfileId = parseFormulaProfileId(
      profileInput && profileInput.value !== ''
        ? profileInput.value
        : currentReconciliation.formula_profile_id
    );
    const reconciliationId = currentReconciliation.id;
    const cashierId = doc.getElementById('cashierSelect').value || currentReconciliation.cashier_id;
    const accountantId = doc.getElementById('accountantSelect').value || currentReconciliation.accountant_id;
    const reconciliationDate = doc.getElementById('reconciliationDate').value || currentReconciliation.reconciliation_date;
    const timeRangeStart = doc.getElementById('timeRangeStart').value || null;
    const timeRangeEnd = doc.getElementById('timeRangeEnd').value || null;
    const filterNotes = (doc.getElementById('filterNotes').value || '').trim() || null;

      logger.log('📊 [SAVE] بيانات التصفية للحفظ:', {
      reconciliationId,
      systemSales,
      totalReceipts,
      surplusDeficit,
      isRecalled,
      cashboxPostingEnabled,
      dataArrays: {
        bankReceipts: getBankReceipts().length,
        cashReceipts: getCashReceipts().length,
        postpaidSales: getPostpaidSales().length,
        customerReceipts: getCustomerReceipts().length,
        returnInvoices: getReturnInvoices().length,
        suppliers: getSuppliers().length
      }
    });

    let reconciliationNumber = currentReconciliation.reconciliation_number || null;
    if (isRecalled) {
      logger.log('📊 [SAVE] حفظ التعديلات على نفس التصفية بدون تخصيص رقم جديد:', reconciliationNumber);
    } else {
      reconciliationNumber = await ipc.invoke('get-next-reconciliation-number');
      logger.log('📊 [SAVE] رقم التصفية الجديد المخصص:', reconciliationNumber);
    }

    if (isRecalled) {
      await ipc.invoke(
        'db-run',
        `UPDATE reconciliations
         SET cashier_id = ?,
             accountant_id = ?,
             reconciliation_date = ?,
             time_range_start = ?,
             time_range_end = ?,
             filter_notes = ?,
             system_sales = ?,
             total_receipts = ?,
             surplus_deficit = ?,
             formula_profile_id = COALESCE(?, formula_profile_id),
             formula_settings = ?,
             cashbox_posting_enabled = ?,
             status = 'completed',
             reconciliation_number = ?,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_date = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          cashierId,
          accountantId,
          reconciliationDate,
          timeRangeStart,
          timeRangeEnd,
          filterNotes,
          systemSales,
          totalReceipts,
          surplusDeficit,
          formulaProfileId,
          formulaSettingsJson,
          toDbBoolean(cashboxPostingEnabled),
          reconciliationNumber,
          reconciliationId
        ]
      );
    } else {
      await ipc.invoke(
        'complete-reconciliation',
        reconciliationId,
        systemSales,
        totalReceipts,
        surplusDeficit,
        reconciliationNumber,
        formulaSettingsJson,
        formulaProfileId,
        cashboxPostingEnabled
      );
    }

    if (isRecalled) {
      try {
        const cashboxSyncResult = await ipc.invoke('sync-reconciliation-cashbox-vouchers', reconciliationId);
        logger.log('🧾 [SAVE] Cashbox auto-sync result after recalled reconciliation save:', cashboxSyncResult);
        if (cashboxPostingEnabled) {
          const skippedReasonMessage = mapCashboxSyncSkippedReason(cashboxSyncResult?.skippedReason);
          if (skippedReasonMessage && typeof dialogUtils.showWarningToast === 'function') {
            dialogUtils.showWarningToast(skippedReasonMessage);
          } else if (typeof dialogUtils.showSuccessToast === 'function') {
            const createdCount = Number(cashboxSyncResult?.created || 0);
            const updatedCount = Number(cashboxSyncResult?.updated || 0);
            const deletedCount = Number(cashboxSyncResult?.deleted || 0);
            dialogUtils.showSuccessToast(
              `تم ترحيل التصفية للصندوق (إضافة: ${createdCount}، تعديل: ${updatedCount}، حذف: ${deletedCount})`
            );
          }
        }
      } catch (cashboxSyncError) {
        logger.warn('⚠️ [SAVE] تعذر مزامنة سندات الصندوق تلقائياً بعد حفظ التصفية المستدعاة:', cashboxSyncError);
        if (typeof dialogUtils.showWarningToast === 'function') {
          dialogUtils.showWarningToast('تم حفظ التصفية لكن تعذر مزامنة سندات الصندوق تلقائيًا');
        }
      }
    }

    logger.log('✅ [SAVE] تم حفظ التصفية في قاعدة البيانات بنجاح مع رقم التصفية:', reconciliationNumber);
    currentReconciliation.reconciliation_number = reconciliationNumber;
    currentReconciliation.cashier_id = cashierId;
    currentReconciliation.accountant_id = accountantId;
    currentReconciliation.reconciliation_date = reconciliationDate;
    currentReconciliation.time_range_start = timeRangeStart;
    currentReconciliation.time_range_end = timeRangeEnd;
    currentReconciliation.filter_notes = filterNotes;
    currentReconciliation.status = 'completed';
    currentReconciliation.formula_profile_id = formulaProfileId;
    currentReconciliation.formula_settings = formulaSettings;
    currentReconciliation.cashbox_posting_enabled = toDbBoolean(cashboxPostingEnabled);
    dialogUtils.close();

    if (currentReconciliation.originRequestId) {
      logger.log('📡 [SAVE] Dispatching update event for Request ID:', currentReconciliation.originRequestId);
      windowObj.dispatchEvent(new CustomEvent('reconciliation-saved', {
        detail: {
          originRequestId: currentReconciliation.originRequestId,
          reconciliationNumber
        }
      }));

      try {
        const reqId = currentReconciliation.originRequestId;
        logger.log(`💾 [SAVE] Updating request ${reqId} status directly via IPC...`);
        await ipc.invoke(
          'db-run',
          "UPDATE reconciliation_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [reqId]
        );
        logger.log(`✅ [SAVE] Request ${reqId} marked as completed in local DB.`);

        if (await isSyncEnabled()) {
          const remoteUrl = getSyncUpdateStatusUrl({ preferLocal: false });
          const localUrl = getSyncUpdateStatusUrl({ preferLocal: true });
          fetchFn(remoteUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: reqId, status: 'completed' })
          }).catch(() => {
            // Fallback to local sync endpoint if remote is unavailable
            fetchFn(localUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: reqId, status: 'completed' })
            }).catch(() => {});
          });
        } else {
          logger.log('⛔ [SAVE] Sync disabled - skipping server notification');
        }
      } catch (dbErr) {
        logger.error('❌ [SAVE] Failed to update request status in DB:', dbErr);
      }
    }

    if (isRecalled) {
      const displayedReconciliationNumber = reconciliationNumber || currentReconciliation.id;
      const updatedSnapshot = {
        reconciliation: JSON.parse(JSON.stringify(currentReconciliation)),
        sections: {
          bankReceipts: JSON.parse(JSON.stringify(getBankReceipts())),
          cashReceipts: JSON.parse(JSON.stringify(getCashReceipts())),
          postpaidSales: JSON.parse(JSON.stringify(getPostpaidSales())),
          customerReceipts: JSON.parse(JSON.stringify(getCustomerReceipts())),
          returnInvoices: JSON.parse(JSON.stringify(getReturnInvoices())),
          suppliers: JSON.parse(JSON.stringify(getSuppliers()))
        }
      };

      if (windowObj) {
        windowObj.recalledReconciliationSnapshot = updatedSnapshot;
      }
      currentReconciliation.__snapshot = updatedSnapshot;

      updateCurrentReconciliationInfo(currentReconciliation);
      await dialogUtils.showSuccess(
        `تم حفظ التعديلات على نفس التصفية بنجاح.\n\n📋 رقم التصفية: #${displayedReconciliationNumber}\n🧾 ترحيل الصندوق: ${cashboxPostingEnabled ? 'مفعل' : 'غير مفعل'}\n\nسيتم الآن تفريغ البيانات وإعداد تصفية جديدة.`,
        'تم حفظ التعديلات'
      );
      dialogUtils.showSuccessToast('تم حفظ التعديلات على التصفية المستدعاة');
      logger.log('✅ [SAVE] تم حفظ التعديلات على نفس التصفية وسيتم تفريغ الشاشة لتصفية جديدة');
    } else {
      const successMessage = `تم حفظ التصفية بنجاح! 🎉\n\n`
        + `📋 رقم التصفية: #${reconciliationNumber}\n`
        + `💰 إجمالي المقبوضات: ${formatCurrency(totalReceipts)} ريال\n`
        + `🏪 مبيعات النظام: ${formatCurrency(systemSales)} ريال\n`
        + `📊 ${surplusDeficit >= 0 ? 'الفائض' : 'العجز'}: ${formatCurrency(Math.abs(surplusDeficit))} ريال\n\n`
        + `🧾 ترحيل الصندوق لهذه التصفية: ${cashboxPostingEnabled ? 'مفعل' : 'غير مفعل'}\n\n`
        + 'سيتم الآن تفريغ البيانات وإعداد تصفية جديدة.';

      await dialogUtils.showSuccess(successMessage, 'تم حفظ التصفية بنجاح');
    }

    if (windowObj.pendingReconciliationData) {
      logger.log('🧹 [SAVE] Ensuring pendingReconciliationData is fully cleared');
      windowObj.pendingReconciliationData = null;
    }

    logger.log('🧹 [SAVE] بدء تفريغ البيانات وإعادة التهيئة...');
    await clearAllReconciliationData();
    getResetSystemToNewReconciliationState()();
    dialogUtils.showSuccessToast('تم تفريغ البيانات وإعداد تصفية جديدة بنجاح');
    logger.log('🎉 [SAVE] تم إكمال عملية الحفظ والتفريغ بنجاح');

    const newReconciliationTab = doc.querySelector('[data-section="reconciliation"]');
    if (newReconciliationTab && !newReconciliationTab.classList.contains('active')) {
      logger.log('🔄 [SAVE] التبديل إلى تبويب التصفية الجديدة...');
      newReconciliationTab.click();
    }
  } catch (error) {
    dialogUtils.close();
    logger.error('❌ [SAVE] خطأ في حفظ التصفية:', error);
    const friendly = mapDbErrorMessage(error, {
      context: 'reconciliation',
      requiredMessage: 'يرجى التأكد من تعبئة بيانات التصفية الأساسية قبل الحفظ.',
      foreignKeyMessage: 'بعض البيانات المرتبطة بالتصفية غير صالحة أو غير موجودة.',
      fallback: 'حدث خطأ أثناء حفظ التصفية.'
    });
    dialogUtils.showError(
      `${friendly}\n\nيرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.`,
      'خطأ في حفظ التصفية'
    );
  }
}

  return {
    handleSaveReconciliation,
    clearAllReconciliationData,
    resetUIOnly,
    clearAllFormFields,
    clearAllTables,
    resetAllTotalsAndSummaries
  };
}

module.exports = {
  createReconciliationSaveResetHandlers
};

