const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'casher.db');
const db = new Database(dbPath);

console.log('--- Branches Table Content ---');
try {
    const branches = db.prepare('SELECT * FROM branches').all();
    console.log(`Row count: ${branches.length}`);
    console.log(branches);
} catch (error) {
    console.error('Error reading branches:', error.message);
}

console.log('\n--- ATMs Table Content (checking branch_id) ---');
try {
    const atms = db.prepare('SELECT id, name, branch_id, location FROM atms').all();
    console.log(`Row count: ${atms.length}`);
    console.log(atms);
} catch (error) {
    console.error('Error reading atms:', error.message);
}
