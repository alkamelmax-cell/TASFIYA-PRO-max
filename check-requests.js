const Database = require('better-sqlite3');
const db = new Database('./database.db');

console.log('=== آخر 5 طلبات تصفية ===\n');

const requests = db.prepare(`
    SELECT id, cashier_id, request_date, system_sales, total_cash, total_bank, status, created_at 
    FROM reconciliation_requests 
    ORDER BY id DESC 
    LIMIT 5
`).all();

if (requests.length === 0) {
    console.log('❌ لا توجد أي طلبات في قاعدة البيانات!');
} else {
    requests.forEach(req => {
        console.log(`ID: ${req.id}`);
        console.log(`Cashier ID: ${req.cashier_id}`);
        console.log(`Date: ${req.request_date}`);
        console.log(`System Sales: ${req.system_sales}`);
        console.log(`Total Cash: ${req.total_cash}`);
        console.log(`Total Bank: ${req.total_bank}`);
        console.log(`Status: ${req.status}`);
        console.log(`Created At: ${req.created_at}`);
        console.log('-------------------\n');
    });
}

db.close();
