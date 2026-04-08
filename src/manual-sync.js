const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { buildRemoteServiceUrl } = require('./remote-service-url');

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

// Check if sync is enabled
try {
    const settingRow = db.prepare("SELECT setting_value FROM system_settings WHERE category = 'general' AND setting_key = 'sync_enabled'").get();
    if (settingRow && settingRow.setting_value === 'false') {
        console.log('⛔ [SYNC] Sync is disabled. Skipping manual sync.');
        console.log('Enable sync in settings to sync data to cloud.');
        process.exit(0);
    }
} catch (e) {
    // If table doesn't exist, continue with sync
}

// 3. Read Data
console.log('🔄 Reading data...');
try {
    const admins = db.prepare('SELECT * FROM admins').all();
    const branches = db.prepare('SELECT * FROM branches').all();
    const cashiers = db.prepare('SELECT * FROM cashiers').all();
    const accountants = db.prepare('SELECT * FROM accountants').all();
    const atms = db.prepare('SELECT * FROM atms').all();
    const branch_cashboxes = db.prepare('SELECT * FROM branch_cashboxes').all();
    const cashbox_vouchers = db.prepare('SELECT * FROM cashbox_vouchers ORDER BY id DESC').all();
    const cashbox_voucher_audit_log = db.prepare('SELECT * FROM cashbox_voucher_audit_log ORDER BY id DESC').all();

    // 4. Prepare Payload
    const payload = {
        admins,
        branches,
        cashiers,
        accountants,
        atms,
        branch_cashboxes,
        cashbox_vouchers,
        cashbox_voucher_audit_log,
        active_branch_cashboxes_ids: branch_cashboxes.map(row => row.id),
        active_cashbox_vouchers_ids: cashbox_vouchers.map(row => row.id),
        active_cashbox_voucher_audit_log_ids: cashbox_voucher_audit_log.map(row => row.id)
    };

    console.log(`📊 Found:
    - ${admins.length} Admins
    - ${branches.length} Branches
    - ${cashiers.length} Cashiers
    - ${accountants.length} Accountants
    - ${atms.length} ATMs
    - ${branch_cashboxes.length} Cashboxes
    - ${cashbox_vouchers.length} Cashbox Vouchers
    - ${cashbox_voucher_audit_log.length} Cashbox Audit Logs`);

    // 5. Send to Cloud
    const REMOTE_URL = buildRemoteServiceUrl('/api/sync/users');

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
                if (Array.isArray(json.failures) && json.failures.length > 0) {
                    console.error('❌ Failed Rows:', json.failures);
                }
                console.error('Server Data:', json);
            }
        })
        .catch(err => {
            console.error('❌ Network Error:', err.message);
        });

} catch (error) {
    console.error('❌ Database Error:', error.message);
}
