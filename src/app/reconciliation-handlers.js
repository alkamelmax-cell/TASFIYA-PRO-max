const {
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  RECONCILIATION_FORMULA_FIELDS,
  normalizeFormulaSettings,
  updateFormulaPreviewInDocument
} = require('./reconciliation-formula');

function createReconciliationHandlers(deps) {
  const ipc = deps.ipcRenderer;
  const doc = deps.document;
  const getDialogUtils = deps.getDialogUtils;
  const getCurrentReconciliation = typeof deps.getCurrentReconciliation === 'function'
    ? deps.getCurrentReconciliation
    : () => null;
  const loadCustomersForDropdowns = typeof deps.loadCustomersForDropdowns === 'function'
    ? deps.loadCustomersForDropdowns
    : async () => {};
  const loadSuppliersForDropdowns = typeof deps.loadSuppliersForDropdowns === 'function'
    ? deps.loadSuppliersForDropdowns
    : async () => {};
  const logger = deps.logger || console;
  let atmLoadRequestSeq = 0;

  function isRecalledReconciliation(reconciliation) {
    return !!(reconciliation && (reconciliation.__mode === 'recalled' || reconciliation.is_recalled === true));
  }

  function applyFormulaSettingsToUi(formulaSettings, formulaProfileId = null) {
    if (!doc || typeof doc.getElementById !== 'function') {
      return;
    }

    const normalizedSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const selectEl = doc.getElementById(field.fieldId);
      if (selectEl) {
        selectEl.value = String(normalizedSettings[field.settingKey]);
      }
    });

    const profileIdInput = doc.getElementById('activeReconciliationFormulaProfileId');
    if (profileIdInput) {
      profileIdInput.value = formulaProfileId ? String(formulaProfileId) : '';
    }

    updateFormulaPreviewInDocument(doc, normalizedSettings);
    if (typeof globalThis?.updateSummary === 'function') {
      globalThis.updateSummary();
    }
  }

  function parseFormulaSettingsJson(settingsJson) {
    if (!settingsJson) {
      return null;
    }
    try {
      const parsed = JSON.parse(settingsJson);
      return normalizeFormulaSettings(parsed);
    } catch (error) {
      return null;
    }
  }

  async function loadFormulaSettingsForBranch(branchId) {
    const numericBranchId = Number.parseInt(branchId, 10);

    if (Number.isFinite(numericBranchId) && numericBranchId > 0) {
      const branchFormula = await ipc.invoke(
        'db-get',
        `SELECT
           p.id AS formula_profile_id,
           p.settings_json
         FROM branches b
         LEFT JOIN reconciliation_formula_profiles p
           ON p.id = b.reconciliation_formula_id
         WHERE b.id = ?
         LIMIT 1`,
        [numericBranchId]
      );

      const parsedBranchFormula = parseFormulaSettingsJson(branchFormula && branchFormula.settings_json);
      if (parsedBranchFormula) {
        return {
          formulaProfileId: branchFormula.formula_profile_id || null,
          formulaSettings: parsedBranchFormula
        };
      }
    }

    const defaultProfile = await ipc.invoke(
      'db-get',
      `SELECT id AS formula_profile_id, settings_json
       FROM reconciliation_formula_profiles
       WHERE is_active = 1
       ORDER BY is_default DESC, id ASC
       LIMIT 1`
    );

    const parsedDefaultFormula = parseFormulaSettingsJson(defaultProfile && defaultProfile.settings_json);
    if (parsedDefaultFormula) {
      return {
        formulaProfileId: defaultProfile.formula_profile_id || null,
        formulaSettings: parsedDefaultFormula
      };
    }

    return null;
  }

  async function handleBranchChange(event) {
    logger.log('🏢 [BRANCH] تغيير الفرع...');
    const branchId = event.target.value;
    const atmSelect = doc.getElementById('atmSelect');
    const requestSeq = ++atmLoadRequestSeq;

    if (!atmSelect) {
      logger.error('❌ [BRANCH] لم يتم العثور على قائمة الأجهزة');
      return;
    }

    try {
      atmSelect.innerHTML = '<option value="">اختر الجهاز</option>';

      if (branchId) {
        logger.log(`📍 [BRANCH] جلب أجهزة الفرع ${branchId}...`);

        const atms = await ipc.invoke(
          'db-query',
          `SELECT DISTINCT id, name, bank_name
                 FROM atms
                 WHERE branch_id = ? AND active = 1
                 ORDER BY name`,
          [branchId]
        );

        // Ignore stale async responses when branch change fires rapidly or multiple listeners exist.
        if (requestSeq !== atmLoadRequestSeq) {
          logger.log('ℹ️ [BRANCH] تم تجاهل نتيجة قديمة لتحميل الأجهزة');
          return;
        }

        logger.log(`✅ [BRANCH] تم العثور على ${atms.length} جهاز`);

        const renderedAtmIds = new Set();
        atms.forEach((atm) => {
          const atmKey = String(atm.id);
          if (renderedAtmIds.has(atmKey)) {
            return;
          }
          renderedAtmIds.add(atmKey);
          const option = doc.createElement('option');
          option.value = atm.id;
          option.textContent = `${atm.name} - ${atm.bank_name}`;
          atmSelect.appendChild(option);
        });

        atmSelect.disabled = false;
      } else {
        logger.log('ℹ️ [BRANCH] لم يتم اختيار فرع');
        atmSelect.disabled = true;
      }

      // Keep customer/supplier dropdowns scoped to the selected branch only.
      await Promise.allSettled([
        loadCustomersForDropdowns(branchId),
        loadSuppliersForDropdowns(branchId)
      ]);

      const currentReconciliation = getCurrentReconciliation();
      if (isRecalledReconciliation(currentReconciliation) && currentReconciliation.formula_settings) {
        applyFormulaSettingsToUi(
          currentReconciliation.formula_settings,
          currentReconciliation.formula_profile_id || null
        );
        return;
      }

      const branchFormula = await loadFormulaSettingsForBranch(branchId);
      if (branchFormula) {
        applyFormulaSettingsToUi(branchFormula.formulaSettings, branchFormula.formulaProfileId);
      } else {
        applyFormulaSettingsToUi(DEFAULT_RECONCILIATION_FORMULA_SETTINGS, null);
      }
    } catch (error) {
      logger.error('❌ [BRANCH] خطأ في جلب الأجهزة:', error);
      const dialogUtils = getDialogUtils();
      dialogUtils.showErrorToast('حدث خطأ أثناء جلب الأجهزة');
    }
  }

  function handleOperationTypeChange(event) {
    const operationType = event.target.value;
    const atmSelect = doc.getElementById('atmSelect');
    const bankName = doc.getElementById('bankName');

    if (operationType === 'تحويل') {
      atmSelect.disabled = true;
      atmSelect.value = '';
      atmSelect.removeAttribute('required');
      bankName.value = '';
      logger.log('🔄 [OPERATION] تم إلغاء اختيار الجهاز لعملية التحويل');
    } else {
      atmSelect.disabled = false;
      atmSelect.setAttribute('required', 'required');
      logger.log('🏧 [OPERATION] تم تفعيل اختيار الجهاز للعمليات الأخرى');
    }
  }

  function handleEditOperationTypeChange(event) {
    const operationType = event.target.value;
    const editAtmSelect = doc.getElementById('editAtmSelect');
    const editBankName = doc.getElementById('editBankName');

    if (operationType === 'تحويل') {
      editAtmSelect.disabled = true;
      editAtmSelect.value = '';
      editAtmSelect.removeAttribute('required');
      editBankName.value = '';
      logger.log('🔄 [EDIT] تم إلغاء اختيار الجهاز لعملية التحويل');
    } else {
      editAtmSelect.disabled = false;
      editAtmSelect.setAttribute('required', 'required');
      logger.log('🏧 [EDIT] تم تفعيل اختيار الجهاز للعمليات الأخرى');
    }
  }

  function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';

    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }

  return {
    handleBranchChange,
    handleOperationTypeChange,
    handleEditOperationTypeChange,
    showError
  };
}

module.exports = {
  createReconciliationHandlers
};
