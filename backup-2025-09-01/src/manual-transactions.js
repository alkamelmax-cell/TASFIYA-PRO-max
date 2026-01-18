// ===================================================
// 📘 معالج الحركات اليدوية - Manual Transactions Handler
// ===================================================
const { ipcRenderer } = require('electron');

// إضافة حركة يدوية جديدة
async function addManualTransaction(data) {
    try {
        const { customerName, type, amount, reason, date } = data;
        
        // تحديث قاعدة البيانات
        const result = await ipcRenderer.invoke('add-manual-transaction', {
            customerName,
            type,
            amount,
            reason,
            date: date || new Date().toISOString()
        });
        
        return result;
    } catch (error) {
        console.error('Error adding manual transaction:', error);
        throw error;
    }
}

// الحصول على الحركات اليدوية لعميل
async function getManualTransactions(customerName, dateFrom, dateTo) {
    try {
        return await ipcRenderer.invoke('get-manual-transactions', {
            customerName,
            dateFrom,
            dateTo
        });
    } catch (error) {
        console.error('Error getting manual transactions:', error);
        return [];
    }
}

module.exports = {
    addManualTransaction,
    getManualTransactions
};