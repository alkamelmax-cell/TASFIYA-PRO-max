/**
 * @file database.js
 * @description وحدة قاعدة البيانات - تحتوي على عمليات إدارة وتنظيم البيانات
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const Joi = require('joi');
const ConfigManager = require('./config');
const ErrorHandler = require('./error-handler');
const Validators = require('./validators');

class DatabaseManager {
    constructor() {
        this.initialized = false;
        this.connected = false;
        this.dbPath = null;
        this.transactions = new Map();
        this.migrations = new Map();
        this.queries = new Map();
    }

    /**
     * تهيئة مدير قاعدة البيانات
     */
    async initialize() {
        console.log('🗄️ [DB] تهيئة مدير قاعدة البيانات...');

        try {
            // تجهيز مسار قاعدة البيانات
            this.dbPath = path.join(
                ConfigManager.get('paths.data'),
                ConfigManager.get('database.filename')
            );

            // إنشاء نسخة احتياطية قبل البدء إذا كان مفعلاً
            if (ConfigManager.get('database.backupOnStart')) {
                await this.backup('startup');
            }

            // تهيئة قاعدة البيانات
            await this.connect();

            // تنفيذ الترحيلات
            await this.runMigrations();

            this.initialized = true;
            this.connected = true;

            console.log('✅ [DB] تم تهيئة مدير قاعدة البيانات بنجاح');

        } catch (error) {
            console.error('❌ [DB] خطأ في تهيئة مدير قاعدة البيانات:', error);
            ErrorHandler.handleError(error, 'DB_ERROR');
            throw error;
        }
    }

    /**
     * الاتصال بقاعدة البيانات
     * @private
     */
    async connect() {
        try {
            await ipcRenderer.invoke('db-connect', this.dbPath);
            this.connected = true;
            console.log('🔌 [DB] تم الاتصال بقاعدة البيانات');
        } catch (error) {
            this.connected = false;
            console.error('❌ [DB] خطأ في الاتصال بقاعدة البيانات:', error);
            throw error;
        }
    }

    /**
     * إنشاء نسخة احتياطية
     * @param {string} reason - سبب النسخ الاحتياطي
     */
    async backup(reason = 'manual') {
        console.log('💾 [DB] إنشاء نسخة احتياطية:', reason);

        try {
            const backupPath = path.join(
                ConfigManager.get('paths.backup'),
                `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`
            );

            await ipcRenderer.invoke('db-backup', {
                source: this.dbPath,
                destination: backupPath
            });

            // تنظيف النسخ الاحتياطية القديمة
            await this.cleanupBackups();

            console.log('✅ [DB] تم إنشاء نسخة احتياطية بنجاح:', backupPath);
            return backupPath;

        } catch (error) {
            console.error('❌ [DB] خطأ في إنشاء نسخة احتياطية:', error);
            throw error;
        }
    }

    /**
     * تنظيف النسخ الاحتياطية القديمة
     * @private
     */
    async cleanupBackups() {
        try {
            const maxBackups = ConfigManager.get('database.maxBackupCount');
            const backupDir = ConfigManager.get('paths.backup');
            
            // جلب قائمة النسخ الاحتياطية
            const backups = await ipcRenderer.invoke('read-directory', backupDir);
            const backupFiles = backups
                .filter(f => f.endsWith('.sqlite'))
                .sort((a, b) => b.localeCompare(a));

            // حذف النسخ الزائدة
            if (backupFiles.length > maxBackups) {
                for (let i = maxBackups; i < backupFiles.length; i++) {
                    await ipcRenderer.invoke('delete-file',
                        path.join(backupDir, backupFiles[i]));
                }
            }

        } catch (error) {
            console.error('❌ [DB] خطأ في تنظيف النسخ الاحتياطية:', error);
            throw error;
        }
    }

    /**
     * تنفيذ الترحيلات
     * @private
     */
    async runMigrations() {
        console.log('🔄 [DB] تنفيذ ترحيلات قاعدة البيانات...');

        try {
            // التحقق من جدول الترحيلات
            await this.createMigrationsTable();

            // جلب الترحيلات المنفذة
            const executed = await this.getExecutedMigrations();

            // تنفيذ الترحيلات الجديدة
            for (const [version, migration] of this.migrations.entries()) {
                if (!executed.includes(version)) {
                    console.log('📦 [DB] تنفيذ ترحيل:', version);

                    // بدء المعاملة
                    await this.beginTransaction();

                    try {
                        // تنفيذ الترحيل
                        await migration.up();

                        // تسجيل الترحيل
                        await this.recordMigration(version);

                        // تأكيد المعاملة
                        await this.commitTransaction();

                        console.log('✅ [DB] تم تنفيذ الترحيل بنجاح:', version);

                    } catch (error) {
                        // التراجع عن المعاملة
                        await this.rollbackTransaction();
                        console.error('❌ [DB] خطأ في تنفيذ الترحيل:', version, error);
                        throw error;
                    }
                }
            }

        } catch (error) {
            console.error('❌ [DB] خطأ في تنفيذ الترحيلات:', error);
            throw error;
        }
    }

    /**
     * إنشاء جدول الترحيلات
     * @private
     */
    async createMigrationsTable() {
        try {
            await ipcRenderer.invoke('db-run', `
                CREATE TABLE IF NOT EXISTS migrations (
                    version TEXT PRIMARY KEY,
                    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (error) {
            console.error('❌ [DB] خطأ في إنشاء جدول الترحيلات:', error);
            throw error;
        }
    }

    /**
     * جلب الترحيلات المنفذة
     * @private
     */
    async getExecutedMigrations() {
        try {
            const migrations = await ipcRenderer.invoke('db-all',
                'SELECT version FROM migrations ORDER BY executed_at');
            return migrations.map(m => m.version);
        } catch (error) {
            console.error('❌ [DB] خطأ في جلب الترحيلات المنفذة:', error);
            throw error;
        }
    }

    /**
     * تسجيل ترحيل
     * @private
     * @param {string} version - رقم إصدار الترحيل
     */
    async recordMigration(version) {
        try {
            await ipcRenderer.invoke('db-run',
                'INSERT INTO migrations (version) VALUES (?)',
                [version]
            );
        } catch (error) {
            console.error('❌ [DB] خطأ في تسجيل الترحيل:', error);
            throw error;
        }
    }

    /**
     * بدء معاملة
     * @returns {string} معرف المعاملة
     */
    async beginTransaction() {
        try {
            // إنشاء معرف للمعاملة
            const transactionId = Date.now().toString();

            // بدء المعاملة
            await ipcRenderer.invoke('db-run', 'BEGIN TRANSACTION');

            // تخزين معرف المعاملة
            this.transactions.set(transactionId, {
                startTime: new Date(),
                status: 'active'
            });

            console.log('🔄 [DB] بدء معاملة جديدة:', transactionId);
            return transactionId;

        } catch (error) {
            console.error('❌ [DB] خطأ في بدء المعاملة:', error);
            throw error;
        }
    }

    /**
     * تأكيد معاملة
     * @param {string} transactionId - معرف المعاملة
     */
    async commitTransaction(transactionId = null) {
        try {
            await ipcRenderer.invoke('db-run', 'COMMIT');

            if (transactionId) {
                const transaction = this.transactions.get(transactionId);
                if (transaction) {
                    transaction.status = 'committed';
                    transaction.endTime = new Date();
                }
            }

            console.log('✅ [DB] تم تأكيد المعاملة:', transactionId);

        } catch (error) {
            console.error('❌ [DB] خطأ في تأكيد المعاملة:', error);
            throw error;
        }
    }

    /**
     * التراجع عن معاملة
     * @param {string} transactionId - معرف المعاملة
     */
    async rollbackTransaction(transactionId = null) {
        try {
            await ipcRenderer.invoke('db-run', 'ROLLBACK');

            if (transactionId) {
                const transaction = this.transactions.get(transactionId);
                if (transaction) {
                    transaction.status = 'rolled-back';
                    transaction.endTime = new Date();
                }
            }

            console.log('↩️ [DB] تم التراجع عن المعاملة:', transactionId);

        } catch (error) {
            console.error('❌ [DB] خطأ في التراجع عن المعاملة:', error);
            throw error;
        }
    }

    /**
     * تنفيذ استعلام مع مصادقة البيانات
     * @param {string} queryName - اسم الاستعلام المخزن
     * @param {Object} params - وسائط الاستعلام
     * @param {Object} validationSchema - مخطط المصادقة
     */
    async executeQuery(queryName, params = {}, validationSchema = null) {
        console.log('🔍 [DB] تنفيذ استعلام:', queryName);

        try {
            // التحقق من وجود الاستعلام
            const query = this.queries.get(queryName);
            if (!query) {
                throw new Error('الاستعلام غير موجود: ' + queryName);
            }

            // مصادقة الوسائط
            if (validationSchema) {
                params = Validators.validate(params, validationSchema);
            }

            // تنفيذ الاستعلام
            const result = await ipcRenderer.invoke('db-all', query, params);

            console.log('✅ [DB] تم تنفيذ الاستعلام بنجاح:', queryName);
            return result;

        } catch (error) {
            console.error('❌ [DB] خطأ في تنفيذ الاستعلام:', error);
            ErrorHandler.handleError(error, 'DB_ERROR', { queryName, params });
            throw error;
        }
    }

    /**
     * تنفيذ استعلام إدراج مع مصادقة البيانات
     * @param {string} table - اسم الجدول
     * @param {Object} data - البيانات
     * @param {Object} validationSchema - مخطط المصادقة
     */
    async insert(table, data, validationSchema = null) {
        console.log('➕ [DB] إدراج بيانات في:', table);

        try {
            // مصادقة البيانات
            if (validationSchema) {
                data = Validators.validate(data, validationSchema);
            }

            // تجهيز الاستعلام
            const columns = Object.keys(data);
            const values = Object.values(data);
            const placeholders = columns.map(() => '?').join(', ');

            const query = `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES (${placeholders})
            `;

            // تنفيذ الإدراج
            const result = await ipcRenderer.invoke('db-run', query, values);

            console.log('✅ [DB] تم الإدراج بنجاح:', result.lastID);
            return result.lastID;

        } catch (error) {
            console.error('❌ [DB] خطأ في الإدراج:', error);
            ErrorHandler.handleError(error, 'DB_ERROR', { table, data });
            throw error;
        }
    }

    /**
     * تنفيذ استعلام تحديث مع مصادقة البيانات
     * @param {string} table - اسم الجدول
     * @param {Object} data - البيانات
     * @param {Object} where - شروط التحديث
     * @param {Object} validationSchema - مخطط المصادقة
     */
    async update(table, data, where, validationSchema = null) {
        console.log('📝 [DB] تحديث بيانات في:', table);

        try {
            // مصادقة البيانات
            if (validationSchema) {
                data = Validators.validate(data, validationSchema);
            }

            // تجهيز الاستعلام
            const setColumns = Object.keys(data).map(key => `${key} = ?`);
            const whereColumns = Object.keys(where).map(key => `${key} = ?`);
            const values = [...Object.values(data), ...Object.values(where)];

            const query = `
                UPDATE ${table}
                SET ${setColumns.join(', ')}
                WHERE ${whereColumns.join(' AND ')}
            `;

            // تنفيذ التحديث
            const result = await ipcRenderer.invoke('db-run', query, values);

            console.log('✅ [DB] تم التحديث بنجاح:', result.changes);
            return result.changes;

        } catch (error) {
            console.error('❌ [DB] خطأ في التحديث:', error);
            ErrorHandler.handleError(error, 'DB_ERROR', { table, data, where });
            throw error;
        }
    }

    /**
     * تنفيذ استعلام حذف
     * @param {string} table - اسم الجدول
     * @param {Object} where - شروط الحذف
     */
    async delete(table, where) {
        console.log('🗑️ [DB] حذف بيانات من:', table);

        try {
            // تجهيز الاستعلام
            const whereColumns = Object.keys(where).map(key => `${key} = ?`);
            const values = Object.values(where);

            const query = `
                DELETE FROM ${table}
                WHERE ${whereColumns.join(' AND ')}
            `;

            // تنفيذ الحذف
            const result = await ipcRenderer.invoke('db-run', query, values);

            console.log('✅ [DB] تم الحذف بنجاح:', result.changes);
            return result.changes;

        } catch (error) {
            console.error('❌ [DB] خطأ في الحذف:', error);
            ErrorHandler.handleError(error, 'DB_ERROR', { table, where });
            throw error;
        }
    }

    /**
     * إضافة استعلام مخزن
     * @param {string} name - اسم الاستعلام
     * @param {string} query - نص الاستعلام
     */
    addStoredQuery(name, query) {
        this.queries.set(name, query);
    }

    /**
     * إضافة ترحيل
     * @param {string} version - رقم الإصدار
     * @param {Object} migration - كائن الترحيل
     */
    addMigration(version, migration) {
        this.migrations.set(version, migration);
    }

    /**
     * تنظيف قاعدة البيانات
     */
    async vacuum() {
        try {
            await ipcRenderer.invoke('db-run', 'VACUUM');
            console.log('🧹 [DB] تم تنظيف قاعدة البيانات');
        } catch (error) {
            console.error('❌ [DB] خطأ في تنظيف قاعدة البيانات:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseManager();