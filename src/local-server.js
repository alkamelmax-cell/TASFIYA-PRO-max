// @ts-nocheck

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { parse } = require('url');
const { hashSecret, hashSecretIfNeeded, verifySecret } = require('./security/auth-service');
const { WebSessionStore } = require('./security/web-session-store');

const SESSION_COOKIE_NAME = 'tasfiya_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_JSON_BODY_LIMIT_BYTES = 512 * 1024;
const LARGE_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const JSON_COMPRESSION_MIN_BYTES = 1024;
const ONESIGNAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTruthyQueryValue(value) {
    return value === true || value === '1' || value === 'true';
}

function createPayloadEtag(payload) {
    return `"${crypto.createHash('sha1').update(payload).digest('base64url')}"`;
}

function requestAcceptsGzip(req) {
    const acceptEncoding = String(req && req.headers ? req.headers['accept-encoding'] || '' : '');
    return /\bgzip\b/i.test(acceptEncoding);
}

function requestMatchesEtag(req, etag) {
    const ifNoneMatch = String(req && req.headers ? req.headers['if-none-match'] || '' : '').trim();
    if (!ifNoneMatch || !etag) {
        return false;
    }

    return ifNoneMatch.split(',').map((value) => value.trim()).includes(etag);
}

function parseNumericDbValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }

    const normalized = Number.parseFloat(String(value).replace(/,/g, '').trim());
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeDetailsJsonPayload(value) {
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

function normalizeCustomerNameValue(value) {
    return String(value == null ? '' : value).replace(/\uFFFD/g, '').replaceAll('\u0000', '').trim();
}

function normalizeCustomerCodeValue(value) {
    const normalized = String(value == null ? '' : value).trim().toUpperCase();
    return ['', '-', '–', '—'].includes(normalized) ? '' : normalized;
}

function normalizePositiveInteger(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

function normalizeCustomerRow(row) {
    if (!row) {
        return null;
    }

    const id = normalizePositiveInteger(row.id || row.customer_id);
    const customerName = normalizeCustomerNameValue(row.customer_name || row.name);
    const customerCode = normalizeCustomerCodeValue(row.customer_code);
    const branchId = normalizePositiveInteger(row.branch_id);

    if (!id && !customerName && !customerCode) {
        return null;
    }

    return {
        id,
        customer_id: id,
        customer_name: customerName,
        customer_code: customerCode,
        branch_id: branchId,
        matched_customer_name: normalizeCustomerNameValue(row.matched_customer_name || customerName),
        matched_customer_code: normalizeCustomerCodeValue(row.matched_customer_code),
        matched_customer_id: normalizePositiveInteger(row.matched_customer_id) || id,
        is_favorite: Number(row.is_favorite || 0) === 1 ? 1 : 0,
        merged_into_customer_id: normalizePositiveInteger(row.merged_into_customer_id)
    };
}

function isCustomerNameMatchOrAlias(customer, name) {
    const normalizedName = normalizeCustomerNameValue(name);
    if (!normalizedName) {
        return false;
    }

    return (
        normalizeCustomerNameValue(customer?.customer_name) === normalizedName
        || normalizeCustomerNameValue(customer?.matched_customer_name) === normalizedName
    );
}

function isSameOrOpenBranch(rowBranchId, branchId) {
    const normalizedRowBranchId = normalizePositiveInteger(rowBranchId);
    const normalizedBranchId = normalizePositiveInteger(branchId);
    return !normalizedBranchId || !normalizedRowBranchId || normalizedRowBranchId === normalizedBranchId;
}

function uniqueCustomerRows(rows = []) {
    const seen = new Set();
    const result = [];

    rows.forEach((row) => {
        const normalized = normalizeCustomerRow(row);
        if (!normalized || !normalized.customer_name) {
            return;
        }

        const key = normalized.id
            ? `id:${normalized.id}`
            : `${normalized.customer_name}|${normalized.customer_code}|${normalized.branch_id || ''}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        result.push(normalized);
    });

    return result;
}

function uniqueCustomerAliasRows(rows = []) {
    const seen = new Set();
    const result = [];

    rows.forEach((row) => {
        const normalized = normalizeCustomerRow(row);
        if (!normalized || !normalized.customer_name) {
            return;
        }

        const key = [
            normalized.id || '',
            normalized.customer_code || '',
            normalized.matched_customer_id || '',
            normalized.matched_customer_name || ''
        ].join('|');
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        result.push(normalized);
    });

    return result;
}

class LocalWebServer {
    constructor(dbManager, port = 4000) {
        this.dbManager = dbManager;
        this.port = port;
        this.server = null;
        this.sessionStore = new WebSessionStore({ ttlMs: SESSION_TTL_MS });
    }

    async readJsonBody(req, options = {}) {
        const maxBytes = Number.isFinite(options.maxBytes) && options.maxBytes > 0
            ? options.maxBytes
            : DEFAULT_JSON_BODY_LIMIT_BYTES;
        const routeLabel = options.routeLabel || 'request body';

        return new Promise((resolve, reject) => {
            const chunks = [];
            let totalBytes = 0;
            let limitExceeded = false;

            req.on('data', (chunk) => {
                if (limitExceeded) {
                    return;
                }

                totalBytes += chunk.length;
                if (totalBytes > maxBytes) {
                    limitExceeded = true;
                    return;
                }

                chunks.push(chunk);
            });

            req.on('end', () => {
                if (limitExceeded) {
                    const error = new Error(`${routeLabel} exceeded the ${maxBytes} byte limit`);
                    error.statusCode = 413;
                    reject(error);
                    return;
                }

                const rawBody = chunks.length > 0
                    ? Buffer.concat(chunks).toString('utf8').trim()
                    : '';

                if (!rawBody) {
                    resolve({});
                    return;
                }

                try {
                    resolve(JSON.parse(rawBody));
                } catch (error) {
                    error.statusCode = 400;
                    reject(error);
                }
            });

            req.on('error', reject);
        });
    }

    getReconciliationRequestSelectColumns(includeDetailsMode = 'none', tableAlias = 'r') {
        const prefix = tableAlias ? `${tableAlias}.` : '';
        const columns = [
            `${prefix}id`,
            `${prefix}cashier_id`,
            `${prefix}request_date`,
            `${prefix}system_sales`,
            `${prefix}total_cash`,
            `${prefix}total_bank`,
            `${prefix}status`,
            `${prefix}notes`,
            `${prefix}created_at`,
            `${prefix}updated_at`
        ];

        if (includeDetailsMode === 'parsed' || includeDetailsMode === 'raw') {
            columns.push(`${prefix}details_json`);
        }

        return columns.join(', ');
    }

    normalizeReconciliationRequestRow(requestRow, includeDetailsMode = 'none') {
        const normalizedRow = {
            id: requestRow.id,
            cashier_id: requestRow.cashier_id,
            request_date: requestRow.request_date,
            system_sales: requestRow.system_sales,
            total_cash: requestRow.total_cash,
            total_bank: requestRow.total_bank,
            status: requestRow.status,
            notes: requestRow.notes,
            created_at: requestRow.created_at,
            updated_at: requestRow.updated_at,
            cashier_name: requestRow.cashier_name || 'غير معروف',
            branch_id: requestRow.branch_id || null
        };

        if (includeDetailsMode === 'raw') {
            if (typeof requestRow.details_json === 'string') {
                normalizedRow.details_json = requestRow.details_json;
            } else {
                normalizedRow.details_json = JSON.stringify(requestRow.details_json || {});
            }
        } else if (includeDetailsMode === 'parsed') {
            try {
                normalizedRow.details = requestRow.details_json
                    ? (typeof requestRow.details_json === 'string' ? JSON.parse(requestRow.details_json) : requestRow.details_json)
                    : {};
            } catch (error) {
                console.warn(`⚠️ [API] Failed to parse reconciliation request details for request ${requestRow.id}:`, error.message);
                normalizedRow.details = {};
            }
        }

        return normalizedRow;
    }

    parseCookies(req) {
        const cookieHeader = req && req.headers ? req.headers.cookie : '';
        if (!cookieHeader) {
            return {};
        }

        return cookieHeader.split(';').reduce((cookies, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) {
                return cookies;
            }

            const key = part.slice(0, separatorIndex).trim();
            const value = part.slice(separatorIndex + 1).trim();

            if (key) {
                cookies[key] = decodeURIComponent(value);
            }

            return cookies;
        }, {});
    }

    getSessionToken(req) {
        const cookies = this.parseCookies(req);
        return cookies[SESSION_COOKIE_NAME] || '';
    }

    buildSessionCookie(token) {
        const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
        return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
    }

    buildExpiredSessionCookie() {
        return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
    }

    getAuthenticatedUser(req) {
        const sessionToken = this.getSessionToken(req);
        const session = typeof this.sessionStore.touchSession === 'function'
            ? this.sessionStore.touchSession(sessionToken)
            : this.sessionStore.getSession(sessionToken);

        if (!session || !session.user) {
            return null;
        }

        return { ...session.user };
    }

    isPublicRoute(pathname, method) {
        return (
            pathname === '/login.html'
            || pathname === '/login'
            || (pathname === '/api/login' && method === 'POST')
            || (pathname === '/api/cashier-login' && method === 'POST')
            || (pathname === '/api/cashiers-list' && method === 'GET')
            || (pathname === '/api/session' && method === 'GET')
            || (pathname === '/api/logout' && method === 'POST')
            // Desktop-to-cloud sync bridge routes do not carry browser sessions.
            || (pathname === '/api/sync/users' && method === 'POST')
            || (pathname === '/api/reconciliation-requests' && method === 'GET')
            || (pathname.match(/^\/api\/reconciliation-requests\/\d+$/) && method === 'GET')
            || (pathname.match(/^\/api\/reconciliation-requests\/\d+$/) && method === 'DELETE')
        );
    }

    getAccessLevel(pathname, method) {
        if (this.isPublicRoute(pathname, method)) {
            return 'public';
        }

        if (
            pathname === '/request-reconciliation.html'
            || (pathname === '/api/customers' && method === 'GET')
            || (pathname === '/api/atms' && method === 'GET')
            || (pathname === '/api/reconciliation-requests' && method === 'POST')
        ) {
            return 'authenticated';
        }

        return 'admin';
    }

    requireAuthorization(req, res, pathname, method) {
        const accessLevel = this.getAccessLevel(pathname, method);
        if (accessLevel === 'public') {
            return { accessLevel, user: null };
        }

        const user = this.getAuthenticatedUser(req);
        if (!user) {
            if (pathname.startsWith('/api/')) {
                this.sendJson(
                    res,
                    { success: false, error: 'غير مصرح، يرجى تسجيل الدخول مرة أخرى' },
                    {
                        statusCode: 401,
                        headers: { 'Set-Cookie': this.buildExpiredSessionCookie() }
                    }
                );
            } else {
                res.writeHead(302, {
                    Location: '/login.html',
                    'Set-Cookie': this.buildExpiredSessionCookie()
                });
                res.end();
            }

            return null;
        }

        if (accessLevel === 'admin' && user.role === 'cashier') {
            if (pathname.startsWith('/api/')) {
                this.sendJson(res, { success: false, error: 'غير مصرح بهذه العملية' }, { statusCode: 403 });
            } else {
                res.writeHead(302, { Location: '/request-reconciliation.html' });
                res.end();
            }

            return null;
        }

        req.authUser = user;
        const refreshedToken = this.getSessionToken(req);
        if (refreshedToken) {
            res.setHeader('Set-Cookie', this.buildSessionCookie(refreshedToken));
        }
        return { accessLevel, user };
    }

    async handleGetSession(req, res) {
        const user = this.getAuthenticatedUser(req);
        if (!user) {
            this.sendJson(
                res,
                { success: false, error: 'لا توجد جلسة نشطة' },
                {
                    statusCode: 401,
                    headers: { 'Set-Cookie': this.buildExpiredSessionCookie() }
                }
            );
            return;
        }

        this.sendJson(res, { success: true, user });
    }

    async handleLogout(req, res) {
        const sessionToken = this.getSessionToken(req);
        this.sessionStore.destroySession(sessionToken);
        this.sendJson(res, { success: true }, { headers: { 'Set-Cookie': this.buildExpiredSessionCookie() } });
    }

    async ensureIndexes() {
        try {
            console.log('🚀 [PERF] Checking database indexes...');
            const pool = this.dbManager.pool; // Check if running on Postgres (Render)

            const indexes = [
                // Reconciliations
                "CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON reconciliations(reconciliation_date)",
                "CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON reconciliations(status)",
                "CREATE INDEX IF NOT EXISTS idx_reconciliations_cashier ON reconciliations(cashier_id)",

                // Sales & Receipts (CRITICAL for Customer Ledger)
                "CREATE INDEX IF NOT EXISTS idx_postpaid_customer ON postpaid_sales(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_postpaid_customer_code_norm ON postpaid_sales(UPPER(TRIM(customer_code)))",
                "CREATE INDEX IF NOT EXISTS idx_postpaid_created_date ON postpaid_sales(DATE(created_at))",
                "CREATE INDEX IF NOT EXISTS idx_postpaid_rec_id ON postpaid_sales(reconciliation_id)",
                "CREATE INDEX IF NOT EXISTS idx_receipts_customer ON customer_receipts(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_receipts_customer_code_norm ON customer_receipts(UPPER(TRIM(customer_code)))",
                "CREATE INDEX IF NOT EXISTS idx_receipts_created_date ON customer_receipts(DATE(created_at))",
                "CREATE INDEX IF NOT EXISTS idx_receipts_rec_id ON customer_receipts(reconciliation_id)",

                // Suppliers
                "CREATE INDEX IF NOT EXISTS idx_suppliers_supplier ON suppliers(supplier_name)",
                "CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_norm ON suppliers(UPPER(TRIM(supplier_name)))",
                "CREATE INDEX IF NOT EXISTS idx_suppliers_created_date ON suppliers(DATE(created_at))",

                // Manual Transactions
                "CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer ON manual_postpaid_sales(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer_code_norm ON manual_postpaid_sales(UPPER(TRIM(customer_code)))",
                "CREATE INDEX IF NOT EXISTS idx_manual_postpaid_created_date ON manual_postpaid_sales(DATE(created_at))",
                "CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer ON manual_customer_receipts(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer_code_norm ON manual_customer_receipts(UPPER(TRIM(customer_code)))",
                "CREATE INDEX IF NOT EXISTS idx_manual_receipts_created_date ON manual_customer_receipts(DATE(created_at))"
            ];

            if (pool) {
                // Postgres
                for (const sql of indexes) {
                    await pool.query(sql);
                }
                console.log('✅ [PERF] Indexes verified on PostgreSQL');
            } else {
                // SQLite
                for (const sql of indexes) {
                    this.dbManager.db.prepare(sql).run();
                }
                console.log('✅ [PERF] Indexes verified on SQLite');
            }
        } catch (error) {
            console.error('⚠️ [PERF] Failed to create indexes:', error.message);
        }
    }

    async ensurePostgresSerialSequences() {
        const pool = this.getPostgresPool();
        if (!pool) {
            return;
        }

        const serialTables = [
            'customers',
            'reconciliation_requests',
            'reconciliations',
            'cash_receipts',
            'bank_receipts',
            'postpaid_sales',
            'customer_receipts',
            'return_invoices',
            'suppliers',
            'branch_cashboxes',
            'cashbox_vouchers',
            'cashbox_voucher_audit_log',
            'customer_fiscal_opening_balances'
        ];

        console.log('🔢 [PERF] Checking PostgreSQL serial sequences...');
        for (const tableName of serialTables) {
            try {
                await this.refreshPostgresSerialSequence(tableName, 'id');
            } catch (error) {
                console.warn(`⚠️ [PERF] تعذر ضبط تسلسل ${tableName}.id:`, error && error.message ? error.message : error);
            }
        }
        console.log('✅ [PERF] PostgreSQL serial sequences verified');
    }

    async start() {
        await this.ensureNotificationSubscriptionStore();

        // Optimize Database Performance on Startup
        await this.ensureIndexes();
        await this.ensurePostgresSerialSequences();

        this.server = http.createServer(async (req, res) => {
            res._tasfiyaRequest = req;
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');
            res.setHeader('Access-Control-Expose-Headers', 'ETag');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const parsedUrl = parse(req.url, true);
            const pathname = parsedUrl.pathname;

            try {
                console.log(`📨 [REQUEST] ${req.method} ${pathname}`);
                // Serve Static Files
                // Serve Static Files
                if (pathname.endsWith('.js') || pathname.endsWith('.json') || pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/assets/')) {
                    this.serveStatic(res, pathname);
                    return;
                }

                // Public Routes
                if (pathname === '/login.html' || pathname === '/login') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'login.html'), 'text/html');
                    return;
                }

                // API: Login
                if (pathname === '/api/login' && req.method === 'POST') {
                    await this.handleLogin(req, res);
                    return;
                }

                if (pathname === '/api/cashier-login' && req.method === 'POST') {
                    await this.handleCashierLogin(req, res);
                    return;
                }

                if (pathname === '/api/session' && req.method === 'GET') {
                    await this.handleGetSession(req, res);
                    return;
                }

                // This intentionally exposes only the public OneSignal App ID.
                // The App API key never leaves the server.
                if (pathname === '/api/client-config' && req.method === 'GET') {
                    this.handlePublicClientConfig(res);
                    return;
                }

                if (pathname === '/api/logout' && req.method === 'POST') {
                    await this.handleLogout(req, res);
                    return;
                }

                if (pathname === '/api/cashiers-list' && req.method === 'GET') {
                    await this.handleGetCashiersList(res);
                    return;
                }

                const authContext = this.requireAuthorization(req, res, pathname, req.method);
                if (!authContext) {
                    return;
                }

                if (pathname === '/api/cashiers/set-pin' && req.method === 'POST') {
                    await this.handleSetCashierPin(req, res);
                    return;
                }

                if (pathname === '/cashiers-management.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'cashiers-management.html'), 'text/html');
                    return;
                }

                // Protected Routes
                if (pathname === '/' || pathname === '/index.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'index.html'), 'text/html');
                    return;
                }

                if (pathname === '/atm-reports.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'atm-reports.html'), 'text/html');
                    return;
                }

                if (pathname === '/cashbox-reports.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'cashbox-reports.html'), 'text/html');
                    return;
                }

                if (pathname === '/customer-ledger.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'customer-ledger.html'), 'text/html');
                    return;
                }



                // API endpoints
                if (pathname === '/api/reconciliations/stats') {
                    await this.handleGetReconciliationsStats(res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/reconciliations') {
                    await this.handleGetReconciliations(res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/reconciliations/reset' && req.method === 'POST') {
                    await this.handleResetReconciliations(res);
                    return;
                }
                else if (pathname === '/api/atm-report') {
                    await this.handleGetAtmReport(res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/cashbox-report') {
                    await this.handleGetCashboxReport(res, parsedUrl.query);
                    return;
                }
                else if (pathname.match(/^\/api\/reconciliation\/\d+$/)) {
                    const id = pathname.split('/').pop();
                    await this.handleGetReconciliationDetails(res, id);
                    return;
                }
                else if (pathname === '/api/lookups') {
                    await this.handleGetLookups(res);
                    return;
                }
                else if (pathname === '/api/customer-ledger') {
                    await this.handleGetCustomerLedger(res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/update-manual-transaction' && req.method === 'POST') {
                    await this.handleUpdateManualTransaction(req, res);
                    return;
                }
                else if (pathname === '/api/delete-manual-transaction' && req.method === 'POST') {
                    await this.handleDeleteManualTransaction(req, res);
                    return;
                }
                else if (pathname === '/api/customers-summary') {
                    await this.handleGetCustomersSummary(res, parsedUrl.query);
                    return;
                }
                // User Management
                else if (pathname === '/users-management.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'users-management.html'), 'text/html');
                    return;
                }
                else if (pathname === '/api/users') {
                    if (req.method === 'GET') await this.handleGetUsers(res);
                    else if (req.method === 'POST') await this.handleSaveUser(req, res);
                    return;
                }
                else if (pathname.match(/^\/api\/users\/\d+$/) && req.method === 'DELETE') {
                    const id = pathname.split('/').pop();
                    await this.handleDeleteUser(res, id);
                    return;
                }

                // --- Reconciliation Requests Feature ---
                else if (pathname === '/request-reconciliation.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'request-reconciliation.html'), 'text/html');
                    return;
                }
                else if (pathname === '/reconciliation-requests.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'reconciliation-requests.html'), 'text/html');
                    return;
                }
                else if (pathname === '/api/reconciliation-requests') {
                    if (req.method === 'GET') await this.handleGetReconciliationRequests(res, parsedUrl.query);
                    else if (req.method === 'POST') await this.handleCreateReconciliationRequest(req, res);
                    else if (req.method === 'DELETE') await this.handleDeleteAllReconciliationRequests(res);
                    return;
                }
                // Reset sequence endpoint
                else if (pathname === '/api/reconciliation-requests/reset-sequence' && req.method === 'POST') {
                    await this.handleResetRequestsSequence(res);
                    return;
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+\/approve$/) && req.method === 'POST') {
                    const id = pathname.split('/')[3]; // /api/reconciliation-requests/ID/approve
                    await this.handleApproveReconciliationRequest(res, id, req);
                    return;
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+\/complete$/) && req.method === 'POST') {
                    const id = pathname.split('/')[3]; // /api/reconciliation-requests/ID/complete
                    await this.handleCompleteReconciliationRequest(res, id);
                    return;
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+$/) && req.method === 'GET') {
                    const id = pathname.split('/').pop();
                    await this.handleGetReconciliationRequestById(res, id, parsedUrl.query);
                    return;
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+$/) && req.method === 'DELETE') {
                    const id = pathname.split('/').pop();
                    await this.handleDeleteReconciliationRequest(res, id);
                    return;
                }

                // Allow clients to update status (Sync back)
                else if (pathname === '/api/sync/update-status' && req.method === 'POST') {
                    await this.handleUpdateRequestStatus(req, res);
                    return;
                }

                // Debug DB Route
                else if (pathname === '/api/debug-db') {
                    await this.handleDebugDB(res);
                    return;
                }

                // --- End Reconciliation Requests Feature ---
                else if (pathname === '/api/customers') {
                    console.log('🔥 [ROUTER] /api/customers route HIT!');
                    await this.handleGetCustomerList(req, res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/atms') {
                    await this.handleGetAtms(req, res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/sync/users' && req.method === 'POST') {
                    await this.handleSyncUsers(req, res);
                    return;
                }

                else if (pathname === '/api/notifications/status' && req.method === 'GET') {
                    this.handleNotificationStatus(res);
                    return;
                }
                else if (pathname === '/api/notifications/diagnostics' && req.method === 'GET') {
                    await this.handleNotificationDiagnostics(res, authContext.user);
                    return;
                }
                else if (pathname === '/api/notifications/register' && req.method === 'POST') {
                    await this.handleRegisterNotificationSubscription(req, res, authContext.user);
                    return;
                }
                else if (pathname === '/api/notifications/test' && req.method === 'POST') {
                    await this.handleNotificationTest(req, res, authContext.user);
                    return;
                }
                else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                }

            } catch (error) {
                console.error('Web Server Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });

        // Handle server errors (e.g. Port in use)
        this.server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.log(`⚠️ [WEB APP] Port ${this.port} is in use, trying ${this.port + 1}...`);
                this.port++;
                this.server.listen(this.port);
            } else {
                console.error('❌ [WEB APP] Server error:', e);
            }
        });

        this.server.listen(this.port, () => {
            console.log(`🌐 [WEB APP] Server running at http://localhost:${this.port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('🌐 [WEB APP] Server stopped');
            });
            this.server = null;
        }
    }

    serveFile(res, filePath, contentType) {
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    res.writeHead(500);
                    res.end('Error loading file');
                }
            } else {
                // Prevent caching for HTML files to ensure updates are always loaded
                const headers = { 'Content-Type': contentType };
                if (contentType === 'text/html') {
                    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    headers['Pragma'] = 'no-cache';
                    headers['Expires'] = '0';
                }
                res.writeHead(200, headers);
                res.end(content, 'utf-8');
            }
        });
    }

    serveStatic(res, pathname) {
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(__dirname, 'web-dashboard', safePath);

        const ext = path.extname(filePath);
        let contentType = 'text/plain';
        if (ext === '.css') contentType = 'text/css';
        if (ext === '.js') contentType = 'text/javascript';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.jpg') contentType = 'image/jpeg';
        if (ext === '.svg') contentType = 'image/svg+xml';
        if (ext === '.json') contentType = 'application/json';
        if (path.basename(filePath) === 'manifest.json') contentType = 'application/manifest+json';

        this.serveFile(res, filePath, contentType);
    }

    async handleLogin(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body);
                const adminRecord = await this.dbManager.db.prepare(`
                    SELECT id, name, username, password, COALESCE(role, 'admin') as role, permissions
                    FROM admins
                    WHERE username = ? AND active = 1
                    LIMIT 1
                `).get(username);

                const authResult = verifySecret(adminRecord ? adminRecord.password : '', password);

                if (adminRecord && authResult.ok) {
                    if (authResult.needsRehash) {
                        await this.dbManager.db.prepare(`
                            UPDATE admins
                            SET password = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(hashSecret(password), adminRecord.id);
                    }

                    const admin = {
                        id: adminRecord.id,
                        name: adminRecord.name,
                        username: adminRecord.username,
                        role: adminRecord.role,
                        permissions: adminRecord.permissions
                    };

                    if (admin.permissions && typeof admin.permissions === 'string') {
                        try { admin.permissions = JSON.parse(admin.permissions); } catch (e) { }
                    }

                    const session = this.sessionStore.createSession(admin);
                    this.sendJson(
                        res,
                        { success: true, user: admin },
                        { headers: { 'Set-Cookie': this.buildSessionCookie(session.token) } }
                    );
                } else {
                    this.sendJson(res, { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
                }
            } catch (error) {
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleCashierLogin(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { cashierId, pin } = JSON.parse(body);
                // Validate
                if (!cashierId || !pin) {
                    return this.sendJson(res, { success: false, error: 'البيانات غير مكتملة' });
                }

                const cashier = await this.dbManager.db.prepare(`
                    SELECT id, name, cashier_number, branch_id, pin_code, active
                    FROM cashiers
                    WHERE id = ? AND active = 1
                    LIMIT 1
                `).get(cashierId);

                if (!cashier) {
                    return this.sendJson(res, { success: false, error: 'الكاشير غير موجود' });
                }

                if (!cashier.pin_code) {
                    return this.sendJson(res, { success: false, error: 'لم يتم تعيين رمز لهذا الكاشير بعد' });
                }

                const authResult = verifySecret(cashier.pin_code, pin);

                if (authResult.ok) {
                    if (authResult.needsRehash) {
                        await this.dbManager.db.prepare(`
                            UPDATE cashiers
                            SET pin_code = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(hashSecret(pin), cashier.id);
                    }

                    // Success
                    // Return user object similar to admin but with role 'cashier'
                    const userObj = {
                        id: cashier.id,
                        name: cashier.name,
                        username: cashier.cashier_number, // User number as username
                        role: 'cashier',
                        permissions: ['request-reconciliation.html'], // Only access to request form
                        branch_id: cashier.branch_id
                    };
                    const session = this.sessionStore.createSession(userObj);
                    this.sendJson(
                        res,
                        { success: true, user: userObj },
                        { headers: { 'Set-Cookie': this.buildSessionCookie(session.token) } }
                    );
                } else {
                    this.sendJson(res, { success: false, error: 'رمز الدخول غير صحيح' });
                }
            } catch (error) {
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleSetCashierPin(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { cashierId, pin } = JSON.parse(body);
                const normalizedPin = String(pin || '').trim();
                if (!cashierId || !/^\d{4,6}$/.test(normalizedPin)) {
                    throw new Error('رمز الدخول يجب أن يكون من 4 إلى 6 أرقام');
                }

                await this.dbManager.db.prepare(`
                    UPDATE cashiers
                    SET pin_code = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(hashSecret(normalizedPin), cashierId);
                this.sendJson(res, { success: true });
            } catch (error) {
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleGetCashiersList(res) {
        try {
            const cashiers = await this.dbManager.db.prepare(`
                SELECT c.id, c.name, c.cashier_number, c.active, c.pin_code, b.branch_name 
                FROM cashiers c 
                LEFT JOIN branches b ON c.branch_id = b.id
                ORDER BY c.id DESC
            `).all();

            // Mask PIN code for security, just indicate if set
            const safeCashiers = cashiers.map(c => ({
                ...c,
                has_pin: !!c.pin_code,
                pin_code: undefined // Do not send actual PIN
            }));

            this.sendJson(res, { success: true, data: safeCashiers });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    // Removed duplicate handleGetLookups from here. Use the one defined later in the file.

    async handleGetReconciliations(res, query) {
        try {
            let sql = `
                SELECT 
                    r.id, r.reconciliation_number, r.reconciliation_date, r.system_sales, r.total_receipts, r.surplus_deficit, r.status,
                    (SELECT COALESCE(SUM(cr.total_amount), 0) FROM cash_receipts cr WHERE cr.reconciliation_id = r.id) as cash_total,
                    c.name as cashier_name,
                    a.name as accountant_name
                FROM reconciliations r
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                LEFT JOIN accountants a ON r.accountant_id = a.id
                WHERE 1=1
            `;

            const params = [];

            if (query.dateFrom) {
                sql += ` AND r.reconciliation_date >= ?`;
                params.push(query.dateFrom);
            }
            if (query.dateTo) {
                sql += ` AND r.reconciliation_date <= ?`;
                params.push(query.dateTo);
            }
            if (query.cashierId && query.cashierId !== 'all') {
                sql += ` AND r.cashier_id = ?`;
                params.push(query.cashierId);
            }
            // Branch filtering would require joining via cashier or storing branch_id in reconciliation
            // Assuming cashier linked to branch, or passed via query.
            // Check schema: cashiers has branch_id.
            if (query.branchId && query.branchId !== 'all') {
                sql += ` AND c.branch_id = ?`;
                params.push(query.branchId);
            }
            if (query.status && query.status !== 'all') {
                sql += ` AND r.status = ?`;
                params.push(query.status);
            }

            // Sort by ID DESC to ensure latest entries show first regardless of date typos
            sql += ` ORDER BY r.id DESC`;

            // Add LIMIT if specified (for performance with large datasets)
            if (query.limit) {
                sql += ` LIMIT ?`;
                params.push(parseInt(query.limit));
            }

            const data = await this.dbManager.db.prepare(sql).all(params);
            this.sendJson(res, { success: true, data: data });

        } catch (error) {
            console.error('API Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetReconciliationsStats(res, query) {
        try {
            const params = [];
            let whereClause = 'WHERE 1=1';

            if (query.dateFrom) {
                whereClause += ' AND r.reconciliation_date >= ?';
                params.push(query.dateFrom);
            }
            if (query.dateTo) {
                whereClause += ' AND r.reconciliation_date <= ?';
                params.push(query.dateTo);
            }
            if (query.cashierId && query.cashierId !== 'all') {
                whereClause += ' AND r.cashier_id = ?';
                params.push(query.cashierId);
            }
            if (query.branchId && query.branchId !== 'all') {
                whereClause += ' AND c.branch_id = ?';
                params.push(query.branchId);
            }
            if (query.status && query.status !== 'all') {
                whereClause += ' AND r.status = ?';
                params.push(query.status);
            }

            const statsRow = await this.dbManager.db.prepare(`
                WITH filtered_reconciliations AS (
                    SELECT
                        r.id,
                        COALESCE(CAST(r.total_receipts AS NUMERIC), 0) AS total_receipts,
                        COALESCE(CAST(r.system_sales AS NUMERIC), 0) AS system_sales
                    FROM reconciliations r
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    LEFT JOIN accountants a ON r.accountant_id = a.id
                    ${whereClause}
                )
                SELECT
                    COUNT(*) AS count,
                    COALESCE(SUM(total_receipts), 0) AS total_receipts,
                    COALESCE(SUM(system_sales), 0) AS total_sales,
                    COALESCE((
                        SELECT SUM(COALESCE(CAST(cr.total_amount AS NUMERIC), 0))
                        FROM cash_receipts cr
                        JOIN filtered_reconciliations fr ON fr.id = cr.reconciliation_id
                    ), 0) AS total_cash
                FROM filtered_reconciliations
            `).get(params);

            const result = {
                count: parseNumericDbValue(statsRow?.count, 0),
                totalReceipts: parseNumericDbValue(statsRow?.total_receipts, 0),
                totalSales: parseNumericDbValue(statsRow?.total_sales, 0),
                totalCash: parseNumericDbValue(statsRow?.total_cash, 0)
            };

            this.sendJson(res, { success: true, stats: result });

        } catch (error) {
            console.error('Stats API Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleResetReconciliations(res) {
        try {
            console.log('🗑️ [RESET] Starting reconciliations reset...');

            // Delete in correct order to avoid FK violations
            // 1. Delete child records first
            await this.dbManager.db.prepare('DELETE FROM cash_receipts').run();
            console.log('✅ [RESET] Deleted cash_receipts');

            await this.dbManager.db.prepare('DELETE FROM bank_receipts').run();
            console.log('✅ [RESET] Deleted bank_receipts');

            await this.dbManager.db.prepare('DELETE FROM postpaid_sales').run();
            console.log('✅ [RESET] Deleted postpaid_sales');

            await this.dbManager.db.prepare('DELETE FROM customer_receipts').run();
            console.log('✅ [RESET] Deleted customer_receipts');

            // 2. Delete parent records last
            await this.dbManager.db.prepare('DELETE FROM reconciliations').run();
            console.log('✅ [RESET] Deleted reconciliations');

            // Reset auto-increment counter (SQLite specific)
            await this.dbManager.db.prepare('DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?, ?, ?)').run(
                'reconciliations', 'cash_receipts', 'bank_receipts', 'postpaid_sales', 'customer_receipts'
            );
            console.log('✅ [RESET] Reset auto-increment counters');

            this.sendJson(res, {
                success: true,
                message: 'All reconciliation data deleted successfully. Ready for fresh sync.'
            });

        } catch (error) {
            console.error('❌ [RESET] Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetAtmReport(res, query) {
        try {
            console.log('[ATM Report] Query params:', query);

            let sql = `
                SELECT 
                    br.id, 
                    br.amount, 
                    br.operation_type, 
                    br.created_at,
                    r.id as reconciliation_id,
                    r.reconciliation_number,
                    r.reconciliation_date,
                    atm.id as atm_id,
                    atm.name as atm_name,
                    atm.bank_name,
                    atm.location,
                    c.name as cashier_name
                FROM bank_receipts br
                LEFT JOIN reconciliations r ON br.reconciliation_id = r.id
                LEFT JOIN atms atm ON br.atm_id = atm.id
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                WHERE 1=1
            `;

            const params = [];

            if (query.dateFrom) {
                sql += ` AND r.reconciliation_date >= ?`;
                params.push(query.dateFrom);
            }
            if (query.dateTo) {
                sql += ` AND r.reconciliation_date <= ?`;
                params.push(query.dateTo);
            }
            if (query.cashierId && query.cashierId !== 'all') {
                sql += ` AND r.cashier_id = ?`;
                params.push(query.cashierId);
            }
            if (query.branchId && query.branchId !== 'all') {
                sql += ` AND atm.branch_id = ?`;
                params.push(query.branchId);
            }
            // Revert to accountLocation for stability
            if (query.accountLocation && query.accountLocation !== 'all') {
                sql += ` AND atm.location = ?`;
                params.push(query.accountLocation);
            }
            if (query.specificAmount) {
                sql += ` AND br.amount = ?`;
                params.push(query.specificAmount);
            }

            sql += ` ORDER BY br.created_at DESC, br.id DESC`;

            console.log('[ATM Report] SQL:', sql);
            console.log('[ATM Report] Params:', params);

            const data = await this.dbManager.db.prepare(sql).all(params);

            console.log('[ATM Report] Found records:', data.length);
            this.sendJson(res, { success: true, data: data });

        } catch (error) {
            console.error('[ATM Report] API Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetCashboxReport(res, query) {
        try {
            console.log('[Cashbox Report] Query params:', query);

            const branchId = String(query?.branchId || '').trim();
            const voucherType = String(query?.voucherType || '').trim();
            const dateFrom = String(query?.dateFrom || '').trim();
            const dateTo = String(query?.dateTo || '').trim();
            const search = String(query?.search || '').trim();

            const where = ['1=1'];
            const params = [];

            if (branchId && branchId !== 'all') {
                where.push('v.branch_id = ?');
                params.push(branchId);
            }

            if (voucherType && voucherType !== 'all') {
                where.push('v.voucher_type = ?');
                params.push(voucherType);
            }

            if (dateFrom) {
                where.push('v.voucher_date >= ?');
                params.push(dateFrom);
            }

            if (dateTo) {
                where.push('v.voucher_date <= ?');
                params.push(dateTo);
            }

            if (search) {
                where.push(`(
                    v.counterparty_name LIKE ?
                    OR COALESCE(v.reference_no, '') LIKE ?
                    OR COALESCE(v.description, '') LIKE ?
                    OR CAST(COALESCE(v.voucher_sequence_number, v.voucher_number) AS TEXT) LIKE ?
                )`);
                const likeTerm = `%${search}%`;
                params.push(likeTerm, likeTerm, likeTerm, likeTerm);
            }

            const whereClause = where.join(' AND ');
            const vouchersSql = `
                SELECT
                    v.id,
                    v.voucher_number,
                    v.voucher_sequence_number,
                    COALESCE(v.voucher_sequence_number, v.voucher_number) AS voucher_display_number,
                    v.voucher_type,
                    v.branch_id,
                    COALESCE(b.branch_name, '-') AS branch_name,
                    v.counterparty_type,
                    v.counterparty_name,
                    v.amount,
                    v.reference_no,
                    v.description,
                    v.voucher_date,
                    v.created_by,
                    v.created_at
                FROM cashbox_vouchers v
                LEFT JOIN branches b ON b.id = v.branch_id
                WHERE ${whereClause}
                ORDER BY
                    v.voucher_date DESC,
                    COALESCE(v.voucher_sequence_number, v.voucher_number) DESC,
                    v.id DESC
            `;

            const rows = await this.dbManager.db.prepare(vouchersSql).all(params);
            const vouchers = Array.isArray(rows) ? rows : [];

            const openingSql = `
                SELECT COALESCE(SUM(opening_balance), 0) AS total_opening
                FROM branch_cashboxes
                ${branchId && branchId !== 'all' ? 'WHERE branch_id = ?' : ''}
            `;
            const openingParams = (branchId && branchId !== 'all') ? [branchId] : [];
            const openingRow = await this.dbManager.db.prepare(openingSql).get(openingParams);

            const openingBalance = Number(openingRow?.total_opening || 0);
            const totalReceipts = vouchers.reduce((sum, row) => (
                row?.voucher_type === 'receipt' ? sum + Number(row?.amount || 0) : sum
            ), 0);
            const totalPayments = vouchers.reduce((sum, row) => (
                row?.voucher_type === 'payment' ? sum + Number(row?.amount || 0) : sum
            ), 0);

            this.sendJson(res, {
                success: true,
                data: vouchers,
                summary: {
                    openingBalance,
                    totalReceipts,
                    totalPayments,
                    currentBalance: openingBalance + totalReceipts - totalPayments
                }
            });
        } catch (error) {
            const message = String(error?.message || '');
            const missingCashboxTables = message.includes('no such table: cashbox_vouchers')
                || message.includes('no such table: branch_cashboxes')
                || message.includes('relation "cashbox_vouchers" does not exist')
                || message.includes('relation "branch_cashboxes" does not exist');

            if (missingCashboxTables) {
                console.warn('[Cashbox Report] Cashbox tables are missing. Returning empty report.');
                this.sendJson(res, {
                    success: true,
                    data: [],
                    summary: {
                        openingBalance: 0,
                        totalReceipts: 0,
                        totalPayments: 0,
                        currentBalance: 0
                    }
                });
                return;
            }

            console.error('[Cashbox Report] API Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetReconciliationDetails(res, id) {
        try {
            // Main info
            // Main info
            const rec = await this.dbManager.db.prepare(`
                SELECT r.*, c.name as cashier_name, a.name as accountant_name
                FROM reconciliations r
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                LEFT JOIN accountants a ON r.accountant_id = a.id
                WHERE r.id = ?
            `).get(id);

            if (!rec) {
                this.sendJson(res, { success: false, error: 'Not found' });
                return;
            }

            // Cash breakdown
            const cashReceipts = await this.dbManager.db.prepare('SELECT * FROM cash_receipts WHERE reconciliation_id = ?').all(id);
            // Bank receipts
            const bankReceipts = await this.dbManager.db.prepare(`
                SELECT b.*, tm.name as atm_name 
                FROM bank_receipts b 
                LEFT JOIN atms tm ON b.atm_id = tm.id 
                WHERE b.reconciliation_id = ?
                `).all(id);

            // Other receipts/invoices if needed
            const customerReceipts = await this.dbManager.db.prepare('SELECT * FROM customer_receipts WHERE reconciliation_id = ?').all(id);
            const postpaidSales = await this.dbManager.db.prepare('SELECT * FROM postpaid_sales WHERE reconciliation_id = ?').all(id);

            this.sendJson(res, {
                success: true,
                data: {
                    reconciliation: rec,
                    cashReceipts,
                    bankReceipts,
                    customerReceipts,
                    postpaidSales
                }
            });

        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    getYearFromDateValue(value) {
        const match = String(value || '').match(/^(\d{4})/);
        return match ? match[1] : '';
    }

    async getCustomerLedgerOpeningContext(customerName, dateFrom = '', pool = null) {
        const yearLimit = this.getYearFromDateValue(dateFrom);
        let openingRow = null;

        try {
            if (pool) {
                const params = [customerName];
                const yearSql = yearLimit ? 'AND CAST(fiscal_year AS INTEGER) <= $2' : '';
                if (yearLimit) params.push(Number(yearLimit));
                const result = await pool.query(
                    `SELECT *
                     FROM customer_fiscal_opening_balances
                     WHERE TRIM(COALESCE(customer_name, '')) = TRIM($1)
                     ${yearSql}
                     ORDER BY CAST(fiscal_year AS INTEGER) DESC, id DESC
                     LIMIT 1`,
                    params
                );
                openingRow = result.rows?.[0] || null;
            } else {
                const params = [customerName];
                const yearSql = yearLimit ? 'AND CAST(fiscal_year AS INTEGER) <= ?' : '';
                if (yearLimit) params.push(Number(yearLimit));
                openingRow = await this.dbManager.db.prepare(
                    `SELECT *
                     FROM customer_fiscal_opening_balances
                     WHERE TRIM(COALESCE(customer_name, '')) = TRIM(?)
                     ${yearSql}
                     ORDER BY CAST(fiscal_year AS INTEGER) DESC, id DESC
                     LIMIT 1`
                ).get(params);
            }
        } catch (_error) {
            openingRow = null;
        }

        const openingStartDate = openingRow?.fiscal_year ? `${openingRow.fiscal_year}-01-01` : '';
        let openingBalance = parseNumericDbValue(openingRow?.opening_balance, 0);

        if (dateFrom && openingStartDate) {
            openingBalance += await this.calculateCustomerLedgerPreperiod(customerName, dateFrom, openingStartDate, pool);
        }

        return {
            hasOpening: !!openingRow,
            openingStartDate,
            openingBalance
        };
    }

    async calculateCustomerLedgerPreperiod(customerName, dateFrom, openingStartDate = '', pool = null) {
        const lowerDate = String(openingStartDate || '').trim();
        const upperDate = String(dateFrom || '').trim();
        if (!upperDate) return 0;

        if (pool) {
            const params = lowerDate ? [customerName, lowerDate, upperDate] : [customerName, upperDate];
            const recSql = lowerDate ? 'AND r.reconciliation_date >= $2 AND r.reconciliation_date < $3' : 'AND r.reconciliation_date < $2';
            const manualSql = lowerDate ? 'AND DATE(created_at) >= $2 AND DATE(created_at) < $3' : 'AND DATE(created_at) < $2';
            const [postpaid, receipts, manualPostpaid, manualReceipts] = await Promise.all([
                pool.query(`SELECT COALESCE(SUM(ps.amount), 0) AS total FROM postpaid_sales ps LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id WHERE ps.customer_name = $1 ${recSql}`, params),
                pool.query(`SELECT COALESCE(SUM(cr.amount), 0) AS total FROM customer_receipts cr LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id WHERE cr.customer_name = $1 ${recSql}`, params),
                pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM manual_postpaid_sales WHERE customer_name = $1 ${manualSql}`, params),
                pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM manual_customer_receipts WHERE customer_name = $1 ${manualSql}`, params)
            ]);
            return parseNumericDbValue(postpaid.rows?.[0]?.total, 0)
                + parseNumericDbValue(manualPostpaid.rows?.[0]?.total, 0)
                - parseNumericDbValue(receipts.rows?.[0]?.total, 0)
                - parseNumericDbValue(manualReceipts.rows?.[0]?.total, 0);
        }

        const params = lowerDate ? [customerName, lowerDate, upperDate] : [customerName, upperDate];
        const recSql = lowerDate ? 'AND r.reconciliation_date >= ? AND r.reconciliation_date < ?' : 'AND r.reconciliation_date < ?';
        const manualSql = lowerDate ? 'AND DATE(created_at) >= ? AND DATE(created_at) < ?' : 'AND DATE(created_at) < ?';
        const postpaid = await this.dbManager.db.prepare(`SELECT COALESCE(SUM(ps.amount), 0) AS total FROM postpaid_sales ps LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id WHERE ps.customer_name = ? ${recSql}`).get(params);
        const receipts = await this.dbManager.db.prepare(`SELECT COALESCE(SUM(cr.amount), 0) AS total FROM customer_receipts cr LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id WHERE cr.customer_name = ? ${recSql}`).get(params);
        const manualPostpaid = await this.dbManager.db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM manual_postpaid_sales WHERE customer_name = ? ${manualSql}`).get(params);
        const manualReceipts = await this.dbManager.db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM manual_customer_receipts WHERE customer_name = ? ${manualSql}`).get(params);

        return parseNumericDbValue(postpaid?.total, 0)
            + parseNumericDbValue(manualPostpaid?.total, 0)
            - parseNumericDbValue(receipts?.total, 0)
            - parseNumericDbValue(manualReceipts?.total, 0);
    }

    buildOpeningLedgerRow(openingContext, dateFrom = '') {
        const openingBalance = parseNumericDbValue(openingContext?.openingBalance, 0);
        if (!openingContext?.hasOpening && Math.abs(openingBalance) <= 0.000001) {
            return null;
        }
        return {
            id: 'opening-balance',
            amount: Math.abs(openingBalance),
            created_at: `${dateFrom || openingContext.openingStartDate || '1970-01-01'} 00:00:00`,
            type: 'رصيد افتتاحي',
            description: 'رصيد مرحل من سنة مؤرشفة',
            cashier_name: 'النظام',
            reconciliation_number: null,
            debit: openingBalance >= 0 ? openingBalance : 0,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0
        };
    }

    async handleGetCustomerLedger(res, query) {
        try {
            const { customerName, dateFrom, dateTo } = query;

            if (!customerName) {
                return this.sendJson(res, { success: false, error: 'اسم العميل مطلوب' });
            }

            // Check if we are in Server Mode (Render/Postgres) or Local Mode (SQLite)
            const pool = this.dbManager.pool;

            if (pool) {
                // ============================================
                // POSTGRESQL MODE (Server / Synced Data)
                // ============================================
                console.log('[Customer Ledger] Using PostgreSQL connection (Synced Data)');

                const openingContext = await this.getCustomerLedgerOpeningContext(customerName, dateFrom, pool);
                const effectiveDateFrom = (dateFrom && dateFrom.trim() !== '') ? dateFrom : openingContext.openingStartDate;
                let dateFilterSales = '';
                let dateFilterReceipts = '';
                const paramsSales = [customerName];
                const paramsReceipts = [customerName];
                let pNextSales = 2;
                let pNextReceipts = 2;

                if (effectiveDateFrom && effectiveDateFrom.trim() !== '') {
                    dateFilterSales += ` AND ps.created_at >= $${pNextSales++}`;
                    dateFilterReceipts += ` AND cr.created_at >= $${pNextReceipts++}`;
                    paramsSales.push(effectiveDateFrom);
                    paramsReceipts.push(effectiveDateFrom);
                }
                if (dateTo && dateTo.trim() !== '') {
                    dateFilterSales += ` AND ps.created_at <= $${pNextSales++}`;
                    dateFilterReceipts += ` AND cr.created_at <= $${pNextReceipts++}`;
                    const dateToEnd = dateTo.includes(' ') ? dateTo : dateTo + ' 23:59:59';
                    paramsSales.push(dateToEnd);
                    paramsReceipts.push(dateToEnd);
                }

                // Get Debits
                const salesResult = await pool.query(`
                    SELECT ps.id, ps.amount, ps.created_at, 'مبيعات آجلة' as type, 'فاتورة مبيعات' as description, c.name as cashier_name, r.reconciliation_number
                    FROM postpaid_sales ps 
                    LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE ps.customer_name = $1 ${dateFilterSales}
                `, paramsSales);

                const filterSalesManual = dateFilterSales.replace(/ps\./g, '');
                const manualSalesResult = await pool.query(`
                    SELECT id, amount, created_at, 'مبيعات يدوية' as type, reason as description, 'مسؤول النظام' as cashier_name, NULL as reconciliation_number
                    FROM manual_postpaid_sales 
                    WHERE customer_name = $1 ${filterSalesManual}
                `, paramsSales);

                // Get Credits
                const receiptsResult = await pool.query(`
                    SELECT cr.id, cr.amount, cr.payment_type, cr.created_at, 'سند قبض' as type, 'سداد - ' || cr.payment_type as description, c.name as cashier_name, r.reconciliation_number
                    FROM customer_receipts cr 
                    LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE cr.customer_name = $1 ${dateFilterReceipts}
                `, paramsReceipts);

                const filterReceiptsManual = dateFilterReceipts.replace(/cr\./g, '');
                const manualReceiptsResult = await pool.query(`
                    SELECT id, amount, 'نقدي' as payment_type, created_at, 'سند قبض يدوي' as type, reason as description, 'مسؤول النظام' as cashier_name, NULL as reconciliation_number
                    FROM manual_customer_receipts 
                    WHERE customer_name = $1 ${filterReceiptsManual}
                `, paramsReceipts);

                const ledger = [
                    this.buildOpeningLedgerRow(openingContext, dateFrom),
                    ...salesResult.rows.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...manualSalesResult.rows.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...receiptsResult.rows.map(r => ({ ...r, debit: 0, credit: r.amount })),
                    ...manualReceiptsResult.rows.map(r => ({ ...r, debit: 0, credit: r.amount }))
                ].filter(Boolean).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                this.sendJson(res, { success: true, data: ledger });

            } else {
                // ============================================
                // SQLITE MODE (Local / Offline)
                // ============================================
                console.log('[Customer Ledger] Using SQLite connection (Local Data)');

                const openingContext = await this.getCustomerLedgerOpeningContext(customerName, dateFrom);
                const effectiveDateFrom = (dateFrom && dateFrom.trim() !== '') ? dateFrom : openingContext.openingStartDate;
                let dateFilterSales = '';
                let dateFilterReceipts = '';
                const paramsSales = [customerName];
                const paramsReceipts = [customerName];

                if (effectiveDateFrom && effectiveDateFrom.trim() !== '') {
                    dateFilterSales += ' AND ps.created_at >= ?';
                    dateFilterReceipts += ' AND cr.created_at >= ?';
                    paramsSales.push(effectiveDateFrom);
                    paramsReceipts.push(effectiveDateFrom);
                }
                if (dateTo && dateTo.trim() !== '') {
                    dateFilterSales += ' AND ps.created_at <= ?';
                    dateFilterReceipts += ' AND cr.created_at <= ?';
                    const dateToEnd = dateTo.includes(' ') ? dateTo : dateTo + ' 23:59:59';
                    paramsSales.push(dateToEnd);
                    paramsReceipts.push(dateToEnd);
                }

                const sales = await this.dbManager.db.prepare(`
                    SELECT ps.id, ps.amount, ps.created_at, 'مبيعات آجلة' as type, 'فاتورة مبيعات' as description, c.name as cashier_name, r.reconciliation_number
                    FROM postpaid_sales ps 
                    LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE ps.customer_name = ? ${dateFilterSales}
                `).all(paramsSales);

                const filterSalesManual = dateFilterSales.replace(/ps\./g, '');
                const manualSales = await this.dbManager.db.prepare(`
                    SELECT id, amount, created_at, 'مبيعات يدوية' as type, reason as description, 'مسؤول النظام' as cashier_name, NULL as reconciliation_number
                    FROM manual_postpaid_sales 
                    WHERE customer_name = ? ${filterSalesManual}
                `).all(paramsSales);

                const receipts = await this.dbManager.db.prepare(`
                    SELECT cr.id, cr.amount, cr.payment_type, cr.created_at, 'سند قبض' as type, 'سداد - ' || cr.payment_type as description, c.name as cashier_name, r.reconciliation_number
                    FROM customer_receipts cr 
                    LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE cr.customer_name = ? ${dateFilterReceipts}
                `).all(paramsReceipts);

                const filterReceiptsManual = dateFilterReceipts.replace(/cr\./g, '');
                const manualReceipts = await this.dbManager.db.prepare(`
                    SELECT id, amount, 'نقدي' as payment_type, created_at, 'سند قبض يدوي' as type, reason as description, 'مسؤول النظام' as cashier_name, NULL as reconciliation_number
                    FROM manual_customer_receipts 
                    WHERE customer_name = ? ${filterReceiptsManual}
                `).all(paramsReceipts);

                const ledger = [
                    this.buildOpeningLedgerRow(openingContext, dateFrom),
                    ...sales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...manualSales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...receipts.map(r => ({ ...r, debit: 0, credit: r.amount })),
                    ...manualReceipts.map(r => ({ ...r, debit: 0, credit: r.amount }))
                ].filter(Boolean).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                this.sendJson(res, { success: true, data: ledger });
            }

        } catch (error) {
            console.error('[Customer Ledger] Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }
    async handleGetCustomersSummary(res, query = {}) {
        try {
            // Determine DB type for compatibility
            // SQLite uses MAX(a,b,c), Postgres uses GREATEST(a,b,c)
            // Postgres throws error on empty string for timestamp, SQLite accepts it
            const isPostgres = !!process.env.DATABASE_URL;
            const greatestFunc = isPostgres ? 'GREATEST' : 'MAX';
            const defaultDate = isPostgres ? "'1970-01-01 00:00:00'" : "''";
            const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
            const dateToRaw = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';

            const params = [];
            const dateFilters = [];
            if (dateFrom) {
                dateFilters.push('t.created_at >= ?');
                params.push(dateFrom);
            }
            if (dateToRaw) {
                const dateTo = dateToRaw.includes(' ') ? dateToRaw : `${dateToRaw} 23:59:59`;
                dateFilters.push('t.created_at <= ?');
                params.push(dateTo);
            }
            const dateWhereClause = dateFilters.length > 0
                ? `AND ${dateFilters.join(' AND ')}`
                : '';

            // Unified calculation query with wrapper for Postgres compatibility
            // Fixed: Restored Branch Name logic using a more robust join technique
            const sql = `
            SELECT * FROM (
                SELECT 
                    t.customer_name,
                    COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as total_debit,
                    COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as total_credit,
                    COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END), 0) as balance,
                    ${greatestFunc}(MAX(t.created_at), ${defaultDate}) as last_transaction,
                    COUNT(*) as transaction_count,
                    (
                        SELECT b.branch_name 
                        FROM postpaid_sales ps
                        JOIN reconciliations r ON ps.reconciliation_id = r.id
                        JOIN cashiers c ON r.cashier_id = c.id
                        JOIN branches b ON c.branch_id = b.id
                        WHERE ps.customer_name = t.customer_name
                        ORDER BY ps.created_at DESC LIMIT 1
                    ) as branch_name 
                FROM (
                    SELECT customer_name, amount, 'debit' as type, created_at FROM postpaid_sales WHERE customer_name IS NOT NULL
                    UNION ALL
                    SELECT customer_name, amount, 'debit' as type, created_at FROM manual_postpaid_sales WHERE customer_name IS NOT NULL
                    UNION ALL
                    SELECT customer_name, amount, 'credit' as type, created_at FROM customer_receipts WHERE customer_name IS NOT NULL
                    UNION ALL
                    SELECT customer_name, amount, 'credit' as type, created_at FROM manual_customer_receipts WHERE customer_name IS NOT NULL
                    UNION ALL
                    SELECT customer_name, ABS(opening_balance) as amount,
                           CASE WHEN opening_balance >= 0 THEN 'debit' ELSE 'credit' END as type,
                           fiscal_year || '-01-01 00:00:00' as created_at
                    FROM customer_fiscal_opening_balances ob
                    WHERE customer_name IS NOT NULL
                      AND CAST(ob.fiscal_year AS INTEGER) = (
                        SELECT MAX(CAST(ob2.fiscal_year AS INTEGER))
                        FROM customer_fiscal_opening_balances ob2
                        WHERE ob2.balance_key = ob.balance_key
                      )
                ) t
                WHERE t.customer_name IS NOT NULL
                ${dateWhereClause}
                GROUP BY t.customer_name
            ) AS final_result
            WHERE balance != 0 OR transaction_count > 0
            ORDER BY balance DESC
            `;

            const data = await this.dbManager.db.prepare(sql).all(params);
            this.sendJson(res, { success: true, data });
        } catch (error) {
            console.error('[Customers Summary] Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetLookups(res) {
        try {
            // FIX: Get full cashier details including branch name and pin status
            const cashiers = await this.dbManager.db.prepare(`
                SELECT 
                    c.id, 
                    c.name, 
                    c.cashier_number, 
                    c.pin_code,
                    c.active,
                    b.branch_name 
                FROM cashiers c
                LEFT JOIN branches b ON c.branch_id = b.id
                WHERE c.active = 1
            `).all();

            const branches = await this.dbManager.db.prepare('SELECT id, branch_name as name FROM branches WHERE is_active = 1').all();
            const accountants = await this.dbManager.db.prepare('SELECT id, name FROM accountants WHERE active = 1').all();

            // Get unique locations from ATMs as "accounts"
            const accounts = await this.dbManager.db.prepare("SELECT DISTINCT location as name FROM atms WHERE location IS NOT NULL AND location != '' ORDER BY location").all();

            // Get unique customers
            const customers = await this.dbManager.db.prepare(`
                SELECT DISTINCT customer_name as name FROM manual_postpaid_sales
            UNION
                SELECT DISTINCT customer_name as name FROM manual_customer_receipts
                ORDER BY name
                `).all();

            this.sendJson(res, { success: true, cashiers, branches, accountants, accounts, customers });
        } catch (error) {
            console.error('[Lookups] Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }


    async handleGetUsers(res) {
        try {
            console.log('👥 [API] Fetching users list...');
            console.log('👥 [API] Database type:', this.dbManager.constructor.name);

            let users = await this.dbManager.db.prepare("SELECT id, name, username, role, permissions, active, created_at FROM admins ORDER BY id DESC").all();

            console.log(`👥 [API] Raw query result:`, users);
            console.log(`👥 [API] Result type:`, typeof users, 'isArray:', Array.isArray(users));
            console.log(`👥 [API] Result length:`, users ? users.length : 'null/undefined');

            // Safety Check
            if (!users || !Array.isArray(users)) {
                console.warn('⚠️ [API] Query returned non-array, converting to empty array');
                users = [];
            }

            console.log(`👥 [API] Final users count: ${users.length}`);

            users.forEach(u => {
                if (u.permissions && typeof u.permissions === 'string') {
                    try { u.permissions = JSON.parse(u.permissions); } catch (e) { u.permissions = []; }
                }
            });

            console.log('👥 [API] About to send response with data:', JSON.stringify({ success: true, data: users }));
            this.sendJson(res, { success: true, data: users });
        } catch (error) {
            console.error('❌ [API] Error fetching users:', error);
            console.error('❌ [API] Error stack:', error.stack);
            this.sendJson(res, { success: false, error: error.message });
        }
    }



    // 🔒 SYSTEM FACTORY RESET (Protected by Secret Key)
    async handleFactoryReset(req, res) {
        const authUser = req && req.authUser ? req.authUser : null;
        const secretKey = req.headers['x-admin-secret'];
        const configuredResetKey = String(process.env.TASFIYA_FACTORY_RESET_KEY || '').trim();
        const hasValidConfiguredKey = configuredResetKey && secretKey === configuredResetKey;
        const isAdminSession = authUser && authUser.role !== 'cashier';

        if (!isAdminSession && !hasValidConfiguredKey) {
            console.warn('⚠️ [SECURITY] محاولة غير مصرح بها لعمل إعادة ضبط المصنع');
            this.sendJson(res, { success: false, error: 'غير مصرح: يلزم جلسة أدمن أو مفتاح مضبوط عبر البيئة' }, { statusCode: 403 });
            return;
        }

        console.log('🚨 [DANGER] بدء عملية إعادة ضبط المصنع للسيرفر...');

        try {
            // 2. Clear All Data Tables (Keep settings and structure)
            const tablesToClear = [
                'reconciliation_requests',
                'reconciliations',
                'customer_receipts',
                'postpaid_sales',
                'manual_customer_receipts',
                'manual_postpaid_sales',
                'cash_receipts',
                'bank_receipts',
                'return_invoices',
                'suppliers'
            ];

            const db = this.dbManager.db;

            // Execute in Transaction
            db.transaction(() => {
                tablesToClear.forEach(table => {
                    try {
                        db.prepare(`DELETE FROM ${table}`).run();
                        // Reset Sequence/ID if possible (for SQLite)
                        try {
                            db.prepare(`DELETE FROM sqlite_sequence WHERE name='${table}'`).run();
                        } catch (e) { /* Ignore if sqlite_sequence doesn't exist or track this table */ }
                    } catch (err) {
                        console.error(`Error clearing ${table}:`, err.message);
                    }
                });
            })();

            /* Also clear users if needed, but usually we keep admins */
            /* db.prepare("DELETE FROM users WHERE role != 'admin'").run(); */

            console.log('✅ [RESET] تم مسح جميع البيانات بنجاح');

            // Send OneSignal Notification to announce Reset
            await this.sendOneSignalNotification(
                '⚠️ تنبيه إداري',
                'تم تنفيذ عملية إعادة ضبط المصنع للنظام. جميع البيانات تم مسحها.',
                { type: 'system_reset' }
            );

            this.sendJson(res, { success: true, message: 'تم إعادة ضبط المصنع بنجاح' });

        } catch (error) {
            console.error('❌ [RESET] خطأ حرج:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleApproveReconciliationRequest(res, id, req) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                console.log(`🛡️ [APPROVAL] Starting approval for request ${id}`);
                const approvalData = JSON.parse(body);

                // Fetch original request
                // Use a direct query that is compatible with both (simple SELECT)
                let request;
                if (this.dbManager.pool) {
                    const res = await this.dbManager.pool.query("SELECT * FROM reconciliation_requests WHERE id = $1", [id]);
                    request = res.rows[0];
                } else {
                    request = this.dbManager.db.prepare("SELECT * FROM reconciliation_requests WHERE id = ?").get(id);
                }

                if (!request) throw new Error('الطلب غير موجود');

                const details = await this.enrichCustomerRequestDetails(
                    JSON.parse(request.details_json || '{}'),
                    request.cashier_id
                );

                // Helper to sanitize amounts (remove commas, handle strings)
                const safeFloat = (val) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    return parseFloat(String(val).replace(/,/g, '')) || 0;
                };

                // Async Transaction
                await this.dbManager.asyncTransaction(async (tx) => {
                    // Extract Arrays
                    const cashBreakdown = details.cash_breakdown || [];
                    const bankReceipts = details.bank_receipts || [];
                    const postpaidSales = details.postpaid_items || [];
                    const customerReceipts = details.customer_receipts || [];
                    const returns = details.return_items || [];
                    const suppliers = details.supplier_items || [];

                    // Calculate Totals safely
                    const totalCash = safeFloat(request.total_cash);
                    const totalBank = safeFloat(request.total_bank);
                    const totalPostpaid = postpaidSales.reduce((sum, item) => sum + safeFloat(item.amount), 0);
                    const totalReturns = returns.reduce((sum, item) => sum + safeFloat(item.amount), 0);
                    const totalCustomerReceipts = customerReceipts.reduce((sum, item) => sum + safeFloat(item.amount), 0);
                    const systemSales = safeFloat(request.system_sales);

                    const totalCollectedValue = totalCash + totalBank + totalPostpaid - totalCustomerReceipts + totalReturns;
                    const surplus = totalCollectedValue - systemSales;
                    const totalReceiptsLog = totalCash + totalBank;

                    // Get Next Reconciliation Number
                    const maxRec = await tx.prepare("SELECT MAX(reconciliation_number) as max_num FROM reconciliations").get();
                    const newRecNum = (maxRec.max_num || 0) + 1;

                    const cashierId = request.cashier_id;
                    const accountantId = approvalData.accountant_id || 1;
                    const date = new Date().toISOString().split('T')[0];

                    console.log(`🛡️ [APPROVAL] Creating Reconciliation #${newRecNum} for Cashier ${cashierId}`);

                    const insertRec = tx.prepare(`
                        INSERT INTO reconciliations
                        (reconciliation_number, cashier_id, accountant_id, reconciliation_date, system_sales, total_receipts, surplus_deficit, status, notes, created_at)
                        VALUES(?, ?, ?, ?, ?, ?, ?, 'completed', ?, CURRENT_TIMESTAMP)
                    `);

                    const recInfo = await insertRec.run(
                        newRecNum, cashierId, accountantId, date, systemSales, totalReceiptsLog, surplus, (request.notes || '')
                    );
                    const recId = recInfo.lastInsertRowid;

                    console.log(`🛡️ [APPROVAL] Created Parent Record ID: ${recId}`);

                    // Insert Details
                    const insertCash = tx.prepare(`INSERT INTO cash_receipts(reconciliation_id, denomination, quantity, total_amount) VALUES(?, ?, ?, ?)`);
                    for (const item of cashBreakdown) {
                        await insertCash.run(recId, safeFloat(item.value), Number(item.count) || 0, safeFloat(item.total));
                    }

                    // Bank Receipts
                    const allAtms = await tx.prepare("SELECT id, name FROM atms").all();
                    const insertBank = tx.prepare(`INSERT INTO bank_receipts(reconciliation_id, operation_type, atm_id, amount) VALUES(?, ?, ?, ?)`);
                    for (const item of bankReceipts) {
                        let atmId = null;
                        if (item.atm_id) atmId = item.atm_id;
                        else if (item.atm_name) {
                            const found = allAtms.find(a => a.name === item.atm_name);
                            if (found) atmId = found.id;
                        }
                        if (!atmId && allAtms.length > 0) atmId = allAtms[0].id; // Fallback
                        await insertBank.run(recId, item.operation_type || 'Unknown', atmId, safeFloat(item.amount));
                    }

                    // Postpaid
                    const insertPostpaid = tx.prepare(`INSERT INTO postpaid_sales(reconciliation_id, customer_id, customer_name, customer_code, amount, notes) VALUES(?, ?, ?, ?, ?, ?)`);
                    for (const item of postpaidSales) {
                        await insertPostpaid.run(
                            recId,
                            item.customer_id || null,
                            item.customer_name,
                            item.customer_code || '',
                            safeFloat(item.amount),
                            item.notes || ''
                        );
                    }

                    // Customer Receipts
                    const insertCustReceipt = tx.prepare(`INSERT INTO customer_receipts(reconciliation_id, customer_id, customer_name, customer_code, amount, payment_type, notes) VALUES(?, ?, ?, ?, ?, ?, ?)`);
                    for (const item of customerReceipts) {
                        await insertCustReceipt.run(
                            recId,
                            item.customer_id || null,
                            item.customer_name,
                            item.customer_code || '',
                            safeFloat(item.amount),
                            item.payment_type || 'cash',
                            item.notes || ''
                        );
                    }

                    // Returns
                    const insertReturn = tx.prepare(`INSERT INTO return_invoices(reconciliation_id, invoice_number, amount) VALUES(?, ?, ?)`);
                    for (const item of returns) {
                        await insertReturn.run(recId, item.invoice_number || 'N/A', safeFloat(item.amount));
                    }

                    // Suppliers
                    const insertSupplier = tx.prepare(`INSERT INTO suppliers(reconciliation_id, supplier_name, amount) VALUES(?, ?, ?)`);
                    for (const item of suppliers) {
                        await insertSupplier.run(recId, item.supplier_name, safeFloat(item.amount));
                    }

                    // Archive Request (Update status to approved)
                    console.log(`🛡️ [APPROVAL] Archiving request ${id}...`);
                    await tx.prepare("UPDATE reconciliation_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
                });

                // Get cashier name for notification
                let cashierName = 'كاشير';
                try {
                    // Safe lookup
                    const cashierInfo = this.dbManager.pool
                        ? (await this.dbManager.pool.query("SELECT name FROM cashiers WHERE id = $1", [request.cashier_id])).rows[0]
                        : this.dbManager.db.prepare("SELECT name FROM cashiers WHERE id = ?").get(request.cashier_id);
                    if (cashierInfo) cashierName = cashierInfo.name;
                } catch (e) { console.warn('Cashier lookup failed', e); }

                // Send notification
                try {
                    await this.sendOneSignalNotification(
                        '✅  تصفية جديدة مكتملة',
                        `تم اعتماد تصفية للكاشير ${cashierName}`,
                        {
                            type: 'reconciliation_approved',
                            cashier_name: cashierName
                        }
                    );
                } catch (e) { console.warn('Notification failed', e); }

                console.log(`✅ [APPROVAL] Successfully approved request ${id}`);
                this.sendJson(res, { success: true });

            } catch (error) {
                console.error('❌ [APPROVAL] Fatal Error:', error);
                this.sendJson(res, { success: false, error: 'حدث خطأ أثناء اعتماد التصفية: ' + error.message });
            }
        });
    }

    async handleDeleteReconciliationRequest(res, id) {
        try {
            const pool = this.dbManager.pool;
            if (pool) {
                // Postgres Mode: soft-delete to prevent resurrecting rows on next desktop push.
                await pool.query(
                    "UPDATE reconciliation_requests SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    [id]
                );
            } else {
                // SQLite Mode: soft-delete for mirror-safe sync recovery.
                await this.dbManager.db
                    .prepare("UPDATE reconciliation_requests SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .run(id);
            }

            // Check if sync is enabled before deleting from cloud
            let syncEnabled = true;
            try {
                const settingRow = this.dbManager.db.prepare("SELECT setting_value FROM system_settings WHERE category = 'general' AND setting_key = 'sync_enabled'").get();
                if (settingRow && settingRow.setting_value === 'false') {
                    syncEnabled = false;
                }
            } catch (e) {
                // If table doesn't exist or error, assume sync is enabled
            }

            // CRITICAL: Also delete from remote server to prevent re-sync (only if sync is enabled)
            if (syncEnabled) {
                try {
                    const remoteUrl = 'https://tasfiya-pro-max.onrender.com/api/reconciliation-requests/' + id;
                    const fetch = require('node-fetch');
                    await fetch(remoteUrl, { method: 'DELETE' });
                    console.log(`✅ [DELETE] Also deleted from cloud: ID ${id}`);
                } catch (cloudErr) {
                    console.warn(`⚠️ [DELETE] Cloud deletion failed (ID ${id}):`, cloudErr.message);
                    // Don't fail the whole request if cloud is down, but log it
                }
            } else {
                console.log(`⛔ [DELETE] Sync disabled - skipping cloud deletion for ID ${id}`);
            }

            this.sendJson(res, { success: true });
        } catch (error) {
            console.error('Delete Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleDeleteAllReconciliationRequests(res) {
        try {
            console.log('🗑️ [DELETE ALL] Deleting ALL reconciliation requests...');
            const pool = this.dbManager.pool;

            if (pool) {
                await pool.query("UPDATE reconciliation_requests SET status = 'deleted', updated_at = CURRENT_TIMESTAMP");
            } else {
                this.dbManager.db
                    .prepare("UPDATE reconciliation_requests SET status = 'deleted', updated_at = CURRENT_TIMESTAMP")
                    .run();
            }

            this.sendJson(res, { success: true });
        } catch (error) {
            console.error('Delete All Error:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    // 🔄 Reset Auto-increment Sequence for Reconciliation Requests
    async handleResetRequestsSequence(res) {
        try {
            console.log('🔄 [RESET SEQ] إعادة ضبط تسلسل طلبات التصفية...');
            const pool = this.dbManager.pool;

            if (pool) {
                // PostgreSQL Mode
                await pool.query(`ALTER SEQUENCE reconciliation_requests_id_seq RESTART WITH 1`);
                console.log('✅ [RESET SEQ] تم إعادة ضبط التسلسل (PostgreSQL)');
            } else {
                // SQLite Mode
                // Delete the sequence entry to reset auto-increment
                this.dbManager.db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'reconciliation_requests'`).run();
                console.log('✅ [RESET SEQ] تم إعادة ضبط التسلسل (SQLite)');
            }

            this.sendJson(res, {
                success: true,
                message: 'تم إعادة ضبط التسلسل بنجاح. الطلب التالي سيبدأ من رقم #1'
            });
        } catch (error) {
            console.error('❌ [RESET SEQ] خطأ في إعادة ضبط التسلسل:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }


    async handleGetAtms(req, res, query) {
        try {
            let atms;
            const authUser = req && req.authUser ? req.authUser : null;
            const effectiveCashierId = authUser && authUser.role === 'cashier'
                ? authUser.id
                : (query && query.cashierId ? query.cashierId : null);

            // If cashierId is provided, filter by their branch
            if (effectiveCashierId) {
                // 1. Get Cashier Branch
                const cashier = await this.dbManager.db.prepare("SELECT branch_id FROM cashiers WHERE id = ?").get(effectiveCashierId);

                if (cashier && cashier.branch_id) {
                    // 2. Get ATMs for this branch
                    atms = await this.dbManager.db.prepare("SELECT * FROM atms WHERE branch_id = ? ORDER BY name").all(cashier.branch_id);
                } else {
                    // Cashier has no branch? Fallback to all or empty? Let's fallback to all for safety, or empty. 
                    // Better to fallback to all if branch logic isn't strictly enforced everywhere yet.
                    atms = await this.dbManager.db.prepare("SELECT * FROM atms ORDER BY name").all();
                }
            } else {
                // Admin or no cashier specified -> Get All
                atms = await this.dbManager.db.prepare("SELECT * FROM atms ORDER BY name").all();
            }

            this.sendJson(res, { success: true, atms }, {
                req,
                cacheable: true
            });
        } catch (error) {
            console.error('Error fetching ATMs:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    getPostgresPool() {
        return this.dbManager?.pool || this.dbManager?.db?.pool || null;
    }

    async getCashierBranchId(cashierId) {
        const normalizedCashierId = normalizePositiveInteger(cashierId);
        if (!normalizedCashierId) {
            return null;
        }

        const pool = this.getPostgresPool();
        if (pool) {
            const result = await pool.query(
                'SELECT branch_id FROM cashiers WHERE id = $1 LIMIT 1',
                [normalizedCashierId]
            );
            return normalizePositiveInteger(result.rows?.[0]?.branch_id);
        }

        const row = this.dbManager.db
            .prepare('SELECT branch_id FROM cashiers WHERE id = ? LIMIT 1')
            .get(normalizedCashierId);
        return normalizePositiveInteger(row?.branch_id);
    }

    async listCustomerRowsForBranch(branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        const pool = this.getPostgresPool();

        if (pool) {
            const whereBranch = normalizedBranchId ? 'AND COALESCE(branch_id, 0) = $1' : '';
            const params = normalizedBranchId ? [normalizedBranchId] : [];
            const result = await pool.query(
                `
                    SELECT id, customer_name, customer_code, branch_id
                    FROM customers
                    WHERE BTRIM(COALESCE(customer_name, '')) <> ''
                    AND COALESCE(is_active, 1) = 1
                    AND COALESCE(merged_into_customer_id, 0) = 0
                    ${whereBranch}
                    ORDER BY customer_name ASC, customer_code ASC, id ASC
                `,
                params
            );
            return this.filterStaleDuplicateCustomerRows(uniqueCustomerRows(result.rows || []), normalizedBranchId);
        }

        const whereBranch = normalizedBranchId ? 'AND COALESCE(branch_id, 0) = ?' : '';
        const params = normalizedBranchId ? [normalizedBranchId] : [];
        const rows = this.dbManager.db.prepare(
            `
                SELECT id, customer_name, customer_code, branch_id
                FROM customers
                WHERE TRIM(COALESCE(customer_name, '')) <> ''
                AND COALESCE(is_active, 1) = 1
                AND COALESCE(merged_into_customer_id, 0) = 0
                ${whereBranch}
                ORDER BY customer_name COLLATE NOCASE ASC, customer_code ASC, id ASC
            `
        ).all(...params);
        return this.filterStaleDuplicateCustomerRows(uniqueCustomerRows(rows), normalizedBranchId);
    }

    async listMergedCustomerAliasRowsForBranch(branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        const pool = this.getPostgresPool();

        if (pool) {
            const branchFilter = normalizedBranchId
                ? 'AND COALESCE(target.branch_id, source.branch_id, 0) = $1'
                : '';
            const params = normalizedBranchId ? [normalizedBranchId] : [];
            const result = await pool.query(
                `
                    SELECT
                        target.id AS id,
                        target.customer_name AS customer_name,
                        target.customer_code AS customer_code,
                        target.branch_id AS branch_id,
                        source.customer_name AS matched_customer_name,
                        source.customer_code AS matched_customer_code,
                        source.id AS matched_customer_id,
                        source.merged_into_customer_id AS merged_into_customer_id
                    FROM customers source
                    JOIN customers target ON target.id = source.merged_into_customer_id
                    WHERE BTRIM(COALESCE(source.customer_name, '')) <> ''
                      AND COALESCE(source.merged_into_customer_id, 0) > 0
                      AND COALESCE(target.is_active, 1) = 1
                      AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ${branchFilter}
                    ORDER BY source.customer_name ASC, target.customer_code ASC, source.id ASC
                `,
                params
            );
            return uniqueCustomerAliasRows(result.rows || []);
        }

        const branchFilter = normalizedBranchId
            ? 'AND COALESCE(target.branch_id, source.branch_id, 0) = ?'
            : '';
        const params = normalizedBranchId ? [normalizedBranchId] : [];
        const rows = this.dbManager.db.prepare(
            `
                SELECT
                    target.id AS id,
                    target.customer_name AS customer_name,
                    target.customer_code AS customer_code,
                    target.branch_id AS branch_id,
                    source.customer_name AS matched_customer_name,
                    source.customer_code AS matched_customer_code,
                    source.id AS matched_customer_id,
                    source.merged_into_customer_id AS merged_into_customer_id
                FROM customers source
                JOIN customers target ON target.id = source.merged_into_customer_id
                WHERE TRIM(COALESCE(source.customer_name, '')) <> ''
                  AND COALESCE(source.merged_into_customer_id, 0) > 0
                  AND COALESCE(target.is_active, 1) = 1
                  AND COALESCE(target.merged_into_customer_id, 0) = 0
                  ${branchFilter}
                ORDER BY source.customer_name COLLATE NOCASE ASC, target.customer_code ASC, source.id ASC
            `
        ).all(...params);
        return uniqueCustomerAliasRows(rows);
    }

    async filterStaleDuplicateCustomerRows(rows = [], branchId = null) {
        const safeRows = uniqueCustomerRows(rows);
        if (safeRows.length <= 1) {
            return safeRows;
        }

        const groups = new Map();
        safeRows.forEach((row) => {
            const key = `${row.customer_name}|${normalizePositiveInteger(row.branch_id) || normalizePositiveInteger(branchId) || 0}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(row);
        });

        const rowsToHide = new Set();
        for (const groupRows of groups.values()) {
            if (groupRows.length <= 1) {
                continue;
            }

            const rowsWithUsage = [];
            for (const row of groupRows) {
                const usageCount = await this.countCustomerIdentityUsage(row, branchId || row.branch_id);
                if (usageCount > 0) {
                    rowsWithUsage.push(row);
                }
            }

            if (rowsWithUsage.length > 0) {
                const activeIds = new Set(rowsWithUsage.map((row) => row.id).filter(Boolean));
                groupRows.forEach((row) => {
                    if (!activeIds.has(row.id)) {
                        rowsToHide.add(row.id || `${row.customer_name}|${row.customer_code}|${row.branch_id || ''}`);
                    }
                });
            }
        }

        return safeRows.filter((row) => (
            !rowsToHide.has(row.id || `${row.customer_name}|${row.customer_code}|${row.branch_id || ''}`)
        ));
    }

    async listTransactionCustomerRowsForBranch(branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        const pool = this.getPostgresPool();

        if (pool) {
            const branchFilter = normalizedBranchId ? 'WHERE branch_id = $1' : '';
            const params = normalizedBranchId ? [normalizedBranchId] : [];
            const result = await pool.query(
                `
                    SELECT DISTINCT customer_id AS id, customer_name, customer_code, branch_id
                    FROM (
                        SELECT ps.customer_id, ps.customer_name, ps.customer_code, c.branch_id
                        FROM postpaid_sales ps
                        LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                        WHERE ps.customer_name IS NOT NULL

                        UNION

                        SELECT cr.customer_id, cr.customer_name, cr.customer_code, c.branch_id
                        FROM customer_receipts cr
                        LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                        WHERE cr.customer_name IS NOT NULL
                    ) tx_customers
                    ${branchFilter}
                    ORDER BY customer_name ASC
                `,
                params
            );
            return uniqueCustomerRows(result.rows || []);
        }

        const branchFilter = normalizedBranchId ? 'WHERE branch_id = ?' : '';
        const params = normalizedBranchId ? [normalizedBranchId] : [];
        const rows = this.dbManager.db.prepare(
            `
                SELECT DISTINCT customer_id AS id, customer_name, customer_code, branch_id
                FROM (
                    SELECT ps.customer_id, ps.customer_name, ps.customer_code, c.branch_id
                    FROM postpaid_sales ps
                    LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE ps.customer_name IS NOT NULL

                    UNION

                    SELECT cr.customer_id, cr.customer_name, cr.customer_code, c.branch_id
                    FROM customer_receipts cr
                    LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    WHERE cr.customer_name IS NOT NULL
                ) tx_customers
                ${branchFilter}
                ORDER BY customer_name COLLATE NOCASE ASC
            `
        ).all(...params);
        return uniqueCustomerRows(rows);
    }

    async findCustomerById(customerId) {
        const normalizedCustomerId = normalizePositiveInteger(customerId);
        if (!normalizedCustomerId) {
            return null;
        }

        const pool = this.getPostgresPool();
        if (pool) {
            const result = await pool.query(
                `
                    SELECT
                        COALESCE(target.id, c.id) AS id,
                        COALESCE(target.customer_name, c.customer_name) AS customer_name,
                        COALESCE(target.customer_code, c.customer_code) AS customer_code,
                        COALESCE(target.branch_id, c.branch_id) AS branch_id,
                        c.customer_name AS matched_customer_name,
                        c.id AS matched_customer_id,
                        COALESCE(target.is_favorite, c.is_favorite, 0) AS is_favorite,
                        COALESCE(c.merged_into_customer_id, 0) AS merged_into_customer_id
                    FROM customers c
                    LEFT JOIN customers target ON target.id = c.merged_into_customer_id
                    WHERE c.id = $1
                      AND (target.id IS NULL OR (
                        COALESCE(target.is_active, 1) = 1
                        AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ))
                    LIMIT 1
                `,
                [normalizedCustomerId]
            );
            return normalizeCustomerRow(result.rows?.[0]);
        }

        return normalizeCustomerRow(
            this.dbManager.db.prepare(
                `
                    SELECT
                        COALESCE(target.id, c.id) AS id,
                        COALESCE(target.customer_name, c.customer_name) AS customer_name,
                        COALESCE(target.customer_code, c.customer_code) AS customer_code,
                        COALESCE(target.branch_id, c.branch_id) AS branch_id,
                        c.customer_name AS matched_customer_name,
                        c.id AS matched_customer_id,
                        COALESCE(target.is_favorite, c.is_favorite, 0) AS is_favorite,
                        COALESCE(c.merged_into_customer_id, 0) AS merged_into_customer_id
                    FROM customers c
                    LEFT JOIN customers target ON target.id = c.merged_into_customer_id
                    WHERE c.id = ?
                      AND (target.id IS NULL OR (
                        COALESCE(target.is_active, 1) = 1
                        AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ))
                    LIMIT 1
                `
            ).get(normalizedCustomerId)
        );
    }

    async findCustomerByCode(customerCode) {
        const normalizedCode = normalizeCustomerCodeValue(customerCode);
        if (!normalizedCode) {
            return null;
        }

        const pool = this.getPostgresPool();
        if (pool) {
            const result = await pool.query(
                `
                    SELECT
                        COALESCE(target.id, c.id) AS id,
                        COALESCE(target.customer_name, c.customer_name) AS customer_name,
                        COALESCE(target.customer_code, c.customer_code) AS customer_code,
                        COALESCE(target.branch_id, c.branch_id) AS branch_id,
                        c.customer_name AS matched_customer_name,
                        c.id AS matched_customer_id,
                        COALESCE(target.is_favorite, c.is_favorite, 0) AS is_favorite,
                        COALESCE(c.merged_into_customer_id, 0) AS merged_into_customer_id
                    FROM customers c
                    LEFT JOIN customers target ON target.id = c.merged_into_customer_id
                    WHERE UPPER(BTRIM(COALESCE(c.customer_code, ''))) = $1
                      AND (target.id IS NULL OR (
                        COALESCE(target.is_active, 1) = 1
                        AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ))
                    ORDER BY
                        CASE
                            WHEN COALESCE(c.is_active, 1) = 1 AND COALESCE(c.merged_into_customer_id, 0) = 0 THEN 0
                            ELSE 1
                        END,
                        c.id ASC
                    LIMIT 1
                `,
                [normalizedCode]
            );
            return normalizeCustomerRow(result.rows?.[0]);
        }

        return normalizeCustomerRow(
            this.dbManager.db.prepare(
                `
                    SELECT
                        COALESCE(target.id, c.id) AS id,
                        COALESCE(target.customer_name, c.customer_name) AS customer_name,
                        COALESCE(target.customer_code, c.customer_code) AS customer_code,
                        COALESCE(target.branch_id, c.branch_id) AS branch_id,
                        c.customer_name AS matched_customer_name,
                        c.id AS matched_customer_id,
                        COALESCE(target.is_favorite, c.is_favorite, 0) AS is_favorite,
                        COALESCE(c.merged_into_customer_id, 0) AS merged_into_customer_id
                    FROM customers c
                    LEFT JOIN customers target ON target.id = c.merged_into_customer_id
                    WHERE UPPER(TRIM(COALESCE(c.customer_code, ''))) = ?
                      AND (target.id IS NULL OR (
                        COALESCE(target.is_active, 1) = 1
                        AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ))
                    ORDER BY
                        CASE
                            WHEN COALESCE(c.is_active, 1) = 1 AND COALESCE(c.merged_into_customer_id, 0) = 0 THEN 0
                            ELSE 1
                        END,
                        c.id ASC
                    LIMIT 1
                `
            ).get(normalizedCode)
        );
    }

    async findCustomersByName(customerName, branchId = null) {
        const normalizedName = normalizeCustomerNameValue(customerName);
        if (!normalizedName) {
            return [];
        }

        const normalizedBranchId = normalizePositiveInteger(branchId);
        const pool = this.getPostgresPool();
        if (pool) {
            const activeBranchFilter = normalizedBranchId ? 'AND COALESCE(c.branch_id, 0) = $2' : '';
            const mergedBranchFilter = normalizedBranchId ? 'AND COALESCE(target.branch_id, source.branch_id, 0) = $4' : '';
            const params = normalizedBranchId
                ? [normalizedName, normalizedBranchId, normalizedName, normalizedBranchId]
                : [normalizedName, normalizedName];
            const result = await pool.query(
                `
                    SELECT id, customer_name, customer_code, branch_id, matched_customer_name, matched_customer_id, merged_into_customer_id
                    FROM (
                        SELECT
                            c.id AS id,
                            c.customer_name AS customer_name,
                            c.customer_code AS customer_code,
                            c.branch_id AS branch_id,
                            c.customer_name AS matched_customer_name,
                            c.id AS matched_customer_id,
                            0 AS merged_into_customer_id
                        FROM customers c
                        WHERE BTRIM(COALESCE(c.customer_name, '')) = $1
                          AND COALESCE(c.is_active, 1) = 1
                          AND COALESCE(c.merged_into_customer_id, 0) = 0
                          ${activeBranchFilter}

                        UNION ALL

                        SELECT
                            target.id AS id,
                            target.customer_name AS customer_name,
                            target.customer_code AS customer_code,
                            target.branch_id AS branch_id,
                            source.customer_name AS matched_customer_name,
                            source.id AS matched_customer_id,
                            source.merged_into_customer_id AS merged_into_customer_id
                        FROM customers source
                        JOIN customers target ON target.id = source.merged_into_customer_id
                        WHERE BTRIM(COALESCE(source.customer_name, '')) = ${normalizedBranchId ? '$3' : '$2'}
                          AND COALESCE(source.merged_into_customer_id, 0) > 0
                          AND COALESCE(target.is_active, 1) = 1
                          AND COALESCE(target.merged_into_customer_id, 0) = 0
                          ${mergedBranchFilter}
                    ) customer_matches
                    GROUP BY id, customer_name, customer_code, branch_id, matched_customer_name, matched_customer_id, merged_into_customer_id
                    ORDER BY id ASC
                `,
                params
            );
            return uniqueCustomerRows(result.rows || []);
        }

        const activeBranchFilter = normalizedBranchId ? 'AND COALESCE(c.branch_id, 0) = ?' : '';
        const mergedBranchFilter = normalizedBranchId ? 'AND COALESCE(target.branch_id, source.branch_id, 0) = ?' : '';
        const params = normalizedBranchId
            ? [normalizedName, normalizedBranchId, normalizedName, normalizedBranchId]
            : [normalizedName, normalizedName];
        const rows = this.dbManager.db.prepare(
            `
                SELECT id, customer_name, customer_code, branch_id, matched_customer_name, matched_customer_id, merged_into_customer_id
                FROM (
                    SELECT
                        c.id AS id,
                        c.customer_name AS customer_name,
                        c.customer_code AS customer_code,
                        c.branch_id AS branch_id,
                        c.customer_name AS matched_customer_name,
                        c.id AS matched_customer_id,
                        0 AS merged_into_customer_id
                    FROM customers c
                    WHERE TRIM(COALESCE(c.customer_name, '')) = ?
                      AND COALESCE(c.is_active, 1) = 1
                      AND COALESCE(c.merged_into_customer_id, 0) = 0
                      ${activeBranchFilter}

                    UNION ALL

                    SELECT
                        target.id AS id,
                        target.customer_name AS customer_name,
                        target.customer_code AS customer_code,
                        target.branch_id AS branch_id,
                        source.customer_name AS matched_customer_name,
                        source.id AS matched_customer_id,
                        source.merged_into_customer_id AS merged_into_customer_id
                    FROM customers source
                    JOIN customers target ON target.id = source.merged_into_customer_id
                    WHERE TRIM(COALESCE(source.customer_name, '')) = ?
                      AND COALESCE(source.merged_into_customer_id, 0) > 0
                      AND COALESCE(target.is_active, 1) = 1
                      AND COALESCE(target.merged_into_customer_id, 0) = 0
                      ${mergedBranchFilter}
                ) customer_matches
                GROUP BY id
                ORDER BY id ASC
            `
        ).all(...params);
        return uniqueCustomerRows(rows);
    }

    buildCustomerIdentityUsageWhere(alias, customer, usePostgresPlaceholders = false) {
        const customerId = normalizePositiveInteger(customer?.id || customer?.customer_id);
        const customerCode = normalizeCustomerCodeValue(customer?.customer_code);
        const clauses = [];
        const params = [];
        const nextPlaceholder = () => (usePostgresPlaceholders ? `$${params.length + 1}` : '?');

        if (customerId) {
            const placeholder = nextPlaceholder();
            clauses.push(`COALESCE(${alias}.customer_id, 0) = ${placeholder}`);
            params.push(customerId);
        }

        if (customerCode) {
            const placeholder = nextPlaceholder();
            const trimFn = usePostgresPlaceholders ? 'BTRIM' : 'TRIM';
            clauses.push(`UPPER(${trimFn}(COALESCE(${alias}.customer_code, ''))) = ${placeholder}`);
            params.push(customerCode);
        }

        return {
            where: clauses.length > 0 ? clauses.map((clause) => `(${clause})`).join(' OR ') : '',
            params
        };
    }

    async countCustomerIdentityUsage(customer, branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        const pool = this.getPostgresPool();
        const usePostgres = Boolean(pool);
        const sources = [
            { tableName: 'postpaid_sales', alias: 'ps', reconciled: true },
            { tableName: 'customer_receipts', alias: 'cr', reconciled: true },
            { tableName: 'manual_postpaid_sales', alias: 'mps', reconciled: false },
            { tableName: 'manual_customer_receipts', alias: 'mcr', reconciled: false }
        ];

        let usageCount = 0;
        for (const source of sources) {
            const matcher = this.buildCustomerIdentityUsageWhere(source.alias, customer, usePostgres);
            if (!matcher.where) {
                continue;
            }

            const params = [...matcher.params];
            const branchSql = source.reconciled && normalizedBranchId
                ? `AND (COALESCE(c.branch_id, 0) = 0 OR COALESCE(c.branch_id, 0) = ${usePostgres ? `$${params.length + 1}` : '?'})`
                : '';
            if (branchSql) {
                params.push(normalizedBranchId);
            }

            const joinSql = source.reconciled
                ? `LEFT JOIN reconciliations r ON r.id = ${source.alias}.reconciliation_id
                   LEFT JOIN cashiers c ON c.id = r.cashier_id`
                : '';
            const countCast = usePostgres ? 'COUNT(*)::int' : 'COUNT(*)';
            const sql = `
                SELECT ${countCast} AS usage_count
                FROM ${source.tableName} ${source.alias}
                ${joinSql}
                WHERE (${matcher.where})
                ${branchSql}
            `;

            try {
                const row = usePostgres
                    ? (await pool.query(sql, params)).rows?.[0]
                    : this.dbManager.db.prepare(sql).get(...params);
                usageCount += Number(row?.usage_count || 0);
            } catch (_error) {
                // Older local databases may lack identity columns; in that case keep duplicate protection strict.
            }
        }

        return usageCount;
    }

    async selectSingleCustomerByTransactionUsage(customers, branchId = null) {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        if (safeCustomers.length <= 1) {
            return safeCustomers[0] || null;
        }

        const usageRows = await Promise.all(
            safeCustomers.map(async (customer) => ({
                customer,
                usageCount: await this.countCustomerIdentityUsage(customer, branchId)
            }))
        );
        const usedRows = usageRows.filter((row) => Number(row.usageCount || 0) > 0);

        return usedRows.length === 1 ? usedRows[0].customer : null;
    }

    async resolveBranchCustomerCodePrefix(branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        if (!normalizedBranchId) {
            return 'C0';
        }

        const pool = this.getPostgresPool();
        if (pool) {
            const result = await pool.query(
                'SELECT customer_code_prefix FROM branches WHERE id = $1 LIMIT 1',
                [normalizedBranchId]
            );
            return normalizeCustomerCodeValue(result.rows?.[0]?.customer_code_prefix) || `C${normalizedBranchId}`;
        }

        if (typeof this.dbManager.resolveCustomerCodePrefix === 'function') {
            return this.dbManager.resolveCustomerCodePrefix(normalizedBranchId);
        }

        const row = this.dbManager.db.prepare(
            'SELECT customer_code_prefix FROM branches WHERE id = ? LIMIT 1'
        ).get(normalizedBranchId);
        return normalizeCustomerCodeValue(row?.customer_code_prefix) || `C${normalizedBranchId}`;
    }

    async generateUniqueCustomerCode(branchId = null) {
        const normalizedBranchId = normalizePositiveInteger(branchId);
        if (!this.getPostgresPool() && typeof this.dbManager.generateUniqueCustomerCode === 'function') {
            return this.dbManager.generateUniqueCustomerCode(normalizedBranchId);
        }

        const branchPrefix = await this.resolveBranchCustomerCodePrefix(normalizedBranchId);
        const pool = this.getPostgresPool();
        const codeRows = pool
            ? (await pool.query(
                `
                    SELECT customer_code
                    FROM customers
                    WHERE UPPER(BTRIM(COALESCE(customer_code, ''))) LIKE $1
                `,
                [`${branchPrefix}-%`]
            )).rows
            : this.dbManager.db.prepare(
                `
                    SELECT customer_code
                    FROM customers
                    WHERE UPPER(TRIM(COALESCE(customer_code, ''))) LIKE ?
                `
            ).all(`${branchPrefix}-%`);

        const escapedPrefix = branchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sequencePattern = new RegExp(`^${escapedPrefix}-(\\d{6})$`, 'i');
        const maxSequence = (codeRows || []).reduce((max, row) => {
            const match = normalizeCustomerCodeValue(row.customer_code).match(sequencePattern);
            const sequence = match ? Number(match[1]) : 0;
            return Number.isFinite(sequence) && sequence > max ? sequence : max;
        }, 0);

        for (let offset = 1; offset <= 100; offset += 1) {
            const candidate = `${branchPrefix}-${String(maxSequence + offset).padStart(6, '0')}`;
            const existing = await this.findCustomerByCode(candidate);
            if (!existing) {
                return candidate;
            }
        }

        throw new Error('customer_code_generation_failed');
    }

    isPostgresPrimaryKeySequenceError(error, tableName) {
        const expectedConstraint = `${tableName}_pkey`;
        const constraint = String(error?.constraint || '');
        const message = String(error?.message || '');
        return String(error?.code || '') === '23505'
            && (constraint === expectedConstraint || message.includes(`"${expectedConstraint}"`));
    }

    async refreshPostgresSerialSequence(tableName, columnName = 'id') {
        const pool = this.getPostgresPool();
        if (!pool) {
            return false;
        }

        const safeIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
        if (!safeIdentifier.test(tableName) || !safeIdentifier.test(columnName)) {
            throw new Error('invalid_sequence_identifier');
        }

        await pool.query(
            `
                SELECT setval(
                    pg_get_serial_sequence($1, $2),
                    GREATEST((SELECT COALESCE(MAX(${columnName}), 0) + 1 FROM ${tableName}), 1),
                    false
                )
            `,
            [tableName, columnName]
        );
        return true;
    }

    async createOrUpdateServerCustomer({ customerName, customerCode = '', branchId = null }) {
        const normalizedName = normalizeCustomerNameValue(customerName);
        if (!normalizedName) {
            return null;
        }

        const normalizedBranchId = normalizePositiveInteger(branchId);
        let normalizedCode = normalizeCustomerCodeValue(customerCode);
        if (normalizedCode && normalizedBranchId) {
            const branchPrefix = await this.resolveBranchCustomerCodePrefix(normalizedBranchId);
            if (!normalizedCode.startsWith(`${branchPrefix}-`)) {
                normalizedCode = '';
            }
        }

        if (normalizedCode) {
            const byCode = await this.findCustomerByCode(normalizedCode);
            if (
                byCode
                && isCustomerNameMatchOrAlias(byCode, normalizedName)
                && isSameOrOpenBranch(byCode.branch_id, normalizedBranchId)
            ) {
                return byCode;
            }

            if (byCode) {
                normalizedCode = '';
            }
        }

        let byName = await this.findCustomersByName(normalizedName, normalizedBranchId);
        if (byName.length > 1 && !normalizedCode) {
            const singleUsedCustomer = await this.selectSingleCustomerByTransactionUsage(byName, normalizedBranchId);
            if (singleUsedCustomer) {
                byName = [singleUsedCustomer];
            } else {
                throw new Error(`customer_code_required_for_duplicate_name:${normalizedName}`);
            }
        }

        if (byName.length > 0) {
            const existing = byName[0];
            const existingName = normalizeCustomerNameValue(existing.customer_name) || normalizedName;
            const nextName = isCustomerNameMatchOrAlias(existing, normalizedName)
                ? existingName
                : normalizedName;
            const nextCode = existing.customer_code || normalizedCode || await this.generateUniqueCustomerCode(normalizedBranchId);
            const nextBranchId = normalizedBranchId || existing.branch_id || null;
            const pool = this.getPostgresPool();

            if (pool) {
                await pool.query(
                    `
                        UPDATE customers
                        SET customer_name = $1,
                            customer_code = $2,
                            branch_id = $3,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $4
                    `,
                    [nextName, nextCode, nextBranchId, existing.id]
                );
            } else {
                this.dbManager.db.prepare(
                    `
                        UPDATE customers
                        SET customer_name = ?,
                            customer_code = ?,
                            branch_id = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `
                ).run(nextName, nextCode, nextBranchId, existing.id);
            }

            return {
                ...existing,
                customer_name: nextName,
                customer_code: nextCode,
                branch_id: nextBranchId
            };
        }

        const effectiveCode = normalizedCode || await this.generateUniqueCustomerCode(normalizedBranchId);
        const pool = this.getPostgresPool();
        if (pool) {
            const insertCustomer = async () => {
                const result = await pool.query(
                    `
                        INSERT INTO customers (customer_code, customer_name, branch_id, created_at, updated_at)
                        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING id, customer_name, customer_code, branch_id
                    `,
                    [effectiveCode, normalizedName, normalizedBranchId]
                );
                return normalizeCustomerRow(result.rows?.[0]);
            };

            const maxInsertAttempts = 3;
            for (let attempt = 1; attempt <= maxInsertAttempts; attempt += 1) {
                try {
                    return await insertCustomer();
                } catch (error) {
                    const canRetrySequence = this.isPostgresPrimaryKeySequenceError(error, 'customers')
                        && attempt < maxInsertAttempts;
                    if (!canRetrySequence) {
                        throw error;
                    }

                    console.warn(
                        `⚠️ [Customers] customers.id sequence was behind; refreshing sequence and retrying insert (${attempt}/${maxInsertAttempts}).`
                    );
                    await this.refreshPostgresSerialSequence('customers');
                }
            }

            throw new Error('customers_sequence_repair_failed');
        }

        if (typeof this.dbManager.ensureCustomerRegistryRecord === 'function') {
            return normalizeCustomerRow(this.dbManager.ensureCustomerRegistryRecord({
                customerName: normalizedName,
                customerCode: effectiveCode,
                branchId: normalizedBranchId
            }));
        }

        const insertResult = this.dbManager.db.prepare(
            `
                INSERT INTO customers (customer_code, customer_name, branch_id, created_at, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `
        ).run(effectiveCode, normalizedName, normalizedBranchId);
        return {
            id: insertResult.lastInsertRowid,
            customer_id: insertResult.lastInsertRowid,
            customer_name: normalizedName,
            customer_code: effectiveCode,
            branch_id: normalizedBranchId
        };
    }

    async resolveRequestCustomerIdentity(item, branchId = null) {
        const source = item && typeof item === 'object' ? item : {};
        const normalizedBranchId = normalizePositiveInteger(source.branch_id) || normalizePositiveInteger(branchId);
        const inputName = normalizeCustomerNameValue(source.customer_name || source.name);
        const inputCode = normalizeCustomerCodeValue(source.customer_code || source.code);
        const inputId = normalizePositiveInteger(source.customer_id || source.id);

        let resolved = null;
        if (inputId) {
            const byId = await this.findCustomerById(inputId);
            if (
                byId
                && (!inputName || isCustomerNameMatchOrAlias(byId, inputName))
                && (!inputCode || normalizeCustomerCodeValue(byId.customer_code) === inputCode)
                && isSameOrOpenBranch(byId.branch_id, normalizedBranchId)
            ) {
                resolved = byId;
            }
        }

        if (!resolved && inputCode) {
            const byCode = await this.findCustomerByCode(inputCode);
            if (
                byCode
                && (!inputName || isCustomerNameMatchOrAlias(byCode, inputName))
                && isSameOrOpenBranch(byCode.branch_id, normalizedBranchId)
            ) {
                resolved = byCode;
            }
        }

        if (!resolved && inputName) {
            resolved = await this.createOrUpdateServerCustomer({
                customerName: inputName,
                customerCode: inputCode,
                branchId: normalizedBranchId
            });
        }

        const finalName = resolved?.customer_name || inputName;
        if (!finalName) {
            return { ...source };
        }

        return {
            ...source,
            customer_id: resolved?.id || resolved?.customer_id || inputId || null,
            customer_code: resolved?.customer_code || inputCode || '',
            customer_name: finalName,
            branch_id: resolved?.branch_id || normalizedBranchId || null
        };
    }

    async enrichCustomerRequestDetails(details = {}, cashierId = null) {
        const branchId = await this.getCashierBranchId(cashierId);
        const normalizeItems = async (items = []) => {
            if (!Array.isArray(items)) {
                return [];
            }

            const enriched = [];
            for (const item of items) {
                enriched.push(await this.resolveRequestCustomerIdentity(item, branchId));
            }
            return enriched;
        };

        return {
            ...details,
            postpaid_items: await normalizeItems(details.postpaid_items),
            customer_receipts: await normalizeItems(details.customer_receipts)
        };
    }

    async handleGetCustomerList(req, res, queryParams = {}) {
        try {
            console.log('🔍 [Customers API] Params:', queryParams);
            const authUser = req && req.authUser ? req.authUser : null;
            const effectiveCashierId = authUser && authUser.role === 'cashier'
                ? authUser.id
                : (queryParams && queryParams.cashierId ? queryParams.cashierId : null);
            const branchId = await this.getCashierBranchId(effectiveCashierId);
            let customerRows = await this.listCustomerRowsForBranch(branchId);
            const compactResponse = isTruthyQueryValue(queryParams && queryParams.compact);
            const includeAliases = isTruthyQueryValue(queryParams && queryParams.includeAliases);

            if (customerRows.length === 0) {
                customerRows = await this.listTransactionCustomerRowsForBranch(branchId);
            }

            const customers = customerRows.map((row) => row.customer_name).filter(Boolean);
            const payload = {
                success: true,
                customer_records: customerRows,
                branch_id: branchId
            };

            if (includeAliases) {
                payload.customer_alias_records = await this.listMergedCustomerAliasRowsForBranch(branchId);
            }

            if (!compactResponse) {
                payload.customers = customers;
            }

            console.log(`✅[Customers API] Returning ${customerRows.length} customers`);
            console.log('🚀 [Customers API] About to call sendJson...');
            this.sendJson(res, payload, {
                req,
                cacheable: true
            });
        } catch (error) {
            console.error('Error fetching customers:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleSyncUsers(req, res) {
        try {
            const data = await this.readJsonBody(req, {
                maxBytes: LARGE_JSON_BODY_LIMIT_BYTES,
                routeLabel: '/api/sync/users payload'
            });
                console.log('🔄 [SYNC] Received sync data:', Object.keys(data));

                // **ROOT FIX**: Use pool.query() directly for PostgreSQL
                const pool = this.dbManager.pool || this.dbManager.db.pool;
                const syncFailures = [];

                if (!pool) {
                    throw new Error('Database pool not available');
                }

                const ensureCashboxSyncSchema = async () => {
                    const statements = [
                        `CREATE TABLE IF NOT EXISTS customers (
                            id SERIAL PRIMARY KEY,
                            customer_code TEXT DEFAULT '',
                            customer_name TEXT NOT NULL,
                            branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
                            phone TEXT DEFAULT '',
                            address TEXT DEFAULT '',
                            is_favorite INTEGER DEFAULT 0,
                            is_active INTEGER DEFAULT 1,
                            merged_into_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                            merged_at TIMESTAMP,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )`,
                        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT ''",
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL',
                        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''",
                        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT DEFAULT ''",
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_favorite INTEGER DEFAULT 0',
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1',
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS merged_into_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL',
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS merged_at TIMESTAMP',
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                        'ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                        'ALTER TABLE postpaid_sales ADD COLUMN IF NOT EXISTS customer_id INTEGER',
                        "ALTER TABLE postpaid_sales ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT ''",
                        'ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS customer_id INTEGER',
                        "ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT ''",
                        'ALTER TABLE manual_postpaid_sales ADD COLUMN IF NOT EXISTS customer_id INTEGER',
                        "ALTER TABLE manual_postpaid_sales ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT ''",
                        'ALTER TABLE manual_customer_receipts ADD COLUMN IF NOT EXISTS customer_id INTEGER',
                        "ALTER TABLE manual_customer_receipts ADD COLUMN IF NOT EXISTS customer_code TEXT DEFAULT ''",
                        `CREATE TABLE IF NOT EXISTS customer_fiscal_opening_balances (
                            id SERIAL PRIMARY KEY,
                            fiscal_year TEXT NOT NULL,
                            closed_year TEXT NOT NULL,
                            balance_key TEXT NOT NULL,
                            customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                            customer_code TEXT DEFAULT '',
                            customer_name TEXT NOT NULL,
                            branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
                            branch_name TEXT DEFAULT '',
                            opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
                            total_postpaid DECIMAL(10,2) NOT NULL DEFAULT 0,
                            total_receipts DECIMAL(10,2) NOT NULL DEFAULT 0,
                            movements_count INTEGER NOT NULL DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(fiscal_year, balance_key)
                        )`,
                        `CREATE TABLE IF NOT EXISTS branch_cashboxes (
                            id SERIAL PRIMARY KEY,
                            branch_id INTEGER NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
                            cashbox_name TEXT NOT NULL,
                            opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
                            is_active INTEGER DEFAULT 1,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )`,
                        `CREATE TABLE IF NOT EXISTS cashbox_vouchers (
                            id SERIAL PRIMARY KEY,
                            voucher_number INTEGER NOT NULL UNIQUE,
                            voucher_sequence_number INTEGER,
                            sync_key TEXT UNIQUE,
                            voucher_type TEXT NOT NULL,
                            cashbox_id INTEGER NOT NULL REFERENCES branch_cashboxes(id) ON DELETE CASCADE,
                            branch_id INTEGER NOT NULL REFERENCES branches(id),
                            counterparty_type TEXT NOT NULL,
                            counterparty_name TEXT NOT NULL,
                            cashier_id INTEGER REFERENCES cashiers(id) ON DELETE SET NULL,
                            amount DECIMAL(10,2) NOT NULL,
                            reference_no TEXT,
                            description TEXT,
                            voucher_date DATE NOT NULL,
                            created_by TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            source_reconciliation_id INTEGER,
                            source_entry_key TEXT,
                            is_auto_generated INTEGER DEFAULT 0
                        )`,
                        'ALTER TABLE cashbox_vouchers ADD COLUMN IF NOT EXISTS sync_key TEXT',
                        `CREATE TABLE IF NOT EXISTS cashbox_voucher_audit_log (
                            id SERIAL PRIMARY KEY,
                            voucher_id INTEGER,
                            voucher_number INTEGER,
                            voucher_sequence_number INTEGER,
                            voucher_type TEXT NOT NULL,
                            branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
                            action_type TEXT NOT NULL,
                            action_by TEXT,
                            action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            payload_json TEXT,
                            notes TEXT
                        )`,
                        'CREATE INDEX IF NOT EXISTS idx_branch_cashboxes_branch_id ON branch_cashboxes(branch_id)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_branch_date ON cashbox_vouchers(branch_id, voucher_date)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_cashbox_date ON cashbox_vouchers(cashbox_id, voucher_date)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_date ON cashbox_vouchers(voucher_type, voucher_date)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence ON cashbox_vouchers(voucher_type, voucher_sequence_number)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_counterparty_name ON cashbox_vouchers(counterparty_name)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_reconciliation ON cashbox_vouchers(source_reconciliation_id, source_entry_key)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_vouchers_auto_generated ON cashbox_vouchers(is_auto_generated, source_reconciliation_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customers_name_branch ON customers(customer_name, branch_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code)',
                        'CREATE INDEX IF NOT EXISTS idx_customers_favorite_active ON customers(is_favorite, is_active, merged_into_customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customers_active_merge ON customers(is_active, merged_into_customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customers_merged_into ON customers(merged_into_customer_id)',
                        `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_customer_code_unique
                         ON customers(UPPER(TRIM(customer_code)))
                         WHERE TRIM(COALESCE(customer_code, '')) <> ''`,
                        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_customer_id ON postpaid_sales(customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_customer_code ON postpaid_sales(customer_code)',
                        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_customer_code_norm ON postpaid_sales(UPPER(TRIM(customer_code)))',
                        'CREATE INDEX IF NOT EXISTS idx_postpaid_sales_created_date ON postpaid_sales(DATE(created_at))',
                        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer_id ON customer_receipts(customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer_code ON customer_receipts(customer_code)',
                        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer_code_norm ON customer_receipts(UPPER(TRIM(customer_code)))',
                        'CREATE INDEX IF NOT EXISTS idx_customer_receipts_created_date ON customer_receipts(DATE(created_at))',
                        'CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer_id ON manual_postpaid_sales(customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer_code_norm ON manual_postpaid_sales(UPPER(TRIM(customer_code)))',
                        'CREATE INDEX IF NOT EXISTS idx_manual_postpaid_created_date ON manual_postpaid_sales(DATE(created_at))',
                        'CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer_id ON manual_customer_receipts(customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer_code_norm ON manual_customer_receipts(UPPER(TRIM(customer_code)))',
                        'CREATE INDEX IF NOT EXISTS idx_manual_receipts_created_date ON manual_customer_receipts(DATE(created_at))',
                        'CREATE INDEX IF NOT EXISTS idx_customer_fiscal_opening_year_key ON customer_fiscal_opening_balances(fiscal_year, balance_key)',
                        'CREATE INDEX IF NOT EXISTS idx_customer_fiscal_opening_customer_id ON customer_fiscal_opening_balances(customer_id)',
                        'CREATE INDEX IF NOT EXISTS idx_customer_fiscal_opening_code ON customer_fiscal_opening_balances(customer_code)',
                        'CREATE INDEX IF NOT EXISTS idx_customer_fiscal_opening_name_branch ON customer_fiscal_opening_balances(customer_name, branch_id)',
                        'CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_name ON suppliers(supplier_name)',
                        'CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_name_norm ON suppliers(UPPER(TRIM(supplier_name)))',
                        'CREATE INDEX IF NOT EXISTS idx_suppliers_created_date ON suppliers(DATE(created_at))',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_voucher_action ON cashbox_voucher_audit_log(voucher_id, action_at DESC)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_branch_action ON cashbox_voucher_audit_log(branch_id, action_at DESC)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_action_type ON cashbox_voucher_audit_log(action_type, action_at DESC)',
                        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence_unique ON cashbox_vouchers(voucher_type, voucher_sequence_number)',
                        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique ON cashbox_vouchers(source_reconciliation_id, source_entry_key)'
                    ];

                    for (const statement of statements) {
                        await pool.query(statement);
                    }

                    const duplicateResult = await pool.query(`
                        SELECT sync_key, COUNT(*)::int AS count
                        FROM cashbox_vouchers
                        WHERE sync_key IS NOT NULL AND TRIM(sync_key) <> ''
                        GROUP BY sync_key
                        HAVING COUNT(*) > 1
                        ORDER BY count DESC, sync_key
                        LIMIT 20
                    `);
                    if (duplicateResult.rowCount > 0) {
                        const duplicateCount = duplicateResult.rows.reduce((total, row) => total + Number(row.count), 0);
                        const error = new Error(
                            `CASHBOX_SYNC_KEY_DUPLICATES: ${duplicateResult.rowCount} duplicate sync_key groups (${duplicateCount} rows). Sync paused; no records were changed.`
                        );
                        error.code = 'CASHBOX_SYNC_KEY_DUPLICATES';
                        error.statusCode = 409;
                        throw error;
                    }
                    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key)');
                };

                const hasCashboxPayload = Boolean(
                    data.branch_cashboxes
                    || data.cashbox_vouchers
                    || data.cashbox_voucher_audit_log
                    || data.active_cashbox_voucher_sync_keys
                    || data.active_branch_cashboxes_branch_ids
                    || data.active_branch_cashboxes_ids
                    || data.active_cashbox_vouchers_ids
                    || data.active_cashbox_voucher_audit_log_ids
                );

                const hasCustomerIdentityPayload = Boolean(
                    data.customers
                    || data.postpaid_sales
                    || data.customer_receipts
                    || data.manual_postpaid_sales
                    || data.manual_customer_receipts
                    || data.customer_fiscal_opening_balances
                    || data.active_customer_fiscal_opening_balances_ids
                );

                if (hasCashboxPayload || hasCustomerIdentityPayload) {
                    await ensureCashboxSyncSchema();
                }

                // Helper to perform safe cleanup based on Full ID Lists
                const handleCleanup = async (table, activeIds) => {
                    if (!activeIds || !Array.isArray(activeIds)) return;

                    try {
                        if (activeIds.length > 0) {
                            // Delete records NOT in the activeIds list (Mirror Sync)
                            // "DELETE FROM table WHERE id NOT IN (...)"
                            // Optimized for Postgres using ANY/ALL
                            const result = await pool.query(
                                `DELETE FROM ${table} WHERE id != ALL($1::int[])`,
                                [activeIds]
                            );
                            if (result.rowCount > 0) {
                                console.log(`🧹 [SYNC] Cleaned ${result.rowCount} orphaned records from ${table}.`);
                            }
                        } else {
                            // Empty list logic skipped for safety
                        }
                    } catch (err) {
                        console.error(`⚠️ [SYNC] Cleanup failed for ${table}:`, err.message);
                    }
                };

                const parseInteger = (value) => {
                    if (value === null || value === undefined || value === '') return null;
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) return null;
                    return Math.trunc(numeric);
                };

                const parseNumber = (value, fallback = 0) => {
                    if (value === null || value === undefined || value === '') return fallback;
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : fallback;
                };

                const toOptionalText = (value) => {
                    if (value === null || value === undefined) return null;
                    const normalized = String(value).trim();
                    return normalized.length > 0 ? normalized : null;
                };

                const ensureCanonicalCashboxByBranchId = async (branchId, fallbackName = null) => {
                    if (!Number.isFinite(Number(branchId))) return null;
                    const normalizedBranchId = Number(branchId);
                    const cashboxName = toOptionalText(fallbackName) || `Branch ${normalizedBranchId} Cashbox`;

                    await pool.query(
                        `
                            INSERT INTO branch_cashboxes (branch_id, cashbox_name, opening_balance, is_active, created_at, updated_at)
                            VALUES ($1, $2, 0, 1, NOW(), NOW())
                            ON CONFLICT (branch_id)
                            DO UPDATE SET
                                cashbox_name = EXCLUDED.cashbox_name,
                                updated_at = NOW()
                        `,
                        [normalizedBranchId, cashboxName]
                    );

                    const canonicalResult = await pool.query(
                        'SELECT id, branch_id FROM branch_cashboxes WHERE branch_id = $1 LIMIT 1',
                        [normalizedBranchId]
                    );
                    return canonicalResult.rows?.[0] || null;
                };

                const buildCanonicalCashboxIdMap = async () => {
                    const result = await pool.query('SELECT id, branch_id FROM branch_cashboxes');
                    const map = new Map();
                    for (const row of result.rows || []) {
                        if (Number.isFinite(Number(row.branch_id)) && Number.isFinite(Number(row.id))) {
                            map.set(Number(row.branch_id), Number(row.id));
                        }
                    }
                    return map;
                };

                const syncBranchCashboxesCanonical = async (items = []) => {
                    if (!Array.isArray(items) || items.length === 0) {
                        return { canonicalMap: await buildCanonicalCashboxIdMap(), localCashboxToBranchMap: new Map() };
                    }

                    const localCashboxToBranchMap = new Map();
                    const seenBranchIds = new Set();
                    for (const item of items) {
                        const branchId = parseInteger(item?.branch_id);
                        if (!Number.isFinite(branchId)) continue;

                        if (Number.isFinite(parseInteger(item?.id))) {
                            localCashboxToBranchMap.set(parseInteger(item.id), branchId);
                        }

                        if (seenBranchIds.has(branchId)) continue;
                        seenBranchIds.add(branchId);

                        await ensureCanonicalCashboxByBranchId(branchId, item?.cashbox_name);

                        await pool.query(
                            `
                                UPDATE branch_cashboxes
                                SET
                                    opening_balance = $2,
                                    is_active = $3,
                                    updated_at = COALESCE($4, NOW())
                                WHERE branch_id = $1
                            `,
                            [
                                branchId,
                                parseNumber(item?.opening_balance, 0),
                                parseInteger(item?.is_active) === 0 ? 0 : 1,
                                item?.updated_at || null
                            ]
                        );
                    }

                    return {
                        canonicalMap: await buildCanonicalCashboxIdMap(),
                        localCashboxToBranchMap
                    };
                };

                const buildCashboxVoucherSyncKey = (voucher, branchId) => {
                    const explicitSyncKey = toOptionalText(voucher?.sync_key);
                    if (explicitSyncKey) return explicitSyncKey;

                    const sourceReconciliationId = parseInteger(voucher?.source_reconciliation_id);
                    const sourceEntryKey = toOptionalText(voucher?.source_entry_key);
                    if (sourceReconciliationId !== null && sourceEntryKey) {
                        return `recon:${sourceReconciliationId}:${sourceEntryKey}`;
                    }

                    const voucherType = toOptionalText(voucher?.voucher_type) || 'unknown';
                    const voucherSequence = parseInteger(voucher?.voucher_sequence_number);
                    if (voucherSequence !== null) {
                        return `seq:${branchId}:${voucherType}:${voucherSequence}`;
                    }

                    const voucherNumber = parseInteger(voucher?.voucher_number);
                    if (voucherNumber !== null) {
                        return `num:${branchId}:${voucherType}:${voucherNumber}`;
                    }

                    const voucherDate = toOptionalText(voucher?.voucher_date) || 'na';
                    const amount = parseNumber(voucher?.amount, 0);
                    const counterpartyType = toOptionalText(voucher?.counterparty_type) || 'na';
                    const counterpartyName = toOptionalText(voucher?.counterparty_name) || 'na';
                    const createdAt = toOptionalText(voucher?.created_at) || 'na';
                    const localId = toOptionalText(voucher?.id) || 'na';

                    return `fallback:${branchId}:${voucherType}:${voucherDate}:${amount}:${counterpartyType}:${counterpartyName}:${createdAt}:${localId}`;
                };

                const syncCashboxVouchersCanonical = async (items = [], canonicalMap = new Map(), localCashboxToBranchMap = new Map()) => {
                    if (!Array.isArray(items) || items.length === 0) return;

                    console.log(`🔄 [SYNC] Syncing cashbox_vouchers (${items.length} items) with canonical sync keys...`);

                    const BATCH_SIZE = 200;
                    const columns = [
                        'sync_key',
                        'voucher_number',
                        'voucher_sequence_number',
                        'voucher_type',
                        'cashbox_id',
                        'branch_id',
                        'counterparty_type',
                        'counterparty_name',
                        'cashier_id',
                        'amount',
                        'reference_no',
                        'description',
                        'voucher_date',
                        'created_by',
                        'created_at',
                        'updated_at',
                        'source_reconciliation_id',
                        'source_entry_key',
                        'is_auto_generated'
                    ];
                    const updateSet = columns
                        .filter(columnName => columnName !== 'sync_key' && columnName !== 'created_at')
                        .map(columnName => `${columnName} = EXCLUDED.${columnName}`)
                        .join(', ');

                    const normalizedItems = [];
                    for (const item of items) {
                        const localCashboxId = parseInteger(item?.cashbox_id);
                        let branchId = parseInteger(item?.branch_id);
                        if (branchId === null && localCashboxId !== null && localCashboxToBranchMap.has(localCashboxId)) {
                            branchId = localCashboxToBranchMap.get(localCashboxId);
                        }
                        if (branchId === null) {
                            const failure = { table: 'cashbox_vouchers', id: item?.id ?? null, error: 'Missing branch_id for cashbox voucher' };
                            syncFailures.push(failure);
                            continue;
                        }

                        if (!canonicalMap.has(branchId)) {
                            const createdCanonical = await ensureCanonicalCashboxByBranchId(branchId, null);
                            if (createdCanonical && Number.isFinite(Number(createdCanonical.id))) {
                                canonicalMap.set(branchId, Number(createdCanonical.id));
                            }
                        }

                        const canonicalCashboxId = canonicalMap.get(branchId);
                        if (!Number.isFinite(Number(canonicalCashboxId))) {
                            const failure = { table: 'cashbox_vouchers', id: item?.id ?? null, error: `Failed to resolve canonical cashbox for branch ${branchId}` };
                            syncFailures.push(failure);
                            continue;
                        }

                        normalizedItems.push({
                            sync_key: buildCashboxVoucherSyncKey(item, branchId),
                            voucher_number: parseInteger(item?.voucher_number),
                            voucher_sequence_number: parseInteger(item?.voucher_sequence_number),
                            voucher_type: toOptionalText(item?.voucher_type),
                            cashbox_id: canonicalCashboxId,
                            branch_id: branchId,
                            counterparty_type: toOptionalText(item?.counterparty_type),
                            counterparty_name: toOptionalText(item?.counterparty_name),
                            cashier_id: parseInteger(item?.cashier_id),
                            amount: parseNumber(item?.amount, 0),
                            reference_no: toOptionalText(item?.reference_no),
                            description: toOptionalText(item?.description),
                            voucher_date: toOptionalText(item?.voucher_date),
                            created_by: toOptionalText(item?.created_by),
                            created_at: item?.created_at || null,
                            updated_at: item?.updated_at || null,
                            source_reconciliation_id: parseInteger(item?.source_reconciliation_id),
                            source_entry_key: toOptionalText(item?.source_entry_key),
                            is_auto_generated: parseInteger(item?.is_auto_generated) === 1 ? 1 : 0
                        });
                    }

                    let successCount = 0;
                    let errorCount = 0;
                    for (let i = 0; i < normalizedItems.length; i += BATCH_SIZE) {
                        const batch = normalizedItems.slice(i, i + BATCH_SIZE);
                        const placeholders = [];
                        const values = [];
                        let paramCounter = 1;

                        for (const item of batch) {
                            const rowPlaceholders = [];
                            for (const columnName of columns) {
                                values.push(item[columnName] === undefined ? null : item[columnName]);
                                rowPlaceholders.push(`$${paramCounter++}`);
                            }
                            placeholders.push(`(${rowPlaceholders.join(', ')})`);
                        }

                        const sql = `
                            INSERT INTO cashbox_vouchers (${columns.join(', ')})
                            VALUES ${placeholders.join(', ')}
                            ON CONFLICT (sync_key) DO UPDATE SET ${updateSet}
                        `;

                        try {
                            await pool.query(sql, values);
                            successCount += batch.length;
                        } catch (err) {
                            console.error('❌ [SYNC] Batch Error cashbox_vouchers:', err.message);
                            for (const item of batch) {
                                try {
                                    const singleValues = columns.map(columnName => item[columnName] === undefined ? null : item[columnName]);
                                    const singlePlaceholders = singleValues.map((_, idx) => `$${idx + 1}`).join(', ');
                                    await pool.query(
                                        `INSERT INTO cashbox_vouchers (${columns.join(', ')}) VALUES (${singlePlaceholders}) ON CONFLICT (sync_key) DO UPDATE SET ${updateSet}`,
                                        singleValues
                                    );
                                    successCount += 1;
                                } catch (singleError) {
                                    errorCount += 1;
                                    syncFailures.push({
                                        table: 'cashbox_vouchers',
                                        id: item.sync_key || item.voucher_number || null,
                                        error: singleError.message
                                    });
                                    console.error('❌ [SYNC] Row insert failed:', {
                                        table: 'cashbox_vouchers',
                                        sync_key: item.sync_key || null,
                                        record_id: item.id || null,
                                        code: singleError.code || null,
                                        message: singleError.message
                                    });
                                }
                            }
                        }
                    }

                    console.log(`✅ [SYNC] cashbox_vouchers: Processed ${successCount} items.${errorCount > 0 ? ` Failed ${errorCount} items.` : ''}`);
                };

                const handleBranchCashboxCleanupByBranchId = async (activeBranchIds) => {
                    if (!Array.isArray(activeBranchIds) || activeBranchIds.length === 0) return;
                    const normalizedIds = Array.from(
                        new Set(
                            activeBranchIds
                                .map(parseInteger)
                                .filter(branchId => Number.isFinite(branchId))
                        )
                    );
                    if (normalizedIds.length === 0) return;

                    try {
                        const result = await pool.query(
                            'DELETE FROM branch_cashboxes WHERE branch_id != ALL($1::int[])',
                            [normalizedIds]
                        );
                        if (result.rowCount > 0) {
                            console.log(`🧹 [SYNC] Cleaned ${result.rowCount} orphaned branch_cashboxes via branch_id mirror cleanup.`);
                        }
                    } catch (err) {
                        console.error('⚠️ [SYNC] branch_cashboxes branch_id cleanup failed:', err.message);
                    }
                };

                const handleCashboxVoucherCleanupBySyncKeys = async (activeSyncKeys) => {
                    if (!Array.isArray(activeSyncKeys)) return;
                    const normalizedSyncKeys = Array.from(
                        new Set(
                            activeSyncKeys
                                .map(toOptionalText)
                                .filter((syncKey) => syncKey !== null)
                        )
                    );

                    try {
                        let result;
                        if (normalizedSyncKeys.length === 0) {
                            result = await pool.query('DELETE FROM cashbox_vouchers');
                        } else {
                            result = await pool.query(
                                `
                                    DELETE FROM cashbox_vouchers
                                    WHERE sync_key IS NULL
                                       OR TRIM(sync_key) = ''
                                       OR sync_key != ALL($1::text[])
                                `,
                                [normalizedSyncKeys]
                            );
                        }

                        if (result.rowCount > 0) {
                            console.log(`🧹 [SYNC] Cleaned ${result.rowCount} orphaned cashbox_vouchers via sync-key mirror cleanup.`);
                        }
                    } catch (err) {
                        console.error('⚠️ [SYNC] cashbox_vouchers sync-key cleanup failed:', err.message);
                    }
                };

                // Helper to sync table using Optimized Batch INSERT
                const syncTable = async (table, items, columns, conflictCol = 'id') => {
                    if (!items || items.length === 0) return;

                    console.log(`🔄 [SYNC] Syncing ${table} (${items.length} items) in batches...`);
                    const cols = columns.map(c => c.name);
                    const updateSets = columns.map(col => {
                        if (col.preserveIfNull) {
                            // Preserve existing value if new value is NULL or empty string
                            return `${col.name} = COALESCE(NULLIF(EXCLUDED.${col.name}, ''), NULLIF(EXCLUDED.${col.name}, 'null'), ${table}.${col.name})`;
                        }
                        return `${col.name} = EXCLUDED.${col.name}`;
                    }).join(', ');

                    // Process in batches of 200 to avoid query parameter limits and timeouts
                    const BATCH_SIZE = 200;
                    let successCount = 0;
                    let errorCount = 0;

                    for (let i = 0; i < items.length; i += BATCH_SIZE) {
                        const batch = items.slice(i, i + BATCH_SIZE);
                        const placeholders = [];
                        const values = [];
                        let paramCounter = 1;

                        batch.forEach(item => {
                            const rowParams = [];
                            cols.forEach(col => {
                                let val = item[col];
                                if (table === 'admins' && col === 'password' && val) {
                                    val = hashSecretIfNeeded(val);
                                }
                                if (table === 'cashiers' && col === 'pin_code' && val) {
                                    val = hashSecretIfNeeded(val);
                                }
                                if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                                if (val === undefined) val = null;
                                values.push(val);
                                rowParams.push(`$${paramCounter++}`);
                            });
                            placeholders.push(`(${rowParams.join(', ')})`);
                        });

                        const sql = `
                        INSERT INTO ${table} (${cols.join(', ')})
                        VALUES ${placeholders.join(', ')}
                        ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSets}
                    `;

                        try {
                            const res = await pool.query(sql, values);
                            successCount += batch.length; // Approximate (rowCount might differ with upserts)
                        } catch (err) {
                            console.error(`❌ [SYNC] Batch Error ${table}:`, err.message);
                            // Fallback: If batch fails, try one-by-one for this batch only
                            // (Usually caused by specific data issues)
                            for (const item of batch) {
                                try {
                                    const singleVals = cols.map(c => {
                                        let v = item[c];
                                        if (table === 'admins' && c === 'password' && v) {
                                            v = hashSecretIfNeeded(v);
                                        }
                                        if (table === 'cashiers' && c === 'pin_code' && v) {
                                            v = hashSecretIfNeeded(v);
                                        }
                                        if (typeof v === 'object' && v !== null) return JSON.stringify(v);
                                        if (v === undefined) return null;
                                        return v;
                                    });
                                    const singlePlaceholders = singleVals.map((_, idx) => `$${idx + 1}`).join(', ');
                                    await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${singlePlaceholders}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSets}`, singleVals);
                                    successCount++;
                                } catch (e) {
                                    errorCount++;
                                    const failedItemId = item && item.id != null ? item.id : null;
                                    const failure = {
                                        table,
                                        id: failedItemId,
                                        error: e.message
                                    };
                                    syncFailures.push(failure);
                                    console.error('❌ [SYNC] Row insert failed:', {
                                        table,
                                        record_id: failedItemId,
                                        code: e.code || null,
                                        message: e.message
                                    });
                                }
                            }
                        }
                    }
                    console.log(`✅ [SYNC] ${table}: Processed ${successCount} items.${errorCount > 0 ? ` Failed ${errorCount} items.` : ''}`);
                };

                // Sync all tables in dependency order
                if (data.branches) {
                    await syncTable('branches', data.branches, [
                        { name: 'id' }, { name: 'branch_name' }, { name: 'customer_code_prefix' }, { name: 'branch_address' },
                        { name: 'branch_phone' }, { name: 'is_active' }
                    ]);
                }

                if (data.customers) {
                    await syncTable('customers', data.customers, [
                        { name: 'id' }, { name: 'customer_code' }, { name: 'customer_name' },
                        { name: 'branch_id' }, { name: 'phone' }, { name: 'address' },
                        { name: 'is_favorite', preserveIfNull: true }, { name: 'is_active', preserveIfNull: true },
                        { name: 'merged_into_customer_id' }, { name: 'merged_at' },
                        { name: 'created_at' }, { name: 'updated_at' }
                    ]);
                    try {
                        await this.refreshPostgresSerialSequence('customers');
                    } catch (sequenceError) {
                        console.warn('⚠️ [SYNC] customers sequence refresh failed:', sequenceError.message);
                    }
                }

                if (data.accountants) {
                    await syncTable('accountants', data.accountants, [
                        { name: 'id' }, { name: 'name' }, { name: 'active' }
                    ]);
                }

                // --- 1. PERFORM CLEANUP (Mirror Logic) ---
                if (data.active_reconciliations_ids) await handleCleanup('reconciliations', data.active_reconciliations_ids);
                if (data.active_postpaid_sales_ids) await handleCleanup('postpaid_sales', data.active_postpaid_sales_ids);
                if (data.active_customer_receipts_ids) await handleCleanup('customer_receipts', data.active_customer_receipts_ids);
                if (data.active_manual_postpaid_sales_ids) await handleCleanup('manual_postpaid_sales', data.active_manual_postpaid_sales_ids);
                if (data.active_manual_customer_receipts_ids) await handleCleanup('manual_customer_receipts', data.active_manual_customer_receipts_ids);
                if (data.active_customer_fiscal_opening_balances_ids) await handleCleanup('customer_fiscal_opening_balances', data.active_customer_fiscal_opening_balances_ids);
                if (data.active_cash_receipts_ids) await handleCleanup('cash_receipts', data.active_cash_receipts_ids);
                if (data.active_bank_receipts_ids) await handleCleanup('bank_receipts', data.active_bank_receipts_ids);
                if (data.active_cashbox_voucher_audit_log_ids) {
                    console.log('ℹ️ [SYNC] Ignoring legacy active_cashbox_voucher_audit_log_ids cleanup on PostgreSQL; local audit-log ids are not globally stable.');
                }
                if (Array.isArray(data.active_cashbox_voucher_sync_keys)) {
                    await handleCashboxVoucherCleanupBySyncKeys(data.active_cashbox_voucher_sync_keys);
                } else if (data.active_cashbox_vouchers_ids) {
                    console.log('ℹ️ [SYNC] Ignoring legacy active_cashbox_vouchers_ids cleanup on PostgreSQL; voucher ids are local and not globally stable.');
                }

                if (Array.isArray(data.active_branch_cashboxes_branch_ids)) {
                    await handleBranchCashboxCleanupByBranchId(data.active_branch_cashboxes_branch_ids);
                } else if (Array.isArray(data.branch_cashboxes) && data.branch_cashboxes.length > 0) {
                    await handleBranchCashboxCleanupByBranchId(data.branch_cashboxes.map(row => row && row.branch_id));
                } else if (data.active_branch_cashboxes_ids) {
                    console.log('ℹ️ [SYNC] Ignoring legacy active_branch_cashboxes_ids for branch_cashboxes cleanup on PostgreSQL; waiting for branch_id-based payload.');
                }


                if (data.admins) {
                    // For admins, use username as conflict key to handle duplicate usernames
                    await syncTable('admins', data.admins, [
                        { name: 'id' }, { name: 'name' }, { name: 'username' },
                        { name: 'password', preserveIfNull: true }, { name: 'role' }, { name: 'active' } // Permissions excluded to protect web edits
                    ], 'username'); // Use username instead of id to avoid constraint violations
                }

                if (data.cashiers) {
                    await syncTable('cashiers', data.cashiers, [
                        { name: 'id' }, { name: 'name' }, { name: 'cashier_number' },
                        { name: 'branch_id' }, { name: 'active' },
                        { name: 'pin_code', preserveIfNull: true }
                    ]);
                }

                if (data.atms) {
                    await syncTable('atms', data.atms, [
                        { name: 'id' }, { name: 'name' }, { name: 'bank_name' },
                        { name: 'location' }, { name: 'branch_id' }, { name: 'active' }
                    ]);
                }

                let canonicalCashboxByBranchId = new Map();
                let localCashboxToBranchMap = new Map();
                if (Array.isArray(data.branch_cashboxes) && data.branch_cashboxes.length > 0) {
                    const canonicalResult = await syncBranchCashboxesCanonical(data.branch_cashboxes);
                    canonicalCashboxByBranchId = canonicalResult.canonicalMap;
                    localCashboxToBranchMap = canonicalResult.localCashboxToBranchMap;
                } else if (hasCashboxPayload) {
                    canonicalCashboxByBranchId = await buildCanonicalCashboxIdMap();
                }



                // --- MIRROR SYNC: Delete Removed Reconciliations ---
                if (data.active_reconciliation_ids && Array.isArray(data.active_reconciliation_ids)) {
                    const activeIds = data.active_reconciliation_ids;
                    if (activeIds.length > 0) {
                        try {
                            console.log(`🗑️ [SYNC] Checking for deletions against ${activeIds.length} active IDs...`);
                            const pool = this.dbManager.pool || this.dbManager.db.pool;

                            // PostgreSQL requires array parameter for ANY operator
                            // Fetch IDs that ARE IN the DB but NOT IN the activeIds list
                            // We do this by selecting all IDs and filtering in JS to act safely, 
                            // or better: use query parameters. But 1200+ params in NOT IN might be heavy.
                            // Better Strategy: Select all local IDs, find diff in JS, then delete.

                            const localResult = await pool.query('SELECT id FROM reconciliations');
                            const localIds = localResult.rows.map(r => r.id);

                            const activeIdSet = new Set(activeIds);
                            const idsToDelete = localIds.filter(id => !activeIdSet.has(id));

                            if (idsToDelete.length > 0) {
                                console.log(`🗑️ [SYNC] Found ${idsToDelete.length} obsolete reconciliations. Deleting...`);

                                // Delete in batches of 50
                                const DELETE_BATCH = 50;
                                for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH) {
                                    const batch = idsToDelete.slice(i, i + DELETE_BATCH);
                                    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');

                                    // 1. Delete Child Records First
                                    await pool.query(`DELETE FROM cash_receipts WHERE reconciliation_id IN (${placeholders})`, batch);
                                    await pool.query(`DELETE FROM bank_receipts WHERE reconciliation_id IN (${placeholders})`, batch);
                                    await pool.query(`DELETE FROM postpaid_sales WHERE reconciliation_id IN (${placeholders})`, batch);
                                    await pool.query(`DELETE FROM customer_receipts WHERE reconciliation_id IN (${placeholders})`, batch);

                                    // 2. Delete Details
                                    await pool.query(`DELETE FROM return_invoices WHERE reconciliation_id IN (${placeholders})`, batch);
                                    await pool.query(`DELETE FROM suppliers WHERE reconciliation_id IN (${placeholders})`, batch);

                                    // 3. Delete Parent
                                    await pool.query(`DELETE FROM reconciliations WHERE id IN (${placeholders})`, batch);
                                }
                                console.log(`✅ [SYNC] Successfully deleted ${idsToDelete.length} obsolete records.`);
                            } else {
                                console.log('✅ [SYNC] No deletions needed. Local DB matches Active IDs.');
                            }
                        } catch (delErr) {
                            console.error('❌ [SYNC] Deletion Error:', delErr.message);
                        }
                    }
                }

                if (data.reconciliations) {
                    // **FIX**: Filter out reconciliations without a valid ID to prevent duplicates
                    const validReconciliations = data.reconciliations.filter(r => r.id && r.id > 0);
                    const skippedCount = data.reconciliations.length - validReconciliations.length;

                    if (skippedCount > 0) {
                        console.log(`⚠️ [SYNC] Skipped ${skippedCount} reconciliations without valid ID`);
                    }

                    // 1. Identify IDs of incoming items (use filtered list)
                    const incomingIds = validReconciliations.map(r => r.id).filter(id => id);
                    let newReconciliationsCount = 0;
                    let firstNewRec = null;

                    // 2. Check which IDs already exist in DB to find truly NEW ones
                    if (incomingIds.length > 0) {
                        try {
                            const pool = this.dbManager.pool || this.dbManager.db.pool;
                            // Create placeholders like $1, $2, $3...
                            // IMPORTANT: PostgreSQL uses $1, $2... syntax
                            const placeholders = incomingIds.map((_, i) => `$${i + 1}`).join(',');

                            // Query existing IDs and their statuses
                            const existingResult = await pool.query(
                                `SELECT id, status FROM reconciliations WHERE id IN (${placeholders})`,
                                incomingIds
                            );

                            const existingMap = new Map();
                            existingResult.rows.forEach(row => existingMap.set(row.id, row.status));

                            // Filter items that need notification:
                            // 1. It is 'completed'
                            // 2. AND (It's NEW OR It was NOT completed before)
                            const notifyItems = validReconciliations.filter(r =>
                                (r.status === 'completed' || r.status === 'مكتملة') &&
                                (!existingMap.has(r.id) || existingMap.get(r.id) !== r.status)
                            );

                            newReconciliationsCount = notifyItems.length;
                            if (newReconciliationsCount > 0) {
                                firstNewRec = notifyItems[0];
                                console.log(`🔔 [SYNC] Detected ${newReconciliationsCount} completed reconciliations (New or Updated). Notifying...`);
                            }

                        } catch (checkErr) {
                            console.error('⚠️ [SYNC] Failed to check existing records:', checkErr.message);
                        }
                    }

                    // 3. Perform the Sync (Save Data) - USE FILTERED LIST
                    await syncTable('reconciliations', validReconciliations, [
                        { name: 'id' }, { name: 'reconciliation_number' }, { name: 'cashier_id' },
                        { name: 'accountant_id' }, { name: 'reconciliation_date' }, { name: 'system_sales' },
                        { name: 'total_receipts' }, { name: 'surplus_deficit' }, { name: 'status' }, { name: 'notes' }
                    ]);

                    // 4. Send Notification ONLY if we found NEW items
                    if (newReconciliationsCount > 0 && firstNewRec) {
                        // Resolve cashier name with database fallback
                        let cashierName = 'كاشير';

                        // Try to find in synced data first
                        if (data.cashiers) {
                            const c = data.cashiers.find(c => c.id === firstNewRec.cashier_id);
                            if (c && c.name) {
                                cashierName = c.name;
                            }
                        } else {
                            // No cashiers data in sync, proceed to DB fallback
                        }

                        // Fallback: Try to get from database
                        if (cashierName === 'كاشير' && firstNewRec.cashier_id) {
                            try {
                                const pool = this.dbManager.pool || this.dbManager.db.pool;
                                const result = await pool.query(
                                    'SELECT name FROM cashiers WHERE id = $1',
                                    [firstNewRec.cashier_id]
                                );
                                if (result.rows && result.rows.length > 0 && result.rows[0].name) {
                                    cashierName = result.rows[0].name;
                                }
                            } catch (dbErr) {
                                console.error('⚠️ [NOTIFICATION] Failed to fetch cashier from DB:', dbErr.message);
                            }
                        }

                        // Calculate surplus/deficit
                        const surplusDeficit = parseFloat(firstNewRec.surplus_deficit || 0);
                        let differenceText = '';

                        if (surplusDeficit > 0) {
                            differenceText = `الفارق: زيادة ${surplusDeficit.toFixed(2)} ريال`;
                        } else if (surplusDeficit < 0) {
                            differenceText = `الفارق: عجز ${Math.abs(surplusDeficit).toFixed(2)} ريال`;
                        } else {
                            differenceText = 'الفارق: متوازن ✅';
                        }

                        // Enhanced notification messages
                        let title, msg;

                        if (newReconciliationsCount === 1) {
                            title = '✅ تصفية جديدة مكتملة';
                            msg = `تصفية جديدة رقم ${firstNewRec.reconciliation_number} (${cashierName}) - ${differenceText}`;
                        } else {
                            title = `🎯 ${newReconciliationsCount} تصفيات جديدة`;
                            msg = `تمت إضافة ${newReconciliationsCount} تصفيات مكتملة - أول تصفية: رقم ${firstNewRec.reconciliation_number} (${cashierName})`;
                        }

                        // Send async notification
                        this.sendOneSignalNotification(title, msg, {
                            type: 'new_reconciliation',
                            count: newReconciliationsCount,
                            rec_number: firstNewRec.reconciliation_number,
                            cashier_name: cashierName,
                            surplus_deficit: surplusDeficit
                        }).catch(e => console.error('Notification send failed:', e));
                    }
                }

                if (data.cash_receipts) {
                    await syncTable('cash_receipts', data.cash_receipts, [
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'denomination' },
                        { name: 'quantity' }, { name: 'total_amount' }
                    ]);
                }

                if (data.bank_receipts) {
                    await syncTable('bank_receipts', data.bank_receipts, [
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'operation_type' },
                        { name: 'atm_id' }, { name: 'amount' }
                    ]);
                }

                if (Array.isArray(data.cashbox_vouchers) && data.cashbox_vouchers.length > 0) {
                    await syncCashboxVouchersCanonical(
                        data.cashbox_vouchers,
                        canonicalCashboxByBranchId,
                        localCashboxToBranchMap
                    );
                }

                if (data.cashbox_voucher_audit_log) {
                    await syncTable('cashbox_voucher_audit_log', data.cashbox_voucher_audit_log, [
                        { name: 'id' }, { name: 'voucher_id' }, { name: 'voucher_number' },
                        { name: 'voucher_sequence_number' }, { name: 'voucher_type' }, { name: 'branch_id' },
                        { name: 'action_type' }, { name: 'action_by' }, { name: 'action_at' },
                        { name: 'payload_json' }, { name: 'notes' }
                    ]);
                }

                if (data.postpaid_sales) {
                    await syncTable('postpaid_sales', data.postpaid_sales, [
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'customer_id' },
                        { name: 'customer_name' }, { name: 'customer_code' }, { name: 'amount' },
                        { name: 'notes' }
                    ]);
                }

                if (data.customer_receipts) {
                    await syncTable('customer_receipts', data.customer_receipts, [
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'customer_id' },
                        { name: 'customer_name' }, { name: 'customer_code' }, { name: 'amount' },
                        { name: 'payment_type' }, { name: 'notes' }
                    ]);
                }

                if (data.manual_postpaid_sales) {
                    await syncTable('manual_postpaid_sales', data.manual_postpaid_sales, [
                        { name: 'id' }, { name: 'customer_id' }, { name: 'customer_name' },
                        { name: 'customer_code' }, { name: 'amount' }, { name: 'reason' },
                        { name: 'created_at' }
                    ]);
                }

                if (data.manual_customer_receipts) {
                    await syncTable('manual_customer_receipts', data.manual_customer_receipts, [
                        { name: 'id' }, { name: 'customer_id' }, { name: 'customer_name' },
                        { name: 'customer_code' }, { name: 'amount' }, { name: 'reason' },
                        { name: 'created_at' }
                    ]);
                }

                if (data.customer_fiscal_opening_balances) {
                    await syncTable('customer_fiscal_opening_balances', data.customer_fiscal_opening_balances, [
                        { name: 'id' }, { name: 'fiscal_year' }, { name: 'closed_year' }, { name: 'balance_key' },
                        { name: 'customer_id' }, { name: 'customer_code' }, { name: 'customer_name' },
                        { name: 'branch_id' }, { name: 'branch_name' }, { name: 'opening_balance' },
                        { name: 'total_postpaid' }, { name: 'total_receipts' }, { name: 'movements_count' },
                        { name: 'created_at' }, { name: 'updated_at' }
                    ]);
                }
                // Sync reconciliation requests (especially status updates)
                if (data.reconciliation_requests) {
                    // SANITIZE DATA: Ensure numeric fields are clean for Postgres (remove commas)
                    const safeFloat = (val) => {
                        if (!val) return 0;
                        if (typeof val === 'number') return val;
                        return parseFloat(String(val).replace(/,/g, '')) || 0;
                    };

                    const cleanRequests = data.reconciliation_requests.map(r => ({
                        ...r,
                        system_sales: safeFloat(r.system_sales),
                        total_cash: safeFloat(r.total_cash),
                        total_bank: safeFloat(r.total_bank),
                        details_json: normalizeDetailsJsonPayload(r.details_json ?? r.details)
                    }));

                    const BATCH_SIZE = 200;
                    let successCount = 0;
                    let errorCount = 0;

                    for (let i = 0; i < cleanRequests.length; i += BATCH_SIZE) {
                        const batch = cleanRequests.slice(i, i + BATCH_SIZE);
                        for (const requestItem of batch) {
                            try {
                                await pool.query(
                                    `
                                        INSERT INTO reconciliation_requests (
                                            id,
                                            cashier_id,
                                            system_sales,
                                            total_cash,
                                            total_bank,
                                            details_json,
                                            notes,
                                            status,
                                            request_date,
                                            created_at,
                                            updated_at
                                        )
                                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                                        ON CONFLICT (id) DO UPDATE SET
                                            cashier_id = EXCLUDED.cashier_id,
                                            system_sales = EXCLUDED.system_sales,
                                            total_cash = EXCLUDED.total_cash,
                                            total_bank = EXCLUDED.total_bank,
                                            details_json = CASE
                                                WHEN EXCLUDED.details_json IS NULL
                                                     OR BTRIM(EXCLUDED.details_json) = ''
                                                     OR BTRIM(EXCLUDED.details_json) IN ('{}', '[]', 'null')
                                                THEN COALESCE(NULLIF(BTRIM(reconciliation_requests.details_json), ''), EXCLUDED.details_json, '{}')
                                                ELSE EXCLUDED.details_json
                                            END,
                                            notes = EXCLUDED.notes,
                                            request_date = COALESCE(EXCLUDED.request_date, reconciliation_requests.request_date),
                                            created_at = COALESCE(reconciliation_requests.created_at, EXCLUDED.created_at),
                                            updated_at = COALESCE(EXCLUDED.updated_at, CURRENT_TIMESTAMP),
                                            status = CASE
                                                WHEN reconciliation_requests.status = 'deleted' THEN 'deleted'
                                                WHEN reconciliation_requests.status IN ('approved', 'completed')
                                                     AND COALESCE(EXCLUDED.status, 'pending') = 'pending'
                                                THEN reconciliation_requests.status
                                                ELSE COALESCE(EXCLUDED.status, reconciliation_requests.status, 'pending')
                                            END
                                    `,
                                    [
                                        requestItem.id,
                                        requestItem.cashier_id,
                                        requestItem.system_sales,
                                        requestItem.total_cash,
                                        requestItem.total_bank,
                                        requestItem.details_json,
                                        requestItem.notes || '',
                                        requestItem.status || 'pending',
                                        requestItem.request_date || requestItem.created_at || null,
                                        requestItem.created_at || null,
                                        requestItem.updated_at || null
                                    ]
                                );
                                successCount += 1;
                            } catch (itemError) {
                                errorCount += 1;
                                syncFailures.push({
                                    table: 'reconciliation_requests',
                                    id: requestItem.id ?? null,
                                    error: itemError.message
                                });
                                console.error('❌ [SYNC] reconciliation_requests row failed:', itemError.message, 'Data:', requestItem);
                            }
                        }
                    }

                    console.log(`✅ [SYNC] reconciliation_requests: Processed ${successCount} items.${errorCount > 0 ? ` Failed ${errorCount} items.` : ''}`);
                }

                if (syncFailures.length > 0) {
                    console.error('❌ [SYNC] Full sync completed with failures:', syncFailures.slice(0, 10));
                    this.sendJson(res, {
                        success: false,
                        error: 'SYNC_PARTIAL_FAILURE',
                        failuresCount: syncFailures.length,
                        failures: syncFailures.slice(0, 20)
                    });
                    return;
                }

            console.log('✅ [SYNC] Full sync completed successfully');
            this.sendJson(res, { success: true, message: 'Full sync completed' });
        } catch (error) {
            console.error('❌ [SYNC] Fatal error:', error);
            this.sendJson(
                res,
                { success: false, error: error.message },
                { statusCode: error.statusCode || 500 }
            );
        }
    }

    async handleUpdateRequestStatus(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { id, status } = JSON.parse(body);
                console.log(`🔄 [Real-time Sync] Updating request ${id} to status: ${status}`);

                const pool = this.dbManager.pool; // Check for Postgres (Render)

                if (pool) {
                    // Update Server DB (Postgres)
                    const result = await pool.query("UPDATE reconciliation_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, id]);
                    console.log(`✅ [Real-time Sync HOOK] Request ${id} updated to '${status}' on PostgreSQL (Server Mode). RowCount: ${result.rowCount}`);
                } else {
                    // Update Local DB (SQLite) - fallback
                    const stmt = this.dbManager.db.prepare("UPDATE reconciliation_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                    const info = stmt.run(status, id);
                    console.log(`✅ [Real-time Sync HOOK] Request ${id} updated to '${status}' on SQLite (Local Mode). Changes: ${info.changes}`);
                }

                this.sendJson(res, { success: true });
            } catch (error) {
                console.error('❌ [Real-time Sync] Error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }


    async handleSaveUser(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const user = JSON.parse(body);
                const normalizedPassword = String(user.password || '').trim();
                const isActive = user.active === undefined ? 1 : (user.active ? 1 : 0);

                if (user.id) {
                    if (normalizedPassword) {
                        await this.dbManager.db.prepare(`
                            UPDATE admins 
                            SET name = ?, username = ?, password = ?, role = ?, active = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(
                            user.name,
                            user.username,
                            hashSecretIfNeeded(normalizedPassword),
                            user.role,
                            isActive,
                            JSON.stringify(user.permissions || []),
                            user.id
                        );
                    } else {
                        await this.dbManager.db.prepare(`
                            UPDATE admins 
                            SET name = ?, username = ?, role = ?, active = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(
                            user.name,
                            user.username,
                            user.role,
                            isActive,
                            JSON.stringify(user.permissions || []),
                            user.id
                        );
                    }
                } else {
                    if (!normalizedPassword) {
                        throw new Error('كلمة المرور مطلوبة للمستخدم الجديد');
                    }

                    await this.dbManager.db.prepare(`
                        INSERT INTO admins (name, username, password, role, active, permissions)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(
                        user.name,
                        user.username,
                        hashSecretIfNeeded(normalizedPassword),
                        user.role,
                        isActive,
                        JSON.stringify(user.permissions || [])
                    );
                }

                this.sendJson(res, { success: true });
            } catch (error) {
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleDeleteUser(res, id) {
        try {
            this.dbManager.db.prepare('DELETE FROM admins WHERE id = ?').run(id);
            this.sendJson(res, { success: true });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleUpdateManualTransaction(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { id, mode, date, amount, description } = JSON.parse(body);
                // mode: 'debit' (manual_postpaid_sales) or 'credit' (manual_customer_receipts)

                const table = (mode === 'debit') ? 'manual_postpaid_sales' : 'manual_customer_receipts';

                // Check Server Mode
                const pool = this.dbManager.pool;
                if (pool) {
                    await pool.query(
                        `UPDATE ${table} SET amount = $1, created_at = $2, reason = $3 WHERE id = $4`,
                        [amount, date, description, id]
                    );
                } else {
                    this.dbManager.db.prepare(
                        `UPDATE ${table} SET amount = ?, created_at = ?, reason = ? WHERE id = ?`
                    ).run(amount, date, description, id);
                }

                this.sendJson(res, { success: true });
            } catch (e) {
                console.error('Update Transaction Error:', e);
                this.sendJson(res, { success: false, error: e.message });
            }
        });
    }

    async handleDeleteManualTransaction(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { id, mode } = JSON.parse(body);
                const table = (mode === 'debit') ? 'manual_postpaid_sales' : 'manual_customer_receipts';

                // Check Server Mode
                const pool = this.dbManager.pool;
                if (pool) {
                    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
                } else {
                    this.dbManager.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
                }

                this.sendJson(res, { success: true });
            } catch (e) {
                console.error('Delete Transaction Error:', e);
                this.sendJson(res, { success: false, error: e.message });
            }
        });
    }

    async ensureNotificationSubscriptionStore() {
        try {
            if (this.dbManager.pool) {
                await this.dbManager.pool.query(`
                    CREATE TABLE IF NOT EXISTS notification_subscriptions (
                        subscription_id TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        user_role TEXT DEFAULT 'admin',
                        external_id TEXT NOT NULL,
                        one_signal_app_id TEXT DEFAULT '',
                        user_agent TEXT DEFAULT '',
                        opted_in INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await this.dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user ON notification_subscriptions(user_id, user_role)');
                await this.dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_external_id ON notification_subscriptions(external_id)');
                await this.dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_app ON notification_subscriptions(one_signal_app_id, opted_in)');
                await this.dbManager.pool.query(`
                    CREATE TABLE IF NOT EXISTS notification_delivery_events (
                        id BIGSERIAL PRIMARY KEY,
                        request_id BIGINT NULL,
                        event_type TEXT NOT NULL,
                        target_type TEXT DEFAULT '',
                        target_count INTEGER DEFAULT 0,
                        one_signal_message_id TEXT DEFAULT '',
                        queued BOOLEAN DEFAULT FALSE,
                        delivery_json TEXT DEFAULT '',
                        error_code TEXT DEFAULT '',
                        error_message TEXT DEFAULT '',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await this.dbManager.pool.query('CREATE INDEX IF NOT EXISTS idx_notification_delivery_events_created ON notification_delivery_events(created_at DESC)');
            } else {
                this.dbManager.db.exec(`
                    CREATE TABLE IF NOT EXISTS notification_subscriptions (
                        subscription_id TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        user_role TEXT DEFAULT 'admin',
                        external_id TEXT NOT NULL,
                        one_signal_app_id TEXT DEFAULT '',
                        user_agent TEXT DEFAULT '',
                        opted_in INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user ON notification_subscriptions(user_id, user_role);
                    CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_external_id ON notification_subscriptions(external_id);
                    CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_app ON notification_subscriptions(one_signal_app_id, opted_in);

                    CREATE TABLE IF NOT EXISTS notification_delivery_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        request_id INTEGER,
                        event_type TEXT NOT NULL,
                        target_type TEXT DEFAULT '',
                        target_count INTEGER DEFAULT 0,
                        one_signal_message_id TEXT DEFAULT '',
                        queued INTEGER DEFAULT 0,
                        delivery_json TEXT DEFAULT '',
                        error_code TEXT DEFAULT '',
                        error_message TEXT DEFAULT '',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_notification_delivery_events_created ON notification_delivery_events(created_at DESC);
                `);
            }
            console.log('✅ [PUSH] Notification subscription and delivery audit stores are ready');
        } catch (error) {
            console.error(`❌ [PUSH] Failed to prepare notification subscriptions: ${error && error.message ? error.message : error}`);
        }
    }

    async recordNotificationDeliveryEvent(event = {}) {
        const deliveryJson = event.delivery && typeof event.delivery === 'object'
            ? JSON.stringify(event.delivery).slice(0, 4000)
            : '';
        const values = {
            requestId: Number.isInteger(Number(event.requestId)) ? Number(event.requestId) : null,
            eventType: String(event.eventType || 'reconciliation_request').slice(0, 100),
            targetType: String(event.targetType || '').slice(0, 100),
            targetCount: Math.max(0, Number.parseInt(event.targetCount, 10) || 0),
            messageId: String(event.messageId || '').slice(0, 200),
            queued: Boolean(event.success),
            deliveryJson,
            errorCode: String(event.code || '').slice(0, 100),
            errorMessage: String(event.error || '').slice(0, 1000)
        };

        try {
            if (this.dbManager.pool) {
                await this.dbManager.pool.query(
                    `
                        INSERT INTO notification_delivery_events (
                            request_id, event_type, target_type, target_count,
                            one_signal_message_id, queued, delivery_json,
                            error_code, error_message, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                    `,
                    [
                        values.requestId, values.eventType, values.targetType, values.targetCount,
                        values.messageId, values.queued, values.deliveryJson,
                        values.errorCode, values.errorMessage
                    ]
                );
            } else {
                this.dbManager.db.prepare(`
                    INSERT INTO notification_delivery_events (
                        request_id, event_type, target_type, target_count,
                        one_signal_message_id, queued, delivery_json,
                        error_code, error_message, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(
                    values.requestId, values.eventType, values.targetType, values.targetCount,
                    values.messageId, values.queued ? 1 : 0, values.deliveryJson,
                    values.errorCode, values.errorMessage
                );
            }
        } catch (error) {
            // Delivery audit must never affect saving a reconciliation request.
            console.warn(`⚠️ [PUSH] Could not write delivery audit: ${error && error.message ? error.message : error}`);
        }
    }

    async handleNotificationDiagnostics(res, authenticatedUser) {
        if (!authenticatedUser || authenticatedUser.role === 'cashier') {
            this.sendJson(res, {
                success: false,
                error: 'تشخيص الإشعارات متاح للإدارة فقط.'
            }, { statusCode: 403 });
            return;
        }

        try {
            const config = this.getOneSignalConfig();
            const subscriptionIds = await this.getNotificationTargetSubscriptionIds();
            const rows = this.dbManager.pool
                ? (await this.dbManager.pool.query(`
                    SELECT request_id, event_type, target_type, target_count,
                           one_signal_message_id, queued, delivery_json,
                           error_code, error_message, created_at
                    FROM notification_delivery_events
                    ORDER BY id DESC
                    LIMIT 20
                `)).rows
                : this.dbManager.db.prepare(`
                    SELECT request_id, event_type, target_type, target_count,
                           one_signal_message_id, queued, delivery_json,
                           error_code, error_message, created_at
                    FROM notification_delivery_events
                    ORDER BY id DESC
                    LIMIT 20
                `).all();

            const events = rows.map((row) => {
                let delivery = null;
                try {
                    delivery = row.delivery_json ? JSON.parse(row.delivery_json) : null;
                } catch (_) {
                    delivery = null;
                }
                return {
                    requestId: row.request_id,
                    eventType: row.event_type,
                    target: row.target_type,
                    targetCount: Number(row.target_count || 0),
                    messageId: row.one_signal_message_id || null,
                    queued: Boolean(row.queued),
                    delivery,
                    code: row.error_code || null,
                    error: row.error_message || null,
                    createdAt: row.created_at
                };
            });

            this.sendJson(res, {
                success: true,
                configured: config.configured,
                registeredSubscriptionCount: subscriptionIds.length,
                events
            });
        } catch (error) {
            this.sendJson(res, {
                success: false,
                error: 'تعذر قراءة تشخيص الإشعارات.'
            }, { statusCode: 500 });
        }
    }

    async resolveAdminNotificationUserId(sessionUser) {
        const sourceUser = sessionUser || {};
        let userId = Number(sourceUser.id);
        if (Number.isInteger(userId) && userId > 0) {
            return userId;
        }

        if (!sourceUser.username) {
            return 0;
        }

        try {
            const username = String(sourceUser.username).trim();
            const row = this.dbManager.pool
                ? (await this.dbManager.pool.query(
                    'SELECT id FROM admins WHERE username = $1 LIMIT 1',
                    [username]
                )).rows[0]
                : this.dbManager.db.prepare(
                    'SELECT id FROM admins WHERE username = ? LIMIT 1'
                ).get(username);
            userId = Number(row && row.id);
            return Number.isInteger(userId) && userId > 0 ? userId : 0;
        } catch (error) {
            console.warn(`⚠️ [PUSH] Unable to resolve admin id for notifications: ${error && error.message ? error.message : error}`);
            return 0;
        }
    }

    async registerNotificationSubscription(sessionUser, data = {}, req = null) {
        const sourceUser = sessionUser || {};
        if (!sourceUser || sourceUser.role === 'cashier') {
            return {
                success: false,
                statusCode: 403,
                code: 'NOTIFICATION_REGISTRATION_FORBIDDEN',
                error: 'تسجيل اشتراك الإشعارات متاح للإدارة فقط.'
            };
        }

        const config = this.getOneSignalConfig();
        if (!ONESIGNAL_UUID_REGEX.test(config.appId)) {
            return {
                success: false,
                statusCode: 500,
                code: 'ONESIGNAL_APP_ID_MISSING',
                error: 'OneSignal App ID غير مضبوط في الخادم.'
            };
        }

        const userId = await this.resolveAdminNotificationUserId(sourceUser);
        if (!Number.isInteger(userId) || userId <= 0) {
            return {
                success: false,
                statusCode: 401,
                code: 'NOTIFICATION_REGISTRATION_IDENTITY_MISSING',
                error: 'تعذر تحديد هوية المدير لتسجيل الإشعارات. سجّل الدخول مرة أخرى.'
            };
        }

        const subscriptionId = String(data.subscriptionId || data.subscription_id || '').trim();
        if (!ONESIGNAL_UUID_REGEX.test(subscriptionId)) {
            return {
                success: false,
                statusCode: 400,
                code: 'NOTIFICATION_SUBSCRIPTION_ID_INVALID',
                error: 'لم يرسل المتصفح معرّف اشتراك OneSignal صالحًا.'
            };
        }

        const externalId = `tasfiya-admin-${userId}`;
        const userAgent = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 500);
        const optedIn = data.optedIn === false || data.opted_in === false ? 0 : 1;

        if (this.dbManager.pool) {
            await this.dbManager.pool.query(
                `
                    INSERT INTO notification_subscriptions (
                        subscription_id, user_id, user_role, external_id,
                        one_signal_app_id, user_agent, opted_in,
                        created_at, updated_at, last_seen_at
                    )
                    VALUES ($1, $2, 'admin', $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (subscription_id) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        user_role = EXCLUDED.user_role,
                        external_id = EXCLUDED.external_id,
                        one_signal_app_id = EXCLUDED.one_signal_app_id,
                        user_agent = EXCLUDED.user_agent,
                        opted_in = EXCLUDED.opted_in,
                        updated_at = CURRENT_TIMESTAMP,
                        last_seen_at = CURRENT_TIMESTAMP
                `,
                [subscriptionId, userId, externalId, config.appId, userAgent, optedIn]
            );
        } else {
            this.dbManager.db.prepare(`
                INSERT INTO notification_subscriptions (
                    subscription_id, user_id, user_role, external_id,
                    one_signal_app_id, user_agent, opted_in,
                    created_at, updated_at, last_seen_at
                )
                VALUES (?, ?, 'admin', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(subscription_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    user_role = excluded.user_role,
                    external_id = excluded.external_id,
                    one_signal_app_id = excluded.one_signal_app_id,
                    user_agent = excluded.user_agent,
                    opted_in = excluded.opted_in,
                    updated_at = CURRENT_TIMESTAMP,
                    last_seen_at = CURRENT_TIMESTAMP
            `).run(subscriptionId, userId, externalId, config.appId, userAgent, optedIn);
        }

        console.log(`✅ [PUSH] Registered browser subscription for admin ${userId}`);
        return {
            success: true,
            userId,
            externalId,
            subscriptionId
        };
    }

    async handleRegisterNotificationSubscription(req, res, authenticatedUser) {
        try {
            const data = await this.readJsonBody(req, {
                maxBytes: DEFAULT_JSON_BODY_LIMIT_BYTES,
                routeLabel: '/api/notifications/register payload'
            });
            const result = await this.registerNotificationSubscription(
                authenticatedUser || req.authUser || this.getAuthenticatedUser(req),
                data,
                req
            );

            this.sendJson(res, result, {
                statusCode: result.success ? 200 : (result.statusCode || 400)
            });
        } catch (error) {
            this.sendJson(
                res,
                { success: false, code: 'NOTIFICATION_REGISTRATION_FAILED', error: error.message },
                { statusCode: error.statusCode || 500 }
            );
        }
    }

    async getNotificationTargetSubscriptionIds() {
        const config = this.getOneSignalConfig();
        if (!ONESIGNAL_UUID_REGEX.test(config.appId)) {
            return [];
        }

        try {
            const rows = this.dbManager.pool
                ? (await this.dbManager.pool.query(
                    `
                        SELECT subscription_id
                        FROM notification_subscriptions
                        WHERE user_role = 'admin'
                          AND COALESCE(opted_in, 1) = 1
                          AND one_signal_app_id = $1
                        ORDER BY last_seen_at DESC
                        LIMIT 200
                    `,
                    [config.appId]
                )).rows
                : this.dbManager.db.prepare(`
                    SELECT subscription_id
                    FROM notification_subscriptions
                    WHERE user_role = 'admin'
                      AND COALESCE(opted_in, 1) = 1
                      AND one_signal_app_id = ?
                    ORDER BY last_seen_at DESC
                    LIMIT 200
                `).all(config.appId);

            const subscriptionIds = this.normalizeOneSignalIds(rows.map((row) => row.subscription_id))
                .filter((id) => ONESIGNAL_UUID_REGEX.test(id));
            console.log(`🔔 [PUSH] Resolved ${subscriptionIds.length} registered browser subscription target(s)`);
            return subscriptionIds;
        } catch (error) {
            console.error(`❌ [PUSH] Unable to resolve registered notification subscriptions: ${error && error.message ? error.message : error}`);
            return [];
        }
    }

    getOneSignalConfig() {
        const appId = String(process.env.ONESIGNAL_APP_ID || '').trim();
        const appApiKey = String(process.env.ONESIGNAL_REST_API_KEY || '').trim();
        const publicUrl = String(process.env.TASFIYA_PUBLIC_URL || '').trim().replace(/\/+$/, '');
        const hasValidAppId = ONESIGNAL_UUID_REGEX.test(appId);
        const hasValidApiKey = appApiKey.length > 20 && !appApiKey.includes('YOUR_REST_API_KEY_HERE');

        return {
            appId,
            appApiKey,
            publicUrl: /^https:\/\//i.test(publicUrl) ? publicUrl : '',
            configured: hasValidAppId && hasValidApiKey
        };
    }

    getOneSignalErrorMessage(result, fallbackMessage) {
        if (!result || typeof result !== 'object') {
            return fallbackMessage;
        }

        const toMessage = (value) => {
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (value && typeof value === 'object') {
                return Object.entries(value)
                    .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`)
                    .join(' | ');
            }
            return '';
        };
        const candidates = [result.errors, result.error, result.message]
            .flatMap((value) => Array.isArray(value) ? value : [value])
            .map(toMessage)
            .filter(Boolean);

        return candidates.length > 0
            ? candidates.join(' | ').slice(0, 500)
            : fallbackMessage;
    }

    handleNotificationStatus(res) {
        const config = this.getOneSignalConfig();
        this.sendJson(res, {
            success: true,
            configured: config.configured,
            provider: 'OneSignal',
            apiEndpoint: 'https://api.onesignal.com/notifications?c=push',
            targeting: 'registered subscription_id first; external_id fallback',
            hasAppId: Boolean(config.appId),
            hasApiKey: Boolean(config.appApiKey),
            hasPublicUrl: Boolean(config.publicUrl),
            message: config.configured
                ? 'إعداد الإرسال موجود. استخدم اختبار الإشعارات للتحقق من وصوله إلى OneSignal.'
                : 'مفتاح OneSignal أو App ID غير مضبوط بشكل صحيح في بيئة الخادم.'
        });
    }

    handlePublicClientConfig(res) {
        const config = this.getOneSignalConfig();
        this.sendJson(res, {
            success: true,
            oneSignalAppId: config.appId
        });
    }

    async handleNotificationTest(req, res, authenticatedUser) {
        // Prefer the identity attached by the authorization layer. A process
        // restart can leave an older session shape in circulation, so recover
        // the numeric admin id from its username rather than trusting any id
        // supplied by the browser.
        const sessionUser = authenticatedUser || req.authUser || this.getAuthenticatedUser(req) || {};
        const data = await this.readJsonBody(req, {
            maxBytes: DEFAULT_JSON_BODY_LIMIT_BYTES,
            routeLabel: '/api/notifications/test payload'
        });
        const userId = await this.resolveAdminNotificationUserId(sessionUser);

        if (!Number.isInteger(userId) || userId <= 0) {
            this.sendJson(res, {
                success: false,
                code: 'NOTIFICATION_TEST_IDENTITY_MISSING',
                error: 'تعذر تحديد هوية المدير لاختبار الإشعارات. سجّل الدخول مرة أخرى ثم أعد المحاولة.'
            }, { statusCode: 401 });
            return;
        }

        const subscriptionId = String(data.subscriptionId || data.subscription_id || '').trim();
        const hasCurrentSubscriptionId = ONESIGNAL_UUID_REGEX.test(subscriptionId);
        if (hasCurrentSubscriptionId) {
            await this.registerNotificationSubscription(
                sessionUser,
                { subscriptionId, optedIn: true },
                req
            );
        }

        // The test targets the exact browser subscription when available. This
        // proves whether the current device can receive push before broader
        // admin fan-out is involved.
        console.log(`🔔 [PUSH] Admin ${userId} requested a notification delivery test`);
        const result = await this.sendOneSignalNotification(
            '🔔 اختبار إشعارات تصفية برو',
            'تم إرسال هذا الاختبار من لوحة الإدارة للتحقق من وصول الإشعارات.',
            { type: 'notification_test', source: 'admin_dashboard' },
            hasCurrentSubscriptionId
                ? { subscriptionIds: [subscriptionId] }
                : { externalIds: [`tasfiya-admin-${userId}`] }
        );

        // Creating a OneSignal message is not the same as proving that the
        // provider has dispatched it.  Ask OneSignal for the message metrics
        // before reporting the diagnostic result to the administrator.
        if (result.success && result.messageId) {
            result.delivery = await this.waitForOneSignalDelivery(result.messageId);
        }

        this.sendJson(res, result, {
            statusCode: result.success ? 200 : (result.code === 'ONESIGNAL_NO_RECIPIENTS' ? 409 : 502)
        });
    }

    async getNotificationTargetExternalIds() {
        try {
            const rows = this.dbManager.pool
                ? (await this.dbManager.pool.query('SELECT id, active FROM admins ORDER BY id')).rows
                : this.dbManager.db.prepare('SELECT id, active FROM admins ORDER BY id').all();

            // Older installations can have NULL activity flags, while Neon
            // migrations may represent the flag as a boolean instead of 0/1.
            // Resolve it in JavaScript so a valid subscribed administrator is
            // never excluded merely by a database-type difference.
            const isActiveAdmin = (value) => {
                if (value === null || value === undefined || value === '') return true;
                if (value === true || value === 1) return true;
                const normalized = String(value).trim().toLowerCase();
                return normalized === '1' || normalized === 'true' || normalized === 'yes';
            };

            const externalIds = [...new Set(
                rows
                    .filter((row) => isActiveAdmin(row && row.active))
                    .map((row) => Number(row && row.id))
                    .filter((id) => Number.isInteger(id) && id > 0)
                    .map((id) => `tasfiya-admin-${id}`)
            )];
            console.log(`🔔 [PUSH] Resolved ${externalIds.length} active administrator target(s)`);
            return externalIds;
        } catch (error) {
            console.error(`❌ [PUSH] Unable to resolve notification recipients: ${error && error.message ? error.message : error}`);
            return [];
        }
    }

    normalizeOneSignalIds(values) {
        const source = Array.isArray(values) ? values : [];
        return [...new Set(source
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )];
    }

    async getOneSignalMessageDelivery(messageId) {
        const config = this.getOneSignalConfig();
        if (!config.configured || !ONESIGNAL_UUID_REGEX.test(String(messageId || '').trim())) {
            return null;
        }

        try {
            const response = await fetch(
                `https://api.onesignal.com/notifications/${encodeURIComponent(messageId)}?app_id=${encodeURIComponent(config.appId)}`,
                {
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Key ${config.appApiKey}`
                    }
                }
            );

            if (!response.ok) {
                return { available: false, statusCode: response.status };
            }

            const payload = await response.json();
            const toNumberOrNull = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            };

            return {
                available: true,
                successful: toNumberOrNull(payload.successful),
                failed: toNumberOrNull(payload.failed),
                errored: toNumberOrNull(payload.errored),
                received: toNumberOrNull(payload.received),
                remaining: toNumberOrNull(payload.remaining),
                completed: Boolean(payload.completed_at),
                platformDeliveryStats: payload.platform_delivery_stats || null
            };
        } catch (error) {
            console.warn(`⚠️ [PUSH] Could not read OneSignal delivery metrics: ${error && error.message ? error.message : error}`);
            return { available: false, error: 'DELIVERY_METRICS_UNAVAILABLE' };
        }
    }

    async waitForOneSignalDelivery(messageId) {
        let delivery = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            delivery = await this.getOneSignalMessageDelivery(messageId);
            if (!delivery || delivery.available === false) {
                return delivery;
            }

            const terminalCount = [delivery.successful, delivery.failed, delivery.errored]
                .filter((value) => Number.isFinite(value))
                .reduce((total, value) => total + value, 0);
            if (delivery.completed || terminalCount > 0) {
                return delivery;
            }

            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }
        return delivery;
    }

    hasConfirmedOneSignalDeliveryFailure(delivery) {
        if (!delivery || delivery.available === false) {
            return false;
        }

        const successful = Number(delivery.successful || 0);
        const failed = Number(delivery.failed || 0);
        const errored = Number(delivery.errored || 0);
        return successful === 0 && (failed > 0 || errored > 0);
    }

    async sendVerifiedReconciliationNotification(title, message, data = {}) {
        // A dashboard test that was confirmed delivered targets the exact
        // OneSignal subscription ID.  Production alerts must use the same
        // proven route whenever the server has registered subscriptions.
        //
        // External IDs are retained only as a fallback for a fresh server with
        // no registered browser yet.  Treating the external-ID result as the
        // primary route caused an accepted OneSignal message to be mistaken for
        // a delivered request alert after the Render -> local-server move: the
        // browser had a real subscription, while the alias association was not
        // guaranteed to be ready at that moment.
        const subscriptionIds = await this.getNotificationTargetSubscriptionIds();
        const directTarget = subscriptionIds.length > 0;
        console.log(
            `🔔 [PUSH] Reconciliation alert target=${directTarget ? 'registered_subscription' : 'external_id_fallback'} count=${directTarget ? subscriptionIds.length : 'admin-aliases'}`
        );

        const result = await this.sendOneSignalNotification(
            title,
            message,
            data,
            directTarget ? { subscriptionIds } : {}
        );

        if (result.success && result.messageId) {
            result.delivery = await this.waitForOneSignalDelivery(result.messageId);
        }

        return {
            ...result,
            target: result.target === 'subscription_id'
                ? 'registered_subscription'
                : result.target,
            targetCount: directTarget ? subscriptionIds.length : (result.targetCount || 0)
        };
    }

    async sendOneSignalNotification(title, message, data = {}, options = {}) {
        const config = this.getOneSignalConfig();
        if (!config.configured) {
            const error = 'OneSignal غير مضبوط: أضف ONESIGNAL_REST_API_KEY الصحيح وأعد تشغيل الخادم.';
            console.error(`❌ [PUSH] ${error}`);
            return { success: false, code: 'ONESIGNAL_NOT_CONFIGURED', error };
        }

        let subscriptionIds = this.normalizeOneSignalIds(options.subscriptionIds)
            .filter((id) => ONESIGNAL_UUID_REGEX.test(id));
        const explicitExternalIds = this.normalizeOneSignalIds(options.externalIds);
        let externalIds = [];

        // A direct subscription ID is used only for a diagnostic test of the
        // current browser.  Normal reconciliation alerts must target the
        // stable OneSignal external ID so every device belonging to the same
        // administrator (web and native app) can receive one notification.
        if (subscriptionIds.length === 0) {
            externalIds = explicitExternalIds.length > 0
                ? explicitExternalIds
                : await this.getNotificationTargetExternalIds();
        }

        if (subscriptionIds.length === 0 && externalIds.length === 0) {
            const error = 'لا يوجد إداريون نشطون أو اشتراكات صالحة لتلقي الإشعار.';
            console.warn(`⚠️ [PUSH] ${error}`);
            return { success: false, code: 'ONESIGNAL_NO_TARGETS', error };
        }

        const notificationPayload = {
            app_id: config.appId,
            target_channel: 'push',
            headings: { en: title, ar: title },
            contents: { en: message, ar: message },
            data,
            priority: 10,
            android_visibility: 1,
            lockscreen_visibility: 1
        };

        if (subscriptionIds.length > 0) {
            // Delivery tests target the exact subscription shown in OneSignal,
            // eliminating ambiguous segment membership from the diagnosis.
            notificationPayload.include_subscription_ids = subscriptionIds;
        } else {
            // Production notifications target authenticated Tasfiya admins.
            // OneSignal.login() creates these stable external IDs per admin.
            notificationPayload.include_aliases = { external_id: externalIds };
        }

        if (config.publicUrl) {
            notificationPayload.web_url = config.publicUrl;
        }

        try {
            const response = await fetch('https://api.onesignal.com/notifications?c=push', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    // OneSignal's current Create Message API requires the "Key" prefix.
                    Authorization: `Key ${config.appApiKey}`
                },
                body: JSON.stringify(notificationPayload)
            });

            const responseText = await response.text();
            let result = null;
            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch (_) {
                result = { message: responseText.slice(0, 500) };
            }

            if (!response.ok) {
                const error = this.getOneSignalErrorMessage(
                    result,
                    `تعذر إرسال الإشعار (OneSignal HTTP ${response.status}).`
                );
                console.error(`❌ [PUSH] OneSignal rejected notification: HTTP ${response.status}; ${error}`);
                return {
                    success: false,
                    code: `ONESIGNAL_HTTP_${response.status}`,
                    error
                };
            }

            if (!result || !result.id) {
                const error = this.getOneSignalErrorMessage(
                    result,
                    'لم يجد OneSignal أي جهاز مشترك صالح لاستقبال الإشعار.'
                );
                console.warn(`⚠️ [PUSH] Notification was not created: ${error}`);
                return { success: false, code: 'ONESIGNAL_NO_RECIPIENTS', error };
            }

            // OneSignal's Create Message API confirms creation with a non-empty
            // id. Some API responses or account views do not include a reliable
            // recipients count immediately, so do not convert a missing count to
            // zero and falsely report failure after OneSignal accepted the push.
            const hasRecipientsCount = Object.prototype.hasOwnProperty.call(result, 'recipients');
            const parsedRecipients = hasRecipientsCount ? Number(result.recipients) : null;
            const recipients = Number.isFinite(parsedRecipients) ? parsedRecipients : null;
            const recipientSummary = recipients === null ? 'unknown' : recipients;

            console.log(`✅ [PUSH] OneSignal accepted message=${result.id} recipients=${recipientSummary}; target=${subscriptionIds.length > 0 ? 'subscription_id' : 'external_id'}`);
            return {
                success: true,
                messageId: result.id,
                recipients,
                recipientCountKnown: recipients !== null,
                target: subscriptionIds.length > 0 ? 'subscription_id' : 'external_id',
                targetCount: subscriptionIds.length > 0 ? subscriptionIds.length : externalIds.length
            };
        } catch (error) {
            const messageText = error && error.message ? error.message : 'تعذر الاتصال بـ OneSignal.';
            console.error(`❌ [PUSH] Network error: ${messageText}`);
            return { success: false, code: 'ONESIGNAL_NETWORK_ERROR', error: messageText };
        }
    }

    sendJson(res, data, options = {}) {
        console.log('📤 [sendJson] Sending:', Object.keys(data), res.headersSent ? '⚠️ Headers already sent!' : '✅ OK');
        if (!res.headersSent) {
            const statusCode = options.statusCode || 200;
            const req = options.req || res._tasfiyaRequest || null;
            const payload = JSON.stringify(data);
            const payloadBuffer = Buffer.from(payload, 'utf8');
            const headers = {
                'Content-Type': 'application/json; charset=utf-8',
                ...(options.headers || {})
            };

            if (options.cacheable && statusCode === 200) {
                const etag = options.etag || createPayloadEtag(payload);
                headers.ETag = etag;
                headers['Cache-Control'] = options.cacheControl || 'private, max-age=0, must-revalidate';
                headers.Vary = 'Accept-Encoding';

                if (requestMatchesEtag(req, etag)) {
                    res.writeHead(304, headers);
                    res.end();
                    return;
                }
            } else {
                headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                headers.Pragma = 'no-cache';
                headers.Expires = '0';
            }

            let responseBody = payloadBuffer;
            if (
                statusCode === 200
                && payloadBuffer.length >= JSON_COMPRESSION_MIN_BYTES
                && requestAcceptsGzip(req)
                && !headers['Content-Encoding']
            ) {
                responseBody = zlib.gzipSync(payloadBuffer);
                headers['Content-Encoding'] = 'gzip';
                headers.Vary = headers.Vary
                    ? (headers.Vary.includes('Accept-Encoding') ? headers.Vary : `${headers.Vary}, Accept-Encoding`)
                    : 'Accept-Encoding';
            }

            headers['Content-Length'] = responseBody.length;
            res.writeHead(statusCode, headers);
            res.end(responseBody);
        } else {
            console.error('❌ [sendJson] Cannot send - headers already sent!');
        }
    }




    async handleCreateReconciliationRequest(req, res) {
        try {
            const data = await this.readJsonBody(req, {
                maxBytes: LARGE_JSON_BODY_LIMIT_BYTES,
                routeLabel: '/api/reconciliation-requests payload'
            });
                const authUser = req && req.authUser ? req.authUser : null;

                if (authUser && authUser.role === 'cashier') {
                    data.cashier_id = authUser.id;
                }

                console.log('📝 [API] Received new reconciliation request:', data);

                // Basic Validation
                if (!data.cashier_id) {
                    console.error('❌ [API] Missing cashier_id');
                    return this.sendJson(res, { success: false, error: 'Missing cashier_id' });
                }

                // Determine "System Sales" vs "Actual Found"
                const systemSales = parseFloat(data.system_sales) || 0;
                const totalCash = parseFloat(data.total_cash) || 0;
                const totalBank = parseFloat(data.total_bank) || 0;

                // Prepare details JSON for all other lists, then attach stable customer identity.
                const rawDetails = {
                    cash_breakdown: data.cash_breakdown || [],
                    bank_receipts: data.bank_receipts || [],
                    postpaid_items: data.postpaid_items || [],
                    customer_receipts: data.customer_receipts || [],
                    return_items: data.return_items || [],
                    supplier_items: data.supplier_items || []
                };
                const details = await this.enrichCustomerRequestDetails(rawDetails, data.cashier_id);

                const detailsJson = JSON.stringify(details);
                const notes = data.notes || '';

                // Insert into DB
                // Check Server Mode (Postgres)
                const pool = this.dbManager.pool;

                let insertedId;

                if (pool) {
                    // PostgreSQL
                    const sql = `
                        INSERT INTO reconciliation_requests (
                            cashier_id, request_date, system_sales, 
                            total_cash, total_bank, details_json, 
                            notes, status, created_at
                        ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
                        RETURNING id
                    `;
                    const result = await pool.query(sql, [
                        data.cashier_id, systemSales, totalCash, totalBank, detailsJson, notes
                    ]);
                    insertedId = result.rows[0].id;
                } else {
                    // SQLite
                    const stmt = this.dbManager.db.prepare(`
                        INSERT INTO reconciliation_requests (
                            cashier_id, request_date, system_sales, 
                            total_cash, total_bank, details_json, 
                            notes, status, created_at
                        ) VALUES (?, CURRENT_DATE, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                    `);
                    const info = stmt.run(
                        data.cashier_id, systemSales, totalCash, totalBank, detailsJson, notes
                    );
                    insertedId = info.lastInsertRowid;
                }

            console.log('✅ [API] Reconciliation Request Saved. ID:', insertedId);

                // --- TRIGGER NOTIFICATION (Notify Admin using OneSignal) ---
                // Saving the reconciliation and notifying an administrator are
                // intentionally separate operations.  The response includes a
                // safe diagnostic result so the sender never confuses a saved
                // request with a confirmed notification.
                let notification = {
                    success: false,
                    code: 'NOTIFICATION_NOT_ATTEMPTED'
                };
                try {
                    let cashierName = `كاشير ${data.cashier_id}`;

                    // Fetch Cashier Name
                    try {
                        if (pool) {
                            const nameRes = await pool.query('SELECT name FROM cashiers WHERE id = $1', [data.cashier_id]);
                            if (nameRes.rows.length > 0) cashierName = nameRes.rows[0].name;
                        } else {
                            const nameRes = this.dbManager.db.prepare('SELECT name FROM cashiers WHERE id = ?').get(data.cashier_id);
                            if (nameRes) cashierName = nameRes.name;
                        }
                    } catch (dbErr) {
                        console.warn('⚠️ Could not fetch cashier name for notification:', dbErr);
                    }

                    notification = await this.sendVerifiedReconciliationNotification(
                        'طلب تصفية جديد 🔔',
                        `قام ${cashierName} بإرسال طلب تصفية جديد. اضغط للمراجعة.`,
                        { type: 'reconciliation_request', request_id: insertedId }
                    );
                    if (!notification.success) {
                        console.warn(`⚠️ [PUSH] Request ${insertedId} was saved but notification was not queued: ${notification.code || 'UNKNOWN_ERROR'}`);
                    }
                } catch (e) {
                    notification = {
                        success: false,
                        code: 'NOTIFICATION_UNEXPECTED_ERROR',
                        error: e && e.message ? e.message : 'تعذر إنشاء الإشعار.'
                    };
                    console.error('Notification Error', e);
                }

                await this.recordNotificationDeliveryEvent({
                    requestId: insertedId,
                    eventType: 'reconciliation_request',
                    targetType: notification.target,
                    targetCount: notification.targetCount,
                    messageId: notification.messageId,
                    success: notification.success,
                    delivery: notification.delivery,
                    code: notification.code,
                    error: notification.error
                });

            this.sendJson(res, {
                success: true,
                id: insertedId,
                notification: {
                    success: Boolean(notification.success),
                    code: notification.code || null,
                    error: notification.success ? null : (notification.error || null),
                    messageId: notification.messageId || null,
                    target: notification.target || null,
                    delivery: notification.delivery || null
                }
            });
        } catch (error) {
            console.error('❌ [API] Error creating reconciliation request:', error);
            this.sendJson(
                res,
                { success: false, error: error.message },
                { statusCode: error.statusCode || 500 }
            );
        }
    }

    async handleGetReconciliationRequests(res, query) {
        try {
            console.log('📋 [API] Getting reconciliation requests, query:', query);

            let statusFilter = 'pending';
            if (query && query.status) statusFilter = query.status;
            const includeDeleted = Boolean(query && isTruthyQueryValue(query.include_deleted));
            const includeDetailsMode = query && query.include_details === 'raw'
                ? 'raw'
                : (query && isTruthyQueryValue(query.include_details) ? 'parsed' : 'none');
            const selectColumns = this.getReconciliationRequestSelectColumns(includeDetailsMode);
            const updatedAfter = query && query.updated_after
                ? String(query.updated_after).trim()
                : '';
            const buildPostgresFilters = () => {
                const params = [];
                const clauses = [];

                if (statusFilter !== 'all') {
                    params.push(statusFilter);
                    clauses.push(`r.status = $${params.length}`);
                } else if (!includeDeleted) {
                    clauses.push("COALESCE(r.status, 'pending') <> 'deleted'");
                }

                if (updatedAfter) {
                    params.push(updatedAfter);
                    clauses.push(`COALESCE(r.updated_at, r.created_at) > $${params.length}`);
                }

                return {
                    params,
                    whereSql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
                };
            };
            const buildSqliteFilters = () => {
                const params = [];
                const clauses = [];

                if (statusFilter !== 'all') {
                    params.push(statusFilter);
                    clauses.push('r.status = ?');
                } else if (!includeDeleted) {
                    clauses.push("COALESCE(r.status, 'pending') <> 'deleted'");
                }

                if (updatedAfter) {
                    params.push(updatedAfter);
                    clauses.push('datetime(COALESCE(r.updated_at, r.created_at)) > datetime(?)');
                }

                return {
                    params,
                    whereSql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : ''
                };
            };

            const pool = this.dbManager.pool;
            let requests = [];

            // Try to fetch with branch info from cashiers table (no JOIN needed)
            try {
                if (pool) {
                    // Postgres Logic
                    let sql = `
                        SELECT ${selectColumns}, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                    `;
                    const { whereSql, params } = buildPostgresFilters();
                    sql += whereSql;
                    sql += ' ORDER BY COALESCE(r.updated_at, r.created_at) DESC, r.created_at DESC';

                    const result = await pool.query(sql, params);
                    requests = result.rows;
                } else {
                    // SQLite Logic
                    let sql = `
                        SELECT ${selectColumns}, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                    `;
                    const { whereSql, params } = buildSqliteFilters();
                    sql += whereSql;
                    sql += ' ORDER BY COALESCE(r.updated_at, r.created_at) DESC, r.created_at DESC';

                    requests = this.dbManager.db.prepare(sql).all(params);
                }
            } catch (queryError) {
                console.warn('⚠️ [API] Could not fetch cashier info, falling back to basic query:', queryError.message);

                // Fallback: Fetch without cashier info
                if (pool) {
                    let sql = `SELECT ${selectColumns} FROM reconciliation_requests r`;
                    const { whereSql, params } = buildPostgresFilters();
                    sql += whereSql;
                    sql += ' ORDER BY COALESCE(r.updated_at, r.created_at) DESC, r.created_at DESC';

                    const result = await pool.query(sql, params);
                    requests = result.rows;
                } else {
                    let sql = `SELECT ${selectColumns} FROM reconciliation_requests r`;
                    const { whereSql, params } = buildSqliteFilters();
                    sql += whereSql;
                    sql += ' ORDER BY COALESCE(r.updated_at, r.created_at) DESC, r.created_at DESC';

                    requests = this.dbManager.db.prepare(sql).all(params);
                }
            }

            console.log(`📋 [API] Found ${requests.length} requests`);

            const enrichedRequests = requests.map((requestRow) =>
                this.normalizeReconciliationRequestRow(requestRow, includeDetailsMode)
            );

            console.log('✅ [API] Sending enriched requests');
            this.sendJson(res, { success: true, data: enrichedRequests });
        } catch (error) {
            console.error('❌ [API] Error fetching requests:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetReconciliationRequestById(res, id, query = {}) {
        try {
            const includeDetailsMode = query && query.include_details === 'raw' ? 'raw' : 'parsed';
            const selectColumns = this.getReconciliationRequestSelectColumns(includeDetailsMode);
            const pool = this.dbManager.pool;
            let requestRow;

            try {
                if (pool) {
                    const result = await pool.query(`
                        SELECT ${selectColumns}, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                        WHERE r.id = $1
                        LIMIT 1
                    `, [id]);
                    requestRow = result.rows?.[0] || null;
                } else {
                    requestRow = this.dbManager.db.prepare(`
                        SELECT ${selectColumns}, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                        WHERE r.id = ?
                        LIMIT 1
                    `).get(id);
                }
            } catch (queryError) {
                console.warn('⚠️ [API] Could not fetch reconciliation request details with cashier info:', queryError.message);
                if (pool) {
                    const result = await pool.query(`
                        SELECT ${selectColumns}
                        FROM reconciliation_requests r
                        WHERE r.id = $1
                        LIMIT 1
                    `, [id]);
                    requestRow = result.rows?.[0] || null;
                } else {
                    requestRow = this.dbManager.db.prepare(`
                        SELECT ${selectColumns}
                        FROM reconciliation_requests r
                        WHERE r.id = ?
                        LIMIT 1
                    `).get(id);
                }
            }

            if (!requestRow) {
                this.sendJson(res, { success: false, error: 'الطلب غير موجود' }, { statusCode: 404 });
                return;
            }

            this.sendJson(res, {
                success: true,
                data: this.normalizeReconciliationRequestRow(requestRow, includeDetailsMode)
            });
        } catch (error) {
            console.error('❌ [API] Error fetching reconciliation request by id:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    // Mark reconciliation request as completed (used by Desktop App)
    async handleCompleteReconciliationRequest(res, id) {
        try {
            console.log(`📝 [API] Completing reconciliation request: ${id}`);

            const stmt = this.dbManager.db.prepare("UPDATE reconciliation_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            const result = await stmt.run(id);

            if (result.changes > 0) {
                console.log(`✅ [API] Request ${id} updated to completed`);
                this.sendJson(res, { success: true, message: 'Request marked as completed' });
            } else {
                console.warn(`⚠️ [API] Request ${id} not found to update`);
                this.sendJson(res, { success: false, error: 'Request not found' });
            }
        } catch (error) {
            console.error('❌ [API] Error completing request:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleDebugDB(res) {
        try {
            const db = this.dbManager.db;

            // 1. Get total count
            const count = db.prepare('SELECT COUNT(*) as count FROM reconciliations').get().count;

            // 2. Get Max Reconciliation Number
            const maxNum = db.prepare('SELECT MAX(reconciliation_number) as max FROM reconciliations').get().max;

            // 3. Find duplicates
            const duplicates = db.prepare(`
                SELECT reconciliation_number, COUNT(*) as c 
                FROM reconciliations 
                WHERE reconciliation_number IS NOT NULL 
                GROUP BY reconciliation_number 
                HAVING c > 1
            `).all();

            // 4. Find NULL numbers
            const nulls = db.prepare(`
                SELECT id, status, created_at FROM reconciliations WHERE reconciliation_number IS NULL
            `).all();

            // 5. Get gaps (optional, simple check)
            const gapAnalysis = {
                expected_count: maxNum,
                actual_count: count,
                gap_size: maxNum - count
            };

            // 6. Check Child Tables
            const cashCount = db.prepare('SELECT COUNT(*) as count FROM cash_receipts').get().count;

            const report = {
                success: true,
                analysis: {
                    total_records: count,
                    total_cash_receipts: cashCount,
                    max_reconciliation_number: maxNum,
                    duplicates: duplicates,
                    records_without_number: nulls,
                    gap_analysis: gapAnalysis
                }
            };

            this.sendJson(res, report);

        } catch (error) {
            this.sendJson(res, { success: false, error: error.message, stack: error.stack });
        }
    }
}

module.exports = LocalWebServer;
