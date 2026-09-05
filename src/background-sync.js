const { app } = require('electron');

const { ipcMain } = require('electron');
const crypto = require('crypto');
const fetch = require('node-fetch');

// Configuration
// لا نستخدم رابطاً افتراضياً قديماً هنا. وجهة المزامنة يجب أن تأتي من إعدادات التطبيق
// حتى لا يرسل سطح المكتب بياناته بصمت إلى خادم سابق بعد تغيير الرابط.
const DEFAULT_REMOTE_URL = '';
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const FULL_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly safety refresh
const MIRROR_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily deletion audit
const REQUEST_FULL_PULL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_PULL_OVERLAP_MS = 2 * 60 * 1000;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SEND_RETRY_DELAYS_MS = [700, 1500, 3000];
const NON_RETRYABLE_PAYLOAD_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_SYNC_BATCH_SIZE = 100;
const RECONCILIATION_SYNC_BATCH_SIZE = 50;
const REQUEST_PULL_TIMEOUT_MS = 15000;
const SYNC_POST_TIMEOUT_MS = 45000;

const SYNC_META_KEYS = {
    sourceId: 'sync-client:source-id',
    remoteUrl: 'background-sync:remote-url',
    lastFullRefreshAt: 'background-sync:last-full-refresh-at',
    lastMirrorCleanupAt: 'background-sync:last-mirror-cleanup-at',
    lastRequestPullAt: 'background-sync:requests:last-pull-at',
    lastRequestFullPullAt: 'background-sync:requests:last-full-pull-at',
    lastRequestId: 'background-sync:requests:last-id'
};

const MIRROR_ID_TABLES = [
    'reconciliations',
    'postpaid_sales',
    'customer_receipts',
    'manual_postpaid_sales',
    'manual_customer_receipts',
    'customer_fiscal_opening_balances',
    'cash_receipts',
    'bank_receipts',
    'return_invoices',
    'suppliers',
    'branch_cashboxes',
    'cashbox_vouchers',
    'cashbox_voucher_audit_log'
];

const EXPLICIT_DELETE_ID_TABLES = new Set([
    'reconciliations',
    'postpaid_sales',
    'customer_receipts',
    'manual_postpaid_sales',
    'manual_customer_receipts',
    'customer_fiscal_opening_balances',
    'cash_receipts',
    'bank_receipts',
    'return_invoices',
    'suppliers'
]);

function stableSerialize(value) {
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const keys = Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value === undefined ? null : value);
}

function hashRow(row) {
    return crypto.createHash('sha256').update(stableSerialize(row || {})).digest('hex');
}

function hashPayload(payload) {
    return crypto.createHash('sha256').update(stableSerialize(payload || {})).digest('hex');
}

function subtractIsoDate(value, offsetMs) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(Math.max(0, timestamp - offsetMs)).toISOString();
}

function normalizeRequestStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) {
        return 'pending';
    }

    if (['completed', 'approved', 'مكتملة', 'معتمدة'].includes(normalized)) {
        return 'completed';
    }

    if (['deleted', 'محذوف', 'محذوفة'].includes(normalized)) {
        return 'deleted';
    }

    if (['pending', 'معلقة', 'قيد الانتظار'].includes(normalized)) {
        return 'pending';
    }

    return normalized;
}

function resolvePulledRequestStatus(localStatus, remoteStatus) {
    const local = normalizeRequestStatus(localStatus);
    const remote = normalizeRequestStatus(remoteStatus);

    if (local === 'deleted' || remote === 'deleted') {
        return 'deleted';
    }

    if (local === 'completed' && remote === 'pending') {
        return 'completed';
    }

    return remote || local || 'pending';
}

function normalizeRemoteSyncUrl(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return '';
    }

    try {
        const parsedUrl = new URL(rawValue);
        if (parsedUrl.protocol !== 'https:') {
            return '';
        }

        parsedUrl.hash = '';
        parsedUrl.search = '';
        let pathname = parsedUrl.pathname.replace(/\/+$/, '');
        pathname = pathname
            .replace(/\/api\/sync\/users$/i, '')
            .replace(/\/api$/i, '')
            .replace(/\/+$/, '');

        const originAndBasePath = `${parsedUrl.origin}${pathname && pathname !== '/' ? pathname : ''}`
            .replace(/\/+$/, '');
        return `${originAndBasePath}/api/sync/users`;
    } catch (_error) {
        return '';
    }
}

class BackgroundSync {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.interval = null;
        this.isSyncing = false;
        this.syncPromise = null;
        this.enabled = true; // Global flag to control sync
        this.requestPullPromise = null;
        this.syncStateWarningShown = false;
        this.nonRetryablePayloads = new Map();
        this.lastResolvedRemoteUrl = null;
        this.remoteUrlMissingWarningShown = false;
        this.syncSourceId = null;
    }

    getRemoteUrl() {
        try {
            const row = this.dbManager?.db?.prepare(
                `SELECT setting_value
                 FROM system_settings
                 WHERE category = 'general'
                   AND setting_key = 'sync_server_url'
                   AND setting_value IS NOT NULL
                   AND TRIM(setting_value) <> ''
                 ORDER BY id DESC
                 LIMIT 1`
            ).get();
            const remoteUrl = normalizeRemoteSyncUrl(row?.setting_value);
            if (remoteUrl) {
                if (remoteUrl !== this.lastResolvedRemoteUrl) {
                    console.log(`🌐 [SYNC] Remote target: ${remoteUrl.replace(/\/api\/sync\/users$/i, '')}`);
                    this.lastResolvedRemoteUrl = remoteUrl;
                    this.remoteUrlMissingWarningShown = false;
                }
                return remoteUrl;
            }
        } catch (_error) {
            // تظهر رسالة واضحة في requireRemoteUrl/fetchRemoteRequests بدون الرجوع لخادم قديم.
        }
        return DEFAULT_REMOTE_URL;
    }

    requireRemoteUrl(operationName = 'sync') {
        const remoteUrl = this.getRemoteUrl();
        if (remoteUrl) {
            return remoteUrl;
        }

        const error = new Error('لم يتم ضبط رابط خادم المزامنة. افتح الإعدادات العامة واحفظ رابط الخادم الجديد.');
        error.code = 'SYNC_REMOTE_URL_MISSING';
        error.nonRetryable = true;
        error.suppressCooldown = true;
        error.operationName = operationName;
        if (!this.remoteUrlMissingWarningShown) {
            console.warn(`⚠️ [SYNC] ${error.message}`);
            this.remoteUrlMissingWarningShown = true;
        }
        throw error;
    }

    getNowIso() {
        return new Date().toISOString();
    }

    ensureSyncStateSchema(db) {
        if (!db || typeof db.exec !== 'function') {
            return false;
        }

        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS sync_row_state (
                    table_name TEXT NOT NULL,
                    row_key TEXT NOT NULL,
                    row_hash TEXT NOT NULL,
                    synced_at DATETIME NOT NULL,
                    PRIMARY KEY (table_name, row_key)
                );

                CREATE TABLE IF NOT EXISTS sync_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
            return true;
        } catch (error) {
            if (!this.syncStateWarningShown) {
                console.warn('⚠️ [SYNC] Delta sync state unavailable; falling back to full push:', error.message);
                this.syncStateWarningShown = true;
            }
            return false;
        }
    }

    readSyncMeta(db, key) {
        try {
            const row = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key);
            return row && row.value ? String(row.value) : null;
        } catch (_error) {
            return null;
        }
    }

    writeSyncMeta(db, key, value) {
        try {
            db.prepare(`
                INSERT INTO sync_metadata (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `).run(key, String(value));
        } catch (error) {
            console.warn(`⚠️ [SYNC] Failed to write sync metadata ${key}:`, error.message);
        }
    }

    getSyncSourceId() {
        if (this.syncSourceId) {
            return this.syncSourceId;
        }

        const db = this.dbManager?.db;
        if (db) {
            this.ensureSyncStateSchema(db);
            const storedSourceId = this.readSyncMeta(db, SYNC_META_KEYS.sourceId);
            if (storedSourceId && /^[A-Za-z0-9._:-]{8,160}$/.test(storedSourceId)) {
                this.syncSourceId = storedSourceId;
                return this.syncSourceId;
            }
        }

        const uniquePart = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : crypto.randomBytes(16).toString('hex');
        this.syncSourceId = `desktop:${uniquePart}`;
        if (db) {
            this.writeSyncMeta(db, SYNC_META_KEYS.sourceId, this.syncSourceId);
        }
        return this.syncSourceId;
    }

    isIntervalDue(db, key, intervalMs) {
        const lastValue = this.readSyncMeta(db, key);
        const lastTime = lastValue ? Date.parse(lastValue) : NaN;
        if (!Number.isFinite(lastTime)) {
            return true;
        }
        return Date.now() - lastTime >= intervalMs;
    }

    hasExistingSyncState(db) {
        try {
            const rowState = db.prepare('SELECT 1 AS present FROM sync_row_state LIMIT 1').get();
            if (rowState) return true;
        } catch (_error) {
            // Fall through to metadata checks.
        }

        return [
            SYNC_META_KEYS.lastFullRefreshAt,
            SYNC_META_KEYS.lastMirrorCleanupAt,
            SYNC_META_KEYS.lastRequestPullAt,
            SYNC_META_KEYS.lastRequestFullPullAt,
            SYNC_META_KEYS.lastRequestId
        ].some((key) => Boolean(this.readSyncMeta(db, key)));
    }

    readLocalMaxRequestId(db) {
        try {
            const row = db.prepare('SELECT MAX(id) AS max_id FROM reconciliation_requests').get();
            const maxId = this.parseInteger(row?.max_id);
            return maxId !== null && maxId > 0 ? maxId : null;
        } catch (_error) {
            return null;
        }
    }

    ensureRemoteSyncScope(db) {
        const currentRemoteUrl = this.getRemoteUrl();
        if (!currentRemoteUrl) {
            return false;
        }
        const previousRemoteUrl = this.readSyncMeta(db, SYNC_META_KEYS.remoteUrl);
        const changedRemote = Boolean(previousRemoteUrl) && previousRemoteUrl !== currentRemoteUrl;
        const legacyStateForAnotherRemote = !previousRemoteUrl
            && currentRemoteUrl !== DEFAULT_REMOTE_URL
            && this.hasExistingSyncState(db);

        if (changedRemote || legacyStateForAnotherRemote) {
            const resetState = () => {
                db.prepare('DELETE FROM sync_row_state').run();
                db.prepare("DELETE FROM sync_metadata WHERE key LIKE 'background-sync:%'").run();
            };

            if (typeof db.transaction === 'function') {
                db.transaction(resetState)();
            } else {
                resetState();
            }

            console.log('🔄 [SYNC] Remote server changed; rebuilding the sync baseline once.');
        }

        if (previousRemoteUrl !== currentRemoteUrl || legacyStateForAnotherRemote) {
            this.writeSyncMeta(db, SYNC_META_KEYS.remoteUrl, currentRemoteUrl);
        }

        return changedRemote || legacyStateForAnotherRemote;
    }

    loadRowStateMap(db, tableName) {
        try {
            const rows = db.prepare('SELECT row_key, row_hash FROM sync_row_state WHERE table_name = ?').all(tableName);
            return new Map(rows.map((row) => [String(row.row_key), String(row.row_hash)]));
        } catch (_error) {
            return new Map();
        }
    }

    getRowKey(tableName, row, context = {}) {
        if (!row || typeof row !== 'object') {
            return null;
        }

        if (tableName === 'cashbox_vouchers') {
            const syncKey = this.buildCashboxVoucherSyncKey(row, context.localCashboxToBranchMap || new Map());
            if (syncKey) {
                return `sync:${syncKey}`;
            }
        }

        if (tableName === 'branch_cashboxes' && row.branch_id !== null && row.branch_id !== undefined) {
            return `branch:${row.branch_id}`;
        }

        if (row.id === null || row.id === undefined || row.id === '') {
            return null;
        }

        return String(row.id);
    }

    getTableDelta(db, tableName, rows, context = {}) {
        const existingState = this.loadRowStateMap(db, tableName);
        const currentKeys = new Set();
        const changedRows = [];

        for (const row of rows) {
            const rowKey = this.getRowKey(tableName, row, context);
            if (!rowKey) {
                changedRows.push(row);
                continue;
            }

            currentKeys.add(rowKey);
            const rowHash = hashRow(row);
            if (existingState.get(rowKey) !== rowHash) {
                changedRows.push(row);
            }
        }

        const deletedKeys = Array.from(existingState.keys())
            .filter((rowKey) => !currentKeys.has(rowKey));

        return { changedRows, deletedKeys };
    }

    markRowsSynced(db, tableName, rows, context = {}) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return;
        }

        const syncedAt = this.getNowIso();
        const stmt = db.prepare(`
            INSERT INTO sync_row_state (table_name, row_key, row_hash, synced_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(table_name, row_key) DO UPDATE SET
                row_hash = excluded.row_hash,
                synced_at = excluded.synced_at
        `);

        const writeRows = (items) => {
            for (const row of items) {
                const rowKey = this.getRowKey(tableName, row, context);
                if (!rowKey) {
                    continue;
                }
                stmt.run(tableName, rowKey, hashRow(row), syncedAt);
            }
        };

        if (typeof db.transaction === 'function') {
            db.transaction(writeRows)(rows);
        } else {
            writeRows(rows);
        }
    }

    clearDeletedRowStates(db, tableName, rowKeys) {
        if (!Array.isArray(rowKeys) || rowKeys.length === 0) {
            return;
        }

        try {
            const stmt = db.prepare('DELETE FROM sync_row_state WHERE table_name = ? AND row_key = ?');
            const deleteRows = (keys) => {
                keys.forEach((rowKey) => stmt.run(tableName, rowKey));
            };

            if (typeof db.transaction === 'function') {
                db.transaction(deleteRows)(rowKeys);
            } else {
                deleteRows(rowKeys);
            }
        } catch (error) {
            console.warn(`⚠️ [SYNC] Failed to clear deleted row state for ${tableName}:`, error.message);
        }
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
    async forceSyncNow() {
        if (!this.enabled) {
            console.log('⛔ [SYNC] Force sync blocked - sync is disabled');
            return { success: false, skipped: true, reason: 'disabled' };
        }
        console.log('⚡ [SYNC] Force sync triggered...');
        return this.doSync();
    }

    get isRunning() {
        return !!this.interval;
    }

    async doSync() {
        if (!this.enabled) {
            console.log('⛔ [SYNC] Sync attempt blocked - sync is disabled');
            return { success: false, skipped: true, reason: 'disabled' };
        }
        if (this.syncPromise) {
            return this.syncPromise;
        }

        this.isSyncing = true;

        this.syncPromise = (async () => {
            const result = {
                success: true,
                pull: null,
                push: null,
                errors: []
            };

            try {
                result.pull = await this.pullRemoteRequests();
            } catch (pullError) {
                console.error('⚠️ [SYNC] Pull phase failed:', pullError.message);
                result.errors.push({ phase: 'pull', message: pullError.message });
            }

            try {
                result.push = await this.pushLocalData(this.dbManager.db);
                if (result.push && result.push.success === false) {
                    result.success = false;
                    result.errors.push({
                        phase: 'push',
                        message: `Failed tables: ${(result.push.failedTables || []).join(', ') || 'unknown'}`
                    });
                }
            } catch (pushError) {
                console.error('⚠️ [SYNC] Push phase failed:', pushError.message);
                result.success = false;
                result.errors.push({ phase: 'push', message: pushError.message });
            }

            return result;
        })();

        try {
            return await this.syncPromise;
        } finally {
            this.isSyncing = false;
            this.syncPromise = null;
        }
    }

    async safePushStep(label, fn) {
        try {
            return await fn();
        } catch (error) {
            if (error && error.suppressLog) {
                return { sentCount: 0, deletedKeys: [], failed: true };
            }
            console.error(`⚠️ [SYNC] ${label} step failed:`, error.message);
            return { sentCount: 0, deletedKeys: [], failed: true };
        }
    }

    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = SYNC_POST_TIMEOUT_MS, label = 'network request') {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeoutHandle = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : null;

        try {
            if (!controller) {
                return await fetch(url, options);
            }

            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } catch (error) {
            if (error && (error.name === 'AbortError' || error.type === 'aborted')) {
                throw new Error(`${label} timed out after ${timeoutMs}ms`);
            }
            throw error;
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
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

    async pullRemoteRequests(options = {}) {
        const allowWhenDisabled = options && options.allowWhenDisabled === true;
        if (!this.enabled && !allowWhenDisabled) {
            console.log('⛔ [SYNC] Remote request pull skipped - sync is disabled');
            return { success: false, skipped: true, reason: 'disabled' };
        }

        if (this.requestPullPromise) {
            return this.requestPullPromise;
        }

        const db = this.dbManager?.db;
        if (!db) {
            throw new Error('Database not initialized');
        }

        this.requestPullPromise = (async () => {
            const result = await this.fetchRemoteRequests(db);
            return { success: true, ...(result || {}) };
        })();

        try {
            return await this.requestPullPromise;
        } finally {
            this.requestPullPromise = null;
        }
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

    readTableRows(db, sql, label) {
        try {
            return db.prepare(sql).all();
        } catch (error) {
            console.warn(`⚠️ [SYNC] Failed reading ${label}:`, error.message);
            return [];
        }
    }

    buildLocalCashboxToBranchMap(branchCashboxes = []) {
        const localCashboxToBranchMap = new Map();
        branchCashboxes.forEach((row) => {
            const localCashboxId = this.parseInteger(row?.id);
            const branchId = this.parseInteger(row?.branch_id);
            if (localCashboxId !== null && branchId !== null) {
                localCashboxToBranchMap.set(localCashboxId, branchId);
            }
        });
        return localCashboxToBranchMap;
    }

    buildActiveIdsForTable(db, table) {
        try {
            return db.prepare(`SELECT id FROM ${table}`).all().map((row) => row.id);
        } catch (error) {
            console.error(`Error fetching IDs for ${table}:`, error.message);
            return [];
        }
    }

    buildMirrorCleanupPayload(db, cleanupTables, cachedRows = {}, context = {}) {
        const payload = {};
        const shouldIncludeAll = cleanupTables.has('*');
        const deletedStateByTable = context.deletedStateByTable instanceof Map
            ? context.deletedStateByTable
            : new Map();

        for (const table of MIRROR_ID_TABLES) {
            if (!shouldIncludeAll && !cleanupTables.has(table)) {
                continue;
            }

            payload[`active_${table}_ids`] = this.buildActiveIdsForTable(db, table);
        }

        if (shouldIncludeAll || cleanupTables.has('branch_cashboxes')) {
            const branchCashboxes = cachedRows.branch_cashboxes || this.readTableRows(db, 'SELECT * FROM branch_cashboxes', 'branch_cashboxes');
            payload.active_branch_cashboxes_branch_ids = branchCashboxes
                .map((row) => row && row.branch_id)
                .filter((branchId) => Number.isFinite(Number(branchId)))
                .map((branchId) => Number(branchId));
        }

        if (shouldIncludeAll || cleanupTables.has('cashbox_vouchers')) {
            const cashboxVouchers = cachedRows.cashbox_vouchers || this.readTableRows(db, 'SELECT * FROM cashbox_vouchers ORDER BY id DESC', 'cashbox_vouchers');
            const localCashboxToBranchMap = context.localCashboxToBranchMap || new Map();
            payload.active_cashbox_voucher_sync_keys = Array.from(
                new Set(
                    cashboxVouchers
                        .map((voucher) => this.buildCashboxVoucherSyncKey(voucher, localCashboxToBranchMap))
                        .filter((syncKey) => typeof syncKey === 'string' && syncKey.length > 0)
                )
            );
        }

        for (const [tableName, rowKeys] of deletedStateByTable.entries()) {
            if (!EXPLICIT_DELETE_ID_TABLES.has(tableName)) {
                continue;
            }

            const deletedIds = Array.from(
                new Set(
                    (Array.isArray(rowKeys) ? rowKeys : [])
                        .map((rowKey) => this.parseInteger(rowKey))
                        .filter((rowId) => rowId !== null && rowId > 0)
                )
            );

            if (deletedIds.length > 0) {
                payload[`deleted_${tableName}_ids`] = deletedIds;
            }
        }

        return payload;
    }

    async sendMirrorCleanup(db, cleanupTables, cachedRows = {}, context = {}) {
        if (!cleanupTables || cleanupTables.size === 0) {
            return false;
        }

        const payload = this.buildMirrorCleanupPayload(db, cleanupTables, cachedRows, context);
        if (Object.keys(payload).length === 0) {
            return false;
        }

        console.log(`🧹 [SYNC] Sending mirror cleanup for: ${Array.from(cleanupTables).join(', ')}`);
        await this.sendPayload(payload, { preserveEmptyArrays: true });
        return true;
    }

    async sendTableDelta(db, spec, rows, options = {}) {
        const stateAvailable = Boolean(options.stateAvailable);
        const fullRefresh = Boolean(options.fullRefresh);
        const context = options.context || {};

        if (!stateAvailable || fullRefresh) {
            await this.sendInBatches(spec.key, rows, spec.batchSize || DEFAULT_SYNC_BATCH_SIZE);
            if (stateAvailable) {
                this.markRowsSynced(db, spec.key, rows, context);
            }
            return { sentCount: rows.length, deletedKeys: [] };
        }

        const { changedRows, deletedKeys } = this.getTableDelta(db, spec.key, rows, context);
        if (changedRows.length === 0 && deletedKeys.length === 0) {
            return { sentCount: 0, deletedKeys: [] };
        }

        if (changedRows.length > 0) {
            console.log(`📦 [SYNC] ${spec.key}: ${changedRows.length}/${rows.length} changed rows`);
            await this.sendInBatches(spec.key, changedRows, spec.batchSize || DEFAULT_SYNC_BATCH_SIZE);
            this.markRowsSynced(db, spec.key, changedRows, context);
        }

        return { sentCount: changedRows.length, deletedKeys };
    }

    async pushLocalData(db) {
        const stateAvailable = this.ensureSyncStateSchema(db);
        const remoteScopeReset = stateAvailable ? this.ensureRemoteSyncScope(db) : false;
        const fullRefresh = !stateAvailable
            || remoteScopeReset
            || this.isIntervalDue(db, SYNC_META_KEYS.lastFullRefreshAt, FULL_REFRESH_INTERVAL_MS);
        const cleanupDue = !stateAvailable
            || (!remoteScopeReset && (
                fullRefresh
                || this.isIntervalDue(db, SYNC_META_KEYS.lastMirrorCleanupAt, MIRROR_CLEANUP_INTERVAL_MS)
            ));

        const tableSpecs = [
            { key: 'admins', query: 'SELECT * FROM admins', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'branches', query: 'SELECT * FROM branches', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'cashiers', query: 'SELECT * FROM cashiers', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'accountants', query: 'SELECT * FROM accountants', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'atms', query: 'SELECT * FROM atms', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'branch_cashboxes', query: 'SELECT * FROM branch_cashboxes', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'customers', query: 'SELECT * FROM customers ORDER BY id ASC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'cashbox_vouchers', query: 'SELECT * FROM cashbox_vouchers ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'cashbox_voucher_audit_log', query: 'SELECT * FROM cashbox_voucher_audit_log ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'reconciliations', query: 'SELECT * FROM reconciliations ORDER BY id DESC', batchSize: RECONCILIATION_SYNC_BATCH_SIZE },
            { key: 'manual_postpaid_sales', query: 'SELECT * FROM manual_postpaid_sales ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'manual_customer_receipts', query: 'SELECT * FROM manual_customer_receipts ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'postpaid_sales', query: 'SELECT * FROM postpaid_sales ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'customer_receipts', query: 'SELECT * FROM customer_receipts ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'customer_fiscal_opening_balances', query: 'SELECT * FROM customer_fiscal_opening_balances ORDER BY fiscal_year DESC, id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'cash_receipts', query: 'SELECT * FROM cash_receipts ORDER BY id DESC LIMIT 10000', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'bank_receipts', query: 'SELECT * FROM bank_receipts ORDER BY id DESC LIMIT 10000', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'return_invoices', query: 'SELECT * FROM return_invoices ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'suppliers', query: 'SELECT * FROM suppliers ORDER BY id DESC', batchSize: DEFAULT_SYNC_BATCH_SIZE },
            { key: 'reconciliation_requests', query: 'SELECT * FROM reconciliation_requests', batchSize: DEFAULT_SYNC_BATCH_SIZE }
        ];

        const cachedRows = {};
        for (const spec of tableSpecs) {
            cachedRows[spec.key] = this.readTableRows(db, spec.query, spec.key);
        }

        const localCashboxToBranchMap = this.buildLocalCashboxToBranchMap(cachedRows.branch_cashboxes);
        const context = { localCashboxToBranchMap };
        const cleanupTables = new Set(cleanupDue ? ['*'] : []);
        const deletedStateByTable = new Map();
        let totalSent = 0;
        let cleanupFailed = false;
        const failedTables = [];

        console.log(
            `🔍 [SYNC] Local counts: ${tableSpecs.map((spec) => `${spec.key}=${cachedRows[spec.key].length}`).join(', ')}`
        );
        console.log(`🔄 [SYNC] Push mode: ${fullRefresh ? 'full safety refresh' : 'delta changes only'}`);

        for (const spec of tableSpecs) {
            const result = await this.safePushStep(spec.key, async () => this.sendTableDelta(db, spec, cachedRows[spec.key], {
                stateAvailable,
                fullRefresh,
                context
            }));

            totalSent += result?.sentCount || 0;
            if (result?.failed) {
                failedTables.push(spec.key);
                continue;
            }

            if (Array.isArray(result?.deletedKeys) && result.deletedKeys.length > 0) {
                cleanupTables.add(spec.key);
                deletedStateByTable.set(spec.key, result.deletedKeys);
            }
        }

        let cleanupSent = false;
        try {
            cleanupSent = await this.sendMirrorCleanup(db, cleanupTables, cachedRows, {
                ...context,
                deletedStateByTable
            });
            if (cleanupSent) {
                for (const [tableName, rowKeys] of deletedStateByTable.entries()) {
                    this.clearDeletedRowStates(db, tableName, rowKeys);
                }
            }
        } catch (cleanupError) {
            cleanupFailed = true;
            console.error('⚠️ [SYNC] Mirror cleanup failed:', cleanupError.message);
        }

        if (stateAvailable) {
            const nowIso = this.getNowIso();
            if (fullRefresh) {
                this.writeSyncMeta(db, SYNC_META_KEYS.lastFullRefreshAt, nowIso);
            }
            if (remoteScopeReset) {
                // A device moving to a new server may only hold a subset of the shared
                // database. Seed the target without deleting rows owned by other devices.
                this.writeSyncMeta(db, SYNC_META_KEYS.lastMirrorCleanupAt, nowIso);
            } else if ((cleanupSent || cleanupDue) && !cleanupFailed) {
                this.writeSyncMeta(db, SYNC_META_KEYS.lastMirrorCleanupAt, nowIso);
            }
        }

        console.log(`✅ [SYNC] Push completed: ${totalSent} changed rows sent${cleanupSent ? ' + cleanup audit' : ''}`);
        return {
            success: failedTables.length === 0 && !cleanupFailed,
            totalSent,
            failedTables,
            cleanupFailed
        };
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

        if (!hasData) {
            console.log('⚠️ [SYNC] sendPayload called but all arrays empty');
            return;
        }

        const dataKeys = Object.keys(dataToSend);
        const payloadKeys = dataKeys.join(', ');
        dataToSend._sync = {
            protocol_version: 2,
            source_id: this.getSyncSourceId()
        };
        const payloadCooldownKey = `${payloadKeys}:${hashPayload(dataToSend).slice(0, 16)}`;
        const blockedUntil = this.nonRetryablePayloads.get(payloadCooldownKey) || 0;
        if (blockedUntil > Date.now()) {
            const error = new Error(`Non-retryable sync failure cooldown active for this ${payloadKeys} payload`);
            error.suppressLog = true;
            throw error;
        }

        console.log(`📤 [SYNC] Sending: ${dataKeys.map(k => `${k}(${dataToSend[k].length})`).join(', ')}`);
        let lastError = null;

        for (let attempt = 0; attempt <= SEND_RETRY_DELAYS_MS.length; attempt++) {
            try {
                const remoteUrl = this.requireRemoteUrl(`sync upload (${payloadKeys})`);
                const res = await this.fetchWithTimeout(remoteUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataToSend)
                }, SYNC_POST_TIMEOUT_MS, `sync upload (${payloadKeys})`);

                if (!res.ok) {
                    const isTransient = TRANSIENT_HTTP_STATUSES.has(res.status);
                    if (isTransient && attempt < SEND_RETRY_DELAYS_MS.length) {
                        const waitMs = SEND_RETRY_DELAYS_MS[attempt];
                        console.warn(`⚠️ [SYNC] Transient HTTP ${res.status} while sending ${payloadKeys}, retrying in ${waitMs}ms...`);
                        await this.delay(waitMs);
                        continue;
                    }
                    const body = await res.json().catch(() => null);
                    const error = new Error(body?.error || `HTTP Error: ${res.status} ${res.statusText}`);
                    error.nonRetryable = true;
                    throw error;
                }

                const responseJson = await res.json().catch(() => null);
                if (responseJson && responseJson.success === false) {
                    const failureSummary = Array.isArray(responseJson.failures) && responseJson.failures.length > 0
                        ? ` | Failures: ${responseJson.failures.map(item => `${item.table}#${item.id ?? '?'}`).join(', ')}`
                        : '';
                    const error = new Error(`${responseJson.error || 'SYNC_FAILED'}${failureSummary}`);
                    error.nonRetryable = true;
                    throw error;
                }

                console.log(`✅ [SYNC] Server accepted: ${payloadKeys}`);
                return;
            } catch (error) {
                lastError = error;
                if (error && error.nonRetryable) {
                    if (!error.suppressCooldown) {
                        this.nonRetryablePayloads.set(payloadCooldownKey, Date.now() + NON_RETRYABLE_PAYLOAD_COOLDOWN_MS);
                    }
                    console.error(`❌ [SYNC] Non-retryable error sending ${payloadKeys}:`, error.message);
                    break;
                }
                if (attempt < SEND_RETRY_DELAYS_MS.length) {
                    const waitMs = SEND_RETRY_DELAYS_MS[attempt];
                    console.warn(`⚠️ [SYNC] Send attempt ${attempt + 1} failed for ${payloadKeys}: ${error.message}. Retrying in ${waitMs}ms...`);
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
            const stateAvailable = this.ensureSyncStateSchema(db);
            if (stateAvailable) {
                this.ensureRemoteSyncScope(db);
            }
            const remoteUrl = this.getRemoteUrl();
            if (!remoteUrl) {
                if (!this.remoteUrlMissingWarningShown) {
                    console.warn('⚠️ [SYNC] لم يتم سحب طلبات التصفيات لأن رابط خادم المزامنة غير مضبوط.');
                    this.remoteUrlMissingWarningShown = true;
                }
                return { success: false, skipped: true, reason: 'missing_remote_url', count: 0 };
            }
            const fullPull = !stateAvailable
                || this.isIntervalDue(db, SYNC_META_KEYS.lastRequestFullPullAt, REQUEST_FULL_PULL_INTERVAL_MS);
            const lastPullAt = stateAvailable && !fullPull
                ? this.readSyncMeta(db, SYNC_META_KEYS.lastRequestPullAt)
                : null;
            const storedLastRequestId = stateAvailable && !fullPull
                ? this.parseInteger(this.readSyncMeta(db, SYNC_META_KEYS.lastRequestId))
                : null;
            const localMaxRequestId = this.readLocalMaxRequestId(db);
            const lastRequestId = [storedLastRequestId, localMaxRequestId]
                .filter((value) => value !== null && value > 0)
                .reduce((maxValue, value) => Math.max(maxValue, value), 0) || null;
            const updatedAfter = lastPullAt ? subtractIsoDate(lastPullAt, REQUEST_PULL_OVERLAP_MS) : null;
            const query = new URLSearchParams({
                status: 'all',
                include_deleted: '1',
                include_details: 'raw'
            });

            if (updatedAfter) {
                query.set('updated_after', updatedAfter);
            }
            if (lastRequestId) {
                query.set('after_id', String(lastRequestId));
            }

            const reqUrl = remoteUrl.replace('/sync/users', `/reconciliation-requests?${query.toString()}`);
            console.log(`📥 [SYNC] Pulling requests from: ${reqUrl}`);

            const res = await this.fetchWithTimeout(
                reqUrl,
                {},
                REQUEST_PULL_TIMEOUT_MS,
                'reconciliation requests pull'
            );
            if (!res.ok) {
                const error = new Error(`Pull failed: ${res.status} ${res.statusText}`);
                error.statusCode = res.status;
                throw error;
            }

            const json = await res.json();
            if (!json || json.success !== true || !Array.isArray(json.data)) {
                throw new Error(json && json.error ? json.error : 'Invalid reconciliation requests response');
            }
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
                    db.prepare('SELECT id FROM reconciliation_requests').all().map((row) => row.id)
                );
                const existingRequestStateById = new Map(
                    db.prepare('SELECT id, details_json, status FROM reconciliation_requests').all().map((row) => [row.id, {
                        details_json: row.details_json || null,
                        status: row.status || null
                    }])
                );

                const writeRequests = db.transaction((remoteRequests) => {
                    remoteRequests.forEach((request) => {
                        const incomingDetails = this.normalizeRequestDetailsPayload(
                            request.details && typeof request.details === 'object'
                                ? request.details
                                : request.details_json
                        );
                        const existingState = existingRequestStateById.get(request.id) || {};
                        const existingDetails = existingState.details_json || null;
                        const details = this.hasMeaningfulRequestDetailsPayload(incomingDetails)
                            ? incomingDetails
                            : (this.normalizeRequestDetailsPayload(existingDetails) || incomingDetails || '{}');
                        const resolvedStatus = resolvePulledRequestStatus(existingState.status, request.status);

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
                                resolvedStatus,
                                details,
                                request.notes || '',
                                request.created_at || null,
                                updatedAt,
                                request.id
                            );
                            updateCount++;
                            existingRequestStateById.set(request.id, {
                                details_json: details,
                                status: resolvedStatus
                            });
                        } else {
                            insertStmt.run(
                                request.id,
                                request.cashier_id,
                                requestDate,
                                systemSales,
                                totalCash,
                                totalBank,
                                resolvedStatus,
                                details,
                                request.notes || '',
                                request.created_at || null,
                                updatedAt
                            );
                            newCount++;
                            existingRequestStateById.set(request.id, {
                                details_json: details,
                                status: resolvedStatus
                            });
                        }
                    });
                });

                writeRequests(requests);

                if (newCount > 0 || updateCount > 0) {
                    console.log(`✅ [SYNC] Pulled requests: ${newCount} new, ${updateCount} updated.`);
                }

                if (stateAvailable) {
                    const maxRemoteTimestamp = requests
                        .map((request) => request.updated_at || request.created_at || null)
                        .map((value) => (value ? Date.parse(value) : NaN))
                        .filter((timestamp) => Number.isFinite(timestamp))
                        .reduce((maxValue, timestamp) => Math.max(maxValue, timestamp), 0);
                    const watermark = maxRemoteTimestamp > 0
                        ? new Date(maxRemoteTimestamp).toISOString()
                        : lastPullAt;

                    // Never advance an empty pull using the desktop clock. A clock skew
                    // between the device and Neon could otherwise hide newer requests.
                    if (watermark) {
                        this.writeSyncMeta(db, SYNC_META_KEYS.lastRequestPullAt, watermark);
                    }
                    if (fullPull) {
                        this.writeSyncMeta(db, SYNC_META_KEYS.lastRequestFullPullAt, this.getNowIso());
                    }

                    const maxRequestId = requests
                        .map((request) => this.parseInteger(request && request.id))
                        .filter((requestId) => requestId !== null && requestId > 0)
                        .reduce((maxValue, requestId) => Math.max(maxValue, requestId), lastRequestId || 0);
                    if (maxRequestId > 0) {
                        this.writeSyncMeta(db, SYNC_META_KEYS.lastRequestId, String(maxRequestId));
                    }
                }

                return {
                    receivedCount: requests.length,
                    insertedCount: newCount,
                    updatedCount: updateCount
                };
            }
        } catch (e) {
            console.error('⚠️ [SYNC] Failed to fetch requests:', e.message);
            throw e;
        }
    }
}

// Wrapper for backward compatibility (Singleton pattern)
let syncInstance = null;

function getOrCreateSyncInstance(dbManager) {
    if (!syncInstance) {
        if (!dbManager) return null;
        syncInstance = new BackgroundSync(dbManager);
    }

    return syncInstance;
}

function startBackgroundSync(dbManager) {
    const instance = getOrCreateSyncInstance(dbManager);
    if (!instance) return;
    if (!instance.isRunning) {
        instance.start();
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

async function triggerInstantSync() {
    if (syncInstance) {
        return syncInstance.forceSyncNow();
    }

    return { success: false, skipped: true, reason: 'not_initialized' };
}

async function pullRemoteRequestsNow(dbManager, options = {}) {
    const instance = getOrCreateSyncInstance(dbManager);
    if (!instance) {
        throw new Error('Background sync is not initialized');
    }

    return instance.pullRemoteRequests(options);
}

module.exports = {
    BackgroundSync,
    startBackgroundSync,
    stopBackgroundSync,
    getSyncStatus,
    getSyncEnabled,
    setSyncEnabled,
    triggerInstantSync,
    pullRemoteRequestsNow
};
