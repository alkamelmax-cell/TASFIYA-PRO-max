const { mapDbErrorMessage } = require('./db-error-messages');

function createBackupRestoreRestoreDbHandlers(context) {
  const ipcRenderer = context.ipcRenderer;

async function ensureRequiredTablesExist() {
    console.log('🔧 [RESTORE] فحص وإنشاء الجداول المفقودة...');

    try {
        // قائمة الجداول المطلوبة مع أوامر إنشائها
        const requiredTables = [
            {
                name: 'customer_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS customer_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        payment_type TEXT NOT NULL DEFAULT 'نقدي',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'bank_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS bank_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        operation_type TEXT NOT NULL,
                        atm_id INTEGER,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
                        FOREIGN KEY (atm_id) REFERENCES atms(id)
                    )
                `
            },
            {
                name: 'cash_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS cash_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        denomination INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        total_amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'postpaid_sales',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS postpaid_sales (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'return_invoices',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS return_invoices (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        invoice_number TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'suppliers',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS suppliers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        supplier_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'archived_years',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_years (
                        year TEXT PRIMARY KEY,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        total_reconciliations INTEGER DEFAULT 0,
                        total_bank_receipts INTEGER DEFAULT 0,
                        total_cash_receipts INTEGER DEFAULT 0,
                        total_postpaid_sales INTEGER DEFAULT 0,
                        total_customer_receipts INTEGER DEFAULT 0,
                        total_return_invoices INTEGER DEFAULT 0,
                        total_suppliers INTEGER DEFAULT 0
                    )
                `
            },
            {
                name: 'archived_reconciliations',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_reconciliations (
                        id INTEGER PRIMARY KEY,
                        reconciliation_number INTEGER NULL,
                        cashier_id INTEGER NOT NULL,
                        accountant_id INTEGER NOT NULL,
                        reconciliation_date DATE NOT NULL,
                        time_range_start TIME NULL,
                        time_range_end TIME NULL,
                        filter_notes TEXT,
                        system_sales DECIMAL(10,2) DEFAULT 0,
                        total_receipts DECIMAL(10,2) DEFAULT 0,
                        surplus_deficit DECIMAL(10,2) DEFAULT 0,
                        status TEXT DEFAULT 'draft',
                        notes TEXT,
                        formula_profile_id INTEGER,
                        formula_settings TEXT,
                        cashbox_posting_enabled INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_modified_date DATETIME,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_bank_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_bank_receipts (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        operation_type TEXT NOT NULL,
                        atm_id INTEGER NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_cash_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_cash_receipts (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        denomination INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        total_amount DECIMAL(10,2) NOT NULL,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_postpaid_sales',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_postpaid_sales (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_customer_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_customer_receipts (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        payment_type TEXT NOT NULL,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_return_invoices',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_return_invoices (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        invoice_number TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'archived_suppliers',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS archived_suppliers (
                        id INTEGER PRIMARY KEY,
                        reconciliation_id INTEGER NOT NULL,
                        supplier_name TEXT NOT NULL,
                        invoice_number TEXT,
                        amount DECIMAL(10,2) NOT NULL,
                        notes TEXT,
                        is_modified INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'manual_supplier_transactions',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS manual_supplier_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        supplier_name TEXT NOT NULL,
                        transaction_type TEXT NOT NULL DEFAULT 'payment',
                        amount DECIMAL(10,2) NOT NULL,
                        reference_no TEXT,
                        notes TEXT,
                        branch_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
                    )
                `
            },
            {
                name: 'branch_cashboxes',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS branch_cashboxes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        branch_id INTEGER NOT NULL UNIQUE,
                        cashbox_name TEXT NOT NULL,
                        opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
                        is_active INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'cashbox_vouchers',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS cashbox_vouchers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        voucher_number INTEGER NOT NULL UNIQUE,
                        voucher_sequence_number INTEGER,
                        sync_key TEXT UNIQUE,
                        voucher_type TEXT NOT NULL,
                        cashbox_id INTEGER NOT NULL,
                        branch_id INTEGER NOT NULL,
                        counterparty_type TEXT NOT NULL,
                        counterparty_name TEXT NOT NULL,
                        cashier_id INTEGER,
                        amount DECIMAL(10,2) NOT NULL,
                        reference_no TEXT,
                        description TEXT,
                        voucher_date DATE NOT NULL,
                        created_by TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        source_reconciliation_id INTEGER,
                        source_entry_key TEXT,
                        is_auto_generated INTEGER DEFAULT 0,
                        FOREIGN KEY (cashbox_id) REFERENCES branch_cashboxes(id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches(id),
                        FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE SET NULL
                    )
                `
            },
            {
                name: 'cashbox_voucher_audit_log',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS cashbox_voucher_audit_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        voucher_id INTEGER,
                        voucher_number INTEGER,
                        voucher_sequence_number INTEGER,
                        voucher_type TEXT NOT NULL,
                        branch_id INTEGER,
                        action_type TEXT NOT NULL,
                        action_by TEXT,
                        action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        payload_json TEXT,
                        notes TEXT,
                        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
                    )
                `
            }
        ];

        // فحص وإنشاء كل جدول
        for (const table of requiredTables) {
            try {
                console.log(`🔍 [RESTORE] فحص جدول ${table.name}...`);

                // فحص وجود الجدول
                const tableExists = await ipcRenderer.invoke('db-get',
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [table.name]
                );

                if (!tableExists) {
                    console.log(`🔧 [RESTORE] إنشاء جدول ${table.name}...`);
                    await ipcRenderer.invoke('db-run', table.createSQL);
                    console.log(`✅ [RESTORE] تم إنشاء جدول ${table.name} بنجاح`);
                } else {
                    console.log(`✅ [RESTORE] جدول ${table.name} موجود بالفعل`);
                }

            } catch (tableError) {
                console.error(`❌ [RESTORE] خطأ في إنشاء جدول ${table.name}:`, tableError);
                // لا نتوقف عند خطأ في جدول واحد، نكمل مع الجداول الأخرى
            }
        }

        try {
            const archivedReconciliationColumns = await ipcRenderer.invoke('db-query', 'PRAGMA table_info(archived_reconciliations)', []);
            const hasArchivedCashboxPostingEnabled = Array.isArray(archivedReconciliationColumns)
                && archivedReconciliationColumns.some((column) => column.name === 'cashbox_posting_enabled');
            if (!hasArchivedCashboxPostingEnabled) {
                await ipcRenderer.invoke('db-run', 'ALTER TABLE archived_reconciliations ADD COLUMN cashbox_posting_enabled INTEGER', []);
                console.log('✅ [RESTORE] تمت إضافة الحقل cashbox_posting_enabled إلى archived_reconciliations');
            }
        } catch (archivedReconciliationMigrationError) {
            console.warn('⚠️ [RESTORE] تعذر إكمال ترحيل جدول archived_reconciliations:', archivedReconciliationMigrationError);
        }

        try {
            const cashboxVoucherColumns = await ipcRenderer.invoke('db-query', 'PRAGMA table_info(cashbox_vouchers)', []);
            const hasSyncKey = Array.isArray(cashboxVoucherColumns)
                && cashboxVoucherColumns.some((column) => column.name === 'sync_key');
            const hasSourceReconciliationId = Array.isArray(cashboxVoucherColumns)
                && cashboxVoucherColumns.some((column) => column.name === 'source_reconciliation_id');
            const hasSourceEntryKey = Array.isArray(cashboxVoucherColumns)
                && cashboxVoucherColumns.some((column) => column.name === 'source_entry_key');
            const hasAutoGeneratedFlag = Array.isArray(cashboxVoucherColumns)
                && cashboxVoucherColumns.some((column) => column.name === 'is_auto_generated');

            if (!hasSyncKey) {
                await ipcRenderer.invoke('db-run', 'ALTER TABLE cashbox_vouchers ADD COLUMN sync_key TEXT', []);
                console.log('✅ [RESTORE] تمت إضافة الحقل sync_key إلى cashbox_vouchers');
            }

            if (!hasSourceReconciliationId) {
                await ipcRenderer.invoke('db-run', 'ALTER TABLE cashbox_vouchers ADD COLUMN source_reconciliation_id INTEGER', []);
                console.log('✅ [RESTORE] تمت إضافة الحقل source_reconciliation_id إلى cashbox_vouchers');
            }

            if (!hasSourceEntryKey) {
                await ipcRenderer.invoke('db-run', 'ALTER TABLE cashbox_vouchers ADD COLUMN source_entry_key TEXT', []);
                console.log('✅ [RESTORE] تمت إضافة الحقل source_entry_key إلى cashbox_vouchers');
            }

            if (!hasAutoGeneratedFlag) {
                await ipcRenderer.invoke('db-run', 'ALTER TABLE cashbox_vouchers ADD COLUMN is_auto_generated INTEGER DEFAULT 0', []);
                console.log('✅ [RESTORE] تمت إضافة الحقل is_auto_generated إلى cashbox_vouchers');
            }

            await ipcRenderer.invoke(
                'db-run',
                `UPDATE cashbox_vouchers
                 SET is_auto_generated = COALESCE(is_auto_generated, 0)
                 WHERE is_auto_generated IS NULL`,
                []
            );

            await ipcRenderer.invoke(
                'db-run',
                'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)',
                []
            );
            await ipcRenderer.invoke(
                'db-run',
                'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_reconciliation ON cashbox_vouchers(source_reconciliation_id, source_entry_key)',
                []
            );
            await ipcRenderer.invoke(
                'db-run',
                'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_auto_generated ON cashbox_vouchers(is_auto_generated, source_reconciliation_id)',
                []
            );
            await ipcRenderer.invoke(
                'db-run',
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique
                 ON cashbox_vouchers(source_reconciliation_id, source_entry_key)
                 WHERE source_reconciliation_id IS NOT NULL
                   AND source_entry_key IS NOT NULL`,
                []
            );

            const hasSystemSettingsTable = await ipcRenderer.invoke(
                'db-get',
                "SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'",
                []
            );
            if (hasSystemSettingsTable) {
                await ipcRenderer.invoke(
                    'db-run',
                    `INSERT OR IGNORE INTO system_settings (
                        category,
                        setting_key,
                        setting_value,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    ['cashboxes', 'auto_post_reconciliation_vouchers', 'false']
                );
            }
        } catch (cashboxSchemaError) {
            console.warn('⚠️ [RESTORE] تعذر إكمال ترحيل بنية سندات الصندوق:', cashboxSchemaError);
        }

        console.log('✅ [RESTORE] تم فحص وإنشاء جميع الجداول المطلوبة');

    } catch (error) {
        console.error('❌ [RESTORE] خطأ في فحص الجداول:', error);
        const friendly = mapDbErrorMessage(error, {
            fallback: 'تعذر التأكد من وجود الجداول المطلوبة.'
        });
        throw new Error(`فشل في التأكد من وجود الجداول المطلوبة: ${friendly}`);
    }
}

async function restoreDatabaseData(backupData) {
    console.log('🔄 [RESTORE] بدء استعادة البيانات إلى قاعدة البيانات...');

    try {
        let totalRecords = 0;
        let tableCount = 0;
        let transactionStarted = false;

        // Define table restoration order (to handle foreign key constraints properly)
        // Order is critical: parent tables must be restored before child tables
        const tableOrder = [
            'admins',           // No dependencies
            'branches',         // No dependencies
            'branch_cashboxes', // References: branches(id)
            'cashiers',         // References: branches(id)
            'accountants',      // No dependencies
            'atms',            // No dependencies
            'reconciliations',  // References: cashiers(id), accountants(id)
            'bank_receipts',    // References: reconciliations(id), atms(id)
            'cash_receipts',    // References: reconciliations(id)
            'postpaid_sales',   // References: reconciliations(id)
            'customer_receipts', // References: reconciliations(id)
            'return_invoices',  // References: reconciliations(id)
            'suppliers',        // References: reconciliations(id)
            'system_settings',  // No dependencies
            'settings',          // No dependencies
            'reconciliation_requests', // References: cashiers(id)
            'manual_postpaid_sales', // No major dependencies
            'manual_supplier_transactions', // Optional branch reference
            'manual_customer_receipts', // No major dependencies
            'cashbox_vouchers', // References: branch_cashboxes(id), branches(id), cashiers(id)
            'cashbox_voucher_audit_log', // Cashboxes audit history
            'archived_years',
            'archived_reconciliations',
            'archived_bank_receipts',
            'archived_cash_receipts',
            'archived_postpaid_sales',
            'archived_customer_receipts',
            'archived_return_invoices',
            'archived_suppliers'
        ];

        const backupTables = (backupData && backupData.data && typeof backupData.data === 'object')
            ? backupData.data
            : {};

        // Normalize missing tables to empty arrays so we fully replace DB state
        for (const table of tableOrder) {
            if (!Array.isArray(backupTables[table])) {
                backupTables[table] = [];
            }
        }

        // Begin transaction
        await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = OFF', []);
        console.log('🔓 [RESTORE] تم تعطيل قيود المفاتيح الخارجية مؤقتاً');
        await ipcRenderer.invoke('db-run', 'BEGIN TRANSACTION', []);
        transactionStarted = true;

        try {
            // Clear existing data (except admins for safety)
            // Clear in reverse order to respect foreign key dependencies
            const reversedOrder = [...tableOrder].reverse();
            for (const table of reversedOrder) {
                if (table !== 'admins' && backupTables[table]) {
                    await ipcRenderer.invoke('db-run', `DELETE FROM ${table}`, []);
                    console.log(`🗑️ [RESTORE] تم مسح البيانات من جدول ${table}`);
                }
            }

            // Restore data table by table in correct order
            for (const table of tableOrder) {
                if (backupTables[table] && Array.isArray(backupTables[table])) {
                    const tableData = backupTables[table];

                    if (tableData.length > 0) {
                        if (table === 'branch_cashboxes') {
                            // Branch inserts trigger automatic default cashbox creation.
                            // Clear those generated rows so we can restore exact backup IDs safely.
                            await ipcRenderer.invoke('db-run', 'DELETE FROM branch_cashboxes', []);
                            console.log('🧹 [RESTORE] تم حذف الصناديق المُنشأة تلقائيًا بعد استعادة الفروع');
                        }

                        // Get column names from first record
                        const columns = Object.keys(tableData[0]);
                        const placeholders = columns.map(() => '?').join(', ');
                        const columnNames = columns.join(', ');

                        const insertQuery = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`;

                        // Insert each record with error handling
                        for (const record of tableData) {
                            const values = columns.map(col => record[col]);

                            try {
                                // For admins table, use INSERT OR REPLACE to handle existing records
                                let finalQuery = insertQuery;
                                if (table === 'admins') {
                                    finalQuery = `INSERT OR REPLACE INTO ${table} (${columnNames}) VALUES (${placeholders})`;
                                }

                                await ipcRenderer.invoke('db-run', finalQuery, values);
                            } catch (recordError) {
                                console.warn(`⚠️ [RESTORE] فشل في إدراج سجل في جدول ${table}:`, recordError.message);
                                console.warn('البيانات المشكلة:', record);

                                // Try with INSERT OR IGNORE as fallback
                                try {
                                    const fallbackQuery = `INSERT OR IGNORE INTO ${table} (${columnNames}) VALUES (${placeholders})`;
                                    await ipcRenderer.invoke('db-run', fallbackQuery, values);
                                    console.log(`✅ [RESTORE] تم إدراج السجل باستخدام INSERT OR IGNORE`);
                                } catch (fallbackError) {
                                    console.error(`❌ [RESTORE] فشل نهائي في إدراج السجل:`, fallbackError.message);
                                }
                            }
                        }

                        totalRecords += tableData.length;
                        tableCount++;
                        console.log(`✅ [RESTORE] تم استعادة ${tableData.length} سجل إلى جدول ${table}`);
                    }
                } else {
                    console.log(`ℹ️ [RESTORE] لا توجد بيانات لجدول ${table} في النسخة الاحتياطية`);
                }
            }

            // Validate foreign key constraints
            const fkCheckResult = await ipcRenderer.invoke('db-query', 'PRAGMA foreign_key_check', []);
            if (fkCheckResult && fkCheckResult.length > 0) {
                console.warn('⚠️ [RESTORE] تم العثور على انتهاكات للمفاتيح الخارجية:', fkCheckResult);
                throw new Error(`انتهاكات المفاتيح الخارجية: ${fkCheckResult.length} مشكلة`);
            } else {
                console.log('✅ [RESTORE] تم التحقق من سلامة المفاتيح الخارجية');
            }

            // Commit transaction
            await ipcRenderer.invoke('db-run', 'COMMIT', []);
            transactionStarted = false;
            await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = ON', []);
            console.log('🔒 [RESTORE] تم إعادة تفعيل قيود المفاتيح الخارجية');

            console.log(`✅ [RESTORE] تم استعادة ${totalRecords} سجل من ${tableCount} جدول بنجاح`);
            return { success: true, recordCount: totalRecords, tableCount: tableCount };

        } catch (error) {
            // Rollback transaction
            if (transactionStarted) {
                await ipcRenderer.invoke('db-run', 'ROLLBACK', []);
                transactionStarted = false;
                console.log('🔄 [RESTORE] تم التراجع عن المعاملة');
            }
            throw error;
        } finally {
            try {
                await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = ON', []);
                console.log('🔒 [RESTORE] تم التأكد من إعادة تفعيل قيود المفاتيح الخارجية');
            } catch (pragmaError) {
                console.error('❌ [RESTORE] فشل في إعادة تفعيل قيود المفاتيح الخارجية:', pragmaError);
            }
        }

    } catch (error) {
        console.error('❌ [RESTORE] خطأ في استعادة البيانات:', error);
        return {
            success: false,
            error: mapDbErrorMessage(error, {
                fallback: 'تعذر استعادة البيانات إلى قاعدة البيانات.'
            })
        };
    }
}

  return {
    ensureRequiredTablesExist,
    restoreDatabaseData
  };
}

module.exports = {
  createBackupRestoreRestoreDbHandlers
};
