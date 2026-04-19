const { app } = require('electron');

const { ipcMain } = require('electron');
const fetch = require('node-fetch');

// Configuration
const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users'; // Ensure this matches your Render URL
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SEND_RETRY_DELAYS_MS = [700, 1500, 3000];
const DEFAULT_SYNC_BATCH_SIZE = 100;
const RECONCILIATION_SYNC_BATCH_SIZE = 50;

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

    async safePushStep(label, fn) {
        try {
            await fn();
        } catch (error) {
            console.error(`⚠️ [SYNC] ${label} step failed:`, error.message);
        }
    }

    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    parseInteger(value) {
        if (value === null || value === undefined || value === '') return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        return Math.trunc(numeric);
    }

    parseNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    toOptionalText(value) {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim();
        return normalized.length > 0 ? normalized : null;
    }

    normalizeRequestDetailsPayload(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'string') {
            const normalized = value.trim();
            return normalized.length > 0 ? normalized : null;
        }

        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (_error) {
                return null;
            }
        }

        return null;
    }

    hasMeaningfulRequestDetailsPayload(value) {
        const normalized = this.normalizeRequestDetailsPayload(value);
        return Boolean(normalized) && !['{}', '[]', 'null'].includes(normalized);
    }

    buildCashboxVoucherSyncKey(voucher, localCashboxToBranchMap = new Map()) {
        const localCashboxId = this.parseInteger(voucher?.cashbox_id);
        let branchId = this.parseInteger(voucher?.branch_id);
        if (branchId === null && localCashboxId !== null && localCashboxToBranchMap.has(localCashboxId)) {
            branchId = localCashboxToBranchMap.get(localCashboxId);
        }
        if (branchId === null) {
            return null;
        }

        const explicitSyncKey = this.toOptionalText(voucher?.sync_key);
        if (explicitSyncKey) return explicitSyncKey;

        const sourceReconciliationId = this.parseInteger(voucher?.source_reconciliation_id);
        const sourceEntryKey = this.toOptionalText(voucher?.source_entry_key);
        if (sourceReconciliationId !== null && sourceEntryKey) {
            return `recon:${sourceReconciliationId}:${sourceEntryKey}`;
        }

        const voucherType = this.toOptionalText(voucher?.voucher_type) || 'unknown';
        const voucherSequence = this.parseInteger(voucher?.voucher_sequence_number);
        if (voucherSequence !== null) {
            return `seq:${branchId}:${voucherType}:${voucherSequence}`;
        }

        const voucherNumber = this.parseInteger(voucher?.voucher_number);
        if (voucherNumber !== null) {
            return `num:${branchId}:${voucherType}:${voucherNumber}`;
        }

        const voucherDate = this.toOptionalText(voucher?.voucher_date) || 'na';
        const amount = this.parseNumber(voucher?.amount, 0);
        const counterpartyType = this.toOptionalText(voucher?.counterparty_type) || 'na';
        const counterpartyName = this.toOptionalText(voucher?.counterparty_name) || 'na';
        const createdAt = this.toOptionalText(voucher?.created_at) || 'na';
        const localId = this.toOptionalText(voucher?.id) || 'na';
        return `fallback:${branchId}:${voucherType}:${voucherDate}:${amount}:${counterpartyType}:${counterpartyName}:${createdAt}:${localId}`;
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
        const cashbox_vouchers = db.prepare('SELECT * FROM cashbox_vouchers ORDER BY id DESC').all();

        console.log(`🔍 [SYNC] Local counts: admins=${admins.length}, branches=${branches.length}, cashiers=${cashiers.length}, accountants=${accountants.length}, atms=${atms.length}, branch_cashboxes=${branch_cashboxes.length}`);

        await this.sendPayload({ admins, branches, cashiers, accountants, atms, branch_cashboxes });

        const localCashboxToBranchMap = new Map();
        branch_cashboxes.forEach((row) => {
            const localCashboxId = this.parseInteger(row?.id);
            const branchId = this.parseInteger(row?.branch_id);
            if (localCashboxId !== null && branchId !== null) {
                localCashboxToBranchMap.set(localCashboxId, branchId);
            }
        });

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

        for (const table of idTables) {
            try {
                const ids = db.prepare(`SELECT id FROM ${table}`).all().map(r => r.id);
                if (ids.length > 0) {
                    allIdsPayload[`active_${table}_ids`] = ids;
                    hasIds = true;
                }
            } catch (e) { console.error(`Error fetching IDs for ${table}:`, e.message); }
        }

        // Cashbox cleanup on Render should be keyed by branch_id, not local SQLite id.
        const activeBranchCashboxBranchIds = branch_cashboxes
            .map(row => row && row.branch_id)
            .filter(branchId => Number.isFinite(Number(branchId)))
            .map(branchId => Number(branchId));
        allIdsPayload.active_branch_cashboxes_branch_ids = activeBranchCashboxBranchIds;
        hasIds = true;

        const activeCashboxVoucherSyncKeys = Array.from(
            new Set(
                cashbox_vouchers
                    .map((voucher) => this.buildCashboxVoucherSyncKey(voucher, localCashboxToBranchMap))
                    .filter((value) => typeof value === 'string' && value.length > 0)
            )
        );
        allIdsPayload.active_cashbox_voucher_sync_keys = activeCashboxVoucherSyncKeys;
        hasIds = true;

        if (hasIds) {
            console.log('🧹 [SYNC] Sending ID lists for mirror cleanup...');
            // We send this as a separate payload type so the server knows it's an ID list, not full data
            await this.sendPayload(allIdsPayload, { preserveEmptyArrays: true });
        }

        // 3. High-priority cashbox mirror first (faster web consistency under heavy sync load)
        await this.safePushStep('cashbox_vouchers', async () => {
            await this.sendInBatches('cashbox_vouchers', cashbox_vouchers, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('cashbox_voucher_audit_log', async () => {
            const cashbox_voucher_audit_log = db.prepare('SELECT * FROM cashbox_voucher_audit_log ORDER BY id DESC').all();
            await this.sendInBatches('cashbox_voucher_audit_log', cashbox_voucher_audit_log, DEFAULT_SYNC_BATCH_SIZE);
        });

        // 4. Fetch & send the rest of history
        await this.safePushStep('reconciliations', async () => {
            const reconciliations = db.prepare('SELECT * FROM reconciliations ORDER BY id DESC').all();
            await this.sendInBatches('reconciliations', reconciliations, RECONCILIATION_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('manual_postpaid_sales', async () => {
            const manual_postpaid_sales = db.prepare('SELECT * FROM manual_postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('manual_postpaid_sales', manual_postpaid_sales, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('manual_customer_receipts', async () => {
            const manual_customer_receipts = db.prepare('SELECT * FROM manual_customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('manual_customer_receipts', manual_customer_receipts, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('postpaid_sales', async () => {
            const postpaid_sales = db.prepare('SELECT * FROM postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('postpaid_sales', postpaid_sales, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('customer_receipts', async () => {
            const customer_receipts = db.prepare('SELECT * FROM customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('customer_receipts', customer_receipts, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('cash_receipts', async () => {
            const cash_receipts = db.prepare('SELECT * FROM cash_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('cash_receipts', cash_receipts, DEFAULT_SYNC_BATCH_SIZE);
        });

        await this.safePushStep('bank_receipts', async () => {
            const bank_receipts = db.prepare('SELECT * FROM bank_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('bank_receipts', bank_receipts, DEFAULT_SYNC_BATCH_SIZE);
        });

        // 5. Push Reconciliation Requests Status Updates
        await this.safePushStep('reconciliation_requests', async () => {
            const reconciliation_requests = db.prepare('SELECT * FROM reconciliation_requests').all();
            if (reconciliation_requests && reconciliation_requests.length > 0) {
                console.log(`📤 [SYNC] Pushing ${reconciliation_requests.length} reconciliation requests...`);
                await this.sendInBatches('reconciliation_requests', reconciliation_requests, DEFAULT_SYNC_BATCH_SIZE);
            }
        });

        console.log('✅ [SYNC] Push completed successfully');
    }

    // Helper: Send a specific payload
    async sendPayload(payload, options = {}) {
        // Check if sync is enabled before sending
        if (!this.enabled) {
            console.log('⛔ [SYNC] sendPayload blocked - sync is disabled');
            return;
        }

        const preserveEmptyArrays = Boolean(options.preserveEmptyArrays);

        // Filter out empty arrays to save bandwidth
        const dataToSend = {};
        let hasData = false;
        for (const key in payload) {
            const value = payload[key];
            if (Array.isArray(value)) {
                if (value.length > 0 || preserveEmptyArrays) {
                    dataToSend[key] = value;
                    hasData = true;
                }
                continue;
            }

            if (value && value.length > 0) {
                dataToSend[key] = value;
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

        const payloadKeys = Object.keys(dataToSend).join(', ');
        let lastError = null;

        for (let attempt = 0; attempt <= SEND_RETRY_DELAYS_MS.length; attempt++) {
            try {
                const res = await fetch(REMOTE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataToSend)
                });

                if (!res.ok) {
                    const isTransient = TRANSIENT_HTTP_STATUSES.has(res.status);
                    if (isTransient && attempt < SEND_RETRY_DELAYS_MS.length) {
                        const waitMs = SEND_RETRY_DELAYS_MS[attempt];
                        console.warn(`⚠️ [SYNC] Transient HTTP ${res.status} while sending ${payloadKeys}, retrying in ${waitMs}ms...`);
                        await this.delay(waitMs);
                        continue;
                    }
                    throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
                }

                const responseJson = await res.json().catch(() => null);
                if (responseJson && responseJson.success === false) {
                    const failureSummary = Array.isArray(responseJson.failures) && responseJson.failures.length > 0
                        ? ` | Failures: ${responseJson.failures.map(item => `${item.table}#${item.id ?? '?'}`).join(', ')}`
                        : '';
                    throw new Error(`${responseJson.error || 'SYNC_FAILED'}${failureSummary}`);
                }

                console.log(`✅ [SYNC] Server accepted: ${payloadKeys}`);
                return;
            } catch (e) {
                lastError = e;
                if (attempt < SEND_RETRY_DELAYS_MS.length) {
                    const waitMs = SEND_RETRY_DELAYS_MS[attempt];
                    console.warn(`⚠️ [SYNC] Send attempt ${attempt + 1} failed for ${payloadKeys}: ${e.message}. Retrying in ${waitMs}ms...`);
                    await this.delay(waitMs);
                    continue;
                }
                break;
            }
        }

        console.error(`❌ [SYNC] Error sending ${payloadKeys}:`, lastError ? lastError.message : 'Unknown error');
        throw lastError || new Error(`Failed sending ${payloadKeys}`);
    }

    // Helper: Split array into chunks and send
    async sendInBatches(key, items, batchSize = DEFAULT_SYNC_BATCH_SIZE) {
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
            const reqUrl = REMOTE_URL.replace('/sync/users', '/reconciliation-requests?status=all&include_deleted=1&include_details=raw');
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
                const existingDetailsById = new Map(
                    db.prepare('SELECT id, details_json FROM reconciliation_requests').all().map((row) => [row.id, row.details_json || null])
                );

                const writeRequests = db.transaction((remoteRequests) => {
                    remoteRequests.forEach((request) => {
                        const incomingDetails = this.normalizeRequestDetailsPayload(
                            request.details && typeof request.details === 'object'
                                ? request.details
                                : request.details_json
                        );
                        const existingDetails = existingDetailsById.get(request.id) || null;
                        const details = this.hasMeaningfulRequestDetailsPayload(incomingDetails)
                            ? incomingDetails
                            : (this.normalizeRequestDetailsPayload(existingDetails) || incomingDetails || '{}');

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
                            existingDetailsById.set(request.id, details);
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
                        existingDetailsById.set(request.id, details);
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
