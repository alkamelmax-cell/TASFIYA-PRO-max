const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const REQUEST_STATUSES = ['draft', 'queued', 'sending', 'sent', 'failed'];

function createLocalRequestId(prefix = 'request') {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeResendMeta(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const sourceRequestId = Number(value.source_request_id || 0) || null;
    const sourceRemoteRequestId = Number(value.source_remote_request_id || 0) || null;
    const approvedByAdminId = Number(value.approved_by_admin_id || 0) || null;
    const approvedByAdminName = typeof value.approved_by_admin_name === 'string'
        ? value.approved_by_admin_name.trim()
        : '';
    const approvedByAdminUsername = typeof value.approved_by_admin_username === 'string'
        ? value.approved_by_admin_username.trim()
        : '';
    const approvedAt = typeof value.approved_at === 'string' ? value.approved_at.trim() : '';
    const reason = typeof value.reason === 'string' ? value.reason.trim() : '';

    if (
        !sourceRequestId
        && !sourceRemoteRequestId
        && !approvedByAdminId
        && !approvedByAdminName
        && !approvedByAdminUsername
        && !approvedAt
        && !reason
    ) {
        return null;
    }

    return {
        source_request_id: sourceRequestId,
        source_remote_request_id: sourceRemoteRequestId,
        approved_by_admin_id: approvedByAdminId,
        approved_by_admin_name: approvedByAdminName,
        approved_by_admin_username: approvedByAdminUsername,
        approved_at: approvedAt,
        reason
    };
}

function normalizeRequestPayload(payload = {}) {
    const normalizedCashierId = Number(payload.cashier_id || 0) || null;

    return {
        cashier_id: normalizedCashierId,
        system_sales: toFiniteNumber(payload.system_sales),
        total_cash: toFiniteNumber(payload.total_cash),
        total_bank: toFiniteNumber(payload.total_bank),
        notes: typeof payload.notes === 'string' ? payload.notes.trim() : '',
        cash_breakdown: normalizeArray(payload.cash_breakdown),
        bank_receipts: normalizeArray(payload.bank_receipts),
        postpaid_items: normalizeArray(payload.postpaid_items),
        customer_receipts: normalizeArray(payload.customer_receipts),
        return_items: normalizeArray(payload.return_items),
        supplier_items: normalizeArray(payload.supplier_items),
        custom_tables: normalizeArray(payload.custom_tables),
        resend_meta: normalizeResendMeta(payload.resend_meta)
    };
}

function parseJsonValue(value, fallback = null) {
    if (typeof value !== 'string' || !value) {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
}

function createPinSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPinWithSalt(pin, salt) {
    return crypto.scryptSync(String(pin || ''), String(salt || ''), 64).toString('hex');
}

function timingSafeHexEqual(expectedHex, actualHex) {
    const expectedBuffer = Buffer.from(String(expectedHex || ''), 'hex');
    const actualBuffer = Buffer.from(String(actualHex || ''), 'hex');

    if (!expectedBuffer.length || expectedBuffer.length !== actualBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

class ClientSenderDb {
    constructor(options = {}) {
        const basePath = options.basePath || process.cwd();
        this.basePath = basePath;
        this.databasePath = path.join(basePath, 'client-sender.db');
        this.db = null;
    }

    ensureBaseDirectory() {
        fs.mkdirSync(this.basePath, { recursive: true });
    }

    initialize() {
        this.ensureBaseDirectory();
        this.db = new Database(this.databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.createTables();
        return this;
    }

    createTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS client_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS client_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                local_request_id TEXT NOT NULL UNIQUE,
                cashier_id INTEGER,
                status TEXT NOT NULL DEFAULT 'draft',
                payload_json TEXT NOT NULL,
                system_sales REAL DEFAULT 0,
                total_cash REAL DEFAULT 0,
                total_bank REAL DEFAULT 0,
                remote_request_id INTEGER,
                last_error TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME
            );

            CREATE INDEX IF NOT EXISTS idx_client_requests_status
            ON client_requests(status);

            CREATE TABLE IF NOT EXISTS cached_cashiers (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                cashier_number TEXT,
                active INTEGER DEFAULT 1,
                has_pin INTEGER DEFAULT 0,
                branch_name TEXT,
                synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cached_customers (
                name TEXT PRIMARY KEY,
                synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS cached_atms (
                cache_key TEXT PRIMARY KEY,
                remote_id INTEGER,
                name TEXT NOT NULL,
                bank_name TEXT,
                branch_id INTEGER,
                branch_name TEXT,
                synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS offline_cashier_auth (
                base_url TEXT NOT NULL,
                cashier_id INTEGER NOT NULL,
                pin_salt TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                user_json TEXT NOT NULL,
                last_verified_online_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (base_url, cashier_id)
            );

            CREATE INDEX IF NOT EXISTS idx_cached_cashiers_name
            ON cached_cashiers(name);

            CREATE INDEX IF NOT EXISTS idx_cached_customers_name
            ON cached_customers(name);

            CREATE INDEX IF NOT EXISTS idx_cached_atms_name
            ON cached_atms(name);

            CREATE INDEX IF NOT EXISTS idx_offline_cashier_auth_cashier
            ON offline_cashier_auth(cashier_id);
        `);
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    getSetting(key, fallback = null) {
        const row = this.db.prepare(`
            SELECT value
            FROM client_settings
            WHERE key = ?
            LIMIT 1
        `).get(key);

        if (!row || row.value == null) {
            return fallback;
        }

        return row.value;
    }

    getJsonSetting(key, fallback = null) {
        return parseJsonValue(this.getSetting(key, ''), fallback);
    }

    setSetting(key, value) {
        const normalizedValue = value == null
            ? null
            : (typeof value === 'string' ? value : JSON.stringify(value));

        this.db.prepare(`
            INSERT INTO client_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `).run(key, normalizedValue);

        return normalizedValue;
    }

    deleteSetting(key) {
        this.db.prepare(`
            DELETE FROM client_settings
            WHERE key = ?
        `).run(key);
    }

    loadClientState() {
        const sessionCookie = this.getSetting('session_cookie', '');
        const offlineMode = this.getSetting('offline_mode', '0') === '1';
        const currentUser = this.getJsonSetting('current_user', null);

        return {
            baseUrl: this.getSetting('base_url', ''),
            sessionCookie,
            currentUser: sessionCookie || offlineMode ? currentUser : null,
            offlineMode
        };
    }

    saveBaseUrl(baseUrl) {
        this.setSetting('base_url', baseUrl || '');
        return this.loadClientState();
    }

    saveSession({ baseUrl, sessionCookie, currentUser, offlineMode } = {}) {
        if (typeof baseUrl === 'string') {
            this.setSetting('base_url', baseUrl);
        }

        if (typeof sessionCookie === 'string') {
            this.setSetting('session_cookie', sessionCookie);
        }

        if (currentUser === null) {
            this.deleteSetting('current_user');
        } else if (currentUser !== undefined) {
            this.setSetting('current_user', currentUser);
        }

        if (typeof offlineMode === 'boolean') {
            this.setSetting('offline_mode', offlineMode ? '1' : '0');
        }

        return this.loadClientState();
    }

    clearSession() {
        this.deleteSetting('session_cookie');
        this.deleteSetting('current_user');
        this.deleteSetting('offline_mode');
        return this.loadClientState();
    }

    cacheCashiers(cashiers = []) {
        const now = new Date().toISOString();
        const insertStmt = this.db.prepare(`
            INSERT INTO cached_cashiers (
                id,
                name,
                cashier_number,
                active,
                has_pin,
                branch_name,
                synced_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                cashier_number = excluded.cashier_number,
                active = excluded.active,
                has_pin = excluded.has_pin,
                branch_name = excluded.branch_name,
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at
        `);

        const runTransaction = this.db.transaction((rows) => {
            rows.forEach((cashier) => {
                const normalizedId = Number(cashier && cashier.id ? cashier.id : 0);
                if (!normalizedId) {
                    return;
                }

                insertStmt.run(
                    normalizedId,
                    cashier && cashier.name ? String(cashier.name) : '',
                    cashier && cashier.cashier_number ? String(cashier.cashier_number) : '',
                    Number(cashier && cashier.active != null ? cashier.active : 1),
                    Number(Boolean(cashier && cashier.has_pin)),
                    cashier && cashier.branch_name ? String(cashier.branch_name) : '',
                    now,
                    now
                );
            });
        });

        runTransaction(Array.isArray(cashiers) ? cashiers : []);
        this.setSetting('cached_cashiers_synced_at', now);
        return this.listCachedCashiers();
    }

    listCachedCashiers() {
        return this.db.prepare(`
            SELECT
                id,
                name,
                cashier_number,
                active,
                has_pin,
                branch_name,
                synced_at,
                updated_at
            FROM cached_cashiers
            ORDER BY name COLLATE NOCASE ASC, id DESC
        `).all();
    }

    saveOfflineCashierAuth(baseUrl, user, pin) {
        const normalizedBaseUrl = String(baseUrl || '').trim();
        const normalizedCashierId = Number(user && user.id ? user.id : 0);
        const normalizedPin = String(pin || '').trim();

        if (!normalizedBaseUrl || !normalizedCashierId || !normalizedPin || !user) {
            return false;
        }

        const pinSalt = createPinSalt();
        const pinHash = hashPinWithSalt(normalizedPin, pinSalt);
        const now = new Date().toISOString();

        this.db.prepare(`
            INSERT INTO offline_cashier_auth (
                base_url,
                cashier_id,
                pin_salt,
                pin_hash,
                user_json,
                last_verified_online_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(base_url, cashier_id) DO UPDATE SET
                pin_salt = excluded.pin_salt,
                pin_hash = excluded.pin_hash,
                user_json = excluded.user_json,
                last_verified_online_at = excluded.last_verified_online_at,
                updated_at = excluded.updated_at
        `).run(
            normalizedBaseUrl,
            normalizedCashierId,
            pinSalt,
            pinHash,
            JSON.stringify(user),
            now,
            now
        );

        return true;
    }

    verifyOfflineCashierLogin(baseUrl, cashierId, pin) {
        const normalizedBaseUrl = String(baseUrl || '').trim();
        const normalizedCashierId = Number(cashierId || 0);
        const normalizedPin = String(pin || '').trim();

        if (!normalizedBaseUrl || !normalizedCashierId || !normalizedPin) {
            return null;
        }

        const row = this.db.prepare(`
            SELECT
                pin_salt,
                pin_hash,
                user_json
            FROM offline_cashier_auth
            WHERE base_url = ? AND cashier_id = ?
            LIMIT 1
        `).get(normalizedBaseUrl, normalizedCashierId);

        if (!row) {
            return null;
        }

        const candidateHash = hashPinWithSalt(normalizedPin, row.pin_salt);
        if (!timingSafeHexEqual(row.pin_hash, candidateHash)) {
            return null;
        }

        return parseJsonValue(row.user_json, null);
    }

    getOfflineCashierUser(baseUrl, cashierId) {
        const normalizedBaseUrl = String(baseUrl || '').trim();
        const normalizedCashierId = Number(cashierId || 0);

        if (!normalizedBaseUrl || !normalizedCashierId) {
            return null;
        }

        const row = this.db.prepare(`
            SELECT user_json
            FROM offline_cashier_auth
            WHERE base_url = ? AND cashier_id = ?
            LIMIT 1
        `).get(normalizedBaseUrl, normalizedCashierId);

        return row ? parseJsonValue(row.user_json, null) : null;
    }

    saveWorkingDraft(cashierId, draft) {
        const normalizedCashierId = Number(cashierId || 0);
        if (!normalizedCashierId) {
            return null;
        }

        const draftKey = `working_draft:${normalizedCashierId}`;
        this.setSetting(draftKey, draft || null);
        return this.getJsonSetting(draftKey, null);
    }

    loadWorkingDraft(cashierId) {
        const normalizedCashierId = Number(cashierId || 0);
        if (!normalizedCashierId) {
            return null;
        }

        return this.getJsonSetting(`working_draft:${normalizedCashierId}`, null);
    }

    clearWorkingDraft(cashierId) {
        const normalizedCashierId = Number(cashierId || 0);
        if (!normalizedCashierId) {
            return false;
        }

        this.deleteSetting(`working_draft:${normalizedCashierId}`);
        return true;
    }

    cacheCustomers(customers = []) {
        const now = new Date().toISOString();
        const insertStmt = this.db.prepare(`
            INSERT INTO cached_customers (
                name,
                synced_at,
                updated_at
            ) VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at
        `);

        const runTransaction = this.db.transaction((rows) => {
            rows.forEach((customerName) => {
                const normalizedName = String(customerName || '').trim();
                if (!normalizedName) {
                    return;
                }

                insertStmt.run(normalizedName, now, now);
            });
        });

        runTransaction(Array.isArray(customers) ? customers : []);
        this.setSetting('cached_customers_synced_at', now);
        return this.listCachedCustomers();
    }

    listCachedCustomers() {
        const rows = this.db.prepare(`
            SELECT name
            FROM cached_customers
            ORDER BY name COLLATE NOCASE ASC
        `).all();

        return rows.map((row) => row.name).filter(Boolean);
    }

    cacheAtms(atms = []) {
        const now = new Date().toISOString();
        const insertStmt = this.db.prepare(`
            INSERT INTO cached_atms (
                cache_key,
                remote_id,
                name,
                bank_name,
                branch_id,
                branch_name,
                synced_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                remote_id = excluded.remote_id,
                name = excluded.name,
                bank_name = excluded.bank_name,
                branch_id = excluded.branch_id,
                branch_name = excluded.branch_name,
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at
        `);

        const runTransaction = this.db.transaction((rows) => {
            rows.forEach((atm) => {
                const normalizedName = atm && atm.name ? String(atm.name).trim() : '';
                if (!normalizedName) {
                    return;
                }

                const remoteId = Number(atm && atm.id ? atm.id : 0) || null;
                const cacheKey = remoteId ? `id:${remoteId}` : `name:${normalizedName}`;

                insertStmt.run(
                    cacheKey,
                    remoteId,
                    normalizedName,
                    atm && atm.bank_name ? String(atm.bank_name) : '',
                    Number(atm && atm.branch_id ? atm.branch_id : 0) || null,
                    atm && atm.branch_name ? String(atm.branch_name) : '',
                    now,
                    now
                );
            });
        });

        runTransaction(Array.isArray(atms) ? atms : []);
        this.setSetting('cached_atms_synced_at', now);
        return this.listCachedAtms();
    }

    listCachedAtms() {
        return this.db.prepare(`
            SELECT
                remote_id AS id,
                name,
                bank_name,
                branch_id,
                branch_name,
                synced_at,
                updated_at
            FROM cached_atms
            ORDER BY name COLLATE NOCASE ASC
        `).all();
    }

    getBootstrapStats() {
        const rows = this.db.prepare(`
            SELECT status, COUNT(*) AS total
            FROM client_requests
            GROUP BY status
        `).all();

        const counts = {
            draft: 0,
            queued: 0,
            sending: 0,
            sent: 0,
            failed: 0,
            total: 0
        };

        rows.forEach((row) => {
            const status = row.status || 'draft';
            const total = Number(row.total || 0);
            if (Object.prototype.hasOwnProperty.call(counts, status)) {
                counts[status] = total;
            }
            counts.total += total;
        });

        return counts;
    }

    mapRequestRow(row) {
        if (!row) {
            return null;
        }

        return {
            ...row,
            payload_json: row.payload_json || '',
            payload: parseJsonValue(row.payload_json, normalizeRequestPayload({}))
        };
    }

    listRecentRequests(limit = 20) {
        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
        const rows = this.db.prepare(`
            SELECT
                id,
                local_request_id,
                cashier_id,
                status,
                payload_json,
                system_sales,
                total_cash,
                total_bank,
                remote_request_id,
                last_error,
                retry_count,
                created_at,
                updated_at,
                sent_at
            FROM client_requests
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
        `).all(safeLimit);

        return rows.map((row) => this.mapRequestRow(row));
    }

    getRequestById(id) {
        const row = this.db.prepare(`
            SELECT
                id,
                local_request_id,
                cashier_id,
                status,
                payload_json,
                system_sales,
                total_cash,
                total_bank,
                remote_request_id,
                last_error,
                retry_count,
                created_at,
                updated_at,
                sent_at
            FROM client_requests
            WHERE id = ?
            LIMIT 1
        `).get(id);

        return this.mapRequestRow(row);
    }

    listPendingRequests(limit = 25) {
        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
        const rows = this.db.prepare(`
            SELECT
                id,
                local_request_id,
                cashier_id,
                status,
                payload_json,
                system_sales,
                total_cash,
                total_bank,
                remote_request_id,
                last_error,
                retry_count,
                created_at,
                updated_at,
                sent_at
            FROM client_requests
            WHERE status IN ('queued', 'failed')
            ORDER BY updated_at ASC, id ASC
            LIMIT ?
        `).all(safeLimit);

        return rows.map((row) => this.mapRequestRow(row));
    }

    recoverInterruptedRequests() {
        const now = new Date().toISOString();
        const result = this.db.prepare(`
            UPDATE client_requests
            SET
                status = 'queued',
                last_error = CASE
                    WHEN last_error IS NULL OR TRIM(last_error) = ''
                        THEN 'تمت استعادة هذا الطلب بعد إغلاق غير متوقع أثناء الإرسال.'
                    ELSE last_error
                END,
                updated_at = ?
            WHERE status = 'sending'
        `).run(now);

        return Number(result && result.changes ? result.changes : 0);
    }

    insertRequest(payload = {}, status = 'draft') {
        const safeStatus = REQUEST_STATUSES.includes(status) ? status : 'draft';
        const now = new Date().toISOString();
        const localRequestId = createLocalRequestId(safeStatus);
        const normalizedPayload = normalizeRequestPayload(payload);

        const stmt = this.db.prepare(`
            INSERT INTO client_requests (
                local_request_id,
                cashier_id,
                status,
                payload_json,
                system_sales,
                total_cash,
                total_bank,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = stmt.run(
            localRequestId,
            normalizedPayload.cashier_id,
            safeStatus,
            JSON.stringify(normalizedPayload),
            normalizedPayload.system_sales,
            normalizedPayload.total_cash,
            normalizedPayload.total_bank,
            now,
            now
        );

        return this.getRequestById(info.lastInsertRowid);
    }

    saveDraft(payload = {}) {
        return this.insertRequest(payload, 'draft');
    }

    queueRequest(payload = {}) {
        return this.insertRequest(payload, 'queued');
    }

    cloneRequestForApprovedResend(sourceRequest, approval = {}) {
        const existing = sourceRequest && sourceRequest.payload
            ? sourceRequest
            : this.getRequestById(sourceRequest && sourceRequest.id ? sourceRequest.id : sourceRequest);

        if (!existing) {
            throw new Error('الطلب الأصلي غير موجود محليًا');
        }

        const sourcePayload = normalizeRequestPayload(existing.payload || {});
        const reason = typeof approval.reason === 'string' ? approval.reason.trim() : '';
        const adminName = typeof approval.admin_name === 'string' ? approval.admin_name.trim() : '';
        const adminUsername = typeof approval.admin_username === 'string' ? approval.admin_username.trim() : '';
        const adminLabel = adminName || adminUsername || 'أدمن';
        const sourceLabel = existing.remote_request_id
            ? `#${existing.remote_request_id}`
            : (existing.local_request_id || `#${existing.id}`);
        const approvedAt = new Date().toISOString();

        const auditParts = [
            `إعادة إرسال معتمدة للأصل ${sourceLabel}`,
            `بواسطة ${adminLabel}`,
            reason ? `السبب: ${reason}` : ''
        ].filter(Boolean);
        const auditNote = `[${auditParts.join(' | ')}]`;
        const mergedNotes = sourcePayload.notes
            ? `${sourcePayload.notes}\n${auditNote}`
            : auditNote;

        return this.insertRequest({
            ...sourcePayload,
            notes: mergedNotes,
            resend_meta: {
                source_request_id: existing.id,
                source_remote_request_id: existing.remote_request_id || null,
                approved_by_admin_id: Number(approval.admin_id || 0) || null,
                approved_by_admin_name: adminName,
                approved_by_admin_username: adminUsername,
                approved_at: approvedAt,
                reason
            }
        }, 'queued');
    }

    updateRequestStatus(id, status, patch = {}) {
        const safeStatus = REQUEST_STATUSES.includes(status) ? status : 'draft';
        const now = new Date().toISOString();
        const existing = this.getRequestById(id);

        if (!existing) {
            throw new Error(`Request ${id} not found`);
        }

        const payload = Object.prototype.hasOwnProperty.call(patch, 'payload')
            ? normalizeRequestPayload(patch.payload || {})
            : existing.payload;
        const lastError = Object.prototype.hasOwnProperty.call(patch, 'last_error')
            ? (patch.last_error || null)
            : existing.last_error;
        const retryCount = Object.prototype.hasOwnProperty.call(patch, 'retry_count')
            ? Number(patch.retry_count || 0)
            : Number(existing.retry_count || 0);
        const remoteRequestId = Object.prototype.hasOwnProperty.call(patch, 'remote_request_id')
            ? (patch.remote_request_id || null)
            : existing.remote_request_id;
        const sentAt = Object.prototype.hasOwnProperty.call(patch, 'sent_at')
            ? (patch.sent_at || null)
            : existing.sent_at;
        const cashierId = Object.prototype.hasOwnProperty.call(patch, 'cashier_id')
            ? (Number(patch.cashier_id || 0) || null)
            : existing.cashier_id;
        const systemSales = Object.prototype.hasOwnProperty.call(patch, 'system_sales')
            ? toFiniteNumber(patch.system_sales)
            : existing.system_sales;
        const totalCash = Object.prototype.hasOwnProperty.call(patch, 'total_cash')
            ? toFiniteNumber(patch.total_cash)
            : existing.total_cash;
        const totalBank = Object.prototype.hasOwnProperty.call(patch, 'total_bank')
            ? toFiniteNumber(patch.total_bank)
            : existing.total_bank;

        this.db.prepare(`
            UPDATE client_requests
            SET
                cashier_id = ?,
                status = ?,
                payload_json = ?,
                system_sales = ?,
                total_cash = ?,
                total_bank = ?,
                remote_request_id = ?,
                last_error = ?,
                retry_count = ?,
                sent_at = ?,
                updated_at = ?
            WHERE id = ?
        `).run(
            cashierId,
            safeStatus,
            JSON.stringify(payload),
            systemSales,
            totalCash,
            totalBank,
            remoteRequestId,
            lastError,
            retryCount,
            sentAt,
            now,
            id
        );

        return this.getRequestById(id);
    }

    markRequestSending(id) {
        return this.updateRequestStatus(id, 'sending', {
            last_error: null
        });
    }

    markRequestQueued(id) {
        return this.updateRequestStatus(id, 'queued', {
            last_error: null
        });
    }

    markRequestFailed(id, errorMessage) {
        const existing = this.getRequestById(id);
        const nextRetryCount = Number(existing && existing.retry_count ? existing.retry_count : 0) + 1;

        return this.updateRequestStatus(id, 'failed', {
            last_error: errorMessage || 'تعذر الإرسال',
            retry_count: nextRetryCount
        });
    }

    markRequestSent(id, remoteRequestId) {
        return this.updateRequestStatus(id, 'sent', {
            remote_request_id: remoteRequestId || null,
            last_error: null,
            sent_at: new Date().toISOString()
        });
    }
}

function createClientSenderDb(options) {
    return new ClientSenderDb(options);
}

module.exports = {
    ClientSenderDb,
    createClientSenderDb
};
