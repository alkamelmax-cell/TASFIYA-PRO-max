const { validateQueryParams, sanitizeSql, validateId } = require('./validators');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

class DataAccessLayer {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * تهيئة اتصال قاعدة البيانات
     */
    async initialize() {
        try {
            // فتح اتصال قاعدة البيانات
            this.db = await open({
                filename: path.join(__dirname, '../data/database.db'),
                driver: sqlite3.Database
            });

            // تمكين القيود الخارجية
            await this.db.run('PRAGMA foreign_keys = ON');
            
            // تعيين وضع القراءة المتزامنة
            await this.db.run('PRAGMA journal_mode = WAL');
            
            this.isInitialized = true;
            console.log('✅ تم تهيئة طبقة الوصول للبيانات بنجاح');
            return true;
        } catch (error) {
            console.error('❌ خطأ في تهيئة طبقة الوصول للبيانات:', error);
            return false;
        }
    }

    /**
     * التحقق من حالة الاتصال
     */
    checkConnection() {
        if (!this.isInitialized || !this.db) {
            throw new Error('لم يتم تهيئة اتصال قاعدة البيانات');
        }
    }

    /**
     * تنفيذ استعلام آمن
     * @param {string} sql - استعلام SQL
     * @param {Array} params - معلمات الاستعلام
     */
    async query(sql, params = []) {
        this.checkConnection();
        
        try {
            // تنظيف وتأمين الاستعلام
            const cleanSql = sanitizeSql(sql);
            const cleanParams = validateQueryParams(params);

            // تنفيذ الاستعلام
            return await this.db.all(cleanSql, cleanParams);
        } catch (error) {
            console.error('❌ خطأ في تنفيذ الاستعلام:', error);
            throw new Error(`فشل تنفيذ الاستعلام: ${error.message}`);
        }
    }

    /**
     * تنفيذ عملية آمنة على قاعدة البيانات
     * @param {string} sql - استعلام SQL
     * @param {Array} params - معلمات الاستعلام
     */
    async execute(sql, params = []) {
        this.checkConnection();
        
        try {
            // تنظيف وتأمين الاستعلام
            const cleanSql = sanitizeSql(sql);
            const cleanParams = validateQueryParams(params);

            // تنفيذ العملية
            return await this.db.run(cleanSql, cleanParams);
        } catch (error) {
            console.error('❌ خطأ في تنفيذ العملية:', error);
            throw new Error(`فشل تنفيذ العملية: ${error.message}`);
        }
    }

    /**
     * بدء معاملة جديدة
     */
    async beginTransaction() {
        this.checkConnection();
        await this.execute('BEGIN TRANSACTION');
    }

    /**
     * تأكيد المعاملة
     */
    async commit() {
        this.checkConnection();
        await this.execute('COMMIT');
    }

    /**
     * التراجع عن المعاملة
     */
    async rollback() {
        this.checkConnection();
        await this.execute('ROLLBACK');
    }

    /**
     * إغلاق اتصال قاعدة البيانات
     */
    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }

    // عمليات خاصة بالعملاء
    async getCustomerById(id) {
        const { error } = validateId(id);
        if (error) throw new Error(error.message);

        return await this.query(
            'SELECT * FROM customers WHERE id = ?',
            [id]
        );
    }

    async getCustomerByName(name) {
        return await this.query(
            'SELECT * FROM customers WHERE customer_name = ?',
            [name]
        );
    }

    async searchCustomers(searchTerm, limit = 10) {
        return await this.query(
            `SELECT * FROM customers 
             WHERE customer_name LIKE ? 
             LIMIT ?`,
            [`%${searchTerm}%`, limit]
        );
    }

    // عمليات خاصة بالتصفيات
    async getReconciliationById(id) {
        const { error } = validateId(id);
        if (error) throw new Error(error.message);

        return await this.query(
            'SELECT * FROM reconciliations WHERE id = ?',
            [id]
        );
    }

    async getReconciliations(filters = {}) {
        let sql = 'SELECT * FROM reconciliations WHERE 1=1';
        const params = [];

        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.dateRange) {
            sql += ' AND reconciliation_date BETWEEN ? AND ?';
            params.push(filters.dateRange.start, filters.dateRange.end);
        }

        if (filters.cashierId) {
            sql += ' AND cashier_id = ?';
            params.push(filters.cashierId);
        }

        return await this.query(sql, params);
    }

    // عمليات خاصة بالمعاملات
    async addTransaction(transactionData) {
        await this.beginTransaction();
        
        try {
            // إدراج المعاملة
            const result = await this.execute(
                `INSERT INTO transactions 
                (customer_id, amount, type, notes, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))`,
                [
                    transactionData.customerId,
                    transactionData.amount,
                    transactionData.type,
                    transactionData.notes
                ]
            );

            // تحديث رصيد العميل
            await this.execute(
                `UPDATE customers 
                SET balance = balance + ? 
                WHERE id = ?`,
                [transactionData.amount, transactionData.customerId]
            );

            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }
}

module.exports = DataAccessLayer;