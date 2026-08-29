// ===================================================
// 🔄 معالجات الحركات اليدوية - Manual Transactions Handlers
// ===================================================
const { ipcMain } = require('electron');

module.exports = function setupManualTransactionsHandlers(dbManager) {
    // إضافة حركة يدوية
    ipcMain.handle('add-manual-transaction', async (event, data) => {
        const { customerName, customerCode = '', customerId = null, branchId = null, type, amount, reason, date } = data;
        
        try {
            let customerIdentity = null;
            const numericCustomerId = Number(customerId);
            if (Number.isFinite(numericCustomerId) && numericCustomerId > 0) {
                customerIdentity = await dbManager.get(
                    'SELECT id, customer_name, customer_code, branch_id FROM customers WHERE id = ?',
                    [numericCustomerId]
                );
            }

            if (!customerIdentity && customerName && typeof dbManager.ensureCustomerRegistryRecord === 'function') {
                customerIdentity = await dbManager.ensureCustomerRegistryRecord({
                    customerName,
                    customerCode,
                    branchId
                });
            }

            if (type === 'receipt') {
                await dbManager.run(
                    'INSERT INTO manual_customer_receipts (customer_id, customer_name, customer_code, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        customerIdentity?.id || null,
                        customerIdentity?.customer_name || customerName,
                        customerIdentity?.customer_code || String(customerCode || '').trim().toUpperCase(),
                        amount,
                        reason,
                        date
                    ]
                );
            } else if (type === 'postpaid') {
                await dbManager.run(
                    'INSERT INTO manual_postpaid_sales (customer_id, customer_name, customer_code, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        customerIdentity?.id || null,
                        customerIdentity?.customer_name || customerName,
                        customerIdentity?.customer_code || String(customerCode || '').trim().toUpperCase(),
                        amount,
                        reason,
                        date
                    ]
                );
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error adding manual transaction:', error);
            return { success: false, error: error.message };
        }
    });

    // الحصول على الحركات اليدوية
    ipcMain.handle('get-manual-transactions', async (event, { customerName, dateFrom, dateTo }) => {
        try {
            let dateFilter = '';
            const params = [customerName];
            
            if (dateFrom && dateTo) {
                dateFilter = 'AND created_at BETWEEN ? AND ?';
                params.push(dateFrom, dateTo);
            }
            
            // الحصول على المبيعات الآجلة اليدوية
            const postpaidSales = await dbManager.all(`
                SELECT amount, 'postpaid' as type, created_at, reason
                FROM manual_postpaid_sales
                WHERE customer_name = ? ${dateFilter}
            `, params);
            
            // الحصول على المقبوضات اليدوية
            const receipts = await dbManager.all(`
                SELECT amount, 'receipt' as type, created_at, reason
                FROM manual_customer_receipts
                WHERE customer_name = ? ${dateFilter}
            `, params);
            
            // دمج وترتيب النتائج حسب التاريخ
            return [...postpaidSales, ...receipts].sort((a, b) => 
                new Date(a.created_at) - new Date(b.created_at)
            );
        } catch (error) {
            console.error('Error getting manual transactions:', error);
            return [];
        }
    });
};
