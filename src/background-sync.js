const { app } = require('electron');

const { ipcMain } = require('electron');
const fetch = require('node-fetch');

// Configuration
const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users'; // Ensure this matches your Render URL
const SYNC_INTERVAL_MS = 30000; // 30 seconds

class BackgroundSync {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.interval = null;
        this.isSyncing = false;
    }

    start() {
        if (this.interval) clearInterval(this.interval);
        console.log('🔄 [SYNC] Background sync started...');
        this.interval = setInterval(() => this.doSync(), SYNC_INTERVAL_MS);
        this.doSync(); // Run immediately on start
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('⏹️ [SYNC] Background sync stopped.');
    }

    // Force immediate sync (for instant updates on critical events)
    forceSyncNow() {
        console.log('⚡ [SYNC] Force sync triggered...');
        this.doSync();
    }

    get isRunning() {
        return !!this.interval;
    }

    async doSync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const db = this.dbManager.db;

            // --- PUSH: Upload Local Data ---

            // 1. Fetch Lookups (Small data, send all at once)
            const admins = db.prepare('SELECT * FROM admins').all();
            const branches = db.prepare('SELECT * FROM branches').all();
            const cashiers = db.prepare('SELECT * FROM cashiers').all();
            const accountants = db.prepare('SELECT * FROM accountants').all();
            const atms = db.prepare('SELECT * FROM atms').all();

            console.log(`🔍 [SYNC] Local counts: admins=${admins.length}, branches=${branches.length}, cashiers=${cashiers.length}, accountants=${accountants.length}, atms=${atms.length}`);

            await this.sendPayload({ admins, branches, cashiers, accountants, atms });

            // 2. Mirror Sync: Send ALL active IDs first to allow server to clean up deleted records
            // This is the robust way to handle deletions without risking data loss during chunked upload
            const idTables = [
                'reconciliations',
                'postpaid_sales',
                'customer_receipts',
                'manual_postpaid_sales',
                'manual_customer_receipts',
                'cash_receipts',
                'bank_receipts'
            ];

            const allIdsPayload = {};
            let hasIds = false;

            for (const table of idTables) {
                try {
                    const ids = db.prepare(`SELECT id FROM ${table}`).all().map(r => r.id);
                    if (ids.length > 0) {
                        allIdsPayload[`active_${table}_ids`] = ids;
                        hasIds = true;
                    }
                } catch (e) { console.error(`Error fetching IDs for ${table}:`, e.message); }
            }

            if (hasIds) {
                console.log('🧹 [SYNC] Sending ID lists for mirror cleanup...');
                // We send this as a separate payload type so the server knows it's an ID list, not full data
                await this.sendPayload(allIdsPayload);
            }

            // 3. Fetch & Send Reconciliations (Chunked) - ALL History
            const reconciliations = db.prepare("SELECT * FROM reconciliations ORDER BY id DESC").all();
            await this.sendInBatches('reconciliations', reconciliations, 200);

            // 3. Fetch & Send Details (Chunked) - Independent Full History
            const manual_postpaid_sales = db.prepare('SELECT * FROM manual_postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('manual_postpaid_sales', manual_postpaid_sales, 500);

            const manual_customer_receipts = db.prepare('SELECT * FROM manual_customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('manual_customer_receipts', manual_customer_receipts, 500);

            const postpaid_sales = db.prepare('SELECT * FROM postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('postpaid_sales', postpaid_sales, 500);

            const customer_receipts = db.prepare('SELECT * FROM customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('customer_receipts', customer_receipts, 500);

            // 4. Fetch Details Linked to Reconciliations
            const cash_receipts = db.prepare('SELECT * FROM cash_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('cash_receipts', cash_receipts, 500);

            const bank_receipts = db.prepare('SELECT * FROM bank_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('bank_receipts', bank_receipts, 500);

            // 5. Push Reconciliation Requests Status Updates
            const reconciliation_requests = db.prepare('SELECT * FROM reconciliation_requests').all();
            if (reconciliation_requests && reconciliation_requests.length > 0) {
                console.log(`📤 [SYNC] Pushing ${reconciliation_requests.length} reconciliation requests...`);
                await this.sendPayload({ reconciliation_requests });
            }

            console.log('✅ [SYNC] Push completed successfully');

            // --- PULL: Fetch Remote Requests (Reconciliation Requests) ---
            await this.fetchRemoteRequests(db);

        } catch (error) {
            console.error('⚠️ [SYNC] Error:', error.message);
        } finally {
            this.isSyncing = false;
        }
    }

    // Helper: Send a specific payload
    async sendPayload(payload) {
        // Filter out empty arrays to save bandwidth
        const dataToSend = {};
        let hasData = false;
        for (const key in payload) {
            if (payload[key] && payload[key].length > 0) {
                dataToSend[key] = payload[key];
                hasData = true;
            }
        }

        // Enhanced logging
        if (Object.keys(dataToSend).length > 0) {
            console.log(`📤 [SYNC] Sending: ${Object.keys(dataToSend).map(k => `${k}(${dataToSend[k].length})`).join(', ')}`);
        }

        if (!hasData) {
            console.log('⚠️ [SYNC] sendPayload called but all arrays empty');
            return;
        }

        try {
            const res = await fetch(REMOTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });
            if (!res.ok) throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
            console.log(`✅ [SYNC] Server accepted: ${Object.keys(dataToSend).join(', ')}`);
        } catch (e) {
            console.error(`❌ [SYNC] Error sending ${Object.keys(dataToSend).join(', ')}:`, e.message);
            throw e;
        }
    }

    // Helper: Split array into chunks and send
    async sendInBatches(key, items, batchSize = 500) {
        if (!items || items.length === 0) return;

        console.log(`📦 [SYNC] Syncing ${key} (${items.length} items)...`);

        for (let i = 0; i < items.length; i += batchSize) {
            const chunk = items.slice(i, i + batchSize);
            await this.sendPayload({ [key]: chunk });
            await new Promise(r => setTimeout(r, 100));
        }
    }

    // Helper: Pull Requests from Web
    async fetchRemoteRequests(db) {
        try {
            // Adjust URL to point to GET /api/reconciliation-requests
            // BASE URL is https://tasfiya-pro-max.onrender.com/api/sync/users
            // We need https://tasfiya-pro-max.onrender.com/api/reconciliation-requests
            const reqUrl = REMOTE_URL.replace('/sync/users', '/reconciliation-requests');
            console.log(`📥 [SYNC] Pulling requests from: ${reqUrl}`);

            const res = await fetch(reqUrl);
            if (!res.ok) {
                console.error(`❌ [SYNC] Pull failed: ${res.status} ${res.statusText}`);
                return;
            }

            const json = await res.json();
            console.log(`📥 [SYNC] Pull Response: ${json.data ? json.data.length : 0} items found`);

            if (json.success && json.data && Array.isArray(json.data)) {
                const requests = json.data;
                const insertStmt = db.prepare(`
                    INSERT OR IGNORE INTO reconciliation_requests (
                        id, cashier_id, status, notes, details_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `);

                const updateStmt = db.prepare(`
                    UPDATE reconciliation_requests 
                    SET status = ?, notes = ?, details_json = ? 
                    WHERE id = ?
                `);

                let newCount = 0;
                let updateCount = 0;
                const existingIds = db.prepare('SELECT id FROM reconciliation_requests').all().map(r => r.id);

                db.transaction(() => {
                    requests.forEach(r => {
                        let details = '{}';
                        if (r.details && typeof r.details === 'object') {
                            details = JSON.stringify(r.details);
                        } else if (r.details_json) {
                            details = r.details_json;
                        }



                        if (existingIds.includes(r.id)) {
                            updateStmt.run(r.status, r.notes, details, r.id);
                            updateCount++;
                        } else {
                            insertStmt.run(r.id, r.cashier_id, r.status, r.notes, details, r.created_at);
                            newCount++;
                        }
                    });
                })();

                if (newCount > 0 || updateCount > 0) {
                    console.log(`✅ [SYNC] Pulled requests: ${newCount} new, ${updateCount} updated.`);
                }

            }
        } catch (e) {
            console.error('⚠️ [SYNC] Failed to fetch requests:', e.message);
        }
    }
}

// Wrapper for backward compatibility (Singleton pattern)
let syncInstance = null;

function startBackgroundSync(dbManager) {
    if (!syncInstance) {
        if (!dbManager) return;
        syncInstance = new BackgroundSync(dbManager);
    }
    if (!syncInstance.isRunning) {
        syncInstance.start();
    }
}

function stopBackgroundSync() {
    if (syncInstance) {
        syncInstance.stop();
    }
}

function getSyncStatus() {
    return syncInstance ? syncInstance.isRunning : false;
}

function triggerInstantSync() {
    if (syncInstance) {
        syncInstance.forceSyncNow();
    }
}

module.exports = { startBackgroundSync, stopBackgroundSync, getSyncStatus, triggerInstantSync };
