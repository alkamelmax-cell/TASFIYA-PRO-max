const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const electron = require('electron');

// Try to find the DB path
// Default Electron User Data path on Windows: C:\Users\<User>\AppData\Roaming\<AppName>
const appName = 'casher'; // From package.json "name"
const userDataPath = path.join(process.env.APPDATA, appName);
const dbPath = path.join(userDataPath, 'casher.db');

console.log('Checking database at:', dbPath);

try {
    const db = new Database(dbPath, { fileMustExist: true });

    // 1. Get total count
    const count = db.prepare('SELECT COUNT(*) as count FROM reconciliations').get().count;
    console.log('Total Reconciliations Count:', count);

    // 2. Get Max Reconciliation Number
    const maxNum = db.prepare('SELECT MAX(reconciliation_number) as max FROM reconciliations').get().max;
    console.log('Max Reconciliation Number:', maxNum);

    // 3. Find duplicates
    const duplicates = db.prepare(`
        SELECT reconciliation_number, COUNT(*) as c 
        FROM reconciliations 
        WHERE reconciliation_number IS NOT NULL 
        GROUP BY reconciliation_number 
        HAVING c > 1
    `).all();

    if (duplicates.length > 0) {
        console.log('⚠️ Found Duplicate Numbers:', duplicates);
    } else {
        console.log('✅ No duplicate numbers found.');
    }

    // 4. Find NULL numbers
    const nulls = db.prepare(`
        SELECT id, status, created_at FROM reconciliations WHERE reconciliation_number IS NULL
    `).all();

    if (nulls.length > 0) {
        console.log('⚠️ Found records with NULL number:', nulls);
    } else {
        console.log('✅ No records with NULL number found.');
    }

    // 5. Look for gaps or extra records
    if (count > maxNum) {
        console.log('❌ Count is greater than Max Number! Analyzing...');
        // Query to find if there are multiple records with same ID? Impossible (PK).
        // Maybe ID != Reconciliation Number.
        const all = db.prepare('SELECT id, reconciliation_number FROM reconciliations ORDER BY reconciliation_number ASC').all();
        // Check for double usage?
    }

} catch (error) {
    console.error('Error opening database:', error);
}
