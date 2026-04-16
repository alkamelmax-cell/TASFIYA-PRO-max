const {
  RECONCILIATION_FORMULA_FIELDS,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  normalizeFormulaSettings,
  updateFormulaPreviewInDocument
} = require('./reconciliation-formula');

function createSystemSettingsUiHelpers(context) {
  const document = context.document;
  const window = context.windowObj || globalThis;
  const localStorage = context.localStorageObj || (window && window.localStorage);

function applyGeneralSettings(settings) {
    console.log('🔄 [SETTINGS] تطبيق الإعدادات العامة على الواجهة...');

    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
        console.log(`📝 [SETTINGS] تطبيق ${setting.setting_key}: ${setting.setting_value}`);
    });

    // Apply to form fields
    if (settingsMap.company_name) {
        const companyNameField = document.getElementById('companyName');
        if (companyNameField) {
            companyNameField.value = settingsMap.company_name;
            console.log('✅ [SETTINGS] تم تطبيق اسم الشركة:', settingsMap.company_name);
        }
    }

    if (settingsMap.company_phone) {
        const companyPhoneField = document.getElementById('companyPhone');
        if (companyPhoneField) companyPhoneField.value = settingsMap.company_phone;
    }

    if (settingsMap.company_email) {
        const companyEmailField = document.getElementById('companyEmail');
        if (companyEmailField) companyEmailField.value = settingsMap.company_email;
    }

    if (settingsMap.company_website) {
        const companyWebsiteField = document.getElementById('companyWebsite');
        if (companyWebsiteField) companyWebsiteField.value = settingsMap.company_website;
    }

    if (settingsMap.company_address) {
        const companyAddressField = document.getElementById('companyAddress');
        if (companyAddressField) companyAddressField.value = settingsMap.company_address;
    }

    if (settingsMap.system_language) {
        const systemLanguageField = document.getElementById('systemLanguage');
        if (systemLanguageField) systemLanguageField.value = settingsMap.system_language;
    }

    if (settingsMap.system_theme) {
        const systemThemeField = document.getElementById('systemTheme');
        if (systemThemeField) systemThemeField.value = settingsMap.system_theme;
    }

    // Apply logo if exists
    if (settingsMap.company_logo) {
        displayCompanyLogo(settingsMap.company_logo);
    }

    // Set global company name for reports and other uses
    if (settingsMap.company_name) {
        window.currentCompanyName = settingsMap.company_name;
        console.log('🏢 [SETTINGS] تم تعيين اسم الشركة العام:', settingsMap.company_name);
    }

    // Apply theme immediately
    if (settingsMap.system_theme) {
        applyTheme(settingsMap.system_theme);
        console.log('🎨 [SETTINGS] تم تطبيق المظهر:', settingsMap.system_theme);
    }

    // Apply language settings
    if (settingsMap.system_language) {
        console.log('🌐 [SETTINGS] تم تعيين اللغة:', settingsMap.system_language);
    }
}

function applyPrintSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    // Apply to form fields
    const fieldMappings = {
        'paper_size': 'paperSize',
        'paper_orientation': 'paperOrientation',
        'font_family': 'fontFamily',
        'font_size': 'fontSize',
        'margin_top': 'marginTop',
        'margin_bottom': 'marginBottom',
        'margin_left': 'marginLeft',
        'margin_right': 'marginRight'
    };

    Object.entries(fieldMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.value = settingsMap[settingKey];
        }
    });

    // Apply checkboxes
    const checkboxMappings = {
        'print_header': 'printHeader',
        'print_footer': 'printFooter',
        'print_logo': 'printLogo',
        'print_page_numbers': 'printPageNumbers',
        'print_date': 'printDate',
        'print_borders': 'printBorders',
        'color_print': 'colorPrintCheck'
    };

    Object.entries(checkboxMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.checked = settingsMap[settingKey] === 'true';
        }
    });
}

function applyReportsSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    // Apply to form fields
    const fieldMappings = {
        'default_format': 'defaultReportFormat',
        'default_date_range': 'defaultDateRange'
    };

    Object.entries(fieldMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.value = settingsMap[settingKey];
        }
    });

    const reportsPathField = document.getElementById('reportsPath');
    if (reportsPathField) {
        reportsPathField.value = settingsMap.reports_path || settingsMap.default_save_path || '';
    }

    // Apply checkboxes
    const checkboxMappings = {
        'include_charts': 'includeCharts',
        'include_summary': 'includeSummary',
        'include_details': 'includeDetails',
        'auto_open_reports': 'autoOpenReports',
        'save_report_history': 'saveReportHistory',
        'compress_reports': 'compressReports'
    };

    Object.entries(checkboxMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.checked = settingsMap[settingKey] === 'true';
        }
    });
}

function applyDatabaseSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    if (settingsMap.auto_backup) {
        const autoBackupField = document.getElementById('autoBackup');
        if (autoBackupField) autoBackupField.value = settingsMap.auto_backup;
    }

    if (settingsMap.backup_location) {
        const backupLocationField = document.getElementById('backupLocation');
        if (backupLocationField) backupLocationField.value = settingsMap.backup_location;
    }
}

function applyUserSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    if (Object.prototype.hasOwnProperty.call(settingsMap, 'session_timeout')) {
        const sessionTimeoutField = document.getElementById('sessionTimeout');
        if (sessionTimeoutField) sessionTimeoutField.value = String(settingsMap.session_timeout ?? '');
    }

    if (Object.prototype.hasOwnProperty.call(settingsMap, 'auto_lock')) {
        const autoLockField = document.getElementById('autoLock');
        if (autoLockField) autoLockField.value = String(settingsMap.auto_lock ?? '');
    }
}

function applyReconciliationFormulaSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    const normalizedSettings = normalizeFormulaSettings({
        ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
        ...settingsMap
    });

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
        const selectEl = document.getElementById(field.fieldId);
        if (selectEl) {
            selectEl.value = String(normalizedSettings[field.settingKey]);
        }
    });

    updateFormulaPreviewInDocument(document, normalizedSettings);

    if (window && typeof window.updateSummary === 'function') {
        window.updateSummary();
    }
}

function applyTheme(theme) {
    console.log('🎨 [THEME] تطبيق المظهر:', theme);
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');

    // Apply new theme
    switch (theme) {
        case 'dark':
            body.classList.add('theme-dark');
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            console.log('🌙 [THEME] تم تطبيق المظهر الداكن');
            break;

        case 'auto':
        {
            body.classList.add('theme-auto');
            // Check system preference
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                body.classList.add('theme-dark');
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                body.classList.add('theme-light');
                document.documentElement.setAttribute('data-theme', 'light');
            }
            localStorage.setItem('theme', 'auto');
            console.log('🌓 [THEME] تم تطبيق المظهر التلقائي -', prefersDark ? 'داكن' : 'فاتح');

            // Add listener for system theme changes
            const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeMediaQuery.addListener((e) => {
                if (localStorage.getItem('theme') === 'auto') {
                    body.classList.remove('theme-light', 'theme-dark');
                    if (e.matches) {
                        body.classList.add('theme-dark');
                        document.documentElement.setAttribute('data-theme', 'dark');
                    } else {
                        body.classList.add('theme-light');
                        document.documentElement.setAttribute('data-theme', 'light');
                    }
                }
            });
            break;
        }

        case 'light':
        default:
            body.classList.add('theme-light');
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            console.log('☀️ [THEME] تم تطبيق المظهر الفاتح');
            break;
    }
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

  return {
    applyGeneralSettings,
    applyPrintSettings,
    applyReportsSettings,
    applyDatabaseSettings,
    applyUserSettings,
    applyReconciliationFormulaSettings,
    applyTheme,
    displayCompanyLogo
  };
}

module.exports = {
  createSystemSettingsUiHelpers
};
