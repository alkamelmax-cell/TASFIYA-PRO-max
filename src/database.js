// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { buildCashboxVoucherSyncKey } = require('./app/cashbox-voucher-utils');
const { resolveAdminSeedPolicy } = require('./security/admin-seed-policy');
const { hashSecret, isHashedSecret } = require('./security/auth-service');

const DEFAULT_RECONCILIATION_FORMULA_SETTINGS = Object.freeze({
  bank_receipts_sign: 1,
  cash_receipts_sign: 1,
  postpaid_sales_sign: 1,
  customer_receipts_sign: -1,
  return_invoices_sign: 1,
  suppliers_sign: 0,
  custom_table_signs: Object.freeze({})
});

let app;
try {
  // Try to import electron, but don't fail if it's not available (server mode)
  const electron = require('electron');
  app = electron.app;
} catch (e) {
  console.log('Running in non-Electron mode (Server)');
}

class DatabaseManager {
  constructor() {
    this.db = null;
  }

  initialize() {
    try {
      let dbPath;
      if (app) {
        const userDataDir = app.getPath('userData');
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        dbPath = path.join(userDataDir, 'casher.db');
      } else {
        // In server mode, store db in a 'data' folder
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        dbPath = path.join(dataDir, 'casher.db');
      }

      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');



      console.log('Database initialized at:', dbPath);
      this.createTables();
      this.migrateSensitiveCredentials();
      this.insertDefaultData();

      return true;
    } catch (error) {
      console.error('Database initialization error:', error);
      return false;
    }
  }

  async asyncTransaction(callback) {
    this.db.prepare('BEGIN').run();
    try {
      // Pass this.db as 'tx'
      const result = await callback(this.db);
      this.db.prepare('COMMIT').run();
      return result;
    } catch (e) {
      this.db.prepare('ROLLBACK').run();
      throw e;
    }
  }

  createTables() {
    // جداول الحركات اليدوية
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manual_postpaid_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manual_customer_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
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
    `);

    this.db.exec(`
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
    `);

    this.db.exec(`
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
    `);

    this.db.exec(`
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
    `);

    // Admins table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reconciliation formula profiles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_formula_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formula_name TEXT NOT NULL UNIQUE,
        settings_json TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Branches table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_name TEXT NOT NULL,
        branch_address TEXT,
        branch_phone TEXT,
        reconciliation_formula_id INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_formula_id) REFERENCES reconciliation_formula_profiles (id)
      )
    `);

    // Cashiers table with branch reference
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cashiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cashier_number TEXT UNIQUE NOT NULL,
        branch_id INTEGER,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches (id)
      )
    `);

    // Accountants table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accountants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ATMs table with branch reference
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS atms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        location TEXT DEFAULT 'غير محدد',
        branch_id INTEGER,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches (id)
      )
    `);

    // Reconciliations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_number INTEGER NULL,
        cashier_id INTEGER NOT NULL,
        accountant_id INTEGER NOT NULL,
        reconciliation_date DATE NOT NULL,
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
        FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
        FOREIGN KEY (accountant_id) REFERENCES accountants(id),
        FOREIGN KEY (formula_profile_id) REFERENCES reconciliation_formula_profiles(id)
      )
    `);

    // Reconciliation Requests table (Pending Drafts for Approval)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cashier_id INTEGER NOT NULL,
        request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        system_sales DECIMAL(10,2) DEFAULT 0,
        total_cash DECIMAL(10,2) DEFAULT 0,
        total_bank DECIMAL(10,2) DEFAULT 0,
        status TEXT DEFAULT 'pending', 
        details_json TEXT, 
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
      )
    `);

    // Add last_modified_date column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE reconciliations ADD COLUMN last_modified_date DATETIME`);
    } catch (error) {
      // Column already exists, ignore error
    }

    try {
      this.db.exec(`ALTER TABLE reconciliations ADD COLUMN formula_settings TEXT`);
    } catch (error) {
      // Column already exists, ignore error
    }

    try {
      this.db.exec(`ALTER TABLE reconciliations ADD COLUMN cashbox_posting_enabled INTEGER`);
    } catch (error) {
      // Column already exists, ignore error
    }

    // Add location column to atms table if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE atms ADD COLUMN location TEXT DEFAULT 'غير محدد'`);
      console.log('✅ [DB] تم إضافة عمود الموقع إلى جدول أجهزة الصراف');
    } catch (error) {
      // Column already exists, ignore error
      console.log('ℹ️ [DB] عمود الموقع موجود بالفعل في جدول أجهزة الصراف');
    }

    // System settings table
    this.db.exec(`
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
    console.log('✅ [DB] تم إنشاء جدول إعدادات النظام');

    // Bank receipts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bank_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        operation_type TEXT NOT NULL, -- مدى، فيزا، ماستر كارد
        atm_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
        FOREIGN KEY (atm_id) REFERENCES atms(id)
      )
    `);

    // Cash receipts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cash_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        denomination INTEGER NOT NULL, -- 500, 200, 100, 50, 20, 10, 5, 1
        quantity INTEGER NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Postpaid sales table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS postpaid_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Customer receipts table - Fixed payment_type constraint issue
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customer_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type TEXT NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Fix payment_type constraint issue if it exists
    try {
      // Check if customer_receipts table exists
      const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_receipts'").get();

      if (!tableExists) {
        console.log('🔧 [DB] إنشاء جدول customer_receipts جديد...');
        // Create the table if it doesn't exist
        this.db.exec(`
          CREATE TABLE customer_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reconciliation_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_type TEXT NOT NULL,
            is_modified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
          )
        `);
        console.log('✅ [DB] تم إنشاء جدول customer_receipts بنجاح');
      } else {
        // Check if there's a problematic constraint and fix it
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS customer_receipts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reconciliation_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_type TEXT NOT NULL,
            is_modified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
          )
        `);

        // Copy data if old table exists and has data
        try {
          const hasData = this.db.prepare("SELECT COUNT(*) as count FROM customer_receipts").get();
          if (hasData && hasData.count > 0) {
            this.db.exec(`
              INSERT INTO customer_receipts_new (id, reconciliation_id, customer_name, amount, payment_type, created_at)
              SELECT id, reconciliation_id, customer_name, amount, payment_type, created_at FROM customer_receipts
            `);
            console.log('📊 [DB] تم نسخ بيانات customer_receipts الموجودة');
          }

          // Drop old table and rename new one
          this.db.exec(`DROP TABLE customer_receipts`);
          this.db.exec(`ALTER TABLE customer_receipts_new RENAME TO customer_receipts`);
          console.log('✅ [DB] تم تحديث جدول customer_receipts بنجاح');
        } catch (migrationError) {
          console.log('ℹ️ [DB] Customer receipts table migration not needed or already completed');
        }
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إنشاء/تحديث جدول customer_receipts:', error);
      // Try to create a basic table as fallback
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS customer_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reconciliation_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_type TEXT NOT NULL DEFAULT 'نقدي',
            is_modified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ [DB] تم إنشاء جدول customer_receipts الأساسي كحل بديل');
      } catch (fallbackError) {
        console.error('❌ [DB] فشل في إنشاء جدول customer_receipts حتى كحل بديل:', fallbackError);
      }
    }

    // Return invoices table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS return_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Suppliers table (for display only, doesn't affect totals)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        invoice_number TEXT,
        amount DECIMAL(10,2) NOT NULL,
        notes TEXT,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Reconciliation custom table definitions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_custom_table_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_key TEXT NOT NULL UNIQUE,
        table_name TEXT NOT NULL,
        entry_template TEXT NOT NULL DEFAULT 'amount_only',
        default_sign INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_custom_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER NOT NULL,
        definition_id INTEGER NOT NULL,
        entry_payload_json TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_modified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
        FOREIGN KEY (definition_id) REFERENCES reconciliation_custom_table_definitions(id) ON DELETE RESTRICT
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_reconciliation_custom_definitions_active ON reconciliation_custom_table_definitions(is_active, display_order)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_reconciliation_custom_entries_reconciliation ON reconciliation_custom_entries(reconciliation_id, definition_id)');

    // Reconciliation Requests (Synced from Web)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_requests(
      id INTEGER PRIMARY KEY,
      cashier_id INTEGER,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
      `);

    // Ledger merge history for safe undo operations in customer/supplier ledgers
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_merge_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        branch_id INTEGER DEFAULT 0,
        target_name TEXT NOT NULL,
        source_names_json TEXT NOT NULL,
        affected_rows_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        undone_at DATETIME,
        undo_details_json TEXT
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
      `);

    console.log('All database tables created successfully');

    // Update existing tables if needed
    this.updateExistingTables();

    // Check and add missing columns for existing databases
    this.updateDatabaseSchema();

    // Ensure performance indexes for heavy reporting/ledger queries.
    this.createPerformanceIndexes();

    // Apply core data-integrity constraints/triggers for critical tables.
    this.applyDataIntegrityLayer();
  }

  updateDatabaseSchema() {
    try {
      console.log('🔄 [DB] فحص وتحديث مخطط قاعدة البيانات...');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_formula_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          formula_name TEXT NOT NULL UNIQUE,
          settings_json TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_formula_profiles_default ON reconciliation_formula_profiles(is_default, is_active)');

      // Check if branch_id column exists in cashiers table
      const cashierColumns = this.db.pragma('table_info(cashiers)');
      const hasBranchId = cashierColumns.some(col => col.name === 'branch_id');

      if (!hasBranchId) {
        console.log('➕ [DB] إضافة عمود branch_id إلى جدول الكاشيرين...');
        this.db.exec('ALTER TABLE cashiers ADD COLUMN branch_id INTEGER');
        console.log('✅ [DB] تم إضافة عمود branch_id بنجاح');
      }

      // Check if reconciliation_number column exists in reconciliations table
      const reconciliationColumns = this.db.pragma('table_info(reconciliations)');
      const hasReconciliationNumber = reconciliationColumns.some(col => col.name === 'reconciliation_number');

      if (!hasReconciliationNumber) {
        console.log('➕ [DB] إضافة عمود reconciliation_number إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN reconciliation_number INTEGER NULL');
        console.log('✅ [DB] تم إضافة عمود reconciliation_number بنجاح');
      }

      // Check and add new filter enhancement columns
      const hasTimeRangeStart = reconciliationColumns.some(col => col.name === 'time_range_start');
      const hasTimeRangeEnd = reconciliationColumns.some(col => col.name === 'time_range_end');
      const hasFilterNotes = reconciliationColumns.some(col => col.name === 'filter_notes');
      const hasFormulaSettings = reconciliationColumns.some(col => col.name === 'formula_settings');
      const hasFormulaProfileId = reconciliationColumns.some(col => col.name === 'formula_profile_id');
      const hasCashboxPostingEnabled = reconciliationColumns.some(col => col.name === 'cashbox_posting_enabled');

      const branchColumns = this.db.pragma('table_info(branches)');
      const hasBranchFormulaId = branchColumns.some(col => col.name === 'reconciliation_formula_id');

      if (!hasTimeRangeStart) {
        console.log('➕ [DB] إضافة عمود time_range_start إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN time_range_start TIME NULL');
        console.log('✅ [DB] تم إضافة عمود time_range_start بنجاح');
      }

      if (!hasTimeRangeEnd) {
        console.log('➕ [DB] إضافة عمود time_range_end إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN time_range_end TIME NULL');
        console.log('✅ [DB] تم إضافة عمود time_range_end بنجاح');
      }

      if (!hasFilterNotes) {
        console.log('➕ [DB] إضافة عمود filter_notes إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN filter_notes TEXT NULL');
        console.log('✅ [DB] تم إضافة عمود filter_notes بنجاح');
      }

      if (!hasFormulaSettings) {
        console.log('➕ [DB] إضافة عمود formula_settings إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN formula_settings TEXT');
        console.log('✅ [DB] تم إضافة عمود formula_settings بنجاح');
      }

      if (!hasFormulaProfileId) {
        console.log('➕ [DB] إضافة عمود formula_profile_id إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN formula_profile_id INTEGER');
        console.log('✅ [DB] تم إضافة عمود formula_profile_id بنجاح');
      }

      if (!hasCashboxPostingEnabled) {
        console.log('➕ [DB] إضافة عمود cashbox_posting_enabled إلى جدول التصفيات...');
        this.db.exec('ALTER TABLE reconciliations ADD COLUMN cashbox_posting_enabled INTEGER');
        console.log('✅ [DB] تم إضافة عمود cashbox_posting_enabled بنجاح');
      }

      if (!hasBranchFormulaId) {
        console.log('➕ [DB] إضافة عمود reconciliation_formula_id إلى جدول الفروع...');
        this.db.exec('ALTER TABLE branches ADD COLUMN reconciliation_formula_id INTEGER');
        console.log('✅ [DB] تم إضافة عمود reconciliation_formula_id بنجاح');
      }

      // Check for role column in admins
      const adminColumns = this.db.pragma('table_info(admins)');
      const hasRole = adminColumns.some(col => col.name === 'role');
      if (!hasRole) {
        console.log('➕ [DB] Adding role column to admins table...');
        this.db.exec("ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'admin'");
        console.log('✅ [DB] role column added.');
      }

      const hasPermissions = adminColumns.some(col => col.name === 'permissions');
      if (!hasPermissions) {
        console.log('➕ [DB] Adding permissions column to admins table...');
        this.db.exec("ALTER TABLE admins ADD COLUMN permissions TEXT");
        console.log('✅ [DB] permissions column added.');
      }

      // Check for pin_code in cashiers table
      const cashierCols = this.db.pragma('table_info(cashiers)');
      const hasPinCode = cashierCols.some(col => col.name === 'pin_code');
      if (!hasPinCode) {
        console.log('➕ [DB] Adding pin_code column to cashiers table...');
        this.db.exec("ALTER TABLE cashiers ADD COLUMN pin_code TEXT");
        console.log('✅ [DB] pin_code column added to cashiers.');
      }

      const manualSupplierColumns = this.db.pragma('table_info(manual_supplier_transactions)');
      const hasManualSupplierUpdatedAt = manualSupplierColumns.some(col => col.name === 'updated_at');
      if (!hasManualSupplierUpdatedAt) {
        console.log('➕ [DB] Adding updated_at column to manual_supplier_transactions table...');
        this.db.exec('ALTER TABLE manual_supplier_transactions ADD COLUMN updated_at DATETIME');
        console.log('✅ [DB] updated_at column added to manual_supplier_transactions.');
      }
      this.db.exec(`
        UPDATE manual_supplier_transactions
        SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        WHERE updated_at IS NULL
      `);

      const cashboxVoucherColumns = this.db.pragma('table_info(cashbox_vouchers)');
      const hasVoucherSequenceNumber = cashboxVoucherColumns.some(col => col.name === 'voucher_sequence_number');
      const hasSyncKey = cashboxVoucherColumns.some(col => col.name === 'sync_key');
      if (!hasVoucherSequenceNumber) {
        console.log('➕ [DB] Adding voucher_sequence_number column to cashbox_vouchers table...');
        this.db.exec('ALTER TABLE cashbox_vouchers ADD COLUMN voucher_sequence_number INTEGER');
        console.log('✅ [DB] voucher_sequence_number column added to cashbox_vouchers.');
      }

      if (!hasSyncKey) {
        console.log('➕ [DB] Adding sync_key column to cashbox_vouchers table...');
        this.db.exec('ALTER TABLE cashbox_vouchers ADD COLUMN sync_key TEXT');
        console.log('✅ [DB] sync_key column added to cashbox_vouchers.');
      }

      const hasSourceReconciliationId = cashboxVoucherColumns.some(col => col.name === 'source_reconciliation_id');
      if (!hasSourceReconciliationId) {
        console.log('➕ [DB] Adding source_reconciliation_id column to cashbox_vouchers table...');
        this.db.exec('ALTER TABLE cashbox_vouchers ADD COLUMN source_reconciliation_id INTEGER');
        console.log('✅ [DB] source_reconciliation_id column added to cashbox_vouchers.');
      }

      const hasSourceEntryKey = cashboxVoucherColumns.some(col => col.name === 'source_entry_key');
      if (!hasSourceEntryKey) {
        console.log('➕ [DB] Adding source_entry_key column to cashbox_vouchers table...');
        this.db.exec('ALTER TABLE cashbox_vouchers ADD COLUMN source_entry_key TEXT');
        console.log('✅ [DB] source_entry_key column added to cashbox_vouchers.');
      }

      const hasAutoGeneratedFlag = cashboxVoucherColumns.some(col => col.name === 'is_auto_generated');
      if (!hasAutoGeneratedFlag) {
        console.log('➕ [DB] Adding is_auto_generated column to cashbox_vouchers table...');
        this.db.exec('ALTER TABLE cashbox_vouchers ADD COLUMN is_auto_generated INTEGER DEFAULT 0');
        console.log('✅ [DB] is_auto_generated column added to cashbox_vouchers.');
      }

      this.db.exec(`
        UPDATE cashbox_vouchers
        SET is_auto_generated = COALESCE(is_auto_generated, 0)
        WHERE is_auto_generated IS NULL
      `);

      const orphanAutoVouchersCleanup = this.db.prepare(`
        DELETE FROM cashbox_vouchers
        WHERE source_reconciliation_id IS NOT NULL
          AND COALESCE(is_auto_generated, 0) = 1
          AND NOT EXISTS (
            SELECT 1
            FROM reconciliations r
            WHERE r.id = cashbox_vouchers.source_reconciliation_id
          )
      `).run();
      if (orphanAutoVouchersCleanup.changes > 0) {
        console.log(`🧹 [DB] تم حذف ${orphanAutoVouchersCleanup.changes} سند تلقائي يتيم من الصندوق`);
      }

      this.db.exec(`
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
      `);

      this.db.exec(`
        INSERT OR IGNORE INTO branch_cashboxes (
          branch_id,
          cashbox_name,
          opening_balance,
          is_active,
          created_at,
          updated_at
        )
        SELECT
          b.id,
          'صندوق ' || TRIM(COALESCE(b.branch_name, 'الفرع')),
          0,
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM branches b
        WHERE b.id IS NOT NULL
      `);

      this.db.exec(`
        INSERT OR IGNORE INTO system_settings (
          category,
          setting_key,
          setting_value,
          created_at,
          updated_at
        ) VALUES (
          'cashboxes',
          'auto_post_reconciliation_vouchers',
          'false',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);

      this.normalizeCashboxVoucherSequences();
      this.backfillCashboxVoucherSyncKeys();

      console.log('✅ [DB] تم فحص وتحديث مخطط قاعدة البيانات بنجاح');

      this.ensureReconciliationFormulaProfiles();

      // إصلاح ترقيم التصفيات المكتملة الموجودة (يتم تشغيله مرة واحدة فقط)
      this.fixExistingCompletedReconciliations();

    } catch (error) {
      console.error('❌ [DB] خطأ في تحديث مخطط قاعدة البيانات:', error);
    }
  }

  normalizeCashboxVoucherSequences() {
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(cashbox_vouchers)').all();
      const hasVoucherSequenceNumber = Array.isArray(tableInfo)
        && tableInfo.some((column) => column.name === 'voucher_sequence_number');

      if (!hasVoucherSequenceNumber) {
        return;
      }

      const vouchers = this.db.prepare(`
        SELECT id, voucher_type
        FROM cashbox_vouchers
        ORDER BY voucher_number ASC, id ASC
      `).all();

      if (!Array.isArray(vouchers) || vouchers.length === 0) {
        return;
      }

      const counters = {
        receipt: 0,
        payment: 0
      };

      const updateSequence = this.db.prepare(`
        UPDATE cashbox_vouchers
        SET voucher_sequence_number = ?
        WHERE id = ?
      `);

      const transaction = this.db.transaction((rows) => {
        rows.forEach((row) => {
          const voucherType = row.voucher_type === 'payment' ? 'payment' : 'receipt';
          counters[voucherType] += 1;
          updateSequence.run(counters[voucherType], row.id);
        });
      });

      transaction(vouchers);
      console.log(`✅ [DB] تم تحديث الترقيم النوعي لعدد ${vouchers.length} سند من الصناديق`);
    } catch (error) {
      console.warn('⚠️ [DB] تعذر تحديث الترقيم النوعي لسندات الصناديق:', error && error.message ? error.message : error);
    }
  }

  backfillCashboxVoucherSyncKeys() {
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(cashbox_vouchers)').all();
      const hasSyncKey = Array.isArray(tableInfo)
        && tableInfo.some((column) => column.name === 'sync_key');

      if (!hasSyncKey) {
        return;
      }

      const vouchers = this.db.prepare(`
        SELECT
          id,
          voucher_number,
          voucher_sequence_number,
          sync_key,
          voucher_type,
          cashbox_id,
          branch_id,
          counterparty_type,
          counterparty_name,
          amount,
          voucher_date,
          created_at,
          updated_at,
          source_reconciliation_id,
          source_entry_key
        FROM cashbox_vouchers
        WHERE sync_key IS NULL OR TRIM(sync_key) = ''
      `).all();

      if (!Array.isArray(vouchers) || vouchers.length === 0) {
        this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)');
        return;
      }

      const updateSyncKey = this.db.prepare(`
        UPDATE cashbox_vouchers
        SET sync_key = ?
        WHERE id = ?
      `);

      const transaction = this.db.transaction((rows) => {
        rows.forEach((row) => {
          const syncKey = buildCashboxVoucherSyncKey(row, { branchId: row.branch_id });
          if (syncKey) {
            updateSyncKey.run(syncKey, row.id);
          }
        });
      });

      transaction(vouchers);
      this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)');
      console.log(`✅ [DB] تم توليد sync_key لعدد ${vouchers.length} سند من الصناديق`);
    } catch (error) {
      console.warn('⚠️ [DB] تعذر تحديث sync_key لسندات الصناديق:', error && error.message ? error.message : error);
    }
  }

  createPerformanceIndexes() {
    try {
      const indexStatements = [
        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_customer_date ON postpaid_sales(customer_name, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_reconciliation_id ON postpaid_sales(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer_date ON customer_receipts(customer_name, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_reconciliation_id ON customer_receipts(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer_date ON manual_postpaid_sales(customer_name, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer_date ON manual_customer_receipts(customer_name, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_manual_supplier_name_date ON manual_supplier_transactions(supplier_name, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_manual_supplier_branch_date ON manual_supplier_transactions(branch_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_branch_cashboxes_branch_id ON branch_cashboxes(branch_id)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_branch_date ON cashbox_vouchers(branch_id, voucher_date)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_cashbox_date ON cashbox_vouchers(cashbox_id, voucher_date)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_date ON cashbox_vouchers(voucher_type, voucher_date)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence ON cashbox_vouchers(voucher_type, voucher_sequence_number)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_counterparty_name ON cashbox_vouchers(counterparty_name)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_reconciliation ON cashbox_vouchers(source_reconciliation_id, source_entry_key)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_auto_generated ON cashbox_vouchers(is_auto_generated, source_reconciliation_id)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_voucher_action ON cashbox_voucher_audit_log(voucher_id, action_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_branch_action ON cashbox_voucher_audit_log(branch_id, action_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_ledger_merge_history_entity_open ON ledger_merge_history(entity_type, undone_at, id DESC)',
        'CREATE INDEX IF NOT EXISTS idx_reconciliations_date_status ON reconciliations(reconciliation_date, status)',
        'CREATE INDEX IF NOT EXISTS idx_reconciliations_cashier_date ON reconciliations(cashier_id, reconciliation_date)',
        'CREATE INDEX IF NOT EXISTS idx_reconciliations_cashbox_posting ON reconciliations(cashbox_posting_enabled, status)',
        'CREATE INDEX IF NOT EXISTS idx_cashiers_branch_id ON cashiers(branch_id)',
        'CREATE INDEX IF NOT EXISTS idx_branches_formula_id ON branches(reconciliation_formula_id)'
      ];

      for (const statement of indexStatements) {
        this.db.prepare(statement).run();
      }

      console.log('✅ [DB] تم إنشاء/التحقق من فهارس الأداء');
    } catch (error) {
      console.warn('⚠️ [DB] تعذر إنشاء بعض فهارس الأداء:', error && error.message ? error.message : error);
    }
  }

  createUniqueIndexIfNoDuplicates(indexName, duplicateCheckSql, createIndexSql, valueLabel = 'value') {
    try {
      const duplicates = this.db.prepare(duplicateCheckSql).all();
      if (Array.isArray(duplicates) && duplicates.length > 0) {
        const sampleValues = duplicates
          .slice(0, 3)
          .map((row) => String(row?.[valueLabel] ?? ''))
          .filter((value) => value.length > 0)
          .join(', ');
        console.warn(
          `⚠️ [DB] تم تجاوز إنشاء الفهرس الفريد ${indexName} بسبب بيانات مكررة حالياً.` +
          (sampleValues ? ` أمثلة: ${sampleValues}` : '')
        );
        return false;
      }

      this.db.exec(createIndexSql);
      console.log(`✅ [DB] تم إنشاء/التحقق من الفهرس الفريد: ${indexName}`);
      return true;
    } catch (error) {
      console.warn(
        `⚠️ [DB] تعذر إنشاء الفهرس الفريد ${indexName}:`,
        error && error.message ? error.message : error
      );
      return false;
    }
  }

  createDataValidationTriggers() {
    const triggerStatements = [
      `CREATE TRIGGER IF NOT EXISTS trg_manual_supplier_transactions_validate_insert
       BEFORE INSERT ON manual_supplier_transactions
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.supplier_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
         OR NEW.transaction_type NOT IN ('payment', 'invoice')
       BEGIN
         SELECT RAISE(ABORT, 'manual_supplier_transactions_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_manual_supplier_transactions_validate_update
       BEFORE UPDATE ON manual_supplier_transactions
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.supplier_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
         OR NEW.transaction_type NOT IN ('payment', 'invoice')
       BEGIN
         SELECT RAISE(ABORT, 'manual_supplier_transactions_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_cashbox_vouchers_validate_insert
       BEFORE INSERT ON cashbox_vouchers
       FOR EACH ROW
       WHEN NEW.voucher_number IS NULL
         OR NEW.voucher_sequence_number IS NULL
         OR NEW.branch_id IS NULL
         OR NEW.cashbox_id IS NULL
         OR TRIM(COALESCE(NEW.counterparty_name, '')) = ''
         OR CAST(COALESCE(NEW.amount, 0) AS REAL) <= 0
         OR TRIM(COALESCE(NEW.voucher_date, '')) = ''
         OR NEW.voucher_type NOT IN ('receipt', 'payment')
         OR NEW.counterparty_type NOT IN ('cashier', 'supplier')
       BEGIN
         SELECT RAISE(ABORT, 'cashbox_vouchers_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_cashbox_vouchers_validate_update
       BEFORE UPDATE ON cashbox_vouchers
       FOR EACH ROW
       WHEN NEW.voucher_number IS NULL
         OR NEW.voucher_sequence_number IS NULL
         OR NEW.branch_id IS NULL
         OR NEW.cashbox_id IS NULL
         OR TRIM(COALESCE(NEW.counterparty_name, '')) = ''
         OR CAST(COALESCE(NEW.amount, 0) AS REAL) <= 0
         OR TRIM(COALESCE(NEW.voucher_date, '')) = ''
         OR NEW.voucher_type NOT IN ('receipt', 'payment')
         OR NEW.counterparty_type NOT IN ('cashier', 'supplier')
       BEGIN
         SELECT RAISE(ABORT, 'cashbox_vouchers_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_branches_create_cashbox_after_insert
       AFTER INSERT ON branches
       FOR EACH ROW
       BEGIN
         INSERT OR IGNORE INTO branch_cashboxes (
           branch_id,
           cashbox_name,
           opening_balance,
           is_active,
           created_at,
           updated_at
         ) VALUES (
           NEW.id,
           'صندوق ' || TRIM(COALESCE(NEW.branch_name, 'الفرع')),
           0,
           1,
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         );
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_manual_postpaid_sales_validate_insert
       BEFORE INSERT ON manual_postpaid_sales
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'manual_postpaid_sales_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_manual_postpaid_sales_validate_update
       BEFORE UPDATE ON manual_postpaid_sales
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'manual_postpaid_sales_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_manual_customer_receipts_validate_insert
       BEFORE INSERT ON manual_customer_receipts
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'manual_customer_receipts_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_manual_customer_receipts_validate_update
       BEFORE UPDATE ON manual_customer_receipts
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'manual_customer_receipts_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_postpaid_sales_validate_insert
       BEFORE INSERT ON postpaid_sales
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'postpaid_sales_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_postpaid_sales_validate_update
       BEFORE UPDATE ON postpaid_sales
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
       BEGIN
         SELECT RAISE(ABORT, 'postpaid_sales_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_customer_receipts_validate_insert
       BEFORE INSERT ON customer_receipts
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
         OR TRIM(COALESCE(NEW.payment_type, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'customer_receipts_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_customer_receipts_validate_update
       BEFORE UPDATE ON customer_receipts
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.customer_name, '')) = ''
       BEGIN
         SELECT RAISE(ABORT, 'customer_receipts_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_suppliers_validate_insert
       BEFORE INSERT ON suppliers
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.supplier_name, '')) = ''
         OR NEW.amount IS NULL
         OR CAST(NEW.amount AS REAL) <= 0
       BEGIN
         SELECT RAISE(ABORT, 'suppliers_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_suppliers_validate_update
       BEFORE UPDATE ON suppliers
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.supplier_name, '')) = ''
       BEGIN
         SELECT RAISE(ABORT, 'suppliers_invalid_data');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_reconciliations_status_validate_insert
       BEFORE INSERT ON reconciliations
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.status, '')) = ''
       BEGIN
         SELECT RAISE(ABORT, 'reconciliations_invalid_status');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_reconciliations_status_validate_update
       BEFORE UPDATE ON reconciliations
       FOR EACH ROW
       WHEN TRIM(COALESCE(NEW.status, '')) = ''
       BEGIN
         SELECT RAISE(ABORT, 'reconciliations_invalid_status');
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_reconciliations_delete_auto_cashbox_vouchers
       AFTER DELETE ON reconciliations
       FOR EACH ROW
       BEGIN
         DELETE FROM cashbox_vouchers
         WHERE source_reconciliation_id = OLD.id
           AND COALESCE(is_auto_generated, 0) = 1;
       END`
    ];

    for (const statement of triggerStatements) {
      this.db.exec(statement);
    }

    console.log('✅ [DB] تم إنشاء/التحقق من Triggers سلامة البيانات');
  }

  applyDataIntegrityLayer() {
    try {
      // Enforce uniqueness of reconciliation numbers when present.
      this.createUniqueIndexIfNoDuplicates(
        'idx_reconciliations_number_unique',
        `SELECT reconciliation_number AS value, COUNT(*) AS count
         FROM reconciliations
         WHERE reconciliation_number IS NOT NULL
         GROUP BY reconciliation_number
         HAVING COUNT(*) > 1`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliations_number_unique
         ON reconciliations(reconciliation_number)
         WHERE reconciliation_number IS NOT NULL`
      );

      // Prevent duplicate branch names by trimmed case-insensitive value.
      this.createUniqueIndexIfNoDuplicates(
        'idx_branches_name_unique_nocase',
        `SELECT LOWER(TRIM(branch_name)) AS value, COUNT(*) AS count
         FROM branches
         WHERE branch_name IS NOT NULL AND TRIM(branch_name) != ''
         GROUP BY LOWER(TRIM(branch_name))
         HAVING COUNT(*) > 1`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_name_unique_nocase
         ON branches(LOWER(TRIM(branch_name)))`
      );

      this.createUniqueIndexIfNoDuplicates(
        'idx_cashbox_vouchers_type_sequence_unique',
        `SELECT voucher_type || ':' || CAST(voucher_sequence_number AS TEXT) AS value, COUNT(*) AS count
         FROM cashbox_vouchers
         WHERE voucher_sequence_number IS NOT NULL
         GROUP BY voucher_type, voucher_sequence_number
         HAVING COUNT(*) > 1`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence_unique
         ON cashbox_vouchers(voucher_type, voucher_sequence_number)
         WHERE voucher_sequence_number IS NOT NULL`
      );

      this.createUniqueIndexIfNoDuplicates(
        'idx_cashbox_vouchers_source_unique',
        `SELECT CAST(source_reconciliation_id AS TEXT) || ':' || source_entry_key AS value, COUNT(*) AS count
         FROM cashbox_vouchers
         WHERE source_reconciliation_id IS NOT NULL
           AND source_entry_key IS NOT NULL
         GROUP BY source_reconciliation_id, source_entry_key
         HAVING COUNT(*) > 1`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique
         ON cashbox_vouchers(source_reconciliation_id, source_entry_key)
         WHERE source_reconciliation_id IS NOT NULL
           AND source_entry_key IS NOT NULL`
      );

      // Keep requests and operations joins fast.
      const extraIndexStatements = [
        'CREATE INDEX IF NOT EXISTS idx_bank_receipts_reconciliation_id ON bank_receipts(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_cash_receipts_reconciliation_id ON cash_receipts(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_suppliers_reconciliation_id ON suppliers(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_return_invoices_reconciliation_id ON return_invoices(reconciliation_id)',
        'CREATE INDEX IF NOT EXISTS idx_reconciliations_formula_profile_id ON reconciliations(formula_profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_system_settings_category_key ON system_settings(category, setting_key)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_cashboxes_branch_unique ON branch_cashboxes(branch_id)',
        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_action_type ON cashbox_voucher_audit_log(action_type, action_at DESC)'
      ];
      for (const statement of extraIndexStatements) {
        this.db.exec(statement);
      }
      console.log('✅ [DB] تم إنشاء/التحقق من فهارس سلامة وأداء إضافية');

      this.createDataValidationTriggers();
    } catch (error) {
      console.warn('⚠️ [DB] تعذر تطبيق كامل طبقة سلامة البيانات:', error && error.message ? error.message : error);
    }
  }

  fixExistingCompletedReconciliations() {
    try {
      console.log('🔄 [DB] إصلاح ترقيم التصفيات المكتملة...');

      // Get all completed reconciliations without reconciliation_number
      const completedReconciliations = this.db.prepare(`
        SELECT id FROM reconciliations 
        WHERE status = 'completed' 
        AND reconciliation_number IS NULL
        ORDER BY id ASC
      `).all();

      if (completedReconciliations.length > 0) {
        // Get the max reconciliation_number
        const maxRecord = this.db.prepare(`
          SELECT MAX(reconciliation_number) as max_num FROM reconciliations
      `).get();

        let nextNumber = (maxRecord.max_num || 0) + 1;

        // Assign numbers to completed reconciliations
        for (const rec of completedReconciliations) {
          this.db.prepare(`
            UPDATE reconciliations 
            SET reconciliation_number = ?
      WHERE id = ?
        `).run(nextNumber, rec.id);
          nextNumber++;
        }

        console.log(`✅[DB] تم إصلاح ${completedReconciliations.length} تصفية مكتملة`);
      } else {
        console.log('✅ [DB] جميع التصفيات المكتملة لديها أرقام');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إصلاح ترقيم التصفيات:', error);
    }
  }

  updateExistingTables() {
    try {
      // Check if branch_id column exists in atms table
      const atmTableInfo = this.db.prepare("PRAGMA table_info(atms)").all();
      const hasBranchId = atmTableInfo.some(column => column.name === 'branch_id');

      if (!hasBranchId) {
        console.log('🔄 [DB] إضافة عمود branch_id إلى جدول الآلات...');
        this.db.exec('ALTER TABLE atms ADD COLUMN branch_id INTEGER REFERENCES branches(id)');

        // Update existing ATMs to use the default branch
        const defaultBranch = this.db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
        if (defaultBranch) {
          this.db.prepare('UPDATE atms SET branch_id = ? WHERE branch_id IS NULL').run(defaultBranch.id);
          console.log('✅ [DB] تم ربط الآلات الموجودة بالفرع الافتراضي');
        }
      }

      console.log('✅ [DB] تم تحديث الجداول الموجودة بنجاح');
    } catch (error) {
      console.error('❌ [DB] خطأ في تحديث الجداول الموجودة:', error);
    }

    // Migration: Allow NULL values for atm_id in bank_receipts table (for transfer operations)
    try {
      console.log('🔄 [DB] فحص جدول المقبوضات البنكية للتحويلات...');

      // Check if we need to migrate the bank_receipts table
      const tableInfo = this.db.prepare("PRAGMA table_info(bank_receipts)").all();
      const atmIdColumn = tableInfo.find(col => col.name === 'atm_id');

      if (atmIdColumn && atmIdColumn.notnull === 1) {
        console.log('🔄 [DB] تحديث جدول المقبوضات البنكية للسماح بالتحويلات...');

        // Create new table with nullable atm_id
        this.db.exec(`
          CREATE TABLE bank_receipts_new(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reconciliation_id INTEGER NOT NULL,
          operation_type TEXT NOT NULL,
          atm_id INTEGER,
          amount DECIMAL(10, 2) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
          FOREIGN KEY(atm_id) REFERENCES atms(id)
        )
      `);

        // Copy existing data
        this.db.exec(`
          INSERT INTO bank_receipts_new(id, reconciliation_id, operation_type, atm_id, amount, created_at)
          SELECT id, reconciliation_id, operation_type, atm_id, amount, created_at
          FROM bank_receipts
      `);

        // Drop old table and rename new one
        this.db.exec(`DROP TABLE bank_receipts`);
        this.db.exec(`ALTER TABLE bank_receipts_new RENAME TO bank_receipts`);

        console.log('✅ [DB] تم تحديث جدول المقبوضات البنكية بنجاح');
      } else {
        console.log('ℹ️ [DB] جدول المقبوضات البنكية محدث بالفعل');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في تحديث جدول المقبوضات البنكية:', error);
    }

    // Migration: Add notes column to postpaid_sales table
    try {
      console.log('🔄 [DB] فحص جدول المبيعات الآجلة لإضافة عمود الملاحظات...');

      // Check if notes column exists
      const tableInfo = this.db.prepare("PRAGMA table_info(postpaid_sales)").all();
      const notesColumn = tableInfo.find(col => col.name === 'notes');

      if (!notesColumn) {
        console.log('🔄 [DB] إضافة عمود الملاحظات إلى جدول المبيعات الآجلة...');

        // Add notes column
        this.db.exec(`ALTER TABLE postpaid_sales ADD COLUMN notes TEXT DEFAULT ''`);

        console.log('✅ [DB] تم إضافة عمود الملاحظات إلى جدول المبيعات الآجلة بنجاح');
      } else {
        console.log('ℹ️ [DB] عمود الملاحظات موجود بالفعل في جدول المبيعات الآجلة');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إضافة عمود الملاحظات إلى جدول المبيعات الآجلة:', error);
    }

    // Migration: Add notes column to customer_receipts table
    try {
      console.log('🔄 [DB] فحص جدول المقبوضات لإضافة عمود الملاحظات...');

      // Check if notes column exists
      const tableInfo = this.db.prepare("PRAGMA table_info(customer_receipts)").all();
      const notesColumn = tableInfo.find(col => col.name === 'notes');

      if (!notesColumn) {
        console.log('🔄 [DB] إضافة عمود الملاحظات إلى جدول المقبوضات...');

        // Add notes column
        this.db.exec(`ALTER TABLE customer_receipts ADD COLUMN notes TEXT DEFAULT ''`);

        console.log('✅ [DB] تم إضافة عمود الملاحظات إلى جدول المقبوضات بنجاح');
      } else {
        console.log('ℹ️ [DB] عمود الملاحظات موجود بالفعل في جدول المقبوضات');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إضافة عمود الملاحظات إلى جدول المقبوضات:', error);
    }

    // Migration: Add missing columns to suppliers table
    try {
      console.log('🔄 [DB] فحص جدول الموردين لإضافة الأعمدة المفقودة...');

      const suppliersTableInfo = this.db.prepare("PRAGMA table_info(suppliers)").all();
      const hasInvoiceNumber = suppliersTableInfo.some(col => col.name === 'invoice_number');
      const hasNotes = suppliersTableInfo.some(col => col.name === 'notes');

      if (!hasInvoiceNumber) {
        console.log('🔄 [DB] إضافة عمود invoice_number إلى جدول الموردين...');
        this.db.exec(`ALTER TABLE suppliers ADD COLUMN invoice_number TEXT`);
        console.log('✅ [DB] تم إضافة عمود invoice_number إلى جدول الموردين بنجاح');
      }

      if (!hasNotes) {
        console.log('🔄 [DB] إضافة عمود notes إلى جدول الموردين...');
        this.db.exec(`ALTER TABLE suppliers ADD COLUMN notes TEXT`);
        console.log('✅ [DB] تم إضافة عمود notes إلى جدول الموردين بنجاح');
      }

      if (hasInvoiceNumber && hasNotes) {
        console.log('ℹ️ [DB] جميع الأعمدة موجودة في جدول الموردين');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إضافة الأعمدة إلى جدول الموردين:', error);
    }

    // Migration: Add missing notes column to return_invoices table
    try {
      console.log('🔄 [DB] فحص جدول المرتجعات لإضافة عمود الملاحظات...');

      const returnInvoicesTableInfo = this.db.prepare("PRAGMA table_info(return_invoices)").all();
      const hasNotes = returnInvoicesTableInfo.some(col => col.name === 'notes');

      if (!hasNotes) {
        console.log('🔄 [DB] إضافة عمود notes إلى جدول المرتجعات...');
        this.db.exec(`ALTER TABLE return_invoices ADD COLUMN notes TEXT`);
        console.log('✅ [DB] تم إضافة عمود notes إلى جدول المرتجعات بنجاح');
      } else {
        console.log('ℹ️ [DB] عمود الملاحظات موجود بالفعل في جدول المرتجعات');
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إضافة عمود الملاحظات إلى جدول المرتجعات:', error);
    }

    // Migration: Add is_modified flag to reconciliation operation tables
    try {
      console.log('🔄 [DB] فحص جداول العمليات لإضافة عمود is_modified...');

      const operationTables = [
        'bank_receipts',
        'cash_receipts',
        'postpaid_sales',
        'customer_receipts',
        'return_invoices',
        'suppliers'
      ];

      for (const tableName of operationTables) {
        const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
        const hasIsModified = tableInfo.some((col) => col.name === 'is_modified');

        if (!hasIsModified) {
          this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN is_modified INTEGER DEFAULT 0`);
          console.log(`✅ [DB] تم إضافة عمود is_modified إلى جدول ${tableName}`);
        } else {
          console.log(`ℹ️ [DB] عمود is_modified موجود بالفعل في جدول ${tableName}`);
        }
      }
    } catch (error) {
      console.error('❌ [DB] خطأ في إضافة عمود is_modified إلى جداول العمليات:', error);
    }
  }

  normalizeReconciliationFormulaSign(value, fallback = 0) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const normalizedText = String(value).trim().toLowerCase();
    if (['+', '+1', '1', 'add', 'plus', 'true'].includes(normalizedText)) return 1;
    if (['-', '-1', 'subtract', 'minus', 'true-negative'].includes(normalizedText)) return -1;
    if (['0', 'ignore', 'none', 'off', 'false'].includes(normalizedText)) return 0;

    const numeric = Number(normalizedText);
    if (numeric > 0) return 1;
    if (numeric < 0) return -1;
    if (numeric === 0) return 0;

    return fallback;
  }

  normalizeReconciliationFormulaSettings(rawSettings = {}) {
    const safeRaw = (rawSettings && typeof rawSettings === 'object') ? rawSettings : {};
    const rawCustomSigns = (() => {
      if (safeRaw.custom_table_signs && typeof safeRaw.custom_table_signs === 'object') {
        return safeRaw.custom_table_signs;
      }
      if (safeRaw.custom_table_signs_json) {
        try {
          const parsed = JSON.parse(safeRaw.custom_table_signs_json);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
          return {};
        }
      }
      return {};
    })();
    const normalizedCustomSigns = {};
    Object.entries(rawCustomSigns).forEach(([tableKey, value]) => {
      if (!tableKey) return;
      normalizedCustomSigns[tableKey] = this.normalizeReconciliationFormulaSign(value, 0);
    });

    return {
      bank_receipts_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.bank_receipts_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.bank_receipts_sign
      ),
      cash_receipts_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.cash_receipts_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.cash_receipts_sign
      ),
      postpaid_sales_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.postpaid_sales_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.postpaid_sales_sign
      ),
      customer_receipts_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.customer_receipts_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.customer_receipts_sign
      ),
      return_invoices_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.return_invoices_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.return_invoices_sign
      ),
      suppliers_sign: this.normalizeReconciliationFormulaSign(
        safeRaw.suppliers_sign,
        DEFAULT_RECONCILIATION_FORMULA_SETTINGS.suppliers_sign
      ),
      custom_table_signs: normalizedCustomSigns
    };
  }

  getLegacyReconciliationFormulaSettings() {
    const rows = this.db.prepare(`
      SELECT setting_key, setting_value
      FROM system_settings
      WHERE category = 'reconciliation_formula'
    `).all();

    if (!rows || rows.length === 0) {
      return this.normalizeReconciliationFormulaSettings(DEFAULT_RECONCILIATION_FORMULA_SETTINGS);
    }

    const settingsMap = {};
    rows.forEach((row) => {
      if (!row || !row.setting_key) return;
      if (row.setting_key === 'custom_table_signs_json') {
        settingsMap.custom_table_signs_json = row.setting_value;
      } else {
        settingsMap[row.setting_key] = row.setting_value;
      }
    });

    return this.normalizeReconciliationFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...settingsMap
    });
  }

  syncLegacyReconciliationFormulaSettings(formulaSettings, activeProfileId = null) {
    const normalizedSettings = this.normalizeReconciliationFormulaSettings(formulaSettings);
    const upsertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    Object.entries(normalizedSettings).forEach(([settingKey, settingValue]) => {
      if (settingKey === 'custom_table_signs') {
        return;
      }
      upsertStmt.run('reconciliation_formula', settingKey, String(settingValue));
    });

    upsertStmt.run(
      'reconciliation_formula',
      'custom_table_signs_json',
      JSON.stringify(normalizedSettings.custom_table_signs || {})
    );

    if (activeProfileId !== null && activeProfileId !== undefined) {
      upsertStmt.run('reconciliation_formula', 'active_profile_id', String(activeProfileId));
    }
  }

  ensureReconciliationFormulaProfiles() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_formula_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          formula_name TEXT NOT NULL UNIQUE,
          settings_json TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_formula_profiles_default ON reconciliation_formula_profiles(is_default, is_active)');

      const profilesCount = this.db.prepare('SELECT COUNT(*) AS count FROM reconciliation_formula_profiles').get();
      let defaultProfileId = null;

      if (!profilesCount || profilesCount.count === 0) {
        const legacySettings = this.getLegacyReconciliationFormulaSettings();
        const insertResult = this.db.prepare(`
          INSERT INTO reconciliation_formula_profiles (formula_name, settings_json, is_default, is_active)
          VALUES (?, ?, 1, 1)
        `).run('المعادلة الافتراضية', JSON.stringify(legacySettings));
        defaultProfileId = insertResult.lastInsertRowid;
        console.log('✅ [DB] تم إنشاء المعادلة الافتراضية الأولى');
      } else {
        const defaultProfile = this.db.prepare(`
          SELECT id, is_default
          FROM reconciliation_formula_profiles
          WHERE is_active = 1
          ORDER BY is_default DESC, id ASC
          LIMIT 1
        `).get();

        if (defaultProfile) {
          defaultProfileId = defaultProfile.id;
          if (!defaultProfile.is_default) {
            this.db.prepare('UPDATE reconciliation_formula_profiles SET is_default = 0').run();
            this.db.prepare('UPDATE reconciliation_formula_profiles SET is_default = 1 WHERE id = ?').run(defaultProfileId);
          }
        }
      }

      if (!defaultProfileId) {
        return;
      }

      this.db.prepare(`
        UPDATE branches
        SET reconciliation_formula_id = ?
        WHERE reconciliation_formula_id IS NULL
      `).run(defaultProfileId);

      const defaultProfileRow = this.db.prepare(`
        SELECT settings_json
        FROM reconciliation_formula_profiles
        WHERE id = ?
        LIMIT 1
      `).get(defaultProfileId);

      let parsedSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      if (defaultProfileRow && defaultProfileRow.settings_json) {
        try {
          parsedSettings = JSON.parse(defaultProfileRow.settings_json);
        } catch (error) {
          parsedSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
        }
      }

      this.syncLegacyReconciliationFormulaSettings(parsedSettings, defaultProfileId);
    } catch (error) {
      console.error('❌ [DB] خطأ في تهيئة معادلات التصفية:', error);
    }
  }

  migrateSensitiveCredentials() {
    try {
      let migratedAdmins = 0;
      let migratedCashiers = 0;

      const adminRows = this.db.prepare(`
        SELECT id, password
        FROM admins
        WHERE password IS NOT NULL AND TRIM(password) != ''
      `).all();

      const updateAdminPassword = this.db.prepare(`
        UPDATE admins
        SET password = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      adminRows.forEach((admin) => {
        if (!isHashedSecret(admin.password)) {
          updateAdminPassword.run(hashSecret(admin.password), admin.id);
          migratedAdmins += 1;
        }
      });

      const cashierRows = this.db.prepare(`
        SELECT id, pin_code
        FROM cashiers
        WHERE pin_code IS NOT NULL AND TRIM(pin_code) != ''
      `).all();

      const updateCashierPin = this.db.prepare(`
        UPDATE cashiers
        SET pin_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      cashierRows.forEach((cashier) => {
        if (!isHashedSecret(cashier.pin_code)) {
          updateCashierPin.run(hashSecret(cashier.pin_code), cashier.id);
          migratedCashiers += 1;
        }
      });

      if (migratedAdmins > 0 || migratedCashiers > 0) {
        console.log(`🔐 [DB] Migrated sensitive credentials: admins=${migratedAdmins}, cashiers=${migratedCashiers}`);
      }
    } catch (error) {
      console.error('⚠️ [DB] Failed to migrate sensitive credentials:', error);
    }
  }

  insertDefaultData() {
    try {
      // Insert default admin if not exists
      const adminCount = this.db.prepare('SELECT COUNT(*) as count FROM admins').get();
      if (adminCount.count === 0) {
        const adminSeed = resolveAdminSeedPolicy({ app, env: process.env });
        if (adminSeed.shouldSeed) {
          this.db.prepare(`
            INSERT INTO admins(name, username, password) 
            VALUES(?, ?, ?)
          `).run(adminSeed.name, adminSeed.username, hashSecret(adminSeed.password));
          console.log(`Default admin created (${adminSeed.source})`);
        } else {
          console.log('⚠️ [DB] Default admin credentials disabled in this environment');
          console.log('ℹ️ [DB] To bootstrap an admin in production set INITIAL_ADMIN_PASSWORD (+ optional INITIAL_ADMIN_USERNAME/INITIAL_ADMIN_NAME)');
        }
      }

      // Insert default branch if not exists
      const branchCount = this.db.prepare('SELECT COUNT(*) as count FROM branches').get();
      if (branchCount.count === 0) {
        this.db.prepare(`
          INSERT INTO branches(branch_name, branch_address, branch_phone, is_active)
          VALUES(?, ?, ?, ?)
        `).run('الفرع الرئيسي', 'الرياض - حي الملك فهد', '011-1234567', 1);
        console.log('Default branch created');
      }

      // Insert default cashier if not exists
      const cashierCount = this.db.prepare('SELECT COUNT(*) as count FROM cashiers').get();
      if (cashierCount.count === 0) {
        // Get the default branch ID
        const defaultBranch = this.db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
        this.db.prepare(`
          INSERT INTO cashiers(name, cashier_number, branch_id)
          VALUES(?, ?, ?)
        `).run('كاشير 1', '001', defaultBranch ? defaultBranch.id : null);
        console.log('Default cashier created');
      }

      // Insert default accountant if not exists
      const accountantCount = this.db.prepare('SELECT COUNT(*) as count FROM accountants').get();
      if (accountantCount.count === 0) {
        this.db.prepare(`
          INSERT INTO accountants(name) 
          VALUES(?)
        `).run('محاسب 1');
        console.log('Default accountant created');
      }

      // Insert default ATM if not exists
      const atmCount = this.db.prepare('SELECT COUNT(*) as count FROM atms').get();
      if (atmCount.count === 0) {
        // Get the default branch ID
        const defaultBranch = this.db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
        const branchId = defaultBranch ? defaultBranch.id : 1;

        this.db.prepare(`
          INSERT INTO atms(name, bank_name, location, branch_id)
          VALUES(?, ?, ?, ?)
        `).run('جهاز 1', 'البنك الأهلي', 'الفرع الرئيسي', branchId);
        console.log('Default ATM created');
      }

      // Insert default settings
      const settingsData = [
        ['company_name', 'شركة المثال التجارية'],
        ['company_logo', ''],
        ['theme_color', '#007bff'],
        ['print_header', 'تصفية برو - Tasfiya Pro'],
        ['print_footer', '© 2025 محمد أمين الكامل - جميع الحقوق محفوظة']
      ];

      const insertSetting = this.db.prepare(`
        INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)
      `);

      settingsData.forEach(([key, value]) => {
        insertSetting.run(key, value);
      });

      console.log('Default settings inserted');

      // Insert default system settings
      const systemSettingsData = [
        ['general', 'company_name', 'شركة المثال التجارية'],
        ['general', 'company_logo', ''],
        ['general', 'theme_color', '#007bff'],
        ['reports', 'print_header', 'تصفية برو - Tasfiya Pro'],
        ['reports', 'print_footer', '© 2025 محمد أمين الكامل - جميع الحقوق محفوظة'],
        ['reports', 'default_save_path', ''],
        ['cashboxes', 'auto_post_reconciliation_vouchers', 'false']
      ];

      const insertSystemSetting = this.db.prepare(`
        INSERT OR IGNORE INTO system_settings(category, setting_key, setting_value) VALUES(?, ?, ?)
      `);

      systemSettingsData.forEach(([category, key, value]) => {
        insertSystemSetting.run(category, key, value);
      });

      console.log('Default system settings inserted');

      this.ensureReconciliationFormulaProfiles();

    } catch (error) {
      console.error('Error inserting default data:', error);
    }
  }

  // Helper methods for database operations
  query(sql, params = []) {
    try {
      return this.db.prepare(sql).all(params);
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  get(sql, params = []) {
    try {
      return this.db.prepare(sql).get(params);
    } catch (error) {
      console.error('Database get error:', error);
      throw error;
    }
  }

  run(sql, params = []) {
    try {
      return this.db.prepare(sql).run(params);
    } catch (error) {
      console.error('Database run error:', error);
      throw error;
    }
  }

  // Get complete reconciliation data for editing
  getReconciliationForEdit(reconciliationId) {
    console.log('🔍 [DB] بدء تحميل بيانات التصفية للتعديل - معرف:', reconciliationId, 'نوع:', typeof reconciliationId);

    try {
      // Enhanced input validation
      if (reconciliationId === null || reconciliationId === undefined) {
        console.error('❌ [DB] معرف التصفية null أو undefined');
        throw new Error('معرف التصفية مطلوب');
      }

      // Convert to number if it's a string
      const numericId = typeof reconciliationId === 'string' ? parseInt(reconciliationId, 10) : reconciliationId;

      if (isNaN(numericId) || numericId <= 0) {
        console.error('❌ [DB] معرف التصفية غير صحيح:', reconciliationId, 'تم تحويله إلى:', numericId);
        throw new Error(`معرف التصفية غير صحيح: ${reconciliationId}`);
      }

      console.log('✅ [DB] معرف التصفية صحيح:', numericId);

      // Check if database is accessible
      if (!this.db) {
        console.error('❌ [DB] قاعدة البيانات غير متاحة');
        throw new Error('قاعدة البيانات غير متاحة');
      }

      // Get main reconciliation data with detailed logging
      console.log('📡 [DB] تنفيذ استعلام التصفية الأساسية...');

      let reconciliation;
      try {
        reconciliation = this.get(`
          SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
          FROM reconciliations r
          LEFT JOIN cashiers c ON r.cashier_id = c.id
          LEFT JOIN accountants a ON r.accountant_id = a.id
          LEFT JOIN branches b ON c.branch_id = b.id
          WHERE r.id = ?
      `, [numericId]);
      } catch (sqlError) {
        console.error('❌ [DB] خطأ في استعلام SQL:', sqlError);
        throw new Error(`خطأ في قاعدة البيانات: ${sqlError.message}`);
      }

      if (!reconciliation) {
        console.error('❌ [DB] لم يتم العثور على التصفية - معرف:', numericId);

        // Check if reconciliation exists at all
        const exists = this.get('SELECT COUNT(*) as count FROM reconciliations WHERE id = ?', [numericId]);
        if (exists && exists.count === 0) {
          throw new Error(`التصفية رقم ${numericId} غير موجودة في قاعدة البيانات`);
        } else {
          throw new Error(`خطأ في تحميل التصفية رقم ${numericId}`);
        }
      }

      // Validate essential reconciliation data
      if (!reconciliation.id) {
        console.error('❌ [DB] معرف التصفية مفقود في النتيجة');
        throw new Error('بيانات التصفية تالفة - معرف مفقود');
      }

      console.log('✅ [DB] تم العثور على التصفية:', {
        id: reconciliation.id,
        cashier_name: reconciliation.cashier_name || 'غير محدد',
        accountant_name: reconciliation.accountant_name || 'غير محدد',
        date: reconciliation.reconciliation_date,
        status: reconciliation.status,
        cashier_id: reconciliation.cashier_id,
        accountant_id: reconciliation.accountant_id
      });

      // Get all related data with detailed logging and error handling
      console.log('📊 [DB] تحميل البيانات المرتبطة للتصفية:', numericId);

      let bankReceipts = [];
      let cashReceipts = [];
      let postpaidSales = [];
      let customerReceipts = [];
      let returnInvoices = [];
      let suppliers = [];
      let customTables = [];

      try {
        console.log('💳 [DB] تحميل المقبوضات البنكية...');
        bankReceipts = this.query(`
          SELECT br.*, atm.name as atm_name, atm.bank_name, atm.location as atm_location,
      b.branch_name as atm_branch_name
          FROM bank_receipts br
          LEFT JOIN atms atm ON br.atm_id = atm.id
          LEFT JOIN branches b ON atm.branch_id = b.id
          WHERE br.reconciliation_id = ?
      ORDER BY br.created_at
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${bankReceipts.length} مقبوضة بنكية`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل المقبوضات البنكية:', error.message);
        bankReceipts = [];
      }

      try {
        console.log('💰 [DB] تحميل المقبوضات النقدية...');
        cashReceipts = this.query(`
          SELECT * FROM cash_receipts
          WHERE reconciliation_id = ?
      ORDER BY denomination DESC
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${cashReceipts.length} مقبوضة نقدية`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل المقبوضات النقدية:', error.message);
        cashReceipts = [];
      }

      try {
        console.log('📱 [DB] تحميل المبيعات الآجلة...');
        postpaidSales = this.query(`
          SELECT * FROM postpaid_sales
          WHERE reconciliation_id = ?
      ORDER BY created_at
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${postpaidSales.length} مبيعة آجلة`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل المبيعات الآجلة:', error.message);
        postpaidSales = [];
      }

      try {
        console.log('👥 [DB] تحميل مقبوضات العملاء...');
        customerReceipts = this.query(`
          SELECT * FROM customer_receipts
          WHERE reconciliation_id = ?
      ORDER BY created_at
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${customerReceipts.length} مقبوضة عميل`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل مقبوضات العملاء:', error.message);
        customerReceipts = [];
      }

      try {
        console.log('↩️ [DB] تحميل فواتير المرتجع...');
        returnInvoices = this.query(`
          SELECT * FROM return_invoices
          WHERE reconciliation_id = ?
      ORDER BY created_at
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${returnInvoices.length} فاتورة مرتجع`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل فواتير المرتجع:', error.message);
        returnInvoices = [];
      }

      try {
        console.log('🏪 [DB] تحميل الموردين...');
        suppliers = this.query(`
          SELECT * FROM suppliers
          WHERE reconciliation_id = ?
      ORDER BY created_at
      `, [numericId]) || [];
        console.log(`✅[DB] تم تحميل ${suppliers.length} مورد`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل الموردين:', error.message);
        suppliers = [];
      }

      try {
        console.log('🧩 [DB] تحميل الجداول الإضافية...');
        const customRows = this.query(`
          SELECT
            e.*,
            d.table_key,
            d.table_name,
            d.entry_template,
            d.default_sign,
            d.display_order,
            d.is_active,
            d.config_json
          FROM reconciliation_custom_entries e
          INNER JOIN reconciliation_custom_table_definitions d
            ON d.id = e.definition_id
          WHERE e.reconciliation_id = ?
          ORDER BY d.display_order ASC, e.created_at ASC, e.id ASC
        `, [numericId]) || [];

        const grouped = new Map();
        customRows.forEach((row) => {
          if (!row.table_key) {
            return;
          }

          if (!grouped.has(row.table_key)) {
            grouped.set(row.table_key, {
              definition: {
                id: row.definition_id,
                table_key: row.table_key,
                table_name: row.table_name,
                entry_template: row.entry_template,
                default_sign: row.default_sign,
                display_order: row.display_order,
                is_active: row.is_active,
                config_json: row.config_json
              },
              entries: []
            });
          }

          let payload = {};
          try {
            payload = JSON.parse(row.entry_payload_json || '{}') || {};
          } catch (_error) {
            payload = {};
          }

          grouped.get(row.table_key).entries.push({
            id: row.id,
            reconciliation_id: row.reconciliation_id,
            definition_id: row.definition_id,
            amount: row.amount || 0,
            payload,
            created_at: row.created_at,
            updated_at: row.updated_at
          });
        });

        customTables = Array.from(grouped.values());
        console.log(`✅ [DB] تم تحميل ${customTables.length} جدول إضافي`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل الجداول الإضافية:', error.message);
        customTables = [];
      }

      // Validate that we have the essential reconciliation data
      if (!reconciliation.cashier_id || !reconciliation.accountant_id) {
        console.warn('⚠️ [DB] بيانات التصفية غير مكتملة - معرفات مفقودة');
        // Don't throw error, just warn - we can still load the reconciliation
      }

      const result = {
        reconciliation,
        bankReceipts: Array.isArray(bankReceipts) ? bankReceipts : [],
        cashReceipts: Array.isArray(cashReceipts) ? cashReceipts : [],
        postpaidSales: Array.isArray(postpaidSales) ? postpaidSales : [],
        customerReceipts: Array.isArray(customerReceipts) ? customerReceipts : [],
        returnInvoices: Array.isArray(returnInvoices) ? returnInvoices : [],
        suppliers: Array.isArray(suppliers) ? suppliers : [],
        customTables: Array.isArray(customTables) ? customTables : []
      };

      // Calculate totals for validation
      const totalBankReceipts = result.bankReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
      const totalCashReceipts = result.cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);

      console.log('✅ [DB] تم تحميل جميع البيانات بنجاح:', {
        reconciliation: !!result.reconciliation,
        reconciliationId: result.reconciliation.id,
        bankReceipts: result.bankReceipts.length,
        cashReceipts: result.cashReceipts.length,
        postpaidSales: result.postpaidSales.length,
        customerReceipts: result.customerReceipts.length,
        returnInvoices: result.returnInvoices.length,
        suppliers: result.suppliers.length,
        customTables: result.customTables.length,
        totalBankReceipts: totalBankReceipts.toFixed(2),
        totalCashReceipts: totalCashReceipts.toFixed(2)
      });

      return result;

    } catch (error) {
      console.error('❌ [DB] خطأ في تحميل بيانات التصفية للتعديل:', {
        reconciliationId: reconciliationId,
        error: error.message,
        code: error.code,
        stack: error.stack
      });

      // Enhanced error handling
      if (error.code === 'SQLITE_ERROR') {
        throw new Error(`خطأ في قاعدة البيانات: ${error.message}`);
      } else if (error.message && error.message.includes('no such table')) {
        throw new Error('جدول قاعدة البيانات غير موجود');
      } else if (error.message && error.message.includes('no such column')) {
        throw new Error('عمود قاعدة البيانات غير موجود');
      } else {
        throw new Error(`خطأ في تحميل بيانات التصفية: ${error.message}`);
      }
    }
  }

  // Update reconciliation with last modified date
  normalizeOptionalBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }
      return value > 0 ? 1 : 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return 1;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return 0;
    }

    return null;
  }

  parseBooleanSettingValue(value, fallback = false) {
    const normalized = this.normalizeOptionalBoolean(value);
    if (normalized === null) {
      return fallback;
    }
    return normalized === 1;
  }

  isCashboxAutoPostingEnabled(database = this.db) {
    try {
      const row = database.prepare(`
        SELECT setting_value
        FROM system_settings
        WHERE category = ?
          AND setting_key = ?
        LIMIT 1
      `).get('cashboxes', 'auto_post_reconciliation_vouchers');

      return this.parseBooleanSettingValue(row && row.setting_value, false);
    } catch (_error) {
      return false;
    }
  }

  ensureBranchCashboxRecord(database, branchId) {
    const numericBranchId = Number(branchId);
    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
      return null;
    }

    const existing = database.prepare(`
      SELECT id, cashbox_name
      FROM branch_cashboxes
      WHERE branch_id = ?
      LIMIT 1
    `).get(numericBranchId);
    if (existing) {
      return existing;
    }

    database.prepare(`
      INSERT OR IGNORE INTO branch_cashboxes (
        branch_id,
        cashbox_name,
        opening_balance,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        b.id,
        'صندوق ' || TRIM(COALESCE(b.branch_name, 'الفرع')),
        0,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM branches b
      WHERE b.id = ?
    `).run(numericBranchId);

    return database.prepare(`
      SELECT id, cashbox_name
      FROM branch_cashboxes
      WHERE branch_id = ?
      LIMIT 1
    `).get(numericBranchId) || null;
  }

  appendCashboxAuditLog(database, entry) {
    database.prepare(`
      INSERT INTO cashbox_voucher_audit_log (
        voucher_id,
        voucher_number,
        voucher_sequence_number,
        voucher_type,
        branch_id,
        action_type,
        action_by,
        action_at,
        payload_json,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(
      entry.voucher_id || null,
      entry.voucher_number || null,
      entry.voucher_sequence_number || null,
      entry.voucher_type || null,
      entry.branch_id || null,
      entry.action_type || 'update',
      entry.action_by || 'النظام (تلقائي)',
      entry.payload_json || null,
      entry.notes || null
    );
  }

  syncCashboxVouchersFromReconciliation(reconciliationId) {
    const numericReconciliationId = Number(reconciliationId);
    if (!Number.isInteger(numericReconciliationId) || numericReconciliationId <= 0) {
      throw new Error('معرف التصفية غير صالح للترحيل التلقائي إلى الصندوق.');
    }

    const toAmount = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
    };

    const toComparableText = (value) => String(value == null ? '' : value).trim();
    const parseBooleanFlag = (value, fallback = false) => this.parseBooleanSettingValue(value, fallback);

    const hasDifference = (existing, desired) => {
      const existingAmount = toAmount(existing.amount);
      if (Math.abs(existingAmount - desired.amount) > 0.0001) return true;
      if (toComparableText(existing.voucher_type) !== toComparableText(desired.voucherType)) return true;
      if (Number(existing.cashbox_id || 0) !== Number(desired.cashboxId || 0)) return true;
      if (Number(existing.branch_id || 0) !== Number(desired.branchId || 0)) return true;
      if (toComparableText(existing.counterparty_type) !== toComparableText(desired.counterpartyType)) return true;
      if (toComparableText(existing.counterparty_name) !== toComparableText(desired.counterpartyName)) return true;
      if (Number(existing.cashier_id || 0) !== Number(desired.cashierId || 0)) return true;
      if (toComparableText(existing.reference_no) !== toComparableText(desired.referenceNo)) return true;
      if (toComparableText(existing.description) !== toComparableText(desired.description)) return true;
      if (toComparableText(existing.voucher_date) !== toComparableText(desired.voucherDate)) return true;
      return false;
    };

    try {
      const transaction = this.db.transaction((targetReconciliationId) => {
        const vouchersTable = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cashbox_vouchers'"
        ).get();
        const cashboxesTable = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'branch_cashboxes'"
        ).get();

        if (!vouchersTable || !cashboxesTable) {
          return {
            enabled: false,
            created: 0,
            updated: 0,
            deleted: 0,
            skippedReason: 'cashbox_tables_missing'
          };
        }

        this.db.prepare(`
          INSERT OR IGNORE INTO system_settings (
            category,
            setting_key,
            setting_value,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run('cashboxes', 'auto_post_reconciliation_vouchers', 'false');

        const reconciliation = this.db.prepare(`
          SELECT
            r.id,
            r.reconciliation_number,
            r.reconciliation_date,
            r.cashier_id,
            r.status,
            r.cashbox_posting_enabled,
            c.name AS cashier_name,
            c.branch_id
          FROM reconciliations r
          LEFT JOIN cashiers c ON c.id = r.cashier_id
          WHERE r.id = ?
          LIMIT 1
        `).get(targetReconciliationId);

        if (!reconciliation) {
          return {
            enabled: true,
            created: 0,
            updated: 0,
            deleted: 0,
            skippedReason: 'reconciliation_not_found'
          };
        }

        if (String(reconciliation.status || '').trim() !== 'completed') {
          return {
            enabled: true,
            created: 0,
            updated: 0,
            deleted: 0,
            skippedReason: 'reconciliation_not_completed'
          };
        }

        const globalAutoPostingEnabled = this.isCashboxAutoPostingEnabled(this.db);
        const hasExplicitPostingPreference = reconciliation.cashbox_posting_enabled !== null
          && reconciliation.cashbox_posting_enabled !== undefined
          && reconciliation.cashbox_posting_enabled !== '';
        const reconciliationPostingEnabled = hasExplicitPostingPreference
          ? parseBooleanFlag(reconciliation.cashbox_posting_enabled, false)
          : globalAutoPostingEnabled;

        if (!reconciliationPostingEnabled) {
          const reconciliationLabel = reconciliation.reconciliation_number || reconciliation.id;
          const existingAutoVouchers = this.db.prepare(`
            SELECT id, voucher_number, voucher_sequence_number, voucher_type, branch_id, source_entry_key
            FROM cashbox_vouchers
            WHERE source_reconciliation_id = ?
              AND source_entry_key IS NOT NULL
              AND COALESCE(is_auto_generated, 0) = 1
          `).all(targetReconciliationId);

          const deleteVoucherStatement = this.db.prepare('DELETE FROM cashbox_vouchers WHERE id = ?');
          let deleted = 0;

          (Array.isArray(existingAutoVouchers) ? existingAutoVouchers : []).forEach((voucher) => {
            deleteVoucherStatement.run(voucher.id);
            deleted += 1;
            this.appendCashboxAuditLog(this.db, {
              voucher_id: voucher.id,
              voucher_number: voucher.voucher_number,
              voucher_sequence_number: voucher.voucher_sequence_number,
              voucher_type: voucher.voucher_type,
              branch_id: voucher.branch_id,
              action_type: 'delete',
              action_by: 'النظام (إلغاء ترحيل التصفية)',
              payload_json: JSON.stringify({
                source: 'reconciliation_auto_post',
                reconciliation_id: targetReconciliationId,
                source_entry_key: voucher.source_entry_key || null,
                reason: 'cashbox_posting_disabled_for_reconciliation'
              }),
              notes: `إلغاء ترحيل التصفية #${reconciliationLabel} وحذف السند التلقائي`
            });
          });

          return {
            enabled: false,
            created: 0,
            updated: 0,
            deleted,
            skippedReason: hasExplicitPostingPreference ? 'disabled_for_reconciliation' : 'disabled_by_default_setting'
          };
        }

        let branchId = Number(reconciliation.branch_id || 0);
        if (!Number.isInteger(branchId) || branchId <= 0) {
          try {
            const cashboxBranchRows = this.db.prepare(`
              SELECT DISTINCT branch_id
              FROM branch_cashboxes
              WHERE branch_id IS NOT NULL
                AND branch_id > 0
                AND COALESCE(is_active, 1) = 1
            `).all();
            const uniqueCashboxBranchIds = Array.from(
              new Set(
                (Array.isArray(cashboxBranchRows) ? cashboxBranchRows : [])
                  .map((row) => Number(row && row.branch_id))
                  .filter((value) => Number.isInteger(value) && value > 0)
              )
            );

            if (uniqueCashboxBranchIds.length === 1) {
              branchId = uniqueCashboxBranchIds[0];
            } else {
              const activeBranchRows = this.db.prepare(`
                SELECT id
                FROM branches
                WHERE COALESCE(is_active, 1) = 1
              `).all();
              const uniqueActiveBranchIds = Array.from(
                new Set(
                  (Array.isArray(activeBranchRows) ? activeBranchRows : [])
                    .map((row) => Number(row && row.id))
                    .filter((value) => Number.isInteger(value) && value > 0)
                )
              );
              if (uniqueActiveBranchIds.length === 1) {
                branchId = uniqueActiveBranchIds[0];
              }
            }
          } catch (_branchFallbackError) {
            // Ignore fallback resolution errors and keep original branch check.
          }
        }

        if (!Number.isInteger(branchId) || branchId <= 0) {
          return {
            enabled: true,
            created: 0,
            updated: 0,
            deleted: 0,
            skippedReason: 'branch_not_found'
          };
        }

        const cashbox = this.ensureBranchCashboxRecord(this.db, branchId);
        if (!cashbox || !cashbox.id) {
          return {
            enabled: true,
            created: 0,
            updated: 0,
            deleted: 0,
            skippedReason: 'cashbox_not_found'
          };
        }

        const cashSummary = this.db.prepare(`
          SELECT COALESCE(SUM(total_amount), 0) AS total_cash
          FROM cash_receipts
          WHERE reconciliation_id = ?
        `).get(targetReconciliationId);

        const suppliers = this.db.prepare(`
          SELECT id, supplier_name, invoice_number, notes, amount
          FROM suppliers
          WHERE reconciliation_id = ?
          ORDER BY id ASC
        `).all(targetReconciliationId);

        const reconciliationLabel = reconciliation.reconciliation_number || reconciliation.id;
        const voucherDate = String(reconciliation.reconciliation_date || new Date().toISOString().split('T')[0]);
        const fallbackReference = `REC-${reconciliationLabel}`;
        const desiredEntries = [];

        const totalCashReceipts = toAmount(cashSummary && cashSummary.total_cash);
        if (totalCashReceipts > 0) {
          desiredEntries.push({
            sourceEntryKey: 'cash_receipts_total',
            voucherType: 'receipt',
            cashboxId: cashbox.id,
            branchId,
            counterpartyType: 'cashier',
            counterpartyName: toComparableText(reconciliation.cashier_name) || `كاشير ${reconciliation.cashier_id}`,
            cashierId: reconciliation.cashier_id || null,
            amount: totalCashReceipts,
            referenceNo: fallbackReference,
            description: `ترحيل تلقائي من التصفية #${reconciliationLabel} - إجمالي المقبوضات النقدية`,
            voucherDate
          });
        }

        (Array.isArray(suppliers) ? suppliers : []).forEach((supplier) => {
          const amount = toAmount(supplier && supplier.amount);
          if (amount <= 0) {
            return;
          }

          const supplierName = toComparableText(supplier && supplier.supplier_name);
          if (!supplierName) {
            return;
          }

          const supplierReference = toComparableText(supplier && supplier.invoice_number) || fallbackReference;
          const supplierNotes = toComparableText(supplier && supplier.notes);
          desiredEntries.push({
            sourceEntryKey: `supplier:${supplier.id}`,
            voucherType: 'payment',
            cashboxId: cashbox.id,
            branchId,
            counterpartyType: 'supplier',
            counterpartyName: supplierName,
            cashierId: null,
            amount,
            referenceNo: supplierReference,
            description: supplierNotes || `ترحيل تلقائي من التصفية #${reconciliationLabel} - مصروفات مورد`,
            voucherDate
          });
        });

        const existingAutoVouchers = this.db.prepare(`
          SELECT
            id,
            voucher_number,
            voucher_sequence_number,
            voucher_type,
            cashbox_id,
            branch_id,
            counterparty_type,
            counterparty_name,
            cashier_id,
            amount,
            reference_no,
            description,
            voucher_date,
            source_entry_key
          FROM cashbox_vouchers
          WHERE source_reconciliation_id = ?
            AND source_entry_key IS NOT NULL
            AND COALESCE(is_auto_generated, 0) = 1
        `).all(targetReconciliationId);

        const existingMap = new Map();
        (Array.isArray(existingAutoVouchers) ? existingAutoVouchers : []).forEach((voucher) => {
          existingMap.set(String(voucher.source_entry_key || ''), voucher);
        });

        const insertVoucherStatement = this.db.prepare(`
          INSERT INTO cashbox_vouchers (
            voucher_number,
            voucher_sequence_number,
            sync_key,
            voucher_type,
            cashbox_id,
            branch_id,
            counterparty_type,
            counterparty_name,
            cashier_id,
            amount,
            reference_no,
            description,
            voucher_date,
            created_by,
            created_at,
            updated_at,
            source_reconciliation_id,
            source_entry_key,
            is_auto_generated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateVoucherStatement = this.db.prepare(`
          UPDATE cashbox_vouchers
          SET sync_key = ?,
              voucher_type = ?,
              cashbox_id = ?,
              branch_id = ?,
              counterparty_type = ?,
              counterparty_name = ?,
              cashier_id = ?,
              amount = ?,
              reference_no = ?,
              description = ?,
              voucher_date = ?,
              is_auto_generated = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        const deleteVoucherStatement = this.db.prepare('DELETE FROM cashbox_vouchers WHERE id = ?');

        let created = 0;
        let updated = 0;
        let deleted = 0;
        const consumedKeys = new Set();

        desiredEntries.forEach((entry) => {
          const existing = existingMap.get(entry.sourceEntryKey);

          if (existing) {
            consumedKeys.add(entry.sourceEntryKey);
            if (!hasDifference(existing, entry)) {
              return;
            }

            updateVoucherStatement.run(
              buildCashboxVoucherSyncKey({
                branch_id: entry.branchId,
                voucher_type: entry.voucherType,
                source_reconciliation_id: targetReconciliationId,
                source_entry_key: entry.sourceEntryKey
              }),
              entry.voucherType,
              entry.cashboxId,
              entry.branchId,
              entry.counterpartyType,
              entry.counterpartyName,
              entry.cashierId,
              entry.amount,
              entry.referenceNo,
              entry.description,
              entry.voucherDate,
              existing.id
            );
            updated += 1;

            this.appendCashboxAuditLog(this.db, {
              voucher_id: existing.id,
              voucher_number: existing.voucher_number,
              voucher_sequence_number: existing.voucher_sequence_number,
              voucher_type: entry.voucherType,
              branch_id: entry.branchId,
              action_type: 'update',
              action_by: 'النظام (ترحيل تلقائي)',
              payload_json: JSON.stringify({
                source: 'reconciliation_auto_post',
                reconciliation_id: targetReconciliationId,
                source_entry_key: entry.sourceEntryKey,
                previous: existing,
                next: entry
              }),
              notes: `تحديث تلقائي لسند مرتبط بالتصفية #${reconciliationLabel}`
            });
            return;
          }

          const nextVoucherNumberRow = this.db.prepare(
            'SELECT COALESCE(MAX(voucher_number), 0) + 1 AS next_number FROM cashbox_vouchers'
          ).get();
          const nextVoucherSequenceRow = this.db.prepare(
            'SELECT COALESCE(MAX(voucher_sequence_number), 0) + 1 AS next_number FROM cashbox_vouchers WHERE voucher_type = ?'
          ).get(entry.voucherType);

          const voucherNumber = Number(nextVoucherNumberRow && nextVoucherNumberRow.next_number) || 1;
          const voucherSequenceNumber = Number(nextVoucherSequenceRow && nextVoucherSequenceRow.next_number) || 1;
          const createdBy = 'النظام (تلقائي من التصفية)';
          const nowIso = new Date().toISOString();
          const syncKey = buildCashboxVoucherSyncKey({
            branch_id: entry.branchId,
            voucher_type: entry.voucherType,
            voucher_sequence_number: voucherSequenceNumber,
            voucher_number: voucherNumber,
            source_reconciliation_id: targetReconciliationId,
            source_entry_key: entry.sourceEntryKey,
            created_at: nowIso
          });

          const insertResult = insertVoucherStatement.run(
            voucherNumber,
            voucherSequenceNumber,
            syncKey,
            entry.voucherType,
            entry.cashboxId,
            entry.branchId,
            entry.counterpartyType,
            entry.counterpartyName,
            entry.cashierId,
            entry.amount,
            entry.referenceNo,
            entry.description,
            entry.voucherDate,
            createdBy,
            nowIso,
            nowIso,
            targetReconciliationId,
            entry.sourceEntryKey,
            1
          );

          created += 1;
          const voucherId = insertResult && insertResult.lastInsertRowid ? insertResult.lastInsertRowid : null;
          this.appendCashboxAuditLog(this.db, {
            voucher_id: voucherId,
            voucher_number: voucherNumber,
            voucher_sequence_number: voucherSequenceNumber,
            voucher_type: entry.voucherType,
            branch_id: entry.branchId,
            action_type: 'create',
            action_by: createdBy,
            payload_json: JSON.stringify({
              source: 'reconciliation_auto_post',
              reconciliation_id: targetReconciliationId,
              source_entry_key: entry.sourceEntryKey,
              voucher: entry
            }),
            notes: `إنشاء تلقائي لسند من التصفية #${reconciliationLabel}`
          });
        });

        (Array.isArray(existingAutoVouchers) ? existingAutoVouchers : []).forEach((voucher) => {
          const sourceKey = String(voucher && voucher.source_entry_key ? voucher.source_entry_key : '');
          if (!sourceKey || consumedKeys.has(sourceKey)) {
            return;
          }

          deleteVoucherStatement.run(voucher.id);
          deleted += 1;

          this.appendCashboxAuditLog(this.db, {
            voucher_id: voucher.id,
            voucher_number: voucher.voucher_number,
            voucher_sequence_number: voucher.voucher_sequence_number,
            voucher_type: voucher.voucher_type,
            branch_id: voucher.branch_id,
            action_type: 'delete',
            action_by: 'النظام (ترحيل تلقائي)',
            payload_json: JSON.stringify({
              source: 'reconciliation_auto_post',
              reconciliation_id: targetReconciliationId,
              source_entry_key: sourceKey,
              voucher
            }),
            notes: `حذف تلقائي لسند لم يعد له مرجع من التصفية #${reconciliationLabel}`
          });
        });

        return {
          enabled: true,
          created,
          updated,
          deleted,
          skippedReason: ''
        };
      });

      return transaction(numericReconciliationId);
    } catch (error) {
      console.error('❌ [DB] خطأ أثناء ترحيل سندات الصندوق تلقائيًا من التصفية:', error);
      throw error;
    }
  }

  // Update reconciliation with last modified date
  updateReconciliationModified(
    reconciliationId,
    systemSales,
    totalReceipts,
    surplusDeficit,
    status = 'completed',
    formulaSettingsJson = null,
    formulaProfileId = null
  ) {
    try {
      return this.run(`
        UPDATE reconciliations
        SET system_sales = ?, total_receipts = ?, surplus_deficit = ?, status = ?,
            formula_profile_id = COALESCE(?, formula_profile_id),
            formula_settings = COALESCE(?, formula_settings),
            updated_at = CURRENT_TIMESTAMP, last_modified_date = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        systemSales,
        totalReceipts,
        surplusDeficit,
        status,
        formulaProfileId,
        formulaSettingsJson,
        reconciliationId
      ]);
    } catch (error) {
      if (error && String(error.message || '').includes('no such column: formula_profile_id')) {
        return this.run(`
          UPDATE reconciliations
          SET system_sales = ?, total_receipts = ?, surplus_deficit = ?, status = ?,
              formula_settings = COALESCE(?, formula_settings),
              updated_at = CURRENT_TIMESTAMP, last_modified_date = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [systemSales, totalReceipts, surplusDeficit, status, formulaSettingsJson, reconciliationId]);
      }
      if (error && String(error.message || '').includes('no such column: formula_settings')) {
        console.warn('⚠️ [DB] formula_settings غير موجود، سيتم التحديث بدونه (توافق مع قواعد بيانات قديمة)');
        return this.run(`
          UPDATE reconciliations
          SET system_sales = ?, total_receipts = ?, surplus_deficit = ?, status = ?,
          updated_at = CURRENT_TIMESTAMP, last_modified_date = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [systemSales, totalReceipts, surplusDeficit, status, reconciliationId]);
      }
      console.error('Error updating reconciliation:', error);
      throw error;
    }
  }

  // Get next reconciliation number for completed reconciliations
  getNextReconciliationNumber() {
    try {
      const transaction = this.db.transaction(() => {
        // Get the max number from COMPLETED reconciliations only with a write lock to prevent race conditions
        const result = this.db.prepare(`
          SELECT MAX(reconciliation_number) as max_number
          FROM reconciliations
          WHERE reconciliation_number IS NOT NULL AND status = 'completed'
      `).get();

        const maxNum = result && result.max_number ? result.max_number : 0;
        let nextNum = maxNum + 1;

        // Validate that this number is not already used (in case of any inconsistencies)
        let isDuplicateNumber = true;
        while (isDuplicateNumber) {
          const exists = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM reconciliations 
            WHERE reconciliation_number = ? AND status = 'completed'
      `).get(nextNum);

          isDuplicateNumber = exists.count !== 0;
          if (!isDuplicateNumber) break;
          console.warn(`���️ [DB] الرقم ${nextNum} مستخدم بالفعل في تصفية مكتملة، جاري تجربة الرقم التالي`);
          nextNum++;
        }

        console.log('📊 [DB] الرقم التسلسلي التالي للتصفية:', nextNum, '(بناءً على أقصى رقم مكتمل:', maxNum, ')');
        return nextNum;
      });

      return transaction();
    } catch (error) {
      console.error('❌ [DB] خطأ في الحصول على الرقم التسلسلي التالي:', error);
      throw error; // Throw error instead of returning 1 to prevent number conflicts
    }
  }

  // Update reconciliation with reconciliation number when completing
  completeReconciliation(
    reconciliationId,
    systemSales,
    totalReceipts,
    surplusDeficit,
    reconciliationNumber,
    formulaSettingsJson = null,
    formulaProfileId = null,
    cashboxPostingEnabled = null
  ) {
    try {
      const normalizedCashboxPosting = this.normalizeOptionalBoolean(cashboxPostingEnabled);
      const transaction = this.db.transaction(() => {
        // First validate that this number is not already used
        const exists = this.db.prepare(`
          SELECT COUNT(*) as count 
          FROM reconciliations 
          WHERE reconciliation_number = ? AND id != ?
        `).get(reconciliationNumber, reconciliationId);

        if (exists.count > 0) {
          throw new Error(`الرقم ${reconciliationNumber} مستخدم بالفعل في تصفية أخرى`);
        }

        // Then do the update within the same transaction
        this.db.prepare(`
          UPDATE reconciliations
          SET system_sales = ?, 
              total_receipts = ?, 
              surplus_deficit = ?,
              formula_profile_id = COALESCE(?, formula_profile_id),
              formula_settings = COALESCE(?, formula_settings),
              cashbox_posting_enabled = COALESCE(?, cashbox_posting_enabled),
              status = 'completed', 
              reconciliation_number = ?,
              updated_at = CURRENT_TIMESTAMP, 
              last_modified_date = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          systemSales,
          totalReceipts,
          surplusDeficit,
          formulaProfileId,
          formulaSettingsJson,
          normalizedCashboxPosting,
          reconciliationNumber,
          reconciliationId
        );

        // Log the update for debugging
        console.log('✅ [DB] تم إكمال التصفية:', {
          id: reconciliationId,
          number: reconciliationNumber,
          sales: systemSales,
          receipts: totalReceipts,
          surplus: surplusDeficit
        });
      });

      // Execute the transaction
      transaction();
      return true;
    } catch (error) {
      if (error && String(error.message || '').includes('no such column: formula_profile_id')) {
        console.warn('⚠️ [DB] formula_profile_id غير موجود، سيتم الإكمال بدونه (توافق مؤقت)');
        const fallbackWithoutProfile = this.db.transaction(() => {
          const exists = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM reconciliations 
            WHERE reconciliation_number = ? AND id != ?
          `).get(reconciliationNumber, reconciliationId);

          if (exists.count > 0) {
            throw new Error(`الرقم ${reconciliationNumber} مستخدم بالفعل في تصفية أخرى`);
          }

          this.db.prepare(`
            UPDATE reconciliations
            SET system_sales = ?, 
                total_receipts = ?, 
                surplus_deficit = ?,
                formula_settings = COALESCE(?, formula_settings),
                status = 'completed', 
                reconciliation_number = ?,
                updated_at = CURRENT_TIMESTAMP, 
                last_modified_date = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            systemSales,
            totalReceipts,
            surplusDeficit,
            formulaSettingsJson,
            reconciliationNumber,
            reconciliationId
          );
        });

        fallbackWithoutProfile();
        return true;
      }
      if (error && String(error.message || '').includes('no such column: formula_settings')) {
        console.warn('⚠️ [DB] formula_settings غير موجود، سيتم إكمال التصفية بدونه (توافق مؤقت)');
        const fallbackTransaction = this.db.transaction(() => {
          const exists = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM reconciliations 
            WHERE reconciliation_number = ? AND id != ?
          `).get(reconciliationNumber, reconciliationId);

          if (exists.count > 0) {
            throw new Error(`الرقم ${reconciliationNumber} مستخدم بالفعل في تصفية أخرى`);
          }

          this.db.prepare(`
            UPDATE reconciliations
            SET system_sales = ?, 
                total_receipts = ?, 
                surplus_deficit = ?,
                status = 'completed', 
                reconciliation_number = ?,
                updated_at = CURRENT_TIMESTAMP, 
                last_modified_date = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            systemSales,
            totalReceipts,
            surplusDeficit,
            reconciliationNumber,
            reconciliationId
          );
        });

        fallbackTransaction();
        return true;
      }
      if (error && String(error.message || '').includes('no such column: cashbox_posting_enabled')) {
        console.warn('⚠️ [DB] cashbox_posting_enabled غير موجود، سيتم إكمال التصفية بدونه (توافق مؤقت)');
        const fallbackWithoutCashboxPosting = this.db.transaction(() => {
          const exists = this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM reconciliations 
            WHERE reconciliation_number = ? AND id != ?
          `).get(reconciliationNumber, reconciliationId);

          if (exists.count > 0) {
            throw new Error(`الرقم ${reconciliationNumber} مستخدم بالفعل في تصفية أخرى`);
          }

          this.db.prepare(`
            UPDATE reconciliations
            SET system_sales = ?, 
                total_receipts = ?, 
                surplus_deficit = ?,
                formula_profile_id = COALESCE(?, formula_profile_id),
                formula_settings = COALESCE(?, formula_settings),
                status = 'completed', 
                reconciliation_number = ?,
                updated_at = CURRENT_TIMESTAMP, 
                last_modified_date = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            systemSales,
            totalReceipts,
            surplusDeficit,
            formulaProfileId,
            formulaSettingsJson,
            reconciliationNumber,
            reconciliationId
          );
        });

        fallbackWithoutCashboxPosting();
        return true;
      }
      console.error('❌ [DB] خطأ في إكمال التصفية:', error);
      throw error;
    }
  }

  // إصلاح ترقيم التصفيات المكتملة الموجودة
  async fixAllReconciliationNumbers() {
    try {
      console.log('🔧 [DB] بدء إصلاح شامل لترقيم جميع التصفيات...');

      const transaction = this.db.transaction(() => {
        // First, get all completed reconciliations ordered by creation date
        const allCompleted = this.db.prepare(`
          SELECT id, reconciliation_number, created_at, status
          FROM reconciliations
          WHERE status = 'completed'
          ORDER BY created_at ASC, id ASC
        `).all();

        if (allCompleted.length === 0) {
          console.log('ℹ️ [DB] لا توجد تصفيات مكتملة للترقيم');
          return;
        }

        console.log(`📊 [DB] تم العثور على ${allCompleted.length} تصفية مكتملة`);

        // Validate current numbering
        const duplicates = this.db.prepare(`
          SELECT reconciliation_number, COUNT(*) as count
          FROM reconciliations
          WHERE reconciliation_number IS NOT NULL
          GROUP BY reconciliation_number
          HAVING COUNT(*) > 1
        `).all();

        if (duplicates.length > 0) {
          console.warn('⚠️ [DB] تم العثور على أرقام مكررة:', duplicates);
        }

        // Reset all reconciliation numbers first
        this.db.prepare(`
          UPDATE reconciliations 
          SET reconciliation_number = NULL 
          WHERE status = 'completed'
        `).run();

        console.log('� [DB] تم إعادة ضبط جميع الأرقام');

        // Reassign numbers sequentially
        let newNumber = 1;
        const updateStmt = this.db.prepare(`
          UPDATE reconciliations
          SET reconciliation_number = ?
          WHERE id = ?
        `);

        for (const rec of allCompleted) {
          updateStmt.run(newNumber, rec.id);
          console.log(`✅ [DB] إعادة ترقيم: التصفية ${rec.id} -> الرقم الجديد ${newNumber} (كان ${rec.reconciliation_number || 'بدون رقم'})`);
          newNumber++;
        }

        // Verify the update
        const verification = this.db.prepare(`
          SELECT COUNT(*) as total,
                 COUNT(DISTINCT reconciliation_number) as unique_numbers
          FROM reconciliations
          WHERE status = 'completed'
        `).get();

        if (verification.total !== verification.unique_numbers) {
          throw new Error('فشل التحقق من الترقيم - لا يزال هناك تكرار في الأرقام');
        }

        console.log('✅ [DB] تم التحقق من صحة الترقيم');

        // Create an index on reconciliation_number if it doesn't exist
        try {
          this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_reconciliation_number 
            ON reconciliations (reconciliation_number)
          `).run();
          console.log('✅ [DB] تم إنشاء/التحقق من وجود الفهرس على رقم التصفية');
        } catch (indexError) {
          console.warn('⚠️ [DB] تحذير عند إنشاء الفهرس:', indexError);
        }
      });

      // Execute the transaction
      transaction();
      console.log('🎉 [DB] تم إكمال إصلاح ترقيم التصفيات بنجاح!');

      return true;

    } catch (error) {
      console.error('❌ [DB] خطأ في إصلاح ترقيم التصفيات:', error);
      throw error;
    }
  }

  // Autocomplete functions for customer names
  /**
   * جلب أسماء العملاء المستخدمة في المبيعات الآجلة
   * @param {string} query - النص المراد البحث عنه
   * @param {number} limit - الحد الأقصى للنتائج (افتراضي: 10)
   * @returns {Array} قائمة بأسماء العملاء المطابقة
   */
  getPostpaidCustomerSuggestions(query, limit = 10) {
    try {
      console.log(`🔍 [AUTOCOMPLETE] البحث عن عملاء المبيعات الآجلة: "${query}"`);

      const stmt = this.db.prepare(`
        SELECT DISTINCT customer_name
        FROM postpaid_sales
        WHERE customer_name LIKE ?
        AND customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
        ORDER BY customer_name ASC
        LIMIT ?
      `);

      const results = stmt.all(`%${query}%`, limit);
      const customerNames = results.map(row => row.customer_name);

      console.log(`✅ [AUTOCOMPLETE] تم العثور على ${customerNames.length} عميل للمبيعات الآجلة`);
      return customerNames;

    } catch (error) {
      console.error('❌ [AUTOCOMPLETE] خطأ في جلب عملاء المبيعات الآجلة:', error);
      return [];
    }
  }

  /**
   * جلب أسماء العملاء المستخدمة في مقبوضات العملاء
   * @param {string} query - النص المراد البحث عنه
   * @param {number} limit - الحد الأقصى للنتائج (افتراضي: 10)
   * @returns {Array} قائمة بأسماء العملاء المطابقة
   */
  getCustomerReceiptSuggestions(query, limit = 10) {
    try {
      console.log(`🔍 [AUTOCOMPLETE] البحث عن عملاء المقبوضات: "${query}"`);

      const stmt = this.db.prepare(`
        SELECT DISTINCT customer_name
        FROM customer_receipts
        WHERE customer_name LIKE ?
        AND customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
        ORDER BY customer_name ASC
        LIMIT ?
      `);

      const results = stmt.all(`%${query}%`, limit);
      const customerNames = results.map(row => row.customer_name);

      console.log(`✅ [AUTOCOMPLETE] تم العثور على ${customerNames.length} عميل للمقبوضات`);
      return customerNames;

    } catch (error) {
      console.error('❌ [AUTOCOMPLETE] خطأ في جلب عملاء المقبوضات:', error);
      return [];
    }
  }

  /**
   * جلب جميع أسماء العملاء من كلا الجدولين (مدمجة)
   * @param {string} query - النص المراد البحث عنه
   * @param {number} limit - الحد الأقصى للنتائج (افتراضي: 10)
   * @returns {Array} قائمة بأسماء العملاء المطابقة مرتبة حسب التكرار
   */
  getAllCustomerSuggestions(query, limit = 10) {
    try {
      console.log(`🔍 [AUTOCOMPLETE] البحث عن جميع العملاء: "${query}"`);

      const stmt = this.db.prepare(`
        SELECT customer_name, COUNT(*) as usage_count
        FROM (
          SELECT customer_name FROM postpaid_sales
          WHERE customer_name LIKE ?
          AND customer_name IS NOT NULL
          AND TRIM(customer_name) != ''

          UNION ALL

          SELECT customer_name FROM customer_receipts
          WHERE customer_name LIKE ?
          AND customer_name IS NOT NULL
          AND TRIM(customer_name) != ''
        ) combined
        GROUP BY customer_name
        ORDER BY usage_count DESC, customer_name ASC
        LIMIT ?
      `);

      const results = stmt.all(`%${query}%`, `%${query}%`, limit);
      const customerNames = results.map(row => row.customer_name);

      console.log(`✅ [AUTOCOMPLETE] تم العثور على ${customerNames.length} عميل مدمج`);
      return customerNames;

    } catch (error) {
      console.error('❌ [AUTOCOMPLETE] خطأ في جلب جميع العملاء:', error);
      return [];
    }
  }

  /**
   * جلب إحصائيات استخدام اسم عميل معين
   * @param {string} customerName - اسم العميل
   * @returns {Object} إحصائيات الاستخدام
   */
  getCustomerUsageStats(customerName) {
    try {
      console.log(`📊 [AUTOCOMPLETE] جلب إحصائيات العميل: "${customerName}"`);

      // عدد المبيعات الآجلة
      const postpaidCount = this.db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
        FROM postpaid_sales
        WHERE customer_name = ?
      `).get(customerName);

      // عدد المقبوضات
      const receiptsCount = this.db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
        FROM customer_receipts
        WHERE customer_name = ?
      `).get(customerName);

      const stats = {
        customerName,
        postpaidSales: {
          count: postpaidCount.count || 0,
          totalAmount: postpaidCount.total_amount || 0
        },
        customerReceipts: {
          count: receiptsCount.count || 0,
          totalAmount: receiptsCount.total_amount || 0
        },
        totalTransactions: (postpaidCount.count || 0) + (receiptsCount.count || 0)
      };

      console.log(`✅ [AUTOCOMPLETE] إحصائيات العميل:`, stats);
      return stats;

    } catch (error) {
      console.error('❌ [AUTOCOMPLETE] خطأ في جلب إحصائيات العميل:', error);
      return null;
    }
  }

  /**
   * جلب آخر معرف تم إدراجه في قاعدة البيانات
   * @returns {number} آخر معرف تم إدراجه
   */
  getInsertId() {
    return this.db.lastInsertRowid;
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = DatabaseManager;
