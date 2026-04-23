const Dexie = require('dexie');

const OFFLINE_DB_NAME = 'TasfiyaProOfflineDB';
const OFFLINE_DB_NAME_KEY = 'tasfiya_offline_db_name';
const OFFLINE_DB_SCHEMA = {
    reconciliations: '++id, date, cashierId, status, synced',
    bankReceipts: '++id, reconciliationId, amount, type, synced',
    cashReceipts: '++id, reconciliationId, amount, category, synced',
    postpaidSales: '++id, reconciliationId, amount, customer, synced',
    customerReceipts: '++id, reconciliationId, amount, customer, synced',
    returnInvoices: '++id, reconciliationId, amount, details, synced',
    syncQueue: '++id, operation, table, data, timestamp'
};

// إنشاء قاعدة بيانات محلية
let db = null;
let dbInitialized = false;
let dbInitPromise = null;
let dbRecoveryAttempted = false;
let storageUnavailable = false;
let storageUnavailableLogged = false;
let connectionListenersInitialized = false;
let syncInProgress = false;

function getLocalStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
    }
    return null;
}

function getStoredOfflineDbName() {
    const storage = getLocalStorage();
    if (!storage || typeof storage.getItem !== 'function') {
        return '';
    }
    return storage.getItem(OFFLINE_DB_NAME_KEY) || '';
}

function setStoredOfflineDbName(name) {
    const storage = getLocalStorage();
    if (!storage || typeof storage.setItem !== 'function') {
        return;
    }
    storage.setItem(OFFLINE_DB_NAME_KEY, name);
}

function clearStoredOfflineDbName() {
    const storage = getLocalStorage();
    if (!storage || typeof storage.removeItem !== 'function') {
        return;
    }
    storage.removeItem(OFFLINE_DB_NAME_KEY);
}

function getOfflineDbName() {
    const storedName = getStoredOfflineDbName();
    return storedName || OFFLINE_DB_NAME;
}

function createOfflineDatabaseInstance(nameOverride) {
    const dbName = nameOverride || getOfflineDbName();
    const instance = new Dexie(dbName);
    instance.version(1).stores(OFFLINE_DB_SCHEMA);
    return instance;
}

function isLikelyIndexedDbCorruption(error) {
    const errorText = `${error && error.name ? error.name : ''} ${error && error.message ? error.message : ''}`.toLowerCase();
    return (
        errorText.includes('unknownerror')
        || errorText.includes('internal error')
        || errorText.includes('operation failed')
        || errorText.includes('database is malformed')
        || errorText.includes('idb')
    );
}

function resetDatabaseHandle() {
    if (db && typeof db.isOpen === 'function' && db.isOpen()) {
        db.close();
    }
    db = null;
    dbInitialized = false;
}

function logStorageUnavailableOnce(context, error) {
    if (storageUnavailableLogged) {
        return;
    }
    storageUnavailableLogged = true;
    console.error(`❌ التخزين المحلي غير متاح (${context})`, error);
}

async function recoverCorruptedDatabase(originalError) {
    if (dbRecoveryAttempted) {
        return false;
    }

    dbRecoveryAttempted = true;

    try {
        console.warn('⚠️ محاولة إصلاح قاعدة البيانات المحلية التالفة...');
        resetDatabaseHandle();
        const currentDbName = getOfflineDbName();

        try {
            await Dexie.delete(currentDbName);
        } catch (deleteError) {
            console.warn('⚠️ تعذر حذف قاعدة البيانات المحلية مباشرةً:', deleteError);
        }

        try {
            const recoveredDb = createOfflineDatabaseInstance(currentDbName);
            await recoveredDb.open();
            db = recoveredDb;
            dbInitialized = true;
            storageUnavailable = false;
            storageUnavailableLogged = false;
            if (currentDbName === OFFLINE_DB_NAME) {
                clearStoredOfflineDbName();
            } else {
                setStoredOfflineDbName(currentDbName);
            }
            console.warn('✅ تمت إعادة إنشاء قاعدة البيانات المحلية بنجاح');
            return true;
        } catch (openError) {
            const fallbackName = `${OFFLINE_DB_NAME}_recovered_${Date.now()}`;
            console.warn('⚠️ محاولة إنشاء قاعدة بديلة:', fallbackName);
            const fallbackDb = createOfflineDatabaseInstance(fallbackName);
            await fallbackDb.open();
            db = fallbackDb;
            dbInitialized = true;
            storageUnavailable = false;
            storageUnavailableLogged = false;
            setStoredOfflineDbName(fallbackName);
            console.warn('✅ تم إنشاء قاعدة بيانات محلية بديلة بنجاح');
            return true;
        }
    } catch (recoveryError) {
        console.error('❌ فشل إصلاح قاعدة البيانات المحلية:', {
            originalError,
            recoveryError
        });
        return false;
    }
}

// دالة لتهيئة قاعدة البيانات
async function initializeDatabase() {
    if (dbInitialized && db) {
        return true;
    }

    if (storageUnavailable) {
        return false;
    }

    if (dbInitPromise) {
        return dbInitPromise;
    }

    dbInitPromise = (async () => {
        try {
            const candidateDb = createOfflineDatabaseInstance();
            await candidateDb.open();
            db = candidateDb;
            dbInitialized = true;
            storageUnavailable = false;
            storageUnavailableLogged = false;
            console.log('✅ تم تهيئة قاعدة البيانات المحلية بنجاح');
            return true;
        } catch (error) {
            resetDatabaseHandle();

            if (isLikelyIndexedDbCorruption(error)) {
                const recovered = await recoverCorruptedDatabase(error);
                if (recovered) {
                    return true;
                }
            }

            storageUnavailable = true;
            logStorageUnavailableOnce('initialize', error);
            return false;
        } finally {
            dbInitPromise = null;
        }
    })();

    return dbInitPromise;
}

async function ensureDatabaseReady(operationName) {
    const isReady = await initializeDatabase();
    if (!isReady || !db) {
        const unavailableError = new Error('LOCAL_DB_UNAVAILABLE');
        unavailableError.code = 'LOCAL_DB_UNAVAILABLE';
        unavailableError.operation = operationName;
        throw unavailableError;
    }
    return db;
}

function isStorageUnavailableError(error) {
    return !!(error && (error.code === 'LOCAL_DB_UNAVAILABLE' || String(error.message || '').includes('LOCAL_DB_UNAVAILABLE')));
}

// وظائف التخزين المحلي
const OfflineStorage = {
    /**
     * حفظ البيانات في التخزين المحلي
     */
    async saveData(table, data) {
        try {
            const localDb = await ensureDatabaseReady('saveData');
            const row = { ...data, synced: false };
            const id = await localDb[table].add(row);
            await this.addToSyncQueue('add', table, row);
            return id;
        } catch (error) {
            if (isStorageUnavailableError(error)) {
                logStorageUnavailableOnce('saveData', error);
            }
            console.error('خطأ في حفظ البيانات محلياً:', error);
            throw error;
        }
    },

    /**
     * تحديث البيانات في التخزين المحلي
     */
    async updateData(table, id, data) {
        try {
            const localDb = await ensureDatabaseReady('updateData');
            const updatedRow = { ...data, synced: false };
            await localDb[table].update(id, updatedRow);
            await this.addToSyncQueue('update', table, { ...data, id });
        } catch (error) {
            if (isStorageUnavailableError(error)) {
                logStorageUnavailableOnce('updateData', error);
            }
            console.error('خطأ في تحديث البيانات محلياً:', error);
            throw error;
        }
    },

    /**
     * استرجاع البيانات من التخزين المحلي
     */
    async getData(table, id) {
        try {
            const localDb = await ensureDatabaseReady('getData');
            return await localDb[table].get(id);
        } catch (error) {
            if (isStorageUnavailableError(error)) {
                return null;
            }
            console.error('خطأ في استرجاع البيانات محلياً:', error);
            throw error;
        }
    },

    /**
     * استرجاع كل البيانات غير المتزامنة
     */
    async getUnsyncedData(table) {
        try {
            const localDb = await ensureDatabaseReady('getUnsyncedData');
            return await localDb[table].where('synced').equals(false).toArray();
        } catch (error) {
            if (isStorageUnavailableError(error)) {
                return [];
            }
            console.error('خطأ في استرجاع البيانات غير المتزامنة:', error);
            throw error;
        }
    },

    /**
     * إضافة عملية إلى قائمة المزامنة
     */
    async addToSyncQueue(operation, table, data) {
        try {
            const localDb = await ensureDatabaseReady('addToSyncQueue');
            await localDb.syncQueue.add({
                operation,
                table,
                data,
                timestamp: new Date().getTime()
            });
        } catch (error) {
            if (isStorageUnavailableError(error)) {
                logStorageUnavailableOnce('addToSyncQueue', error);
            }
            console.error('خطأ في إضافة العملية لقائمة المزامنة:', error);
            throw error;
        }
    },

    /**
     * مزامنة البيانات مع الخادم عند عودة الاتصال
     */
    async syncWithServer() {
        if (syncInProgress) {
            return {
                success: false,
                reason: 'sync_in_progress'
            };
        }

        syncInProgress = true;

        try {
        const isReady = await initializeDatabase();
        if (!isReady || !db) {
            return {
                success: false,
                reason: 'local_db_unavailable'
            };
        }

        let syncedCount = 0;
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
                syncedCount += 1;
            } catch (error) {
                console.error('خطأ في مزامنة البيانات:', error);
                // الاحتفاظ بالعملية في القائمة للمحاولة لاحقاً
            }
        }

        return {
            success: true,
            syncedCount,
            queuedCount: queue.length
        };
        } finally {
            syncInProgress = false;
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
        if (typeof navigator === 'undefined') {
            return false;
        }
        return navigator.onLine;
    },

    /**
     * تهيئة مراقبي حالة الاتصال
     */
    initConnectionListeners() {
        if (connectionListenersInitialized) {
            return;
        }
        if (typeof window === 'undefined') {
            return;
        }
        connectionListenersInitialized = true;
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    },

    /**
     * معالج حدث الاتصال
     */
    async handleOnline() {
        console.log('تم استعادة الاتصال بالإنترنت');
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('connectionChanged', { detail: true }));
        }
        await this.syncWithServer();
    },

    /**
     * معالج حدث قطع الاتصال
     */
    handleOffline() {
        console.log('تم فقد الاتصال بالإنترنت');
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('connectionChanged', { detail: false }));
        }
    }
};

module.exports = OfflineStorage;
