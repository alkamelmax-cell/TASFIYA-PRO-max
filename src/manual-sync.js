const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 1. Find Database
const possiblePaths = [
    // Standard Electron UserData on Windows
    path.join(process.env.APPDATA, 'casher', 'casher.db'),
    path.join(process.env.APPDATA, 'تصفية برو - Tasfiya Pro', 'casher.db'),
    path.join(process.env.APPDATA, 'Tasfiya Pro', 'casher.db'),

    // Dev environment (local data folder?)
    path.join(__dirname, '..', 'data', 'casher.db'),
    path.join(process.cwd(), 'data', 'casher.db')
];

let dbPath = possiblePaths.find(p => fs.existsSync(p));

if (!dbPath) {
    console.error('❌ Error: Could not find local database file!');
    console.log('Checked paths:', possiblePaths);
    process.exit(1);
}

console.log('✅ Found local database at:', dbPath);

// 2. Open Database
const db = new Database(dbPath, { readonly: true }); // Read only to be safe

// 3. Read Data
console.log('🔄 Reading data...');
try {
    const admins = db.prepare('SELECT * FROM admins').all();
    const branches = db.prepare('SELECT * FROM branches').all();
    const cashiers = db.prepare('SELECT * FROM cashiers').all();
    const accountants = db.prepare('SELECT * FROM accountants').all();
    const atms = db.prepare('SELECT * FROM atms').all();

    // 4. Prepare Payload
    const payload = {
        admins, branches, cashiers, accountants, atms
    };

    console.log(`📊 Found:
    - ${admins.length} Admins
    - ${branches.length} Branches
    - ${cashiers.length} Cashiers
    - ${accountants.length} Accountants
    - ${atms.length} ATMs`);

    // 5. Send to Cloud
    const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users';

    console.log('🚀 Sending data to Cloud (' + REMOTE_URL + ')...');

    fetch(REMOTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async res => {
            const json = await res.json();
            if (json.success) {
                console.log('✅✅ SYNC SUCCESSFUL! ✅✅');
                console.log('Users and branches are now on the website.');
            } else {
                console.error('❌ Sync Failed:', json.error);
                console.error('Server Data:', json);
            }
        })
        .catch(err => {
            console.error('❌ Network Error:', err.message);
        });

} catch (error) {
    console.error('❌ Database Error:', error.message);
}
