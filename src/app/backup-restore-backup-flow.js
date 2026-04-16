const { mapDbErrorMessage, extractDbErrorMessage } = require('./db-error-messages');

function createBackupRestoreBackupFlowHandlers(context) {
  const ipcRenderer = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils;

async function handleCreateBackup() {
    console.log('💾 [BACKUP] بدء إنشاء نسخة احتياطية...');

    try {
        getDialogUtils().showLoading('جاري إنشاء النسخة الاحتياطية...', 'يرجى الانتظار قد تستغرق هذه العملية بضع دقائق');

        // Get backup file path from user
        const backupPath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'حفظ النسخة الاحتياطية',
            defaultPath: `casher_backup_${new Date().toISOString().split('T')[0]}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!backupPath) {
            getDialogUtils().close();
            return; // User cancelled
        }

        // Collect all data from database
        const backupData = await collectDatabaseData();

        // Save backup file
        const result = await ipcRenderer.invoke('save-backup-file', {
            filePath: backupPath,
            data: backupData
        });

        getDialogUtils().close();

        if (result.success) {
            getDialogUtils().showSuccess(
                `تم إنشاء النسخة الاحتياطية بنجاح!\n\nالملف: ${backupPath}\nحجم البيانات: ${result.recordCount} سجل\nحجم الملف: ${result.fileSize}`,
                'تم إنشاء النسخة الاحتياطية'
            );
            console.log('✅ [BACKUP] تم إنشاء النسخة الاحتياطية بنجاح');
        } else {
            const friendly = mapDbErrorMessage(result.error, {
                fallback: 'تعذر إنشاء ملف النسخة الاحتياطية.'
            });
            getDialogUtils().showError(`فشل في إنشاء النسخة الاحتياطية: ${friendly}`, 'خطأ في النسخ الاحتياطي');
        }

    } catch (error) {
        getDialogUtils().close();
        console.error('❌ [BACKUP] خطأ في إنشاء النسخة الاحتياطية:', error);
        const friendly = mapDbErrorMessage(error, {
            fallback: 'حدث خطأ أثناء إنشاء النسخة الاحتياطية.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء إنشاء النسخة الاحتياطية: ${friendly}`, 'خطأ في النسخ الاحتياطي');
    }
}

async function collectDatabaseData() {
    console.log('📊 [BACKUP] جمع البيانات من قاعدة البيانات...');

    const backupData = {
        metadata: {
            version: '1.0',
            created_at: new Date().toISOString(),
            app_name: 'نظام تصفية الكاشير',
            description: 'نسخة احتياطية كاملة من قاعدة البيانات'
        },
        data: {}
    };

    try {
        // Get all table data - Fixed to include all tables with proper order
        const tables = [
            'admins',
            'branches',
            'cashiers',
            'accountants',
            'atms',
            'reconciliations',
            'bank_receipts',
            'cash_receipts',
            'postpaid_sales',
            'customer_receipts',
            'return_invoices',
            'suppliers',
            'archived_years',
            'archived_reconciliations',
            'archived_bank_receipts',
            'archived_cash_receipts',
            'archived_postpaid_sales',
            'archived_customer_receipts',
            'archived_return_invoices',
            'archived_suppliers',
            'system_settings',
            'settings',
            'reconciliation_requests',
            'manual_postpaid_sales',
            'manual_supplier_transactions',
            'manual_customer_receipts',
            'branch_cashboxes',
            'cashbox_vouchers',
            'cashbox_voucher_audit_log'
        ];

        for (const table of tables) {
            try {
                const tableData = await ipcRenderer.invoke('db-query', `SELECT * FROM ${table}`, []);
                backupData.data[table] = tableData;
                console.log(`📋 [BACKUP] تم جمع ${tableData.length} سجل من جدول ${table}`);
            } catch (error) {
                console.warn(`⚠️ [BACKUP] تعذر جمع البيانات من جدول ${table}:`, error);
                backupData.data[table] = [];

                // Log specific error for debugging
                const rawErrorMessage = extractDbErrorMessage(error);
                if (rawErrorMessage.includes('no such table')) {
                    console.warn(`ℹ️ [BACKUP] جدول ${table} غير موجود في قاعدة البيانات`);
                }
            }
        }

        // Validate backup data before saving
        const backupValidation = validateBackupCompleteness(backupData.data);
        if (!backupValidation.valid) {
            console.warn('⚠️ [BACKUP] تحذير في النسخة الاحتياطية:', backupValidation.warnings);
        }

        // Calculate total records
        const totalRecords = Object.values(backupData.data).reduce((sum, tableData) => sum + tableData.length, 0);
        backupData.metadata.total_records = totalRecords;

        console.log(`✅ [BACKUP] تم جمع ${totalRecords} سجل من ${tables.length} جدول`);
        return backupData;

    } catch (error) {
        console.error('❌ [BACKUP] خطأ في جمع البيانات:', error);
        throw error;
    }
}

function validateBackupCompleteness(data) {
    const warnings = [];
    const requiredTables = ['branches', 'cashiers', 'accountants', 'atms', 'reconciliations'];

    // Check for missing essential tables
    requiredTables.forEach(table => {
        if (!data[table] || data[table].length === 0) {
            warnings.push(`جدول ${table} فارغ أو مفقود`);
        }
    });

    // Check for orphaned records
    if (data.reconciliations && data.reconciliations.length > 0) {
        if (!data.cashiers || data.cashiers.length === 0) {
            warnings.push('توجد تصفيات ولكن لا توجد كاشيرين');
        }
        if (!data.accountants || data.accountants.length === 0) {
            warnings.push('توجد تصفيات ولكن لا توجد محاسبين');
        }
    }

    if (data.bank_receipts && data.bank_receipts.length > 0) {
        if (!data.atms || data.atms.length === 0) {
            warnings.push('توجد مقبوضات بنكية ولكن لا توجد أجهزة صراف');
        }
    }

    return {
        valid: warnings.length === 0,
        warnings: warnings
    };
}

  return {
    handleCreateBackup,
    collectDatabaseData,
    validateBackupCompleteness
  };
}

module.exports = {
  createBackupRestoreBackupFlowHandlers
};
