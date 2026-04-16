const {
  RECONCILIATION_FORMULA_FIELDS,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  normalizeFormulaSettings,
  updateFormulaPreviewInDocument,
  buildFormulaPreviewText
} = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');

function createSettingsUiLoader(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || (typeof globalThis !== 'undefined' ? globalThis : {});
  const DialogUtils = deps.getDialogUtils();
  const applyTheme = deps.applyTheme;
  const logger = deps.logger || console;

  function parseFormulaProfileId(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function parseProfileSettings(settingsJson) {
    if (!settingsJson) {
      return null;
    }
    try {
      return normalizeFormulaSettings(JSON.parse(settingsJson));
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

  function displayCompanyLogo(base64Data) {
    const logoPreview = document.getElementById('logoPreview');
    if (!logoPreview) {
      return;
    }

    if (base64Data) {
      logoPreview.innerHTML = `<img src="${base64Data}" alt="شعار الشركة" style="max-width: 100%; max-height: 80px;">`;
      return;
    }

    logoPreview.innerHTML = '<span class="text-muted">لا يوجد شعار</span>';
  }

  function toNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function fetchAllSettingsRows() {
    try {
      const rows = await ipcRenderer.invoke(
        'db-query',
        `SELECT s.category, s.setting_key, s.setting_value
         FROM system_settings s
         INNER JOIN (
           SELECT category, setting_key, MAX(id) AS latest_id
           FROM system_settings
           GROUP BY category, setting_key
         ) latest
           ON latest.latest_id = s.id
         ORDER BY s.category, s.setting_key`,
        []
      );
      if (Array.isArray(rows)) {
        return rows;
      }
    } catch (error) {
      logger.warn('⚠️ [SETTINGS] تعذر تحميل الإعدادات عبر db-query، سيتم تجربة المسار القديم', error);
    }

    const categories = ['general', 'print', 'reports', 'database', 'user', 'reconciliation_formula', 'backup'];
    const fallbackRows = [];
    for (const category of categories) {
      try {
        const rows = await ipcRenderer.invoke(
          'db-all',
          `SELECT s.setting_key, s.setting_value
           FROM system_settings s
           INNER JOIN (
             SELECT setting_key, MAX(id) AS latest_id
             FROM system_settings
             WHERE category = ?
             GROUP BY setting_key
           ) latest
             ON latest.latest_id = s.id
           WHERE s.category = ?
           ORDER BY s.setting_key`,
          [category, category]
        );
        if (Array.isArray(rows)) {
          rows.forEach((row) => {
            fallbackRows.push({
              ...row,
              category: row.category || category
            });
          });
        }
      } catch (error) {
        logger.warn(`⚠️ [SETTINGS] تعذر تحميل فئة الإعدادات: ${category}`, error);
      }
    }

    return fallbackRows;
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
      const parsedSettings = parseProfileSettings(profile.settings_json) || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      const operationText = buildFormulaPreviewText(parsedSettings).replace(/^إجمالي المقبوضات\s*=\s*/u, '');
      const selectedClass = normalizedSelectedId && normalizedSelectedId === profileId ? 'is-selected' : '';
      const defaultBadge = profile.is_default
        ? '<span class="badge bg-success-subtle text-success-emphasis ms-1">افتراضية</span>'
        : '';
      const usage = getProfileUsageSummary(profile);
      const usageText = `الفروع: ${usage.branchesCount} | التصفيات: ${usage.reconciliationsCount}`;
      const editBlockedReason = getEditBlockedReason(profile);
      const deleteBlockedReason = getDeleteBlockedReason(profile);
      const editBtnClass = canEditFormulaProfile(profile)
        ? 'btn btn-sm btn-outline-primary'
        : 'btn btn-sm btn-outline-secondary formula-delete-blocked-btn';
      const editBtnTitle = canEditFormulaProfile(profile) ? 'تعديل المعادلة' : editBlockedReason;
      const deleteBtnClass = canDeleteFormulaProfile(profile)
        ? 'btn btn-sm btn-outline-danger'
        : 'btn btn-sm btn-outline-secondary formula-delete-blocked-btn';
      const deleteBtnTitle = canDeleteFormulaProfile(profile) ? 'حذف المعادلة' : deleteBlockedReason;

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
              <button type="button" class="${editBtnClass}" data-action="edit" data-profile-id="${profileId}" title="${escapeHtml(editBtnTitle)}" aria-disabled="${canEditFormulaProfile(profile) ? 'false' : 'true'}">تعديل</button>
              ${profile.is_default
                ? '<span class="text-success-emphasis small fw-semibold">مفعّلة</span>'
                : `<button type="button" class="btn btn-sm btn-outline-secondary" data-action="activate" data-profile-id="${profileId}">افتراضية</button>`}
              <button type="button" class="${deleteBtnClass}" data-action="delete" data-profile-id="${profileId}" title="${escapeHtml(deleteBtnTitle)}" aria-disabled="${canDeleteFormulaProfile(profile) ? 'false' : 'true'}">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadAllSettings() {
    logger.log('⚙️ [SETTINGS] تحميل جميع الإعدادات...');

    try {
      const allSettings = await fetchAllSettingsRows();

      const settingsByCategory = {};
      const normalizedSettings = Array.isArray(allSettings) ? allSettings : [];
      normalizedSettings.forEach((setting) => {
        if (!settingsByCategory[setting.category]) {
          settingsByCategory[setting.category] = {};
        }
        settingsByCategory[setting.category][setting.setting_key] = setting.setting_value;
      });

      if (settingsByCategory.general) {
        applyGeneralSettingsToUI(settingsByCategory.general);
      }
      if (settingsByCategory.print) {
        applyPrintSettingsToUI(settingsByCategory.print);
      }
      if (settingsByCategory.reports) {
        applyReportsSettingsToUI(settingsByCategory.reports);
      }
      if (settingsByCategory.database) {
        applyDatabaseSettingsToUI(settingsByCategory.database);
      }
      if (settingsByCategory.user) {
        applyUserSettingsToUI(settingsByCategory.user);
      }
      const reconciliationFormulaSettings = settingsByCategory.reconciliation_formula || {};
      const activeProfileId = parseFormulaProfileId(reconciliationFormulaSettings.active_profile_id);
      const loadedProfile = await loadReconciliationFormulaProfiles(activeProfileId, reconciliationFormulaSettings);
      if (!loadedProfile) {
        applyReconciliationFormulaSettingsToUI(reconciliationFormulaSettings);
      }
      if (settingsByCategory.backup) {
        applyBackupSettingsToUI(settingsByCategory.backup);
      }

      if (
        settingsByCategory.general
        && Object.prototype.hasOwnProperty.call(settingsByCategory.general, 'company_name')
      ) {
        windowObj.currentCompanyName = settingsByCategory.general.company_name || '';
      }

      logger.log('✅ [SETTINGS] تم تحميل جميع الإعدادات بنجاح');
    } catch (error) {
      logger.error('❌ [SETTINGS] خطأ في تحميل الإعدادات:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحميل إعدادات النظام.'
      });
      DialogUtils.showError(`حدث خطأ أثناء تحميل الإعدادات: ${friendly}`, 'خطأ في التحميل');
    }
  }

  function applyGeneralSettingsToUI(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, 'company_name')) {
      const companyNameField = document.getElementById('companyName');
      if (companyNameField) companyNameField.value = settings.company_name || '';
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'company_phone')) {
      const companyPhoneField = document.getElementById('companyPhone');
      if (companyPhoneField) companyPhoneField.value = settings.company_phone || '';
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'company_email')) {
      const companyEmailField = document.getElementById('companyEmail');
      if (companyEmailField) companyEmailField.value = settings.company_email || '';
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'company_website')) {
      const companyWebsiteField = document.getElementById('companyWebsite');
      if (companyWebsiteField) companyWebsiteField.value = settings.company_website || '';
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'company_address')) {
      const companyAddressField = document.getElementById('companyAddress');
      if (companyAddressField) companyAddressField.value = settings.company_address || '';
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'company_logo')) {
      displayCompanyLogo(settings.company_logo || '');
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'system_language')) {
      const selectedLanguage = settings.system_language || 'ar';
      const systemLanguageField = document.getElementById('systemLanguage');
      if (systemLanguageField) systemLanguageField.value = selectedLanguage;
      document.documentElement.setAttribute('lang', selectedLanguage);
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'system_theme')) {
      const systemThemeField = document.getElementById('systemTheme');
      const selectedTheme = settings.system_theme || 'light';
      if (systemThemeField) systemThemeField.value = selectedTheme;
      applyTheme(selectedTheme);
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'company_name')) {
      windowObj.currentCompanyName = settings.company_name || '';
    }
  }

  function applyPrintSettingsToUI(settings) {
    if (!settings || typeof settings !== 'object') {
      return;
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(settings, key);
    const read = (...keys) => {
      for (const key of keys) {
        if (has(key)) {
          return settings[key];
        }
      }
      return undefined;
    };
    const parseBoolean = (value, fallback = false) => {
      if (value === undefined || value === null || value === '') {
        return fallback;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      const normalized = String(value).trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    };
    const setFieldValue = (fieldId, value) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = value;
      }
    };
    const setFieldChecked = (fieldId, value) => {
      if (value === undefined) {
        return;
      }
      const field = document.getElementById(fieldId);
      if (field) {
        field.checked = parseBoolean(value, false);
      }
    };
    const readMargins = () => {
      const rawMargins = read('margins');
      if (!rawMargins) {
        return {};
      }
      if (typeof rawMargins === 'object') {
        return rawMargins;
      }
      try {
        const parsedMargins = JSON.parse(rawMargins);
        if (parsedMargins && typeof parsedMargins === 'object') {
          return parsedMargins;
        }
      } catch (error) {
        void error;
      }
      return {};
    };

    const copies = read('copies');
    if (copies !== undefined) {
      setFieldValue('copiesInput', copies);
    }

    const paperSize = read('paper_size', 'paperSize');
    if (paperSize !== undefined) {
      setFieldValue('paperSize', paperSize);
      setFieldValue('paperSizeSelect', paperSize);
    }

    const orientation = read('paper_orientation', 'orientation');
    if (orientation !== undefined) {
      setFieldValue('paperOrientation', orientation);
      setFieldValue('orientationSelect', orientation);
    }

    const fontFamily = read('font_family', 'fontFamily');
    if (fontFamily !== undefined) {
      setFieldValue('fontFamily', fontFamily);
    }

    const fontSize = read('font_size', 'fontSize');
    if (fontSize !== undefined) {
      setFieldValue('fontSize', fontSize);
    }

    const colorPrint = read('color_print', 'color');
    if (colorPrint !== undefined) {
      setFieldChecked('colorPrintCheck', colorPrint);
    }

    const duplex = read('duplex');
    if (duplex !== undefined) {
      setFieldValue('duplexSelect', duplex);
    }

    const margins = readMargins();
    const marginTop = read('margin_top') ?? margins.top;
    const marginRight = read('margin_right') ?? margins.right;
    const marginBottom = read('margin_bottom') ?? margins.bottom;
    const marginLeft = read('margin_left') ?? margins.left;

    if (marginTop !== undefined) {
      setFieldValue('marginTop', marginTop);
      setFieldValue('printDialogMarginTop', marginTop);
    }
    if (marginRight !== undefined) {
      setFieldValue('marginRight', marginRight);
      setFieldValue('printDialogMarginRight', marginRight);
    }
    if (marginBottom !== undefined) {
      setFieldValue('marginBottom', marginBottom);
      setFieldValue('printDialogMarginBottom', marginBottom);
    }
    if (marginLeft !== undefined) {
      setFieldValue('marginLeft', marginLeft);
      setFieldValue('printDialogMarginLeft', marginLeft);
    }

    const printOptionsCheckboxes = {
      print_header: 'printHeader',
      print_footer: 'printFooter',
      print_logo: 'printLogo',
      print_page_numbers: 'printPageNumbers',
      print_date: 'printDate',
      print_borders: 'printBorders'
    };

    Object.entries(printOptionsCheckboxes).forEach(([settingKey, fieldId]) => {
      if (has(settingKey)) {
        setFieldChecked(fieldId, settings[settingKey]);
      }
    });
  }

  function applyReportsSettingsToUI(settings) {
    const defaultFormat = settings.default_format || settings.default_report_format;
    if (defaultFormat) {
      const defaultReportFormatField = document.getElementById('defaultReportFormat');
      if (defaultReportFormatField) defaultReportFormatField.value = defaultFormat;
    }

    const defaultDateRange = settings.default_date_range || settings.default_time_range;
    if (defaultDateRange) {
      const defaultDateRangeField = document.getElementById('defaultDateRange');
      if (defaultDateRangeField) defaultDateRangeField.value = defaultDateRange;
    }

    const reportsPath = settings.reports_path || settings.default_save_path || '';
    const reportsPathField = document.getElementById('reportsPath');
    if (reportsPathField) reportsPathField.value = reportsPath;

    const checkboxMappings = {
      include_charts: 'includeCharts',
      include_summary: 'includeSummary',
      include_details: 'includeDetails',
      auto_open_reports: 'autoOpenReports',
      save_report_history: 'saveReportHistory',
      compress_reports: 'compressReports'
    };

    Object.entries(checkboxMappings).forEach(([settingKey, fieldId]) => {
      if (Object.prototype.hasOwnProperty.call(settings, settingKey)) {
        const field = document.getElementById(fieldId);
        if (field) field.checked = settings[settingKey] === 'true';
      }
    });

    logger.log('📊 [SETTINGS] تطبيق إعدادات التقارير:', settings);
  }

  function applyDatabaseSettingsToUI(settings) {
    if (settings.auto_backup) {
      const autoBackupField = document.getElementById('autoBackup');
      if (autoBackupField) autoBackupField.value = settings.auto_backup;
    }
    if (settings.backup_location) {
      const backupLocationField = document.getElementById('backupLocation');
      if (backupLocationField) backupLocationField.value = settings.backup_location;
    }
  }

  function applyUserSettingsToUI(settings) {
    logger.log('👤 [SETTINGS] تطبيق إعدادات المستخدمين:', settings);

    if (Object.prototype.hasOwnProperty.call(settings, 'session_timeout')) {
      const sessionTimeoutField = document.getElementById('sessionTimeout');
      if (sessionTimeoutField) sessionTimeoutField.value = String(settings.session_timeout ?? '');
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'auto_lock')) {
      const autoLockField = document.getElementById('autoLock');
      if (autoLockField) autoLockField.value = String(settings.auto_lock ?? '');
    }
  }

  function applyBackupSettingsToUI(settings) {
    logger.log('💾 [SETTINGS] تطبيق إعدادات النسخ الاحتياطي:', settings);

    if (settings.default_backup_path) {
      const backupLocationField = document.getElementById('backupLocation');
      if (backupLocationField) {
        backupLocationField.value = settings.default_backup_path;
      }
    }

    if (settings.auto_backup_frequency) {
      const autoBackupField = document.getElementById('autoBackup');
      if (autoBackupField) {
        autoBackupField.value = settings.auto_backup_frequency;
      }
    }
  }

  function applyReconciliationFormulaSettingsToUI(settings) {
    const normalizedSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...settings
    });

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const selectEl = document.getElementById(field.fieldId);
      if (selectEl) {
        selectEl.value = String(normalizedSettings[field.settingKey]);
      }
    });

    updateFormulaPreviewInDocument(document, normalizedSettings);

    if (windowObj && typeof windowObj.updateSummary === 'function') {
      windowObj.updateSummary();
    }
  }

  async function loadReconciliationFormulaProfiles(preferredProfileId = null, fallbackSettings = {}) {
    const profileSelect = document.getElementById('formulaProfileSelect');
    const selectedProfileIdInput = document.getElementById('selectedFormulaProfileId');

    try {
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

      if (!Array.isArray(profiles) || profiles.length === 0) {
        if (profileSelect) {
          profileSelect.innerHTML = '<option value="">لا توجد معادلات محفوظة</option>';
        }
        if (selectedProfileIdInput) {
          selectedProfileIdInput.value = '';
        }
        renderFormulaProfilesTable([]);
        return null;
      }

      if (profileSelect) {
        profileSelect.innerHTML = profiles.map((profile) => {
          const suffix = profile.is_default ? ' (افتراضية)' : '';
          return `<option value="${profile.id}">${profile.formula_name}${suffix}</option>`;
        }).join('');
      }

      const preferredId = parseFormulaProfileId(preferredProfileId);
      const selectedProfile = preferredId
        ? profiles.find((profile) => parseFormulaProfileId(profile.id) === preferredId) || profiles[0]
        : profiles[0];

      if (profileSelect) {
        profileSelect.value = String(selectedProfile.id);
      }
      if (selectedProfileIdInput) {
        selectedProfileIdInput.value = String(selectedProfile.id);
      }
      renderFormulaProfilesTable(profiles, selectedProfile.id);

      const profileNameInput = document.getElementById('formulaProfileName');
      if (profileNameInput) {
        profileNameInput.value = selectedProfile.formula_name || '';
      }

      let parsedSettings = null;
      if (selectedProfile.settings_json) {
        try {
          parsedSettings = JSON.parse(selectedProfile.settings_json);
        } catch (error) {
          parsedSettings = null;
        }
      }

      if (parsedSettings) {
        applyReconciliationFormulaSettingsToUI(parsedSettings);
      } else {
        applyReconciliationFormulaSettingsToUI(fallbackSettings);
      }

      return selectedProfile;
    } catch (error) {
      logger.warn('⚠️ [SETTINGS] تعذر تحميل بروفايلات معادلة التصفية:', error);
      return null;
    }
  }

  return {
    loadAllSettings,
    applyGeneralSettingsToUI,
    applyPrintSettingsToUI,
    applyReportsSettingsToUI,
    applyDatabaseSettingsToUI,
    applyUserSettingsToUI,
    applyBackupSettingsToUI,
    applyReconciliationFormulaSettingsToUI,
    loadReconciliationFormulaProfiles
  };
}

module.exports = {
  createSettingsUiLoader
};
