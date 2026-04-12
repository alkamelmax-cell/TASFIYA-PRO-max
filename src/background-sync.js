const { app } = require('electron');

const { ipcMain } = require('electron');
const fetch = require('node-fetch');
const { buildCashboxVoucherSyncKey } = require('./app/cashbox-voucher-utils');

// Configuration
const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users'; // Ensure this matches your Render URL
const SYNC_INTERVAL_MS = 30000; // 30 seconds

class BackgroundSync {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.interval = null;
        this.isSyncing = false;
        this.enabled = true; // Global flag to control sync
    }

    /**
     * Set sync enabled/disabled
     * @param {boolean} enabled - Whether sync is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`🔄 [SYNC] Sync ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if sync is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
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
        if (!this.enabled) {
            console.log('⛔ [SYNC] Force sync blocked - sync is disabled');
            return;
        }
        console.log('⚡ [SYNC] Force sync triggered...');
        this.doSync();
    }

    get isRunning() {
        return !!this.interval;
    }

    async doSync() {
        if (!this.enabled) {
            console.log('⛔ [SYNC] Sync attempt blocked - sync is disabled');
            return;
        }
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const db = this.dbManager.db;
            try {
                await this.pushLocalData(db);
            } catch (pushError) {
                console.error('⚠️ [SYNC] Push phase failed:', pushError.message);
            }

            try {
                await this.fetchRemoteRequests(db);
            } catch (pullError) {
                console.error('⚠️ [SYNC] Pull phase failed:', pullError.message);
            }
        } catch (error) {
            console.error('⚠️ [SYNC] Error:', error.message);
        } finally {
            this.isSyncing = false;
        }
    }

    async pushLocalData(db) {
        // --- PUSH: Upload Local Data ---

        // 1. Fetch Lookups (Small data, send all at once)
        const admins = db.prepare('SELECT * FROM admins').all();
        const branches = db.prepare('SELECT * FROM branches').all();
        const cashiers = db.prepare('SELECT * FROM cashiers').all();
        const accountants = db.prepare('SELECT * FROM accountants').all();
        const atms = db.prepare('SELECT * FROM atms').all();
        const branch_cashboxes = db.prepare('SELECT * FROM branch_cashboxes').all();

        console.log(`🔍 [SYNC] Local counts: admins=${admins.length}, branches=${branches.length}, cashiers=${cashiers.length}, accountants=${accountants.length}, atms=${atms.length}, branch_cashboxes=${branch_cashboxes.length}`);

        await this.sendPayload({ admins, branches, cashiers, accountants, atms, branch_cashboxes });

        // 2. Mirror Sync: Send ALL active IDs first to allow server to clean up deleted records
        // This is the robust way to handle deletions without risking data loss during chunked upload
        const idTables = [
            'reconciliations',
            'postpaid_sales',
            'customer_receipts',
            'manual_postpaid_sales',
            'manual_customer_receipts',
            'cash_receipts',
            'bank_receipts',
            'branch_cashboxes',
            'cashbox_vouchers',
            'cashbox_voucher_audit_log'
        ];

        const allIdsPayload = {};
        let hasIds = false;
        const activeBranchCashboxBranchIds = [...new Set(
            branch_cashboxes
                .map((row) => Number(row.branch_id))
                .filter((branchId) => Number.isInteger(branchId) && branchId > 0)
        )];
        const activeCashboxVoucherSyncKeys = [...new Set(
            db.prepare('SELECT * FROM cashbox_vouchers').all()
                .map((row) => buildCashboxVoucherSyncKey(row))
                .filter((syncKey) => typeof syncKey === 'string' && syncKey.trim() !== '')
        )];

        for (const table of idTables) {
            try {
                const ids = db.prepare(`SELECT id FROM ${table}`).all().map(r => r.id);
                if (ids.length > 0) {
                    allIdsPayload[`active_${table}_ids`] = ids;
                    hasIds = true;
                }
            } catch (e) { console.error(`Error fetching IDs for ${table}:`, e.message); }
        }

        if (activeBranchCashboxBranchIds.length > 0) {
            allIdsPayload.active_branch_cashboxes_branch_ids = activeBranchCashboxBranchIds;
            hasIds = true;
        }

        if (activeCashboxVoucherSyncKeys.length > 0) {
            allIdsPayload.active_cashbox_voucher_sync_keys = activeCashboxVoucherSyncKeys;
            hasIds = true;
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

        const cashbox_vouchers = db.prepare('SELECT * FROM cashbox_vouchers ORDER BY id DESC').all();
        await this.sendInBatches('cashbox_vouchers', cashbox_vouchers, 500);

        const cashbox_voucher_audit_log = db.prepare('SELECT * FROM cashbox_voucher_audit_log ORDER BY id DESC').all();
        await this.sendInBatches('cashbox_voucher_audit_log', cashbox_voucher_audit_log, 500);

        // 5. Push Reconciliation Requests Status Updates
        const reconciliation_requests = db.prepare('SELECT * FROM reconciliation_requests').all();
        if (reconciliation_requests && reconciliation_requests.length > 0) {
            console.log(`📤 [SYNC] Pushing ${reconciliation_requests.length} reconciliation requests...`);
            await this.sendPayload({ reconciliation_requests });
        }

        console.log('✅ [SYNC] Push completed successfully');
    }

    // Helper: Send a specific payload
    async sendPayload(payload) {
        // Check if sync is enabled before sending
        if (!this.enabled) {
            console.log('⛔ [SYNC] sendPayload blocked - sync is disabled');
            return;
        }

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
            const responseJson = await res.json().catch(() => null);
            if (responseJson && responseJson.success === false) {
                const failureSummary = Array.isArray(responseJson.failures) && responseJson.failures.length > 0
                    ? ` | Failures: ${responseJson.failures.map(item => `${item.table}#${item.id ?? '?'}`).join(', ')}`
                    : '';
                throw new Error(`${responseJson.error || 'SYNC_FAILED'}${failureSummary}`);
            }
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
                        id, cashier_id, request_date, system_sales,
                        total_cash, total_bank, status, details_json,
                        notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const updateStmt = db.prepare(`
                    UPDATE reconciliation_requests 
                    SET cashier_id = ?, request_date = ?, system_sales = ?,
                        total_cash = ?, total_bank = ?, status = ?,
                        details_json = ?, notes = ?, created_at = ?, updated_at = ?
                    WHERE id = ?
                `);

                let newCount = 0;
                let updateCount = 0;
                const existingIds = new Set(
                    db.prepare('SELECT id FROM reconciliation_requests').all().map(r => r.id)
                );

                const writeRequests = db.transaction((remoteRequests) => {
                    remoteRequests.forEach((request) => {
                        let details = '{}';
                        if (request.details && typeof request.details === 'object') {
                            details = JSON.stringify(request.details);
                        } else if (request.details_json) {
                            details = request.details_json;
                        }

                        const requestDate = request.request_date || request.created_at || null;
                        const systemSales = Number(request.system_sales || 0);
                        const totalCash = Number(request.total_cash || 0);
                        const totalBank = Number(request.total_bank || 0);
                        const updatedAt = request.updated_at || request.created_at || null;

                        if (existingIds.has(request.id)) {
                            updateStmt.run(
                                request.cashier_id,
                                requestDate,
                                systemSales,
                                totalCash,
                                totalBank,
                                request.status,
                                details,
                                request.notes || '',
                                request.created_at || null,
                                updatedAt,
                                request.id
                            );
                            updateCount++;
                            return;
                        }

                        insertStmt.run(
                            request.id,
                            request.cashier_id,
                            requestDate,
                            systemSales,
                            totalCash,
                            totalBank,
                            request.status,
                            details,
                            request.notes || '',
                            request.created_at || null,
                            updatedAt
                        );
                        newCount++;
                    });
                });

                writeRequests(requests);

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
        syncInstance.setEnabled(false);
    }
}

function getSyncStatus() {
    return syncInstance ? syncInstance.isRunning : false;
}

function getSyncEnabled() {
    return syncInstance ? syncInstance.isEnabled() : true;
}

function setSyncEnabled(enabled) {
    if (syncInstance) {
        syncInstance.setEnabled(enabled);
        console.log(`🔄 [SYNC] Global sync ${enabled ? 'enabled' : 'disabled'}`);
    }
}

function triggerInstantSync() {
    if (syncInstance) {
        syncInstance.forceSyncNow();
    }
}

module.exports = {
    BackgroundSync,
    startBackgroundSync,
    stopBackgroundSync,
    getSyncStatus,
    getSyncEnabled,
    setSyncEnabled,
    triggerInstantSync
};
