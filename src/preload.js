const { contextBridge, ipcRenderer } = require('electron');

const runtimeInfo = Object.freeze({
    isElectron: true,
    processType: process.type || null,
    defaultApp: Boolean(process.defaultApp),
    argv: Array.isArray(process.argv) ? [...process.argv] : [],
    env: Object.freeze({
        NODE_ENV: process.env.NODE_ENV || null,
        ENABLE_TEST_SCRIPTS: process.env.ENABLE_TEST_SCRIPTS || null
    }),
    versions: Object.freeze({
        node: process.versions?.node || null,
        electron: process.versions?.electron || null,
        chrome: process.versions?.chrome || null
    }),
    isPackagedGuess: !process.defaultApp
        && process.env.NODE_ENV !== 'development'
        && !(Array.isArray(process.argv) && process.argv.includes('--dev'))
});

contextBridge.exposeInMainWorld('electronRuntime', runtimeInfo);

const ipcBridge = Object.freeze({
    transport: 'preload',
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args)
});

// تعريف API آمن للوصول إلى وظائف النظام
contextBridge.exposeInMainWorld('electronAPI', {
    ipc: ipcBridge,

    // عمليات دفتر العملاء
    customerLedger: {
        addTransaction: (data) => ipcRenderer.invoke('add-transaction', data),
        getStatement: (customerId) => ipcRenderer.invoke('get-customer-statement', customerId),
        printStatement: (data) => ipcRenderer.invoke('print-customer-statement', data),
        addReconciliation: (data) => ipcRenderer.invoke('add-reconciliation', data)
    },
    
    // عمليات قاعدة البيانات
    database: {
        query: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
        run: (sql, params) => ipcRenderer.invoke('db-run', sql, params),
        get: (sql, params) => ipcRenderer.invoke('db-get', sql, params),
        all: (sql, params) => ipcRenderer.invoke('db-all', sql, params),
        getCustomers: () => ipcRenderer.invoke('get-customers'),
        getTransactions: () => ipcRenderer.invoke('get-transactions')
    },
    
    // إدارة الطباعة
    printing: {
        getPrinters: () => ipcRenderer.invoke('get-printers'),
        print: (data) => ipcRenderer.invoke('print', data)
    },
    
    // إدارة النوافذ والواجهة
    ui: {
        showModal: (modalId) => ipcRenderer.invoke('show-modal', modalId),
        closeModal: (modalId) => ipcRenderer.invoke('close-modal', modalId),
        showError: (message) => ipcRenderer.invoke('show-error', message),
        showSuccess: (message) => ipcRenderer.invoke('show-success', message)
    },
    
    // المزامنة والتخزين المحلي
    sync: {
        syncData: () => ipcRenderer.invoke('sync-data'),
        getStatus: () => ipcRenderer.invoke('get-sync-status'),
        toggle: (enabled) => ipcRenderer.invoke('toggle-sync', enabled),
        getOfflineData: () => ipcRenderer.invoke('get-offline-data'),
        saveOfflineData: (data) => ipcRenderer.invoke('save-offline-data', data)
    }
});
