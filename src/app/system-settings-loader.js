function createSystemSettingsLoader(context) {
  const ipcRenderer = context.ipcRenderer;
  const applyGeneralSettings = context.applyGeneralSettings;
  const applyPrintSettings = context.applyPrintSettings;
  const applyReportsSettings = context.applyReportsSettings;
  const applyDatabaseSettings = context.applyDatabaseSettings;
  const applyUserSettings = context.applyUserSettings;
  const applyReconciliationFormulaSettings = context.applyReconciliationFormulaSettings;
  const loadSystemInformation = context.loadSystemInformation;

async function loadSystemSettings() {
    console.log('⚙️ [SETTINGS] تحميل إعدادات النظام...');

    try {
        // Load general settings
        const generalSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['general']);

        // Load print settings
        const printSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['print']);

        // Load reports settings
        const reportsSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['reports']);

        // Load database settings
        const databaseSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['database']);

        // Load user settings
        const userSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['user']);

        // Load reconciliation formula settings
        const reconciliationFormulaSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['reconciliation_formula']);

        // Apply settings to UI
        console.log('📋 [SETTINGS] تطبيق الإعدادات العامة:', generalSettings);
        applyGeneralSettings(generalSettings);
        applyPrintSettings(printSettings);
        applyReportsSettings(reportsSettings);
        applyDatabaseSettings(databaseSettings);
        applyUserSettings(userSettings);
        applyReconciliationFormulaSettings(reconciliationFormulaSettings);

        // Load system information
        loadSystemInformation();

        console.log('✅ [SETTINGS] تم تحميل إعدادات النظام بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحميل الإعدادات:', error);
        // Create default settings if table doesn't exist
        await createDefaultSettings();
    }
}

async function createDefaultSettings() {
    console.log('🔧 [SETTINGS] إنشاء إعدادات افتراضية...');

    try {
        // Create settings table if it doesn't exist
        await ipcRenderer.invoke('db-run', `
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, setting_key)
            )
        `);

        // Insert default settings
        const defaultSettings = [
            // General settings
            { category: 'general', key: 'company_name', value: 'شركة الكاشير' },
            { category: 'general', key: 'company_phone', value: '' },
            { category: 'general', key: 'company_email', value: '' },
            { category: 'general', key: 'company_website', value: '' },
            { category: 'general', key: 'company_address', value: '' },
            { category: 'general', key: 'company_logo', value: '' },
            { category: 'general', key: 'system_language', value: 'ar' },
            { category: 'general', key: 'system_theme', value: 'light' },

            // Print settings
            { category: 'print', key: 'paper_size', value: 'A4' },
            { category: 'print', key: 'paper_orientation', value: 'portrait' },
            { category: 'print', key: 'font_family', value: 'Cairo' },
            { category: 'print', key: 'font_size', value: 'normal' },
            { category: 'print', key: 'margin_top', value: '20' },
            { category: 'print', key: 'margin_bottom', value: '20' },
            { category: 'print', key: 'margin_left', value: '15' },
            { category: 'print', key: 'margin_right', value: '15' },
            { category: 'print', key: 'print_header', value: 'true' },
            { category: 'print', key: 'print_footer', value: 'true' },
            { category: 'print', key: 'color_print', value: 'false' },
            { category: 'print', key: 'print_logo', value: 'true' },
            { category: 'print', key: 'print_page_numbers', value: 'true' },
            { category: 'print', key: 'print_date', value: 'true' },
            { category: 'print', key: 'print_borders', value: 'false' },

            // Reports settings
            { category: 'reports', key: 'default_format', value: 'pdf' },
            { category: 'reports', key: 'default_date_range', value: 'week' },
            { category: 'reports', key: 'reports_path', value: '' },
            { category: 'reports', key: 'default_save_path', value: '' },
            { category: 'reports', key: 'include_charts', value: 'true' },
            { category: 'reports', key: 'include_summary', value: 'true' },
            { category: 'reports', key: 'include_details', value: 'true' },
            { category: 'reports', key: 'auto_open_reports', value: 'false' },
            { category: 'reports', key: 'save_report_history', value: 'true' },
            { category: 'reports', key: 'compress_reports', value: 'false' },

            // Database settings
            { category: 'database', key: 'auto_backup', value: 'daily' },
            { category: 'database', key: 'backup_location', value: '' },

            // User settings
            { category: 'user', key: 'session_timeout', value: '60' },
            { category: 'user', key: 'auto_lock', value: '10' },

            // Reconciliation formula settings
            { category: 'reconciliation_formula', key: 'bank_receipts_sign', value: '1' },
            { category: 'reconciliation_formula', key: 'cash_receipts_sign', value: '1' },
            { category: 'reconciliation_formula', key: 'postpaid_sales_sign', value: '1' },
            { category: 'reconciliation_formula', key: 'customer_receipts_sign', value: '-1' },
            { category: 'reconciliation_formula', key: 'return_invoices_sign', value: '1' },
            { category: 'reconciliation_formula', key: 'suppliers_sign', value: '0' }
        ];

        for (const setting of defaultSettings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR IGNORE INTO system_settings (category, setting_key, setting_value)
                VALUES (?, ?, ?)
            `, [setting.category, setting.key, setting.value]);
        }

        console.log('✅ [SETTINGS] تم إنشاء الإعدادات الافتراضية');

        // Load the newly created settings
        await loadSystemSettings();

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في إنشاء الإعدادات الافتراضية:', error);
    }
}

async function getCompanyName() {
    try {
        const result = await ipcRenderer.invoke('db-get',
            'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?',
            ['general', 'company_name']
        );

        if (result && result.setting_value) {
            return result.setting_value;
        }

        return 'تقرير النظام'; // Default fallback
    } catch (error) {
        console.error('❌ [REPORTS] خطأ في جلب اسم الشركة:', error);
        return 'تقرير النظام'; // Default fallback
    }
}

  return {
    loadSystemSettings,
    createDefaultSettings,
    getCompanyName
  };
}

module.exports = {
  createSystemSettingsLoader
};
