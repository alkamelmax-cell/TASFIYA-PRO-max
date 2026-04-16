const {
  RECONCILIATION_FORMULA_FIELDS,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  normalizeFormulaSettings,
  applyFormulaPresetToDocument,
  getFormulaSettingsFromDocument,
  updateFormulaPreviewInDocument,
  buildFormulaPreviewText
} = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');

function createSystemSettingsSaveActions(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const window = context.windowObj || globalThis;
  const FormData = context.FormDataCtor || globalThis.FormData;
  const getDialogUtils = context.getDialogUtils;
  const applyTheme = context.applyTheme;
  const logger = context.logger || console;
  const FORMULA_MODAL_FIELD_IDS = {
    bank_receipts_sign: 'formulaModalBankReceipts',
    cash_receipts_sign: 'formulaModalCashReceipts',
    postpaid_sales_sign: 'formulaModalPostpaidSales',
    customer_receipts_sign: 'formulaModalCustomerReceipts',
    return_invoices_sign: 'formulaModalReturnInvoices',
    suppliers_sign: 'formulaModalSuppliers'
  };

  function parseFormulaProfileId(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function getFormulaProfileSelect() {
    return document.getElementById('formulaProfileSelect');
  }

  function getSelectedProfileIdInput() {
    return document.getElementById('selectedFormulaProfileId');
  }

  function setSelectedFormulaProfileIdInDocument(profileId) {
    const normalizedId = parseFormulaProfileId(profileId);
    const profileSelect = getFormulaProfileSelect();
    const selectedProfileIdInput = getSelectedProfileIdInput();
    const value = normalizedId ? String(normalizedId) : '';

    if (selectedProfileIdInput) {
      selectedProfileIdInput.value = value;
    }
    if (profileSelect) {
      profileSelect.value = value;
    }

    return normalizedId;
  }

  function getSelectedFormulaProfileIdFromDocument() {
    const selectedProfileIdInput = getSelectedProfileIdInput();
    if (selectedProfileIdInput) {
      const hiddenSelection = parseFormulaProfileId(selectedProfileIdInput.value);
      if (hiddenSelection) {
        return hiddenSelection;
      }
    }

    const profileSelect = getFormulaProfileSelect();
    return profileSelect ? parseFormulaProfileId(profileSelect.value) : null;
  }

  function getCurrentFormulaNameFromDocument() {
    const profileNameInput = document.getElementById('formulaProfileName');
    return profileNameInput ? (profileNameInput.value || '').trim() : '';
  }

  function getFormulaProfileModalElement() {
    return document.getElementById('formulaProfileModal');
  }

  function getFormulaProfileModalModeInput() {
    return document.getElementById('formulaProfileModalMode');
  }

  function getFormulaProfileModalIdInput() {
    return document.getElementById('formulaProfileModalId');
  }

  function getFormulaProfileModalNameInput() {
    return document.getElementById('formulaProfileModalName');
  }

  function getFormulaProfileModalTitle() {
    return document.getElementById('formulaProfileModalLabel');
  }

  function getFormulaProfileModalSaveButton() {
    return document.getElementById('saveFormulaProfileModalBtn');
  }

  function getFormulaProfileModalBootstrapInstance() {
    const modalEl = getFormulaProfileModalElement();
    if (!modalEl) {
      return null;
    }

    const bootstrapApi = (window && window.bootstrap)
      || (typeof globalThis !== 'undefined' ? globalThis.bootstrap : null);

    if (bootstrapApi && bootstrapApi.Modal && typeof bootstrapApi.Modal.getOrCreateInstance === 'function') {
      return bootstrapApi.Modal.getOrCreateInstance(modalEl);
    }

    return {
      show() {
        modalEl.classList.add('show');
        modalEl.style.display = 'block';
        modalEl.removeAttribute('aria-hidden');
      },
      hide() {
        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
        modalEl.setAttribute('aria-hidden', 'true');
      }
    };
  }

  function hasFormulaProfileManagementUi() {
    return Boolean(
      document.getElementById('formulaProfileName')
      || getFormulaProfileSelect()
      || getSelectedProfileIdInput()
      || document.getElementById('formulaProfilesTableBody')
    );
  }

  function parseFormulaProfileSettings(profileRow) {
    if (!profileRow || !profileRow.settings_json) {
      return null;
    }

    try {
      return normalizeFormulaSettings(JSON.parse(profileRow.settings_json));
    } catch (error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildFormulaSignature(formulaSettings) {
    const normalizedSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });

    return RECONCILIATION_FORMULA_FIELDS
      .map((field) => String(normalizedSettings[field.settingKey]))
      .join('|');
  }

  function buildOperationSummaryText(formulaSettings) {
    const fullText = buildFormulaPreviewText(formulaSettings);
    return fullText.replace(/^إجمالي المقبوضات\s*=\s*/u, '');
  }

  function toNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getProfileUsageSummary(profile) {
    const branchesCount = toNumber(profile && profile.branches_count);
    const reconciliationsCount = toNumber(profile && profile.reconciliations_count);
    return {
      branchesCount,
      reconciliationsCount,
      total: branchesCount + reconciliationsCount
    };
  }

  function getDeleteBlockedReason(profile) {
    if (toNumber(profile && profile.is_default) === 1) {
      return 'لا يمكن حذف المعادلة الافتراضية';
    }

    const usage = getProfileUsageSummary(profile);
    if (usage.total > 0) {
      return `مرتبطة بـ ${usage.branchesCount} فرع و ${usage.reconciliationsCount} تصفية`;
    }

    return '';
  }

  function getEditBlockedReason(profile) {
    const usage = getProfileUsageSummary(profile);
    if (usage.total > 0) {
      return `مرتبطة بـ ${usage.branchesCount} فرع و ${usage.reconciliationsCount} تصفية`;
    }

    return '';
  }

  function canEditFormulaProfile(profile) {
    return getEditBlockedReason(profile) === '';
  }

  function canDeleteFormulaProfile(profile) {
    return getDeleteBlockedReason(profile) === '';
  }

  function applyFormulaSettingsToUi(formulaSettings) {
    const normalized = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const selectEl = document.getElementById(field.fieldId);
      if (selectEl) {
        selectEl.value = String(normalized[field.settingKey]);
      }
    });

    updateFormulaPreviewInDocument(document, normalized);

    if (window && typeof window.updateSummary === 'function') {
      window.updateSummary();
    }

    return normalized;
  }

  function getFormulaSettingsFromModalDocument() {
    const collected = {};
    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const modalFieldId = FORMULA_MODAL_FIELD_IDS[field.settingKey];
      const selectEl = modalFieldId ? document.getElementById(modalFieldId) : null;
      if (selectEl) {
        collected[field.settingKey] = Number.parseInt(selectEl.value, 10);
      }
    });

    return normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...collected
    });
  }

  function applyFormulaSettingsToModal(formulaSettings) {
    const normalized = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const modalFieldId = FORMULA_MODAL_FIELD_IDS[field.settingKey];
      const selectEl = modalFieldId ? document.getElementById(modalFieldId) : null;
      if (selectEl) {
        selectEl.value = String(normalized[field.settingKey]);
      }
    });

    const previewEl = document.getElementById('formulaProfileModalPreview');
    if (previewEl) {
      previewEl.textContent = buildFormulaPreviewText(normalized);
    }

    return normalized;
  }

  function setFormulaProfileModalState(mode, profileId, formulaName, formulaSettings) {
    const normalizedMode = mode === 'edit' ? 'edit' : 'create';
    const modeInput = getFormulaProfileModalModeInput();
    const idInput = getFormulaProfileModalIdInput();
    const nameInput = getFormulaProfileModalNameInput();
    const titleEl = getFormulaProfileModalTitle();
    const saveBtn = getFormulaProfileModalSaveButton();

    if (modeInput) {
      modeInput.value = normalizedMode;
    }
    if (idInput) {
      idInput.value = normalizedMode === 'edit' && profileId ? String(profileId) : '';
    }
    if (nameInput) {
      nameInput.value = formulaName || '';
    }
    if (titleEl) {
      titleEl.textContent = normalizedMode === 'edit' ? 'تعديل المعادلة' : 'إضافة معادلة جديدة';
    }
    if (saveBtn) {
      saveBtn.textContent = normalizedMode === 'edit' ? 'حفظ التعديلات' : 'إضافة المعادلة';
    }

    applyFormulaSettingsToModal(formulaSettings || DEFAULT_RECONCILIATION_FORMULA_SETTINGS);
  }

  function showFormulaProfileModal() {
    const modalInstance = getFormulaProfileModalBootstrapInstance();
    if (modalInstance && typeof modalInstance.show === 'function') {
      modalInstance.show();
    }
  }

  function hideFormulaProfileModal() {
    const modalInstance = getFormulaProfileModalBootstrapInstance();
    if (modalInstance && typeof modalInstance.hide === 'function') {
      modalInstance.hide();
    }
  }

  function persistReconciliationFormulaSettings(formulaSettings, activeProfileId = null) {
    const normalized = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });

    const tasks = RECONCILIATION_FORMULA_FIELDS.map((field) => {
      return ipcRenderer.invoke('db-run', `
        INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, ['reconciliation_formula', field.settingKey, String(normalized[field.settingKey])]);
    });

    if (activeProfileId !== null && activeProfileId !== undefined) {
      tasks.push(
        ipcRenderer.invoke('db-run', `
          INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, ['reconciliation_formula', 'active_profile_id', String(activeProfileId)])
      );
    }

    return Promise.all(tasks).then(() => normalized);
  }

  async function getFormulaProfilesFromDatabase() {
    const profiles = await ipcRenderer.invoke(
      'db-query',
      `SELECT
         p.id,
         p.formula_name,
         p.settings_json,
         p.is_default,
         COALESCE((
           SELECT COUNT(*)
           FROM branches b
           WHERE b.reconciliation_formula_id = p.id
         ), 0) AS branches_count,
         COALESCE((
           SELECT COUNT(*)
           FROM reconciliations r
           WHERE r.formula_profile_id = p.id
         ), 0) AS reconciliations_count
       FROM reconciliation_formula_profiles p
       WHERE p.is_active = 1
       ORDER BY p.is_default DESC, p.id DESC`
    );

    if (!Array.isArray(profiles)) {
      return [];
    }

    return profiles;
  }

  async function getFormulaProfileById(profileId) {
    const normalizedId = parseFormulaProfileId(profileId);
    if (!normalizedId) {
      return null;
    }

    return ipcRenderer.invoke(
      'db-get',
      `SELECT
         p.id,
         p.formula_name,
         p.settings_json,
         p.is_default,
         COALESCE((
           SELECT COUNT(*)
           FROM branches b
           WHERE b.reconciliation_formula_id = p.id
         ), 0) AS branches_count,
         COALESCE((
           SELECT COUNT(*)
           FROM reconciliations r
           WHERE r.formula_profile_id = p.id
         ), 0) AS reconciliations_count
       FROM reconciliation_formula_profiles p
       WHERE p.id = ? AND p.is_active = 1
       LIMIT 1`,
      [normalizedId]
    );
  }

  function renderFormulaProfilesTable(profiles, selectedProfileId = null) {
    const tableBody = document.getElementById('formulaProfilesTableBody');
    if (!tableBody) {
      return;
    }

    if (!Array.isArray(profiles) || profiles.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-3">لا توجد معادلات محفوظة</td>
        </tr>
      `;
      return;
    }

    const normalizedSelectedId = parseFormulaProfileId(selectedProfileId);
    tableBody.innerHTML = profiles.map((profile) => {
      const profileId = parseFormulaProfileId(profile.id);
      const parsedSettings = parseFormulaProfileSettings(profile) || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      const operationText = buildOperationSummaryText(parsedSettings);
      const defaultBadge = profile.is_default
        ? '<span class="badge bg-success-subtle text-success-emphasis ms-1">افتراضية</span>'
        : '';
      const selectedClass = normalizedSelectedId && profileId === normalizedSelectedId
        ? 'is-selected'
        : '';
      const usage = getProfileUsageSummary(profile);
      const usageText = `الفروع: ${usage.branchesCount} | التصفيات: ${usage.reconciliationsCount}`;
      const editBlockedReason = getEditBlockedReason(profile);
      const deleteBlockedReason = getDeleteBlockedReason(profile);
      const activateBtn = profile.is_default
        ? '<span class="text-success-emphasis small fw-semibold">مفعّلة</span>'
        : `<button type="button" class="btn btn-sm btn-outline-secondary" data-action="activate" data-profile-id="${profileId}">افتراضية</button>`;
      const editBtnClass = canEditFormulaProfile(profile)
        ? 'btn btn-sm btn-outline-primary'
        : 'btn btn-sm btn-outline-secondary formula-delete-blocked-btn';
      const editBtnTitle = canEditFormulaProfile(profile) ? 'تعديل المعادلة' : editBlockedReason;
      const editBtn = `<button type="button" class="${editBtnClass}" data-action="edit" data-profile-id="${profileId}" title="${escapeHtml(editBtnTitle)}" aria-disabled="${canEditFormulaProfile(profile) ? 'false' : 'true'}">تعديل</button>`;
      const deleteBtnClass = canDeleteFormulaProfile(profile)
        ? 'btn btn-sm btn-outline-danger'
        : 'btn btn-sm btn-outline-secondary formula-delete-blocked-btn';
      const deleteBtnTitle = canDeleteFormulaProfile(profile) ? 'حذف المعادلة' : deleteBlockedReason;
      const deleteBtn = `<button type="button" class="${deleteBtnClass}" data-action="delete" data-profile-id="${profileId}" title="${escapeHtml(deleteBtnTitle)}" aria-disabled="${canDeleteFormulaProfile(profile) ? 'false' : 'true'}">حذف</button>`;

      return `
        <tr class="formula-profile-row ${selectedClass}" data-profile-id="${profileId}">
          <td>
            <button type="button" class="btn btn-link p-0 fw-semibold text-decoration-none" data-action="select" data-profile-id="${profileId}">
              ${escapeHtml(profile.formula_name)}
            </button>
            ${defaultBadge}
          </td>
          <td><span class="formula-profile-op-text">${escapeHtml(operationText)}</span></td>
          <td><span class="formula-profile-usage-text">${escapeHtml(usageText)}</span></td>
          <td class="text-nowrap">
            <div class="formula-profile-actions">
              ${editBtn}
              ${activateBtn}
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function ensureFormulaProfileIsUnique(profileId, formulaName, formulaSettings) {
    const normalizedProfileId = parseFormulaProfileId(profileId);
    const normalizedName = (formulaName || '').trim();
    const normalizedSignature = buildFormulaSignature(formulaSettings);
    const profiles = await getFormulaProfilesFromDatabase();

    for (const profile of profiles) {
      const existingId = parseFormulaProfileId(profile.id);
      if (normalizedProfileId && existingId === normalizedProfileId) {
        continue;
      }

      const existingName = String(profile.formula_name || '').trim();
      if (normalizedName && existingName === normalizedName) {
        throw new Error('DUPLICATE_FORMULA_NAME');
      }

      const existingSettings = parseFormulaProfileSettings(profile);
      if (!existingSettings) {
        continue;
      }

      const existingSignature = buildFormulaSignature(existingSettings);
      if (existingSignature === normalizedSignature) {
        throw new Error('DUPLICATE_FORMULA_SIGNATURE');
      }
    }
  }

  async function persistFormulaProfile(profileId, formulaName, formulaSettings) {
    const normalizedSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });
    const normalizedName = (formulaName || '').trim();
    const normalizedProfileId = parseFormulaProfileId(profileId);
    const settingsJson = JSON.stringify(normalizedSettings);

    if (!normalizedName) {
      throw new Error('FORMULA_NAME_REQUIRED');
    }

    await ensureFormulaProfileIsUnique(normalizedProfileId, normalizedName, normalizedSettings);

    if (normalizedProfileId) {
      await ipcRenderer.invoke(
        'db-run',
        `UPDATE reconciliation_formula_profiles
         SET formula_name = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedName, settingsJson, normalizedProfileId]
      );
      return normalizedProfileId;
    }

    const insertResult = await ipcRenderer.invoke(
      'db-run',
      `INSERT INTO reconciliation_formula_profiles (formula_name, settings_json, is_default, is_active)
       VALUES (?, ?, 0, 1)`,
      [normalizedName, settingsJson]
    );

    if (insertResult && insertResult.lastInsertRowid) {
      return insertResult.lastInsertRowid;
    }

    const insertedProfile = await ipcRenderer.invoke(
      'db-get',
      `SELECT id
       FROM reconciliation_formula_profiles
       WHERE formula_name = ?
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedName]
    );

    return insertedProfile ? insertedProfile.id : null;
  }

  async function loadAndSelectFormulaProfile(preferredProfileId = null) {
    const profileSelect = getFormulaProfileSelect();

    const profiles = await getFormulaProfilesFromDatabase();
    if (profiles.length === 0) {
      if (profileSelect) {
        profileSelect.innerHTML = '<option value="">لا توجد معادلات محفوظة</option>';
      }
      setSelectedFormulaProfileIdInDocument(null);
      const profileNameInput = document.getElementById('formulaProfileName');
      if (profileNameInput) {
        profileNameInput.value = '';
      }
      renderFormulaProfilesTable([]);
      return null;
    }

    if (profileSelect) {
      profileSelect.innerHTML = profiles.map((profile) => {
        const defaultSuffix = profile.is_default ? ' (افتراضية)' : '';
        return `<option value="${profile.id}">${profile.formula_name}${defaultSuffix}</option>`;
      }).join('');
    }

    const preferredId = parseFormulaProfileId(preferredProfileId);
    const selectedProfile = preferredId
      ? profiles.find((profile) => parseFormulaProfileId(profile.id) === preferredId) || profiles[0]
      : profiles[0];

    const selectedProfileId = setSelectedFormulaProfileIdInDocument(selectedProfile.id);
    renderFormulaProfilesTable(profiles, selectedProfileId);

    const profileNameInput = document.getElementById('formulaProfileName');
    if (profileNameInput) {
      profileNameInput.value = selectedProfile.formula_name || '';
    }

    const profileSettings = parseFormulaProfileSettings(selectedProfile)
      || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
    applyFormulaSettingsToUi(profileSettings);

    return selectedProfile;
  }

  function setSelectedFormulaPresetInDocument(presetKey) {
    const normalizedPreset = presetKey || 'default';
    const selectedPresetInput = document.getElementById('selectedFormulaPreset');
    if (selectedPresetInput) {
      selectedPresetInput.value = normalizedPreset;
    }

    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-formula-preset]').forEach((btn) => {
        const btnPreset = btn && btn.dataset ? btn.dataset.formulaPreset : '';
        const isSelected = btnPreset === normalizedPreset;
        if (btn.classList && typeof btn.classList.toggle === 'function') {
          btn.classList.toggle('is-selected', isSelected);
        } else if (btn.classList && typeof btn.classList.add === 'function' && typeof btn.classList.remove === 'function') {
          if (isSelected) {
            btn.classList.add('is-selected');
          } else {
            btn.classList.remove('is-selected');
          }
        }
      });
    }
  }

  function getSelectedFormulaPresetFromDocument() {
    const selectedPresetInput = document.getElementById('selectedFormulaPreset');
    const selectedPreset = selectedPresetInput && selectedPresetInput.value
      ? selectedPresetInput.value
      : 'default';
    return selectedPreset;
  }

  function getPresetDisplayNameFromDocument(presetKey) {
    if (typeof document.querySelectorAll !== 'function') {
      return 'القالب المختار';
    }

    const buttons = document.querySelectorAll('[data-formula-preset]');
    const match = Array.from(buttons || []).find((btn) => {
      return btn && btn.dataset && btn.dataset.formulaPreset === presetKey;
    });

    return (match && match.dataset && match.dataset.formulaPresetName) || 'القالب المختار';
  }

  function applyFormulaPresetAndRefreshUi(presetKey) {
    const formulaSettings = applyFormulaPresetToDocument(document, presetKey);
    setSelectedFormulaPresetInDocument(presetKey);
    return applyFormulaSettingsToUi(formulaSettings);
  }

async function handleSaveGeneralSettings(event) {
    event.preventDefault();

    console.log('💾 [SETTINGS] حفظ الإعدادات العامة...');

    try {
        getDialogUtils().showLoading('جاري حفظ الإعدادات العامة...', 'يرجى الانتظار');

        const formData = new FormData(event.target);
        const requestedLanguage = String(formData.get('systemLanguage') || 'ar').trim().toLowerCase();
        const settings = [
            { key: 'company_name', value: formData.get('companyName') || '' },
            { key: 'company_phone', value: formData.get('companyPhone') || '' },
            { key: 'company_email', value: formData.get('companyEmail') || '' },
            { key: 'company_website', value: formData.get('companyWebsite') || '' },
            { key: 'company_address', value: formData.get('companyAddress') || '' },
            { key: 'system_language', value: requestedLanguage || 'ar' },
            { key: 'system_theme', value: formData.get('systemTheme') || 'light' }
        ];

        console.log('📝 [SETTINGS] البيانات المراد حفظها:', settings);

        for (const setting of settings) {
            console.log(`💾 [SETTINGS] حفظ ${setting.key}: ${setting.value}`);
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['general', setting.key, setting.value]);
            console.log(`✅ [SETTINGS] تم حفظ ${setting.key} بنجاح`);
        }

        const shouldWarnAboutLanguage = requestedLanguage && requestedLanguage !== 'ar';

        // Apply settings immediately
        await applyGeneralSettingsRealTime(settings);

        getDialogUtils().close();
        getDialogUtils().showSuccessToast('تم حفظ الإعدادات العامة بنجاح وتطبيقها على النظام');

        if (shouldWarnAboutLanguage) {
            const dialog = getDialogUtils();
            if (dialog && typeof dialog.showWarningToast === 'function') {
                dialog.showWarningToast('اللغة الإنجليزية قيد التطوير حالياً، وقد تظهر الواجهة بالعربية جزئياً');
            } else if (dialog && typeof dialog.showErrorToast === 'function') {
                dialog.showErrorToast('ملاحظة: اللغة الإنجليزية قيد التطوير حالياً');
            }
        }

    } catch (error) {
        getDialogUtils().close();
        console.error('❌ [SETTINGS] خطأ في حفظ الإعدادات العامة:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ الإعدادات.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ الإعدادات: ${friendly}`, 'خطأ في الحفظ');
    }
}

async function handleSelectReportsPath() {
    try {
        console.log('📁 [SETTINGS] اختيار مجلد حفظ التقارير...');

        const result = await ipcRenderer.invoke('select-directory', {
            title: 'اختر مجلد حفظ التقارير',
            defaultPath: ''
        });

        if (result.success && result.filePath) {
            document.getElementById('reportsPath').value = result.filePath;

            await saveReportsPathSetting(result.filePath);

            getDialogUtils().showSuccessToast('تم تحديد مجلد حفظ التقارير بنجاح');
            console.log('✅ [SETTINGS] تم حفظ مسار التقارير:', result.filePath);
        }
    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في اختيار مجلد التقارير:', error);
        getDialogUtils().showErrorToast('حدث خطأ أثناء اختيار المجلد');
    }
}

async function saveReportsPathSetting(filePath) {
    const normalizedPath = (filePath || '').trim();

    // Keep backward compatibility with old key while standardizing on reports_path.
    const pathSettings = ['reports_path', 'default_save_path'];
    for (const key of pathSettings) {
        await ipcRenderer.invoke('db-run', `
            INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, ['reports', key, normalizedPath]);
    }
}

async function applyGeneralSettingsRealTime(settings) {
    console.log('⚡ [SETTINGS] تطبيق الإعدادات العامة في الوقت الفعلي...');

    try {
        const settingsMap = {};
        settings.forEach(setting => {
            settingsMap[setting.key] = setting.value;
        });

        // Apply theme changes
        if (settingsMap.system_theme) {
            applyTheme(settingsMap.system_theme);
        }

        // Apply language changes (if needed in future)
        if (settingsMap.system_language) {
            const selectedLanguage = String(settingsMap.system_language).trim().toLowerCase();
            const htmlEl = document.documentElement;
            if (htmlEl) {
                htmlEl.setAttribute('lang', selectedLanguage || 'ar');
            }
            console.log(`🌐 [SETTINGS] تم تعيين اللغة إلى: ${selectedLanguage || 'ar'}`);
        }

        // Update company name in global variable for reports
        if (settingsMap.company_name) {
            window.currentCompanyName = settingsMap.company_name;
            console.log(`🏢 [SETTINGS] تم تحديث اسم الشركة إلى: ${settingsMap.company_name}`);
        }

        console.log('✅ [SETTINGS] تم تطبيق الإعدادات العامة بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تطبيق الإعدادات العامة:', error);
    }
}

async function handleSavePrintSettings(event) {
    event.preventDefault();

    console.log('🖨️ [SETTINGS] حفظ إعدادات الطباعة...');

    try {
        getDialogUtils().showLoading('جاري حفظ إعدادات الطباعة...', 'يرجى الانتظار');

        const colorPrintField = document.getElementById('colorPrintCheck');
        const copiesField = document.getElementById('copiesInput');
        const duplexField = document.getElementById('duplexSelect');
        const printerField = document.getElementById('printerSelect');

        const settings = [
            { key: 'paper_size', value: document.getElementById('paperSize').value },
            { key: 'paper_orientation', value: document.getElementById('paperOrientation').value },
            { key: 'font_family', value: document.getElementById('fontFamily').value },
            { key: 'font_size', value: document.getElementById('fontSize').value },
            { key: 'margin_top', value: document.getElementById('marginTop').value },
            { key: 'margin_bottom', value: document.getElementById('marginBottom').value },
            { key: 'margin_left', value: document.getElementById('marginLeft').value },
            { key: 'margin_right', value: document.getElementById('marginRight').value },
            { key: 'print_header', value: document.getElementById('printHeader').checked.toString() },
            { key: 'print_footer', value: document.getElementById('printFooter').checked.toString() },
            { key: 'print_logo', value: document.getElementById('printLogo').checked.toString() },
            { key: 'print_page_numbers', value: document.getElementById('printPageNumbers').checked.toString() },
            { key: 'print_date', value: document.getElementById('printDate').checked.toString() },
            { key: 'print_borders', value: document.getElementById('printBorders').checked.toString() },
            { key: 'color_print', value: (colorPrintField ? colorPrintField.checked : false).toString() },
            { key: 'copies', value: copiesField ? String(copiesField.value || '1') : '1' },
            { key: 'duplex', value: duplexField ? String(duplexField.value || 'simplex') : 'simplex' },
            { key: 'printer_name', value: printerField ? String(printerField.value || '') : '' }
        ];

        for (const setting of settings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['print', setting.key, setting.value]);

            // Keep only the latest value per key even on old databases that may allow duplicates.
            await ipcRenderer.invoke('db-run', `
                DELETE FROM system_settings
                WHERE category = ?
                  AND setting_key = ?
                  AND id NOT IN (
                    SELECT id
                    FROM system_settings
                    WHERE category = ?
                      AND setting_key = ?
                    ORDER BY id DESC
                    LIMIT 1
                  )
            `, ['print', setting.key, 'print', setting.key]);
        }

        // Apply print settings to the print manager
        await applyPrintSettingsRealTime(settings);

        getDialogUtils().close();
        getDialogUtils().showSuccessToast('تم حفظ إعدادات الطباعة بنجاح وتطبيقها على النظام');

    } catch (error) {
        getDialogUtils().close();
        console.error('❌ [SETTINGS] خطأ في حفظ إعدادات الطباعة:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ إعدادات الطباعة.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ الإعدادات: ${friendly}`, 'خطأ في الحفظ');
    }
}

async function applyPrintSettingsRealTime(settings) {
    console.log('🖨️ [SETTINGS] تطبيق إعدادات الطباعة في الوقت الفعلي...');

    try {
        const settingsMap = {};
        settings.forEach(setting => {
            settingsMap[setting.key] = setting.value;
        });

        // Update print manager settings via IPC
        const printSettings = {
            copies: parseInt(settingsMap.copies, 10) || 1,
            paperSize: settingsMap.paper_size || 'A4',
            orientation: settingsMap.paper_orientation || 'portrait',
            color: settingsMap.color_print === 'true',
            duplex: settingsMap.duplex || 'simplex',
            printerName: settingsMap.printer_name || '',
            fontSize: settingsMap.font_size || 'normal',
            fontFamily: settingsMap.font_family || 'Cairo',
            margins: {
                top: parseFloat(settingsMap.margin_top) || 20,
                right: parseFloat(settingsMap.margin_right) || 15,
                bottom: parseFloat(settingsMap.margin_bottom) || 20,
                left: parseFloat(settingsMap.margin_left) || 15
            }
        };

        await ipcRenderer.invoke('update-print-settings', printSettings);
        console.log('✅ [SETTINGS] تم تطبيق إعدادات الطباعة بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تطبيق إعدادات الطباعة:', error);
    }
}

async function handleSaveReportsSettings(event) {
    event.preventDefault();

    console.log('📊 [SETTINGS] حفظ إعدادات التقارير...');

    try {
        getDialogUtils().showLoading('جاري حفظ إعدادات التقارير...', 'يرجى الانتظار');

        const settings = [
            { key: 'default_format', value: document.getElementById('defaultReportFormat').value },
            { key: 'default_date_range', value: document.getElementById('defaultDateRange').value },
            { key: 'reports_path', value: document.getElementById('reportsPath').value },
            { key: 'default_save_path', value: document.getElementById('reportsPath').value },
            { key: 'include_charts', value: document.getElementById('includeCharts').checked.toString() },
            { key: 'include_summary', value: document.getElementById('includeSummary').checked.toString() },
            { key: 'include_details', value: document.getElementById('includeDetails').checked.toString() },
            { key: 'auto_open_reports', value: document.getElementById('autoOpenReports').checked.toString() },
            { key: 'save_report_history', value: document.getElementById('saveReportHistory').checked.toString() },
            { key: 'compress_reports', value: document.getElementById('compressReports').checked.toString() }
        ];

        for (const setting of settings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['reports', setting.key, setting.value]);
        }

        getDialogUtils().close();
        getDialogUtils().showSuccessToast('تم حفظ إعدادات التقارير بنجاح');

    } catch (error) {
        getDialogUtils().close();
        console.error('❌ [SETTINGS] خطأ في حفظ إعدادات التقارير:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ إعدادات التقارير.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ الإعدادات: ${friendly}`, 'خطأ في الحفظ');
    }
}

  function handleReconciliationFormulaSettingsPreview() {
    const formulaSettings = getFormulaSettingsFromDocument(document);
    applyFormulaSettingsToUi(formulaSettings);
  }

  async function handleLoadReconciliationFormulaProfiles() {
    try {
      let preferredProfileId = getSelectedFormulaProfileIdFromDocument();
      if (!preferredProfileId) {
        const activeProfileRow = await ipcRenderer.invoke(
          'db-get',
          `SELECT setting_value
           FROM system_settings
           WHERE category = 'reconciliation_formula' AND setting_key = 'active_profile_id'
           LIMIT 1`
        );
        preferredProfileId = parseFormulaProfileId(activeProfileRow && activeProfileRow.setting_value);
      }

      await loadAndSelectFormulaProfile(preferredProfileId);
    } catch (error) {
      logger.warn('⚠️ [SETTINGS] تعذر تحميل بروفايلات معادلة التصفية:', error);
    }
  }

  async function handleFormulaProfileSelectionChange(event) {
    const selectedProfileId = parseFormulaProfileId(event?.target?.value);
    if (!selectedProfileId) {
      return;
    }

    try {
      setSelectedFormulaProfileIdInDocument(selectedProfileId);
      const selectedProfile = await getFormulaProfileById(selectedProfileId);
      if (!selectedProfile) {
        getDialogUtils().showErrorToast('المعادلة المحددة غير موجودة');
        return;
      }

      const profileNameInput = document.getElementById('formulaProfileName');
      if (profileNameInput) {
        profileNameInput.value = selectedProfile.formula_name || '';
      }

      const formulaSettings = parseFormulaProfileSettings(selectedProfile)
        || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      applyFormulaSettingsToUi(formulaSettings);
      await persistReconciliationFormulaSettings(formulaSettings, selectedProfileId);
      await loadAndSelectFormulaProfile(selectedProfileId);
    } catch (error) {
      console.error('❌ [SETTINGS] خطأ في تحميل المعادلة المحددة:', error);
      getDialogUtils().showErrorToast('حدث خطأ أثناء تحميل المعادلة');
    }
  }

  function handleFormulaProfileModalPreview() {
    const formulaSettings = getFormulaSettingsFromModalDocument();
    applyFormulaSettingsToModal(formulaSettings);
  }

  function handleOpenCreateFormulaProfileModal(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const baseSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...getFormulaSettingsFromDocument(document)
    });
    setFormulaProfileModalState('create', null, '', baseSettings);
    showFormulaProfileModal();
  }

  async function handleOpenEditFormulaProfileModal(event, profileId = null) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const targetProfileId = parseFormulaProfileId(profileId) || getSelectedFormulaProfileIdFromDocument();
    if (!targetProfileId) {
      getDialogUtils().showValidationError('اختر معادلة أولاً للتعديل');
      return;
    }

    try {
      setSelectedFormulaProfileIdInDocument(targetProfileId);
      const profile = await getFormulaProfileById(targetProfileId);
      if (!profile) {
        getDialogUtils().showErrorToast('المعادلة المحددة غير موجودة');
        return;
      }
      const editBlockedReason = getEditBlockedReason(profile);
      if (editBlockedReason) {
        getDialogUtils().showError(`لا يمكن تعديل المعادلة: ${editBlockedReason}`, 'تعديل غير مسموح');
        return;
      }

      const formulaSettings = parseFormulaProfileSettings(profile)
        || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      setFormulaProfileModalState('edit', targetProfileId, profile.formula_name || '', formulaSettings);
      showFormulaProfileModal();
    } catch (error) {
      console.error('❌ [SETTINGS] خطأ في فتح نافذة تعديل المعادلة:', error);
      getDialogUtils().showErrorToast('حدث خطأ أثناء فتح نافذة التعديل');
    }
  }

  async function handleSaveFormulaProfileModal(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const modeInput = getFormulaProfileModalModeInput();
    const idInput = getFormulaProfileModalIdInput();
    const nameInput = getFormulaProfileModalNameInput();
    const mode = modeInput && modeInput.value === 'edit' ? 'edit' : 'create';
    const targetProfileId = mode === 'edit' ? parseFormulaProfileId(idInput && idInput.value) : null;
    const formulaName = nameInput ? (nameInput.value || '').trim() : '';
    const formulaSettings = getFormulaSettingsFromModalDocument();

    if (!formulaName) {
      getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة');
      return;
    }
    if (mode === 'edit' && !targetProfileId) {
      getDialogUtils().showValidationError('تعذر تحديد المعادلة المراد تعديلها');
      return;
    }

    try {
      getDialogUtils().showLoading(
        mode === 'edit' ? 'جاري حفظ التعديلات...' : 'جاري إضافة المعادلة...',
        'يرجى الانتظار'
      );

      const savedProfileId = await persistFormulaProfile(
        mode === 'edit' ? targetProfileId : null,
        formulaName,
        formulaSettings
      );
      if (!savedProfileId) {
        throw new Error(mode === 'edit' ? 'تعذر تحديث المعادلة' : 'تعذر إنشاء المعادلة');
      }

      await persistReconciliationFormulaSettings(formulaSettings, savedProfileId);
      await loadAndSelectFormulaProfile(savedProfileId);

      hideFormulaProfileModal();
      getDialogUtils().close();
      getDialogUtils().showSuccessToast(
        mode === 'edit' ? 'تم تحديث المعادلة بنجاح' : 'تم إضافة المعادلة بنجاح'
      );
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في حفظ المعادلة من النافذة المنبثقة:', error);
      const rawMessage = String(error && error.message ? error.message : '');
      if (rawMessage === 'FORMULA_NAME_REQUIRED') {
        getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة');
      } else if (rawMessage === 'DUPLICATE_FORMULA_NAME' || rawMessage.includes('UNIQUE constraint failed')) {
        getDialogUtils().showError('اسم المعادلة موجود مسبقًا. اختر اسمًا آخر.', 'اسم مكرر');
      } else if (rawMessage === 'DUPLICATE_FORMULA_SIGNATURE') {
        getDialogUtils().showError('هذه الصيغة مطابقة لمعادلة محفوظة مسبقًا. غيّر الصيغة قبل الحفظ.', 'صيغة مكررة');
      } else {
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ المعادلة.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ المعادلة: ${friendly}`, 'خطأ');
      }
    }
  }

  async function handleFormulaProfilesTableClick(event) {
    const rawTarget = event && event.target ? event.target : null;
    const target = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentElement : rawTarget;
    if (!target) {
      return;
    }

    const actionButton = typeof target.closest === 'function'
      ? target.closest('[data-action][data-profile-id]')
      : null;
    const action = actionButton ? actionButton.getAttribute('data-action') : null;
    const actionProfileId = actionButton
      ? parseFormulaProfileId(actionButton.getAttribute('data-profile-id'))
      : null;

    if (action === 'activate' && actionProfileId) {
      setSelectedFormulaProfileIdInDocument(actionProfileId);
      await handleActivateFormulaProfile({ preventDefault() {} });
      return;
    }

    if (action === 'delete' && actionProfileId) {
      await handleDeleteFormulaProfile({ preventDefault() {} }, actionProfileId);
      return;
    }

    if (action === 'edit' && actionProfileId) {
      await handleOpenEditFormulaProfileModal({ preventDefault() {} }, actionProfileId);
      return;
    }

    const clickedRow = typeof target.closest === 'function'
      ? target.closest('tr[data-profile-id]')
      : null;
    const rowProfileId = clickedRow
      ? parseFormulaProfileId(clickedRow.getAttribute('data-profile-id'))
      : null;
    const selectedProfileId = actionProfileId || rowProfileId;

    if (!selectedProfileId) {
      return;
    }

    await handleFormulaProfileSelectionChange({
      target: { value: String(selectedProfileId) }
    });
  }

  async function handleCreateFormulaProfile(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const formulaName = getCurrentFormulaNameFromDocument();
    if (!formulaName) {
      getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري إنشاء المعادلة...', 'يرجى الانتظار');

      const formulaSettings = normalizeFormulaSettings({
        ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
        ...getFormulaSettingsFromDocument(document)
      });

      const createdProfileId = await persistFormulaProfile(null, formulaName, formulaSettings);
      if (!createdProfileId) {
        throw new Error('تعذر تحديد معرف المعادلة الجديدة');
      }

      await persistReconciliationFormulaSettings(formulaSettings, createdProfileId);
      const selectedProfile = await loadAndSelectFormulaProfile(createdProfileId);

      getDialogUtils().close();
      const successName = selectedProfile && selectedProfile.formula_name
        ? selectedProfile.formula_name
        : formulaName;
      getDialogUtils().showSuccessToast(`تم إنشاء المعادلة: ${successName}`);
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في إنشاء معادلة جديدة:', error);
      const rawMessage = String(error && error.message ? error.message : '');
      if (rawMessage === 'FORMULA_NAME_REQUIRED') {
        getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة');
      } else if (rawMessage === 'DUPLICATE_FORMULA_NAME' || rawMessage.includes('UNIQUE constraint failed')) {
        getDialogUtils().showError('اسم المعادلة موجود مسبقًا. اختر اسمًا آخر.', 'اسم مكرر');
      } else if (rawMessage === 'DUPLICATE_FORMULA_SIGNATURE') {
        getDialogUtils().showError('هذه المعادلة مطابقة لمعادلة محفوظة مسبقًا. غيّر العملية قبل الحفظ.', 'معادلة مكررة');
      } else {
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء إنشاء المعادلة.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء إنشاء المعادلة: ${friendly}`, 'خطأ');
      }
    }
  }

  async function handleActivateFormulaProfile(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const selectedProfileId = getSelectedFormulaProfileIdFromDocument();
    if (!selectedProfileId) {
      getDialogUtils().showValidationError('اختر معادلة أولاً لتعيينها كافتراضية');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تعيين المعادلة الافتراضية...', 'يرجى الانتظار');

      await ipcRenderer.invoke(
        'db-run',
        `UPDATE reconciliation_formula_profiles
         SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
             updated_at = CURRENT_TIMESTAMP
         WHERE is_active = 1`,
        [selectedProfileId]
      );

      const selectedProfile = await getFormulaProfileById(selectedProfileId);
      const formulaSettings = parseFormulaProfileSettings(selectedProfile)
        || normalizeFormulaSettings({
          ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
          ...getFormulaSettingsFromDocument(document)
        });

      await persistReconciliationFormulaSettings(formulaSettings, selectedProfileId);
      await ipcRenderer.invoke(
        'db-run',
        'UPDATE branches SET reconciliation_formula_id = ? WHERE reconciliation_formula_id IS NULL',
        [selectedProfileId]
      );
      await loadAndSelectFormulaProfile(selectedProfileId);

      getDialogUtils().close();
      getDialogUtils().showSuccessToast('تم تعيين المعادلة الافتراضية بنجاح');
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في تعيين المعادلة الافتراضية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء تعيين المعادلة الافتراضية.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء تعيين المعادلة الافتراضية: ${friendly}`, 'خطأ');
    }
  }

  async function handleDeleteFormulaProfile(event, profileId = null) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const targetProfileId = parseFormulaProfileId(profileId) || getSelectedFormulaProfileIdFromDocument();
    if (!targetProfileId) {
      getDialogUtils().showValidationError('اختر معادلة أولاً للحذف');
      return;
    }

    try {
      const profile = await getFormulaProfileById(targetProfileId);
      if (!profile) {
        getDialogUtils().showErrorToast('المعادلة المحددة غير موجودة');
        return;
      }

      const deleteBlockedReason = getDeleteBlockedReason(profile);
      if (deleteBlockedReason) {
        getDialogUtils().showError(`لا يمكن حذف المعادلة: ${deleteBlockedReason}`, 'حذف غير مسموح');
        return;
      }

      const confirmed = await getDialogUtils().showConfirm(
        `هل تريد حذف المعادلة "${profile.formula_name}" نهائيًا؟`,
        'تأكيد حذف المعادلة'
      );
      if (!confirmed) {
        return;
      }

      getDialogUtils().showLoading('جاري حذف المعادلة...', 'يرجى الانتظار');

      await ipcRenderer.invoke(
        'db-run',
        `UPDATE reconciliation_formula_profiles
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetProfileId]
      );

      const profilesAfterDelete = await getFormulaProfilesFromDatabase();
      if (profilesAfterDelete.length === 0) {
        const fallbackSettings = normalizeFormulaSettings(DEFAULT_RECONCILIATION_FORMULA_SETTINGS);
        applyFormulaSettingsToUi(fallbackSettings);
        setSelectedFormulaProfileIdInDocument(null);
        const profileNameInput = document.getElementById('formulaProfileName');
        if (profileNameInput) {
          profileNameInput.value = '';
        }
        await persistReconciliationFormulaSettings(fallbackSettings);
        renderFormulaProfilesTable([]);
      } else {
        const currentSelectedId = getSelectedFormulaProfileIdFromDocument();
        const preferredAfterDelete = currentSelectedId && currentSelectedId !== targetProfileId
          ? currentSelectedId
          : null;

        const nextProfile = preferredAfterDelete
          ? profilesAfterDelete.find((profileRow) => parseFormulaProfileId(profileRow.id) === preferredAfterDelete)
          : null;

        const fallbackProfile = nextProfile
          || profilesAfterDelete.find((profileRow) => toNumber(profileRow.is_default) === 1)
          || profilesAfterDelete[0];

        const fallbackProfileId = parseFormulaProfileId(fallbackProfile.id);
        const fallbackSettings = parseFormulaProfileSettings(fallbackProfile)
          || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;

        await persistReconciliationFormulaSettings(fallbackSettings, fallbackProfileId);
        await loadAndSelectFormulaProfile(fallbackProfileId);
      }

      getDialogUtils().close();
      getDialogUtils().showSuccessToast('تم حذف المعادلة بنجاح');
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في حذف المعادلة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء حذف المعادلة.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء حذف المعادلة: ${friendly}`, 'خطأ');
    }
  }

  function handleApplyReconciliationFormulaPreset(event) {
    const dataset = (event && event.currentTarget && event.currentTarget.dataset)
      || (event && event.target && event.target.dataset)
      || {};
    const presetKey = dataset.formulaPreset || 'default';
    const presetName = dataset.formulaPresetName || 'القالب المختار';

    applyFormulaPresetAndRefreshUi(presetKey);

    getDialogUtils().showSuccessToast(`تم تطبيق القالب: ${presetName} (اضغط حفظ للتثبيت)`);
  }

  async function handleApplyAndSaveReconciliationFormulaPreset(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const presetKey = getSelectedFormulaPresetFromDocument();
    const presetName = getPresetDisplayNameFromDocument(presetKey);

    try {
      getDialogUtils().showLoading('جاري تطبيق وحفظ القالب...', 'يرجى الانتظار');

      const formulaSettings = applyFormulaPresetAndRefreshUi(presetKey);
      if (!hasFormulaProfileManagementUi()) {
        await persistReconciliationFormulaSettings(formulaSettings);
        getDialogUtils().close();
        getDialogUtils().showSuccessToast(`تم تطبيق وحفظ القالب: ${presetName}`);
        return;
      }

      let targetProfileId = getSelectedFormulaProfileIdFromDocument();

      const profileName = getCurrentFormulaNameFromDocument() || presetName;
      targetProfileId = await persistFormulaProfile(targetProfileId, profileName, formulaSettings);
      if (!targetProfileId) {
        throw new Error('تعذر حفظ القالب داخل ملف المعادلات');
      }
      await persistReconciliationFormulaSettings(formulaSettings, targetProfileId);
      await loadAndSelectFormulaProfile(targetProfileId);

      getDialogUtils().close();
      getDialogUtils().showSuccessToast(`تم تطبيق وحفظ القالب: ${presetName}`);
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في تطبيق وحفظ قالب معادلة التصفية:', error);
      const rawMessage = String(error && error.message ? error.message : '');
      if (rawMessage === 'FORMULA_NAME_REQUIRED') {
        getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة قبل حفظ القالب');
      } else if (rawMessage === 'DUPLICATE_FORMULA_NAME') {
        getDialogUtils().showError('اسم المعادلة موجود مسبقًا. اختر اسمًا آخر.', 'اسم مكرر');
      } else if (rawMessage === 'DUPLICATE_FORMULA_SIGNATURE') {
        getDialogUtils().showError('القالب الناتج مطابق لمعادلة محفوظة. غيّر القيم قبل الحفظ.', 'معادلة مكررة');
      } else {
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء تطبيق القالب.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء تطبيق القالب: ${friendly}`, 'خطأ');
      }
    }
  }

  async function handleSaveReconciliationFormulaSettings(event) {
    event.preventDefault();

    const formulaSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...getFormulaSettingsFromDocument(document)
    });

    if (!hasFormulaProfileManagementUi()) {
      try {
        getDialogUtils().showLoading('جاري حفظ معادلة التصفية...', 'يرجى الانتظار');
        await persistReconciliationFormulaSettings(formulaSettings);
        applyFormulaSettingsToUi(formulaSettings);
        getDialogUtils().close();
        getDialogUtils().showSuccessToast('تم حفظ معادلة التصفية بنجاح');
      } catch (error) {
        getDialogUtils().close();
        console.error('❌ [SETTINGS] خطأ في حفظ معادلة التصفية:', error);
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ معادلة التصفية.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ معادلة التصفية: ${friendly}`, 'خطأ في الحفظ');
      }
      return;
    }

    const targetProfileId = getSelectedFormulaProfileIdFromDocument();
    if (!targetProfileId) {
      getDialogUtils().showValidationError('اختر معادلة من الجدول للتعديل، أو استخدم زر "إضافة معادلة" لإنشاء واحدة جديدة');
      return;
    }

    const formulaName = getCurrentFormulaNameFromDocument();
    if (!formulaName) {
      getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة قبل الحفظ');
      return;
    }

    try {
      getDialogUtils().showLoading('جاري تحديث المعادلة...', 'يرجى الانتظار');

      const updatedProfileId = await persistFormulaProfile(targetProfileId, formulaName, formulaSettings);
      if (!updatedProfileId) {
        throw new Error('تعذر تحديث المعادلة');
      }

      await persistReconciliationFormulaSettings(formulaSettings, updatedProfileId);
      await loadAndSelectFormulaProfile(updatedProfileId);

      getDialogUtils().close();
      getDialogUtils().showSuccessToast('تم تحديث المعادلة بنجاح');
    } catch (error) {
      getDialogUtils().close();
      console.error('❌ [SETTINGS] خطأ في حفظ معادلة التصفية:', error);
      const rawMessage = String(error && error.message ? error.message : '');
      if (rawMessage === 'FORMULA_NAME_REQUIRED') {
        getDialogUtils().showValidationError('يرجى إدخال اسم المعادلة قبل الحفظ');
      } else if (rawMessage === 'DUPLICATE_FORMULA_NAME') {
        getDialogUtils().showError('اسم المعادلة موجود مسبقًا. اختر اسمًا آخر.', 'اسم مكرر');
      } else if (rawMessage === 'DUPLICATE_FORMULA_SIGNATURE') {
        getDialogUtils().showError('هذه المعادلة مطابقة لمعادلة محفوظة. غيّر العملية قبل الحفظ.', 'معادلة مكررة');
      } else {
        const friendly = mapDbErrorMessage(error, {
          fallback: 'حدث خطأ أثناء حفظ معادلة التصفية.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء حفظ معادلة التصفية: ${friendly}`, 'خطأ في الحفظ');
      }
    }
  }

  return {
    handleSaveGeneralSettings,
    handleSelectReportsPath,
    applyGeneralSettingsRealTime,
    handleSavePrintSettings,
    applyPrintSettingsRealTime,
    handleSaveReportsSettings,
    handleLoadReconciliationFormulaProfiles,
    handleFormulaProfileSelectionChange,
    handleOpenCreateFormulaProfileModal,
    handleOpenEditFormulaProfileModal,
    handleSaveFormulaProfileModal,
    handleFormulaProfileModalPreview,
    handleFormulaProfilesTableClick,
    handleCreateFormulaProfile,
    handleActivateFormulaProfile,
    handleDeleteFormulaProfile,
    handleSaveReconciliationFormulaSettings,
    handleApplyAndSaveReconciliationFormulaPreset,
    handleApplyReconciliationFormulaPreset,
    handleReconciliationFormulaSettingsPreview
  };
}

module.exports = {
  createSystemSettingsSaveActions
};
