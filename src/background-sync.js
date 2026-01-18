const { app } = require('electron');

/**
 * Starts the background sync service.
 * @param {Object} dbManager - The initialized DatabaseManager instance.
 */
function startBackgroundSync(dbManager) {
    if (!dbManager) {
        console.error('❌ [SYNC] Database Manager is missing. Sync disabled.');
        return;
    }

    const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users';
    const SYNC_INTERVAL_MS = 30000; // 30 seconds

    console.log(`🔄 [SYNC] Background Service Started (Interval: ${SYNC_INTERVAL_MS / 1000}s)`);
    console.log(`🔗 [SYNC] Remote URL: ${REMOTE_URL}`);

    async function doSync() {
        try {
            // Check internet connection implicitly via fetch

            // Access the better-sqlite3 instance
            const db = dbManager.db;
            if (!db) return;

            // Read Data
            // We use try-catch specifically for DB read to avoid crashing app on lock
            const admins = db.prepare('SELECT * FROM admins').all();
            const branches = db.prepare('SELECT * FROM branches').all();
            const cashiers = db.prepare('SELECT * FROM cashiers').all();
            const accountants = db.prepare('SELECT * FROM accountants').all();
            const atms = db.prepare('SELECT * FROM atms').all();

            // Prepare Payload
            const payload = {
                admins, branches, cashiers, accountants, atms
            };

            // Send to Cloud
            const res = await fetch(REMOTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    console.log(`✅ [SYNC] Success: ${new Date().toLocaleTimeString()} - Sent ${cashiers.length} cashiers.`);
                } else {
                    console.warn(`⚠️ [SYNC] Partial Success / Server Error: ${json.error}`);
                }
            } else {
                console.warn(`⚠️ [SYNC] HTTP Error: ${res.status} ${res.statusText}`);
            }

        } catch (e) {
            // Log quietly to avoid spamming if offline
            if (e.cause && (e.cause.code === 'ENOTFOUND' || e.cause.code === 'ECONNREFUSED')) {
                // Offline
            } else {
                console.error('❌ [SYNC] Error:', e.message);
            }
        }
    }

    // Run immediately once
    doSync();

    // Schedule
    setInterval(doSync, SYNC_INTERVAL_MS);
}

module.exports = { startBackgroundSync };
