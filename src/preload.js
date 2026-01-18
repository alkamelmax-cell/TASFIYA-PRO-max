const { contextBridge, ipcRenderer } = require('electron');

// تعريف API آمن للوصول إلى وظائف النظام
contextBridge.exposeInMainWorld('electronAPI', {
    // عمليات دفتر العملاء
    customerLedger: {
        addTransaction: (data) => ipcRenderer.invoke('add-transaction', data),
        getStatement: (customerId) => ipcRenderer.invoke('get-customer-statement', customerId),
        printStatement: (data) => ipcRenderer.invoke('print-customer-statement', data),
        addReconciliation: (data) => ipcRenderer.invoke('add-reconciliation', data)
    },
    
    // عمليات قاعدة البيانات
    database: {
        query: (sql, params) => ipcRenderer.invoke('db-query', { sql, params }),
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
        getOfflineData: () => ipcRenderer.invoke('get-offline-data'),
        saveOfflineData: (data) => ipcRenderer.invoke('save-offline-data', data)
    }
});
