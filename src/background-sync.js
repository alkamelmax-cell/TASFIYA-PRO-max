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

            // Sync EXTENSIVE history (Last 10,000 records essentially all)
            const reconciliations = db.prepare(`
                SELECT * FROM reconciliations 
                WHERE status = 'completed'
                ORDER BY id DESC 
                LIMIT 10000
            `).all();

            // Get IDs for detail fetching
            const recIds = reconciliations.map(r => r.id);
            const recIdsParams = recIds.length ? recIds.join(',') : null;

            let cash_receipts = [];
            let bank_receipts = [];

            // Manual entries (Independent)
            const manual_postpaid_sales = db.prepare('SELECT * FROM manual_postpaid_sales ORDER BY id DESC LIMIT 2000').all();
            const manual_customer_receipts = db.prepare('SELECT * FROM manual_customer_receipts ORDER BY id DESC LIMIT 2000').all();

            // Customer Normal Entries (Sync More History for Ledger) - Independent of Rec Limit
            // We fetch last 5000 records to ensure we cover old debts
            const postpaid_sales = db.prepare('SELECT * FROM postpaid_sales ORDER BY id DESC LIMIT 5000').all();
            const customer_receipts = db.prepare('SELECT * FROM customer_receipts ORDER BY id DESC LIMIT 5000').all();

            if (recIdsParams) {
                // Fetch details for ALL synced reconciliations
                cash_receipts = db.prepare(`SELECT * FROM cash_receipts WHERE reconciliation_id IN (${recIdsParams})`).all();
                // ATM Reports associated with synced reconciliations
                bank_receipts = db.prepare(`SELECT * FROM bank_receipts WHERE reconciliation_id IN (${recIdsParams})`).all();
            }

            // Prepare Payload with ALL details
            const payload = {
                admins, branches, cashiers, accountants, atms, reconciliations,
                cash_receipts, bank_receipts,
                postpaid_sales, customer_receipts, // Sent independently
                manual_postpaid_sales, manual_customer_receipts
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
