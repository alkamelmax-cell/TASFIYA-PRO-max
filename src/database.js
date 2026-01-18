// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

const Database = require('better-sqlite3');
const path = require('path');

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
        dbPath = path.join(app.getPath('userData'), 'casher.db');
      } else {
        // In server mode, store db in a 'data' folder
        const dataDir = path.join(process.cwd(), 'data');
        const fs = require('fs');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir);
        }
        dbPath = path.join(dataDir, 'casher.db');
      }

      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');



      console.log('Database initialized at:', dbPath);
      this.createTables();
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

    // Branches table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_name TEXT NOT NULL,
        branch_address TEXT,
        branch_phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified_date DATETIME,
        FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
        FOREIGN KEY (accountant_id) REFERENCES accountants(id)
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
        amount DECIMAL(10,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
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
  }

  updateDatabaseSchema() {
    try {
      console.log('🔄 [DB] فحص وتحديث مخطط قاعدة البيانات...');

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

      console.log('✅ [DB] تم فحص وتحديث مخطط قاعدة البيانات بنجاح');

      // إصلاح ترقيم التصفيات المكتملة الموجودة (يتم تشغيله مرة واحدة فقط)
      this.fixExistingCompletedReconciliations();

    } catch (error) {
      console.error('❌ [DB] خطأ في تحديث مخطط قاعدة البيانات:', error);
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

        console.log(`✅ [DB] تم إصلاح ${completedReconciliations.length} تصفية مكتملة`);
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
          CREATE TABLE bank_receipts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reconciliation_id INTEGER NOT NULL,
            operation_type TEXT NOT NULL,
            atm_id INTEGER,
            amount DECIMAL(10,2) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
            FOREIGN KEY (atm_id) REFERENCES atms(id)
          )
        `);

        // Copy existing data
        this.db.exec(`
          INSERT INTO bank_receipts_new (id, reconciliation_id, operation_type, atm_id, amount, created_at)
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
  }

  insertDefaultData() {
    try {
      // Insert default admin if not exists
      const adminCount = this.db.prepare('SELECT COUNT(*) as count FROM admins').get();
      if (adminCount.count === 0) {
        this.db.prepare(`
          INSERT INTO admins (name, username, password) 
          VALUES (?, ?, ?)
        `).run('المدير العام', 'admin', 'admin123');
        console.log('Default admin created');
      }

      // Insert default branch if not exists
      const branchCount = this.db.prepare('SELECT COUNT(*) as count FROM branches').get();
      if (branchCount.count === 0) {
        this.db.prepare(`
          INSERT INTO branches (branch_name, branch_address, branch_phone, is_active)
          VALUES (?, ?, ?, ?)
        `).run('الفرع الرئيسي', 'الرياض - حي الملك فهد', '011-1234567', 1);
        console.log('Default branch created');
      }

      // Insert default cashier if not exists
      const cashierCount = this.db.prepare('SELECT COUNT(*) as count FROM cashiers').get();
      if (cashierCount.count === 0) {
        // Get the default branch ID
        const defaultBranch = this.db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
        this.db.prepare(`
          INSERT INTO cashiers (name, cashier_number, branch_id)
          VALUES (?, ?, ?)
        `).run('كاشير 1', '001', defaultBranch ? defaultBranch.id : null);
        console.log('Default cashier created');
      }

      // Insert default accountant if not exists
      const accountantCount = this.db.prepare('SELECT COUNT(*) as count FROM accountants').get();
      if (accountantCount.count === 0) {
        this.db.prepare(`
          INSERT INTO accountants (name) 
          VALUES (?)
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
          INSERT INTO atms (name, bank_name, location, branch_id)
          VALUES (?, ?, ?, ?)
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
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
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
        ['reports', 'default_save_path', '']
      ];

      const insertSystemSetting = this.db.prepare(`
        INSERT OR IGNORE INTO system_settings (category, setting_key, setting_value) VALUES (?, ?, ?)
      `);

      systemSettingsData.forEach(([category, key, value]) => {
        insertSystemSetting.run(category, key, value);
      });

      console.log('Default system settings inserted');

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
        console.log(`✅ [DB] تم تحميل ${bankReceipts.length} مقبوضة بنكية`);
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
        console.log(`✅ [DB] تم تحميل ${cashReceipts.length} مقبوضة نقدية`);
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
        console.log(`✅ [DB] تم تحميل ${postpaidSales.length} مبيعة آجلة`);
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
        console.log(`✅ [DB] تم تحميل ${customerReceipts.length} مقبوضة عميل`);
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
        console.log(`✅ [DB] تم تحميل ${returnInvoices.length} فاتورة مرتجع`);
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
        console.log(`✅ [DB] تم تحميل ${suppliers.length} مورد`);
      } catch (error) {
        console.warn('⚠️ [DB] خطأ في تحميل الموردين:', error.message);
        suppliers = [];
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
        suppliers: Array.isArray(suppliers) ? suppliers : []
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
  updateReconciliationModified(reconciliationId, systemSales, totalReceipts, surplusDeficit, status = 'completed') {
    try {
      return this.run(`
        UPDATE reconciliations
        SET system_sales = ?, total_receipts = ?, surplus_deficit = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP, last_modified_date = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [systemSales, totalReceipts, surplusDeficit, status, reconciliationId]);
    } catch (error) {
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
        while (true) {
          const exists = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM reconciliations 
            WHERE reconciliation_number = ? AND status = 'completed'
          `).get(nextNum);

          if (exists.count === 0) break;
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
  completeReconciliation(reconciliationId, systemSales, totalReceipts, surplusDeficit, reconciliationNumber) {
    try {
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
              status = 'completed', 
              reconciliation_number = ?,
              updated_at = CURRENT_TIMESTAMP, 
              last_modified_date = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(systemSales, totalReceipts, surplusDeficit, reconciliationNumber, reconciliationId);

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
