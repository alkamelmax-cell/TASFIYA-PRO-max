const Database = require('better-sqlite3');
const path = require('path');
const os = require('os'); // To get home dir

// Adjust path based on your user data location logic
// Usually: C:\Users\KC\AppData\Roaming\casher\casher.db ? 
// Or user provided info: "casher.db" in AppData/Roaming/... (Electron default)

// Let's try to find the db path. In main.js/database.js it uses app.getPath('userData').
// On Windows usually: C:\Users\USERNAME\AppData\Roaming\AppName
// AppName from package.json name or "casher" based on paths.

// I will try the standard Electron path for 'casher'
const dbPath = path.join(process.env.APPDATA, 'casher', 'casher.db');

console.log('Trying DB Path:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });

    // 1. Check Tables
    console.log('\n--- Tables ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('postpaid_sales', 'reconciliations', 'cash_reconciliations', 'cashiers')").all();
    console.log(tables);

    const recTable = tables.find(t => t.name === 'reconciliations') ? 'reconciliations' : 'cash_reconciliations';
    console.log('\nUsing Reconciliation Table:', recTable);

    // 2. Sample Postpaid Sale
    console.log('\n--- Sample Postpaid Sale ---');
    const sale = db.prepare('SELECT * FROM postpaid_sales LIMIT 1').get();
    console.log(sale);

    if (sale) {
        // 3. Try Join
        console.log('\n--- Join Test ---');
        const query = `
            SELECT 
                ps.id, 
                ps.amount, 
                r.id as rec_id,
                r.cashier_id,
                c.name as cashier_name
            FROM postpaid_sales ps 
            LEFT JOIN ${recTable} r ON ps.reconciliation_id = r.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            WHERE ps.id = ?
        `;
        const joined = db.prepare(query).get(sale.id);
        console.log(joined);
    } else {
        console.log('No sales found.');
    }

} catch (e) {
    console.error('Error:', e.message);
}
