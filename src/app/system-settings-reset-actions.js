const {
  RECONCILIATION_FORMULA_FIELDS,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  updateFormulaPreviewInDocument
} = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');

function createSystemSettingsResetActions(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || globalThis;
  const FileReader = context.FileReaderCtor || globalThis.FileReader;
  const getDialogUtils = context.getDialogUtils;
  const displayCompanyLogo = context.displayCompanyLogo;
  const applyGeneralSettingsRealTime = typeof context.applyGeneralSettingsRealTime === 'function'
    ? context.applyGeneralSettingsRealTime
    : async () => {};

async function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
        getDialogUtils().showValidationError('نوع الملف غير مدعوم. يرجى اختيار PNG أو JPG أو SVG');
        event.target.value = '';
        return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
        getDialogUtils().showValidationError('حجم الملف كبير جداً. الحد الأقصى 2 ميجابايت');
        event.target.value = '';
        return;
    }

    try {
        // Convert to base64
        const reader = new FileReader();
        reader.onload = async function (e) {
            const base64Data = e.target.result;

            // Save to database
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['general', 'company_logo', base64Data]);

            // Display preview
            displayCompanyLogo(base64Data);

            getDialogUtils().showSuccessToast('تم رفع الشعار بنجاح');
        };

        reader.readAsDataURL(file);

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في رفع الشعار:', error);
        const friendly = mapDbErrorMessage(error, {
            fallback: 'تعذر رفع الشعار.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء رفع الشعار: ${friendly}`, 'خطأ في الرفع');
    }
}

async function handleResetGeneralSettings() {
    const confirmed = await getDialogUtils().showConfirm(
        'هل أنت متأكد من إعادة تعيين الإعدادات العامة إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            const defaultSettings = [
                { key: 'company_name', value: 'شركة الكاشير' },
                { key: 'company_phone', value: '' },
                { key: 'company_email', value: '' },
                { key: 'company_website', value: '' },
                { key: 'company_address', value: '' },
                { key: 'company_logo', value: '' },
                { key: 'system_language', value: 'ar' },
                { key: 'system_theme', value: 'light' }
            ];

            for (const setting of defaultSettings) {
                await ipcRenderer.invoke('db-run', `
                    INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                `, ['general', setting.key, setting.value]);
            }

            // Reset to default values
            document.getElementById('companyName').value = 'شركة الكاشير';
            document.getElementById('companyPhone').value = '';
            document.getElementById('companyEmail').value = '';
            document.getElementById('companyWebsite').value = '';
            document.getElementById('companyAddress').value = '';
            document.getElementById('systemLanguage').value = 'ar';
            document.getElementById('systemTheme').value = 'light';
            document.getElementById('companyLogo').value = '';
            displayCompanyLogo('');

            await applyGeneralSettingsRealTime(defaultSettings);

            getDialogUtils().showSuccessToast('تم إعادة تعيين الإعدادات العامة وحفظها');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين الإعدادات:', error);
            getDialogUtils().showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

async function handleResetPrintSettings() {
    const confirmed = await getDialogUtils().showConfirm(
        'هل أنت متأكد من إعادة تعيين إعدادات الطباعة إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            // Reset to default values
            document.getElementById('paperSize').value = 'A4';
            document.getElementById('paperOrientation').value = 'portrait';
            document.getElementById('fontFamily').value = 'Cairo';
            document.getElementById('fontSize').value = 'normal';
            document.getElementById('marginTop').value = '20';
            document.getElementById('marginBottom').value = '20';
            document.getElementById('marginLeft').value = '15';
            document.getElementById('marginRight').value = '15';
            document.getElementById('printHeader').checked = true;
            document.getElementById('printFooter').checked = true;
            document.getElementById('printLogo').checked = true;
            document.getElementById('printPageNumbers').checked = true;
            document.getElementById('printDate').checked = true;
            document.getElementById('printBorders').checked = false;
            const colorPrintCheck = document.getElementById('colorPrintCheck');
            if (colorPrintCheck) colorPrintCheck.checked = false;
            const copiesInput = document.getElementById('copiesInput');
            if (copiesInput) copiesInput.value = '1';
            const duplexSelect = document.getElementById('duplexSelect');
            if (duplexSelect) duplexSelect.value = 'simplex';
            const dialogMarginTop = document.getElementById('printDialogMarginTop');
            if (dialogMarginTop) dialogMarginTop.value = '20';
            const dialogMarginBottom = document.getElementById('printDialogMarginBottom');
            if (dialogMarginBottom) dialogMarginBottom.value = '20';
            const dialogMarginLeft = document.getElementById('printDialogMarginLeft');
            if (dialogMarginLeft) dialogMarginLeft.value = '15';
            const dialogMarginRight = document.getElementById('printDialogMarginRight');
            if (dialogMarginRight) dialogMarginRight.value = '15';

            getDialogUtils().showSuccessToast('تم إعادة تعيين إعدادات الطباعة');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين إعدادات الطباعة:', error);
            getDialogUtils().showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

async function handleResetReportsSettings() {
    const confirmed = await getDialogUtils().showConfirm(
        'هل أنت متأكد من إعادة تعيين إعدادات التقارير إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            // Reset to default values
            document.getElementById('defaultReportFormat').value = 'pdf';
            document.getElementById('defaultDateRange').value = 'week';
            document.getElementById('reportsPath').value = '';
            document.getElementById('includeCharts').checked = true;
            document.getElementById('includeSummary').checked = true;
            document.getElementById('includeDetails').checked = true;
            document.getElementById('autoOpenReports').checked = false;
            document.getElementById('saveReportHistory').checked = true;
            document.getElementById('compressReports').checked = false;

            getDialogUtils().showSuccessToast('تم إعادة تعيين إعدادات التقارير');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين إعدادات التقارير:', error);
            getDialogUtils().showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

async function handleResetReconciliationFormulaSettings() {
    const confirmed = await getDialogUtils().showConfirm(
        'هل أنت متأكد من إعادة تعيين معادلة التصفية إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (!confirmed) {
        return;
    }

    try {
        RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
            const selectEl = document.getElementById(field.fieldId);
            if (selectEl) {
                selectEl.value = String(DEFAULT_RECONCILIATION_FORMULA_SETTINGS[field.settingKey]);
            }
        });

        updateFormulaPreviewInDocument(document, DEFAULT_RECONCILIATION_FORMULA_SETTINGS);

        if (windowObj && typeof windowObj.updateSummary === 'function') {
            windowObj.updateSummary();
        }

        getDialogUtils().showSuccessToast('تم إعادة تعيين معادلة التصفية');
    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في إعادة تعيين معادلة التصفية:', error);
        getDialogUtils().showError('حدث خطأ أثناء إعادة تعيين معادلة التصفية', 'خطأ');
    }
}

  return {
    handleLogoUpload,
    handleResetGeneralSettings,
    handleResetPrintSettings,
    handleResetReportsSettings,
    handleResetReconciliationFormulaSettings
  };
}

module.exports = {
  createSystemSettingsResetActions
};
