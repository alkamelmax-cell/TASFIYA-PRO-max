const Dexie = require('dexie');

// إنشاء قاعدة بيانات محلية
let db = null;
let dbInitialized = false;

// دالة لتهيئة قاعدة البيانات
async function initializeDatabase() {
    if (dbInitialized) return;
    
    try {
        db = new Dexie('TasfiyaProOfflineDB');
        
        // تعريف هيكل قاعدة البيانات
        db.version(1).stores({
            reconciliations: '++id, date, cashierId, status, synced',
            bankReceipts: '++id, reconciliationId, amount, type, synced',
            cashReceipts: '++id, reconciliationId, amount, category, synced',
            postpaidSales: '++id, reconciliationId, amount, customer, synced',
            customerReceipts: '++id, reconciliationId, amount, customer, synced',
            returnInvoices: '++id, reconciliationId, amount, details, synced',
            syncQueue: '++id, operation, table, data, timestamp'
        });
        
        // فتح قاعدة البيانات
        await db.open();
        dbInitialized = true;
        console.log('✅ تم تهيئة قاعدة البيانات المحلية بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات المحلية:', error);
        dbInitialized = false;
        throw error;
    }
}

// وظائف التخزين المحلي
const OfflineStorage = {
    /**
     * حفظ البيانات في التخزين المحلي
     */
    async saveData(table, data) {
        try {
            await initializeDatabase();
            data.synced = false;
            const id = await db[table].add(data);
            await this.addToSyncQueue('add', table, data);
            return id;
        } catch (error) {
            console.error('خطأ في حفظ البيانات محلياً:', error);
            throw error;
        }
    },

    /**
     * تحديث البيانات في التخزين المحلي
     */
    async updateData(table, id, data) {
        try {
            await initializeDatabase();
            data.synced = false;
            await db[table].update(id, data);
            await this.addToSyncQueue('update', table, { ...data, id });
        } catch (error) {
            console.error('خطأ في تحديث ال��يانات محلياً:', error);
            throw error;
        }
    },

    /**
     * استرجاع البيانات من التخزين المحلي
     */
    async getData(table, id) {
        try {
            await initializeDatabase();
            return await db[table].get(id);
        } catch (error) {
            console.error('خطأ في استرجاع البيانات محلياً:', error);
            throw error;
        }
    },

    /**
     * استرجاع كل البيانات غير المتزامنة
     */
    async getUnsyncedData(table) {
        try {
            await initializeDatabase();
            return await db[table].where('synced').equals(false).toArray();
        } catch (error) {
            console.error('خطأ في استرجاع البيانات غير المتزامنة:', error);
            throw error;
        }
    },

    /**
     * إضافة عملية إلى قائمة المزامنة
     */
    async addToSyncQueue(operation, table, data) {
        try {
            await initializeDatabase();
            await db.syncQueue.add({
                operation,
                table,
                data,
                timestamp: new Date().getTime()
            });
        } catch (error) {
            console.error('خطأ في إضافة العملية لقائمة المزامنة:', error);
            throw error;
        }
    },

    /**
     * مزامنة البيانات مع الخادم عند عودة الاتصال
     */
    async syncWithServer() {
        try {
            await initializeDatabase();
        } catch (error) {
            console.error('❌ فشل في تهيئة قاعدة البيانات:', error);
            return;
        }
        
        const queue = await db.syncQueue.toArray();
        for (const item of queue) {
            try {
                // محاولة مزامنة البيانات مع الخادم
                await this.performSync(item);
                // حذف العملية من قائمة الانتظار بعد نجاح المزامنة
                await db.syncQueue.delete(item.id);
                // تحديث حالة المزامنة للبيانات
                if (item.data.id) {
                    await db[item.table].update(item.data.id, { synced: true });
                }
            } catch (error) {
                console.error('خطأ في مزامنة البيانات:', error);
                // الاحتفاظ بالعملية في القائمة للمحاولة لاحقاً
            }
        }
    },

    /**
     * تنفيذ عملية المزامنة مع الخادم
     */
    async performSync(syncItem) {
        // هنا يتم تنفيذ المزامنة الفعلية مع الخادم
        // يمكن استخدام fetch أو axios للاتصال بالخادم
        // TODO: تنفيذ الاتصال بالخادم
    },

    /**
     * التحقق من حالة الاتصال
     */
    isOnline() {
        return navigator.onLine;
    },

    /**
     * تهيئة مراقبي حالة الاتصال
     */
    initConnectionListeners() {
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    },

    /**
     * معالج حدث الاتصال
     */
    async handleOnline() {
        console.log('تم استعادة الاتصال بالإنترنت');
        document.dispatchEvent(new CustomEvent('connectionChanged', { detail: true }));
        await this.syncWithServer();
    },

    /**
     * معالج حدث قطع الاتصال
     */
    handleOffline() {
        console.log('تم فقد الاتصال بالإنترنت');
        document.dispatchEvent(new CustomEvent('connectionChanged', { detail: false }));
    }
};

module.exports = OfflineStorage;
