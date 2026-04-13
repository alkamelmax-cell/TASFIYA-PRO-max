// @ts-nocheck

const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');
const { buildRemoteServiceUrl } = require('./remote-service-url');
const { hashSecret, hashSecretIfNeeded, verifySecret } = require('./security/auth-service');
const { WebSessionStore } = require('./security/web-session-store');
const { filterVisibleBranches } = require('./app/branch-visibility');
const { buildCashboxVoucherSyncKey } = require('./app/cashbox-voucher-utils');

const SESSION_COOKIE_NAME = 'tasfiya_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

class LocalWebServer {
    constructor(dbManager, port = 4000, options = {}) {
        const normalizedPort = Number(port);

        this.dbManager = dbManager;
        this.port = Number.isFinite(normalizedPort) ? normalizedPort : 4000;
        this.host = options.host || process.env.HOST || '0.0.0.0';
        this.hasExplicitPort = options.explicitPort !== undefined
            ? Boolean(options.explicitPort)
            : Boolean(process.env.PORT);
        this.server = null;
        this.sessionStore = new WebSessionStore({ ttlMs: SESSION_TTL_MS });
        this.databaseMode = this.dbManager && this.dbManager.pool ? 'postgres' : 'sqlite';
        this.databaseReady = options.databaseReady !== undefined
            ? Boolean(options.databaseReady)
            : Boolean(this.dbManager && this.dbManager.db && typeof this.dbManager.db.prepare === 'function' && !this.dbManager.pool);
        this.databaseStatus = this.databaseReady ? 'ready' : 'initializing';
        this.databaseReadyAt = this.databaseReady ? new Date().toISOString() : null;
        this.lastDatabaseError = null;
        this.startedAt = null;
        this.indexesReady = false;
        this.ensureIndexesInFlight = null;
    }

    setDatabaseReady(metadata = {}) {
        this.databaseReady = true;
        this.databaseStatus = metadata.status || 'ready';
        this.databaseReadyAt = new Date().toISOString();
        this.lastDatabaseError = null;

        if (this.server && this.server.listening) {
            void this.ensureIndexes();
        }
    }

    setDatabaseUnavailable(error = null, status = 'unavailable') {
        this.databaseReady = false;
        this.databaseStatus = status;
        this.databaseReadyAt = null;
        this.indexesReady = false;
        this.ensureIndexesInFlight = null;
        this.lastDatabaseError = error
            ? {
                message: error.message || String(error),
                name: error.name || 'Error',
                at: new Date().toISOString()
            }
            : null;
    }

    getHealthPayload() {
        return {
            success: true,
            status: 'ok',
            startedAt: this.startedAt,
            service: 'tasfiya-web',
            database: {
                mode: this.databaseMode,
                ready: this.databaseReady,
                status: this.databaseStatus,
                readyAt: this.databaseReadyAt,
                lastError: this.lastDatabaseError
            }
        };
    }

    isHealthRoute(pathname) {
        return pathname === '/health'
            || pathname === '/healthz'
            || pathname === '/ready'
            || pathname === '/readyz';
    }

    isStaticAssetPath(pathname) {
        return pathname.endsWith('.js')
            || pathname.endsWith('.json')
            || pathname.startsWith('/css/')
            || pathname.startsWith('/js/')
            || pathname.startsWith('/assets/');
    }

    isDatabaseOptionalApi(pathname, method) {
        return (pathname === '/api/session' && method === 'GET')
            || (pathname === '/api/logout' && method === 'POST');
    }

    shouldBlockUntilDatabaseReady(pathname, method) {
        if (!pathname.startsWith('/api/')) {
            return false;
        }

        return !this.isDatabaseOptionalApi(pathname, method);
    }

    handleHealthRequest(res, pathname) {
        const readinessRoute = pathname === '/ready' || pathname === '/readyz';
        const payload = this.getHealthPayload();
        const statusCode = readinessRoute && !this.databaseReady ? 503 : 200;
        this.sendJson(res, payload, { statusCode });
    }

    sendDatabaseUnavailable(res) {
        this.sendJson(
            res,
            {
                success: false,
                code: 'SERVICE_INITIALIZING',
                error: 'الخدمة قيد التهيئة، يرجى المحاولة بعد قليل',
                database: this.getHealthPayload().database
            },
            {
                statusCode: 503,
                headers: {
                    'Retry-After': '5'
                }
            }
        );
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
        if (this.indexesReady) {
            return true;
        }

        if (this.ensureIndexesInFlight) {
            return this.ensureIndexesInFlight;
        }

        this.ensureIndexesInFlight = (async () => {
            try {
                console.log('🚀 [PERF] Checking database indexes...');
                const pool = this.dbManager && this.dbManager.pool;
                const hasPrepare = Boolean(this.dbManager && this.dbManager.db && typeof this.dbManager.db.prepare === 'function');

                if (!pool && !hasPrepare) {
                    console.log('⏳ [PERF] Skipping index verification until database is available');
                    return false;
                }

                const indexes = [
                    // Reconciliations
                    "CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON reconciliations(reconciliation_date)",
                    "CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON reconciliations(status)",
                    "CREATE INDEX IF NOT EXISTS idx_reconciliations_cashier ON reconciliations(cashier_id)",
                    "CREATE INDEX IF NOT EXISTS idx_reconciliations_origin_request_id ON reconciliations(origin_request_id)",

                    // Sales & Receipts (CRITICAL for Customer Ledger)
                    "CREATE INDEX IF NOT EXISTS idx_postpaid_customer ON postpaid_sales(customer_name)",
                    "CREATE INDEX IF NOT EXISTS idx_postpaid_rec_id ON postpaid_sales(reconciliation_id)",
                    "CREATE INDEX IF NOT EXISTS idx_receipts_customer ON customer_receipts(customer_name)",
                    "CREATE INDEX IF NOT EXISTS idx_receipts_rec_id ON customer_receipts(reconciliation_id)",

                    // Requests
                    "CREATE INDEX IF NOT EXISTS idx_reconciliation_requests_status_created ON reconciliation_requests(status, created_at DESC)",

                    // Manual Transactions
                    "CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer ON manual_postpaid_sales(customer_name)",
                    "CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer ON manual_customer_receipts(customer_name)"
                ];

                if (pool) {
                    for (const sql of indexes) {
                        await pool.query(sql);
                    }
                    console.log('✅ [PERF] Indexes verified on PostgreSQL');
                } else {
                    for (const sql of indexes) {
                        this.dbManager.db.prepare(sql).run();
                    }
                    console.log('✅ [PERF] Indexes verified on SQLite');
                }

                this.indexesReady = true;
                return true;
            } catch (error) {
                console.error('⚠️ [PERF] Failed to create indexes:', error.message);
                return false;
            } finally {
                this.ensureIndexesInFlight = null;
            }
        })();

        return this.ensureIndexesInFlight;
    }

    async start() {
        if (this.server && this.server.listening) {
            return this;
        }

        this.server = http.createServer(async (req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const parsedUrl = parse(req.url, true);
            const pathname = parsedUrl.pathname;

            try {
                console.log(`📨 [REQUEST] ${req.method} ${pathname}`);
                if (this.isHealthRoute(pathname)) {
                    this.handleHealthRequest(res, pathname);
                    return;
                }

                if (this.isStaticAssetPath(pathname)) {
                    this.serveStatic(res, pathname);
                    return;
                }

                if (this.shouldBlockUntilDatabaseReady(pathname, req.method) && !this.databaseReady) {
                    this.sendDatabaseUnavailable(res);
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
                    await this.handleGetLookups(res, parsedUrl.query);
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


                // DEBUG ROUTE: Test Notification directly
                else if (pathname === '/api/test-notification') {
                    console.log('🔔 Manual test notification requested');
                    const result = await this.sendOneSignalNotification(
                        '🔔 اختبار الإشعارات',
                        'إذا وصلت هذه الرسالة، فإن OneSignal يعمل بنجاح!',
                        { type: 'test' }
                    );
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
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

        await new Promise((resolve, reject) => {
            const tryListen = () => {
                const onError = (error) => {
                    this.server.off('listening', onListening);

                    if (error.code === 'EADDRINUSE' && !this.hasExplicitPort) {
                        console.log(`⚠️ [WEB APP] Port ${this.port} is in use, trying ${this.port + 1}...`);
                        this.port += 1;
                        setImmediate(tryListen);
                        return;
                    }

                    console.error('❌ [WEB APP] Server error:', error);
                    reject(error);
                };

                const onListening = () => {
                    this.server.off('error', onError);

                    const address = this.server.address();
                    if (address && typeof address === 'object' && typeof address.port === 'number') {
                        this.port = address.port;
                    }

                    this.startedAt = new Date().toISOString();
                    console.log(`🌐 [WEB APP] Server running at http://${this.host}:${this.port}`);

                    if (this.databaseReady) {
                        void this.ensureIndexes();
                    }

                    resolve(this);
                };

                this.server.once('error', onError);
                this.server.once('listening', onListening);
                this.server.listen(this.port, this.host);
            };

            tryListen();
        });

        return this;
    }

    stop() {
        if (!this.server) {
            return Promise.resolve();
        }

        const activeServer = this.server;
        this.server = null;

        return new Promise((resolve) => {
            activeServer.close(() => {
                console.log('🌐 [WEB APP] Server stopped');
                resolve();
            });
        });
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
            let whereClause = "WHERE 1=1";

            // Build WHERE clause reused for both queries
            if (query.dateFrom) { whereClause += ` AND r.reconciliation_date >= ?`; params.push(query.dateFrom); }
            if (query.dateTo) { whereClause += ` AND r.reconciliation_date <= ?`; params.push(query.dateTo); }
            if (query.cashierId && query.cashierId !== 'all') { whereClause += ` AND r.cashier_id = ?`; params.push(query.cashierId); }
            if (query.branchId && query.branchId !== 'all') { whereClause += ` AND c.branch_id = ?`; params.push(query.branchId); }
            if (query.status && query.status !== 'all') { whereClause += ` AND r.status = ?`; params.push(query.status); }

            // Strategy: Fetch RAW data and sum in JS to handle any data type weirdness (String vs Number)

            // 1. Get Main Totals (Fetch raw columns only)
            // IMPORTANT: Use same JOINs as handleGetReconciliations for identical counts
            const sqlMain = `
                SELECT 
                    r.total_receipts,
                    r.system_sales
                FROM reconciliations r
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                LEFT JOIN accountants a ON r.accountant_id = a.id
                ${whereClause}
            `;

            console.log('📊 [STATS] Calculating via JS Loop...');
            const mainRows = await this.dbManager.db.prepare(sqlMain).all(params);

            let count = 0;
            let totalReceipts = 0;
            let totalSales = 0;

            // Safe Summation Function
            const safeParse = (val) => {
                if (val === null || val === undefined) return 0;
                if (typeof val === 'number') return val;
                // Clean string: remove commas, allow dots
                const clean = String(val).replace(/,/g, '').trim();
                const num = parseFloat(clean);
                return isNaN(num) ? 0 : num;
            };

            mainRows.forEach(row => {
                count++;
                totalReceipts += safeParse(row.total_receipts);
                totalSales += safeParse(row.system_sales);
            });

            console.log(`📊 [STATS] JS Result -> Count: ${count}, Receipts: ${totalReceipts}, Sales: ${totalSales}`);

            // 2. Get Cash Totals (Fetch raw total_amount)
            const sqlCash = `
                SELECT 
                    cr.total_amount
                FROM cash_receipts cr
                JOIN reconciliations r ON cr.reconciliation_id = r.id
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                LEFT JOIN accountants a ON r.accountant_id = a.id
                ${whereClause}
            `;

            const cashRows = await this.dbManager.db.prepare(sqlCash).all(params);

            console.log(`📊 [STATS] Cash Rows Found: ${cashRows.length}`);

            let totalCash = 0;
            cashRows.forEach(row => {
                totalCash += safeParse(row.total_amount);
            });
            console.log(`📊 [STATS] Total Cash Calculated: ${totalCash}`);

            console.log(`📊 [STATS] JS Cash Result -> Rows: ${cashRows.length}, Total: ${totalCash}`);

            const result = {
                count: count,
                totalReceipts: totalReceipts,
                totalSales: totalSales,
                totalCash: totalCash
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

                let dateFilterSales = '';
                let dateFilterReceipts = '';
                const paramsSales = [customerName];
                const paramsReceipts = [customerName];
                let pNextSales = 2;
                let pNextReceipts = 2;

                if (dateFrom && dateFrom.trim() !== '') {
                    dateFilterSales += ` AND ps.created_at >= $${pNextSales++}`;
                    dateFilterReceipts += ` AND cr.created_at >= $${pNextReceipts++}`;
                    paramsSales.push(dateFrom);
                    paramsReceipts.push(dateFrom);
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
                    ...salesResult.rows.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...manualSalesResult.rows.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...receiptsResult.rows.map(r => ({ ...r, debit: 0, credit: r.amount })),
                    ...manualReceiptsResult.rows.map(r => ({ ...r, debit: 0, credit: r.amount }))
                ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                this.sendJson(res, { success: true, data: ledger });

            } else {
                // ============================================
                // SQLITE MODE (Local / Offline)
                // ============================================
                console.log('[Customer Ledger] Using SQLite connection (Local Data)');

                let dateFilterSales = '';
                let dateFilterReceipts = '';
                const paramsSales = [customerName];
                const paramsReceipts = [customerName];

                if (dateFrom && dateFrom.trim() !== '') {
                    dateFilterSales += ' AND ps.created_at >= ?';
                    dateFilterReceipts += ' AND cr.created_at >= ?';
                    paramsSales.push(dateFrom);
                    paramsReceipts.push(dateFrom);
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
                    ...sales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...manualSales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                    ...receipts.map(r => ({ ...r, debit: 0, credit: r.amount })),
                    ...manualReceipts.map(r => ({ ...r, debit: 0, credit: r.amount }))
                ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

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

    async handleGetLookups(res, query = {}) {
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

            const includeExperimentalBranches = String(
                query?.includeTestBranches
                ?? query?.includeExperimentalBranches
                ?? ''
            ).trim().toLowerCase();
            const shouldIncludeExperimentalBranches = ['1', 'true', 'yes', 'on'].includes(includeExperimentalBranches);

            const rawBranches = await this.dbManager.db.prepare('SELECT id, branch_name as name FROM branches WHERE is_active = 1').all();
            const branches = shouldIncludeExperimentalBranches ? rawBranches : filterVisibleBranches(rawBranches);
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

                const details = JSON.parse(request.details_json || '{}');

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

                    let recInfo;
                    try {
                        const insertRec = tx.prepare(`
                            INSERT INTO reconciliations
                            (reconciliation_number, cashier_id, accountant_id, reconciliation_date, system_sales, total_receipts, surplus_deficit, status, notes, origin_request_id, created_at)
                            VALUES(?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP)
                        `);

                        recInfo = await insertRec.run(
                            newRecNum, cashierId, accountantId, date, systemSales, totalReceiptsLog, surplus, (request.notes || ''), request.id
                        );
                    } catch (insertError) {
                        if (String(insertError.message || '').includes('origin_request_id')) {
                            console.warn('⚠️ [APPROVAL] origin_request_id غير متاح، سيتم اعتماد الطلب بدونه مؤقتاً');
                            const fallbackInsertRec = tx.prepare(`
                                INSERT INTO reconciliations
                                (reconciliation_number, cashier_id, accountant_id, reconciliation_date, system_sales, total_receipts, surplus_deficit, status, notes, created_at)
                                VALUES(?, ?, ?, ?, ?, ?, ?, 'completed', ?, CURRENT_TIMESTAMP)
                            `);

                            recInfo = await fallbackInsertRec.run(
                                newRecNum, cashierId, accountantId, date, systemSales, totalReceiptsLog, surplus, (request.notes || '')
                            );
                        } else {
                            throw insertError;
                        }
                    }
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
                    const insertPostpaid = tx.prepare(`INSERT INTO postpaid_sales(reconciliation_id, customer_name, amount, notes) VALUES(?, ?, ?, ?)`);
                    for (const item of postpaidSales) {
                        await insertPostpaid.run(recId, item.customer_name, safeFloat(item.amount), item.notes || '');
                    }

                    // Customer Receipts
                    const insertCustReceipt = tx.prepare(`INSERT INTO customer_receipts(reconciliation_id, customer_name, amount, payment_type, notes) VALUES(?, ?, ?, ?, ?)`);
                    for (const item of customerReceipts) {
                        await insertCustReceipt.run(recId, item.customer_name, safeFloat(item.amount), item.payment_type || 'cash', item.notes || '');
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
                // Postgres Mode
                await pool.query('DELETE FROM reconciliation_requests WHERE id = $1', [id]);
            } else {
                // SQLite Mode
                await this.dbManager.db.prepare("DELETE FROM reconciliation_requests WHERE id = ?").run(id);
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
                    const remoteUrl = buildRemoteServiceUrl(`/api/reconciliation-requests/${id}`);
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
                await pool.query('DELETE FROM reconciliation_requests');
            } else {
                this.dbManager.db.prepare('DELETE FROM reconciliation_requests').run();
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

            this.sendJson(res, { success: true, atms });
        } catch (error) {
            console.error('Error fetching ATMs:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetCustomerList(req, res, queryParams = {}) {
        try {
            console.log('🔍 [Customers API] Params:', queryParams);
            let customers = [];
            const authUser = req && req.authUser ? req.authUser : null;
            const effectiveCashierId = authUser && authUser.role === 'cashier'
                ? authUser.id
                : (queryParams && queryParams.cashierId ? queryParams.cashierId : null);

            // Check if we should filter by cashier's branch
            if (effectiveCashierId) {
                const cashier = await this.dbManager.db.prepare('SELECT branch_id FROM cashiers WHERE id = ?').get(effectiveCashierId);

                if (cashier && cashier.branch_id) {
                    const branchId = cashier.branch_id;

                    // Get customers who have transactions in this branch
                    const query = `
                        SELECT DISTINCT customer_name
            FROM(
                SELECT ps.customer_name, c.branch_id
                            FROM postpaid_sales ps
                            LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
                            LEFT JOIN cashiers c ON r.cashier_id = c.id
                            WHERE ps.customer_name IS NOT NULL
                            
                            UNION
                            
                            SELECT cr.customer_name, c.branch_id
                            FROM customer_receipts cr
                            LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
                            LEFT JOIN cashiers c ON r.cashier_id = c.id
                            WHERE cr.customer_name IS NOT NULL
            )
                        WHERE branch_id = ?
                ORDER BY customer_name
                    `;

                    const rows = await this.dbManager.db.prepare(query).all(branchId);
                    customers = rows.map(r => r.customer_name).filter(n => n && n.trim().length > 0);
                }
            }

            // If no filter applied or no results, return all customers
            if (customers.length === 0) {
                const query = `
                    SELECT DISTINCT customer_name FROM postpaid_sales WHERE customer_name IS NOT NULL
            UNION 
                    SELECT DISTINCT customer_name FROM customer_receipts WHERE customer_name IS NOT NULL
                    ORDER BY customer_name
                `;
                const rows = await this.dbManager.db.prepare(query).all();
                customers = rows.map(r => r.customer_name).filter(n => n && n.trim().length > 0);
            }


            console.log(`✅[Customers API] Returning ${customers.length} customers`);
            console.log('🚀 [Customers API] About to call sendJson...');
            this.sendJson(res, { success: true, customers });
        } catch (error) {
            console.error('Error fetching customers:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleSyncUsers(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                console.log('🔄 [SYNC] Received sync data:', Object.keys(data));

                // **ROOT FIX**: Use pool.query() directly for PostgreSQL
                const pool = this.dbManager.pool || this.dbManager.db.pool;
                const syncFailures = [];

                if (!pool) {
                    throw new Error('Database pool not available');
                }

                const ensureCashboxSyncSchema = async () => {
                    const statements = [
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
                            sync_key TEXT,
                            is_auto_generated INTEGER DEFAULT 0
                        )`,
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
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_voucher_action ON cashbox_voucher_audit_log(voucher_id, action_at DESC)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_branch_action ON cashbox_voucher_audit_log(branch_id, action_at DESC)',
                        'CREATE INDEX IF NOT EXISTS idx_cashbox_audit_log_action_type ON cashbox_voucher_audit_log(action_type, action_at DESC)',
                        'ALTER TABLE cashbox_vouchers ADD COLUMN IF NOT EXISTS sync_key TEXT',
                        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence_unique ON cashbox_vouchers(voucher_type, voucher_sequence_number)',
                        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique ON cashbox_vouchers(source_reconciliation_id, source_entry_key)',
                        'DROP INDEX IF EXISTS idx_cashbox_vouchers_sync_key_unique',
                        `CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique
                         ON cashbox_vouchers(sync_key)`
                    ];

                    for (const statement of statements) {
                        await pool.query(statement);
                    }
                };

                const hasCashboxPayload = Boolean(
                    data.branch_cashboxes
                    || data.cashbox_vouchers
                    || data.cashbox_voucher_audit_log
                    || data.active_branch_cashboxes_branch_ids
                    || data.active_branch_cashboxes_ids
                    || data.active_cashbox_voucher_sync_keys
                    || data.active_cashbox_vouchers_ids
                    || data.active_cashbox_voucher_audit_log_ids
                );

                if (hasCashboxPayload) {
                    await ensureCashboxSyncSchema();
                }

                // Helper to perform safe cleanup based on Full ID Lists
                const normalizeIdList = (list) => (Array.isArray(list)
                    ? list
                        .map(value => Number(value))
                        .filter(value => Number.isInteger(value) && value > 0)
                    : []);

                const normalizeTextList = (list) => (Array.isArray(list)
                    ? [...new Set(
                        list
                            .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
                            .filter(Boolean)
                    )]
                    : []);

                const normalizeDecimal = (value, fallback = 0) => {
                    if (value === null || value === undefined || value === '') {
                        return fallback;
                    }

                    const numericValue = Number(String(value).replace(/,/g, ''));
                    return Number.isFinite(numericValue) ? numericValue : fallback;
                };

                const canonicalCashboxIdByBranchId = new Map();
                const canonicalVoucherNumbers = {
                    nextVoucherNumber: null,
                    nextVoucherSequenceByType: new Map()
                };

                const refreshCanonicalCashboxMap = async (branchIds = []) => {
                    const normalizedBranchIds = normalizeIdList(branchIds);
                    const hasBranchFilter = normalizedBranchIds.length > 0;
                    const result = hasBranchFilter
                        ? await pool.query(
                            'SELECT id, branch_id FROM branch_cashboxes WHERE branch_id = ANY($1::int[])',
                            [normalizedBranchIds]
                        )
                        : await pool.query('SELECT id, branch_id FROM branch_cashboxes');

                    if (hasBranchFilter) {
                        normalizedBranchIds.forEach((branchId) => canonicalCashboxIdByBranchId.delete(branchId));
                    } else {
                        canonicalCashboxIdByBranchId.clear();
                    }

                    for (const row of result.rows || []) {
                        const branchId = Number(row.branch_id);
                        const cashboxId = Number(row.id);
                        if (Number.isInteger(branchId) && branchId > 0 && Number.isInteger(cashboxId) && cashboxId > 0) {
                            canonicalCashboxIdByBranchId.set(branchId, cashboxId);
                        }
                    }

                    return canonicalCashboxIdByBranchId;
                };

                const ensureCanonicalCashboxesForBranches = async (branchIds, sourceRows = []) => {
                    const normalizedBranchIds = normalizeIdList(branchIds);
                    if (normalizedBranchIds.length === 0) {
                        return;
                    }

                    await refreshCanonicalCashboxMap(normalizedBranchIds);

                    const missingBranchIds = normalizedBranchIds.filter((branchId) => !canonicalCashboxIdByBranchId.has(branchId));
                    if (missingBranchIds.length === 0) {
                        return;
                    }

                    const sourceRowsByBranchId = new Map(
                        (Array.isArray(sourceRows) ? sourceRows : [])
                            .map((row) => {
                                const branchId = Number(row && row.branch_id);
                                return Number.isInteger(branchId) && branchId > 0
                                    ? [branchId, row]
                                    : null;
                            })
                            .filter(Boolean)
                    );

                    const branchesResult = await pool.query(
                        'SELECT id, branch_name, is_active FROM branches WHERE id = ANY($1::int[])',
                        [missingBranchIds]
                    );

                    const branchesById = new Map(
                        (branchesResult.rows || []).map((row) => [Number(row.id), row])
                    );

                    let createdCount = 0;

                    for (const branchId of missingBranchIds) {
                        const branchRow = branchesById.get(branchId);
                        if (!branchRow) {
                            console.warn(`⚠️ [SYNC] Skipping canonical cashbox creation for missing branch ${branchId}.`);
                            continue;
                        }

                        const sourceRow = sourceRowsByBranchId.get(branchId) || {};
                        const branchName = String(branchRow.branch_name || '').trim() || 'الفرع';
                        const cashboxName = String(sourceRow.cashbox_name || '').trim() || `صندوق ${branchName}`;
                        const openingBalance = normalizeDecimal(sourceRow.opening_balance, 0);
                        const isActive = Number.isInteger(Number(sourceRow.is_active))
                            ? Number(sourceRow.is_active)
                            : Number.isInteger(Number(branchRow.is_active))
                                ? Number(branchRow.is_active)
                                : 1;
                        const createdAt = sourceRow.created_at || new Date().toISOString();
                        const updatedAt = sourceRow.updated_at || createdAt;

                        await pool.query(
                            `INSERT INTO branch_cashboxes (
                                branch_id, cashbox_name, opening_balance, is_active, created_at, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (branch_id) DO UPDATE SET
                                cashbox_name = COALESCE(NULLIF(EXCLUDED.cashbox_name, ''), branch_cashboxes.cashbox_name),
                                opening_balance = COALESCE(EXCLUDED.opening_balance, branch_cashboxes.opening_balance),
                                is_active = COALESCE(EXCLUDED.is_active, branch_cashboxes.is_active),
                                updated_at = COALESCE(EXCLUDED.updated_at, CURRENT_TIMESTAMP)`,
                            [branchId, cashboxName, openingBalance, isActive, createdAt, updatedAt]
                        );
                        createdCount += 1;
                    }

                    if (createdCount > 0) {
                        console.log(`🧰 [SYNC] Ensured ${createdCount} canonical branch cashboxes for incoming vouchers.`);
                    }

                    await refreshCanonicalCashboxMap(normalizedBranchIds);
                };
                const handleCleanup = async (table, activeIds, options = {}) => {
                    if (!activeIds || !Array.isArray(activeIds)) return;

                    const column = options.column || 'id';
                    const castType = options.castType || 'int';
                    const normalizer = typeof options.normalizer === 'function'
                        ? options.normalizer
                        : normalizeIdList;
                    const normalizedIds = normalizer(activeIds);

                    try {
                        if (normalizedIds.length > 0) {
                            // Delete records NOT in the activeIds list (Mirror Sync)
                            // "DELETE FROM table WHERE id NOT IN (...)"
                            // Optimized for Postgres using ANY/ALL
                            const result = await pool.query(
                                `DELETE FROM ${table} WHERE ${column} != ALL($1::${castType}[])`,
                                [normalizedIds]
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
                                    console.error(`❌ [SYNC] Row insert failed for ${table}:`, e.message, 'Data:', item);
                                }
                            }
                        }
                    }
                    console.log(`✅ [SYNC] ${table}: Processed ${successCount} items.${errorCount > 0 ? ` Failed ${errorCount} items.` : ''}`);
                };

                const syncBranchCashboxes = async (items) => {
                    if (!Array.isArray(items) || items.length === 0) {
                        return;
                    }

                    const validBranchCashboxes = items
                        .map((item) => ({
                            ...item,
                            branch_id: Number(item.branch_id)
                        }))
                        .filter((item) => Number.isInteger(item.branch_id) && item.branch_id > 0);

                    if (validBranchCashboxes.length === 0) {
                        console.warn('⚠️ [SYNC] Received branch_cashboxes payload without valid branch_id values.');
                        return;
                    }

                    await syncTable('branch_cashboxes', validBranchCashboxes, [
                        { name: 'branch_id' }, { name: 'cashbox_name' },
                        { name: 'opening_balance' }, { name: 'is_active' },
                        { name: 'created_at' }, { name: 'updated_at' }
                    ], 'branch_id');

                    await refreshCanonicalCashboxMap(validBranchCashboxes.map((item) => item.branch_id));
                };

                const getNextCanonicalCashboxVoucherNumbers = async (voucherType) => {
                    const normalizedVoucherType = String(voucherType || 'receipt').trim() || 'receipt';

                    if (canonicalVoucherNumbers.nextVoucherNumber === null) {
                        const voucherNumberResult = await pool.query(
                            'SELECT COALESCE(MAX(voucher_number), 0) AS max_number FROM cashbox_vouchers'
                        );
                        canonicalVoucherNumbers.nextVoucherNumber = Number(voucherNumberResult.rows?.[0]?.max_number || 0);
                    }

                    if (!canonicalVoucherNumbers.nextVoucherSequenceByType.has(normalizedVoucherType)) {
                        const voucherSequenceResult = await pool.query(
                            'SELECT COALESCE(MAX(voucher_sequence_number), 0) AS max_number FROM cashbox_vouchers WHERE voucher_type = $1',
                            [normalizedVoucherType]
                        );
                        canonicalVoucherNumbers.nextVoucherSequenceByType.set(
                            normalizedVoucherType,
                            Number(voucherSequenceResult.rows?.[0]?.max_number || 0)
                        );
                    }

                    canonicalVoucherNumbers.nextVoucherNumber += 1;
                    canonicalVoucherNumbers.nextVoucherSequenceByType.set(
                        normalizedVoucherType,
                        Number(canonicalVoucherNumbers.nextVoucherSequenceByType.get(normalizedVoucherType) || 0) + 1
                    );

                    return {
                        voucherNumber: canonicalVoucherNumbers.nextVoucherNumber,
                        voucherSequenceNumber: canonicalVoucherNumbers.nextVoucherSequenceByType.get(normalizedVoucherType)
                    };
                };

                const loadExistingCashboxVouchersBySyncKey = async (syncKeys) => {
                    const normalizedSyncKeys = normalizeTextList(syncKeys);
                    if (normalizedSyncKeys.length === 0) {
                        return new Map();
                    }

                    const result = await pool.query(
                        `SELECT id, sync_key, voucher_number, voucher_sequence_number
                         FROM cashbox_vouchers
                         WHERE sync_key = ANY($1::text[])`,
                        [normalizedSyncKeys]
                    );

                    return new Map(
                        (result.rows || [])
                            .map((row) => [String(row.sync_key || '').trim(), row])
                            .filter(([syncKey]) => Boolean(syncKey))
                    );
                };

                const syncCashboxVouchers = async (items) => {
                    if (!Array.isArray(items) || items.length === 0) {
                        return;
                    }

                    const voucherBranchIds = normalizeIdList(items.map((voucher) => voucher.branch_id));
                    if (voucherBranchIds.length > 0) {
                        await ensureCanonicalCashboxesForBranches(voucherBranchIds, data.branch_cashboxes);
                        await refreshCanonicalCashboxMap(voucherBranchIds);
                    }

                    const preparedBySyncKey = new Map();

                    for (const voucher of items) {
                        const branchId = Number(voucher?.branch_id);
                        const cashboxId = canonicalCashboxIdByBranchId.get(branchId);
                        const syncKey = buildCashboxVoucherSyncKey(voucher);

                        if (!Number.isInteger(branchId) || branchId <= 0) {
                            syncFailures.push({
                                table: 'cashbox_vouchers',
                                id: voucher && voucher.id != null ? voucher.id : null,
                                error: 'INVALID_BRANCH_ID'
                            });
                            continue;
                        }

                        if (!cashboxId) {
                            syncFailures.push({
                                table: 'cashbox_vouchers',
                                id: voucher && voucher.id != null ? voucher.id : null,
                                error: `MISSING_CANONICAL_CASHBOX_FOR_BRANCH_${branchId}`
                            });
                            continue;
                        }

                        if (!syncKey) {
                            syncFailures.push({
                                table: 'cashbox_vouchers',
                                id: voucher && voucher.id != null ? voucher.id : null,
                                error: 'MISSING_SYNC_KEY'
                            });
                            continue;
                        }

                        preparedBySyncKey.set(syncKey, {
                            sync_key: syncKey,
                            voucher_type: voucher.voucher_type,
                            cashbox_id: cashboxId,
                            branch_id: branchId,
                            counterparty_type: voucher.counterparty_type,
                            counterparty_name: voucher.counterparty_name,
                            cashier_id: voucher.cashier_id ?? null,
                            amount: voucher.amount,
                            reference_no: voucher.reference_no ?? null,
                            description: voucher.description ?? null,
                            voucher_date: voucher.voucher_date,
                            created_by: voucher.created_by ?? null,
                            created_at: voucher.created_at || voucher.updated_at || new Date().toISOString(),
                            updated_at: voucher.updated_at || voucher.created_at || new Date().toISOString(),
                            source_reconciliation_id: voucher.source_reconciliation_id ?? null,
                            source_entry_key: voucher.source_entry_key ?? null,
                            is_auto_generated: voucher.is_auto_generated ?? 0
                        });
                    }

                    const preparedRows = Array.from(preparedBySyncKey.values());
                    if (preparedRows.length === 0) {
                        return;
                    }

                    const existingVoucherBySyncKey = await loadExistingCashboxVouchersBySyncKey(
                        preparedRows.map((voucher) => voucher.sync_key)
                    );

                    for (const voucher of preparedRows) {
                        const existingVoucher = existingVoucherBySyncKey.get(voucher.sync_key);
                        if (existingVoucher) {
                            voucher.voucher_number = Number(existingVoucher.voucher_number || 0);
                            voucher.voucher_sequence_number = Number(existingVoucher.voucher_sequence_number || 0);
                            continue;
                        }

                        const nextNumbers = await getNextCanonicalCashboxVoucherNumbers(voucher.voucher_type);
                        voucher.voucher_number = nextNumbers.voucherNumber;
                        voucher.voucher_sequence_number = nextNumbers.voucherSequenceNumber;
                    }

                    console.log(`🔄 [SYNC] Syncing cashbox_vouchers (${preparedRows.length} items) with canonical sync keys...`);

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
                    const updateSets = [
                        'voucher_number = COALESCE(cashbox_vouchers.voucher_number, EXCLUDED.voucher_number)',
                        'voucher_sequence_number = COALESCE(cashbox_vouchers.voucher_sequence_number, EXCLUDED.voucher_sequence_number)',
                        'voucher_type = EXCLUDED.voucher_type',
                        'cashbox_id = EXCLUDED.cashbox_id',
                        'branch_id = EXCLUDED.branch_id',
                        'counterparty_type = EXCLUDED.counterparty_type',
                        'counterparty_name = EXCLUDED.counterparty_name',
                        'cashier_id = EXCLUDED.cashier_id',
                        'amount = EXCLUDED.amount',
                        'reference_no = EXCLUDED.reference_no',
                        'description = EXCLUDED.description',
                        'voucher_date = EXCLUDED.voucher_date',
                        `created_by = COALESCE(NULLIF(EXCLUDED.created_by, ''), cashbox_vouchers.created_by)`,
                        'updated_at = COALESCE(EXCLUDED.updated_at, CURRENT_TIMESTAMP)',
                        'source_reconciliation_id = EXCLUDED.source_reconciliation_id',
                        'source_entry_key = EXCLUDED.source_entry_key',
                        'is_auto_generated = EXCLUDED.is_auto_generated'
                    ].join(', ');

                    const BATCH_SIZE = 100;
                    let successCount = 0;
                    let errorCount = 0;

                    const upsertBatch = async (batch) => {
                        const placeholders = [];
                        const values = [];
                        let paramCounter = 1;

                        batch.forEach((item) => {
                            const rowParams = [];
                            columns.forEach((column) => {
                                let value = item[column];
                                if (typeof value === 'object' && value !== null) {
                                    value = JSON.stringify(value);
                                }
                                if (value === undefined) {
                                    value = null;
                                }
                                values.push(value);
                                rowParams.push(`$${paramCounter++}`);
                            });
                            placeholders.push(`(${rowParams.join(', ')})`);
                        });

                        const sql = `
                            INSERT INTO cashbox_vouchers (${columns.join(', ')})
                            VALUES ${placeholders.join(', ')}
                            ON CONFLICT (sync_key) DO UPDATE SET ${updateSets}
                        `;

                        await pool.query(sql, values);
                    };

                    for (let index = 0; index < preparedRows.length; index += BATCH_SIZE) {
                        const batch = preparedRows.slice(index, index + BATCH_SIZE);

                        try {
                            await upsertBatch(batch);
                            successCount += batch.length;
                        } catch (batchError) {
                            console.error('❌ [SYNC] Batch Error cashbox_vouchers:', batchError.message);
                            for (const voucher of batch) {
                                try {
                                    await upsertBatch([voucher]);
                                    successCount += 1;
                                } catch (rowError) {
                                    errorCount += 1;
                                    syncFailures.push({
                                        table: 'cashbox_vouchers',
                                        id: voucher.sync_key,
                                        error: rowError.message
                                    });
                                    console.error('❌ [SYNC] Row insert failed for cashbox_vouchers:', rowError.message, 'Data:', voucher);
                                }
                            }
                        }
                    }

                    console.log(`✅ [SYNC] cashbox_vouchers: Processed ${successCount} items.${errorCount > 0 ? ` Failed ${errorCount} items.` : ''}`);
                };

                // Sync all tables in dependency order
                if (data.branches) {
                    await syncTable('branches', data.branches, [
                        { name: 'id' }, { name: 'branch_name' }, { name: 'branch_address' },
                        { name: 'branch_phone' }, { name: 'is_active' }
                    ]);
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
                if (data.active_cash_receipts_ids) await handleCleanup('cash_receipts', data.active_cash_receipts_ids);
                if (data.active_bank_receipts_ids) await handleCleanup('bank_receipts', data.active_bank_receipts_ids);
                if (Array.isArray(data.active_cashbox_voucher_audit_log_ids) && data.active_cashbox_voucher_audit_log_ids.length > 0) {
                    console.log('ℹ️ [SYNC] Ignoring legacy active_cashbox_voucher_audit_log_ids cleanup on PostgreSQL; local audit-log ids are not globally stable.');
                }

                const activeCashboxVoucherSyncKeys = normalizeTextList(data.active_cashbox_voucher_sync_keys);
                if (activeCashboxVoucherSyncKeys.length > 0) {
                    await handleCleanup('cashbox_vouchers', activeCashboxVoucherSyncKeys, {
                        column: 'sync_key',
                        castType: 'text',
                        normalizer: normalizeTextList
                    });
                } else if (Array.isArray(data.active_cashbox_vouchers_ids) && data.active_cashbox_vouchers_ids.length > 0) {
                    console.log('ℹ️ [SYNC] Ignoring legacy active_cashbox_vouchers_ids cleanup on PostgreSQL; voucher ids are local and not globally stable.');
                }

                const cashboxBranchIds = Array.isArray(data.branch_cashboxes)
                    ? normalizeIdList(data.branch_cashboxes.map((row) => row.branch_id))
                    : [];
                const activeCashboxBranchIds = normalizeIdList(data.active_branch_cashboxes_branch_ids);
                const cleanupCashboxBranchIds = cashboxBranchIds.length > 0
                    ? cashboxBranchIds
                    : activeCashboxBranchIds;

                if (cleanupCashboxBranchIds.length > 0) {
                    await handleCleanup('branch_cashboxes', cleanupCashboxBranchIds, { column: 'branch_id' });
                } else if (Array.isArray(data.active_branch_cashboxes_ids) && data.active_branch_cashboxes_ids.length > 0) {
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

                if (data.branch_cashboxes) {
                    await syncBranchCashboxes(data.branch_cashboxes);
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
                        { name: 'total_receipts' }, { name: 'surplus_deficit' }, { name: 'status' }, { name: 'notes' },
                        { name: 'origin_request_id' }
                    ]);

                    // 3.1 Auto-archive linked reconciliation requests on Render/Server
                    try {
                        const originRequestIds = normalizeIdList(
                            validReconciliations.map(r => r.origin_request_id ?? r.originRequestId)
                        );
                        if (originRequestIds.length > 0) {
                            const placeholders = originRequestIds.map((_, i) => `$${i + 1}`).join(', ');
                            if (this.dbManager.pool) {
                                await this.dbManager.pool.query(
                                    `UPDATE reconciliation_requests
                                     SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                                     WHERE id IN (${placeholders})`,
                                    originRequestIds
                                );
                            } else {
                                const stmt = this.dbManager.db.prepare(
                                    `UPDATE reconciliation_requests
                                     SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                                     WHERE id IN (${originRequestIds.map(() => '?').join(', ')})`
                                );
                                stmt.run(originRequestIds);
                            }
                            console.log(`🧾 [SYNC] Auto-archived ${originRequestIds.length} reconciliation request(s) from origin_request_id`);
                        }
                    } catch (archiveErr) {
                        console.warn('⚠️ [SYNC] Failed to auto-archive linked reconciliation requests:', archiveErr.message);
                    }

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

                if (data.cashbox_vouchers) {
                    await syncCashboxVouchers(data.cashbox_vouchers);
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
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'customer_name' },
                        { name: 'amount' } //, {name: 'notes'}
                    ]);
                }

                if (data.customer_receipts) {
                    await syncTable('customer_receipts', data.customer_receipts, [
                        { name: 'id' }, { name: 'reconciliation_id' }, { name: 'customer_name' },
                        { name: 'amount' }, { name: 'payment_type' } //, {name: 'notes'}
                    ]);
                }

                if (data.manual_postpaid_sales) {
                    await syncTable('manual_postpaid_sales', data.manual_postpaid_sales, [
                        { name: 'id' }, { name: 'customer_name' }, { name: 'amount' },
                        { name: 'reason' }, { name: 'created_at' }
                    ]);
                }

                if (data.manual_customer_receipts) {
                    await syncTable('manual_customer_receipts', data.manual_customer_receipts, [
                        { name: 'id' }, { name: 'customer_name' }, { name: 'amount' },
                        { name: 'reason' }, { name: 'created_at' }
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
                        total_bank: safeFloat(r.total_bank)
                    }));

                    if (this.dbManager.pool) {
                        const pool = this.dbManager.pool;
                        const columns = [
                            'id',
                            'cashier_id',
                            'system_sales',
                            'total_cash',
                            'total_bank',
                            'details_json',
                            'notes',
                            'status',
                            'request_date',
                            'created_at',
                            'updated_at'
                        ];

                        const updateSets = [
                            'cashier_id = EXCLUDED.cashier_id',
                            'system_sales = EXCLUDED.system_sales',
                            'total_cash = EXCLUDED.total_cash',
                            'total_bank = EXCLUDED.total_bank',
                            'details_json = EXCLUDED.details_json',
                            'notes = EXCLUDED.notes',
                            // Never downgrade a completed request back to pending
                            `status = CASE
                                WHEN reconciliation_requests.status = 'completed'
                                     AND EXCLUDED.status <> 'completed'
                                THEN reconciliation_requests.status
                                ELSE EXCLUDED.status
                             END`,
                            'request_date = EXCLUDED.request_date',
                            'created_at = COALESCE(reconciliation_requests.created_at, EXCLUDED.created_at)',
                            `updated_at = GREATEST(
                                COALESCE(reconciliation_requests.updated_at, EXCLUDED.updated_at),
                                COALESCE(EXCLUDED.updated_at, reconciliation_requests.updated_at)
                             )`
                        ].join(', ');

                        const rows = Array.isArray(cleanRequests) ? cleanRequests : [];
                        if (rows.length > 0) {
                            const BATCH_SIZE = 200;
                            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                                const batch = rows.slice(i, i + BATCH_SIZE);
                                const placeholders = [];
                                const values = [];
                                let param = 1;

                                batch.forEach((row) => {
                                    const rowParams = [];
                                    columns.forEach((col) => {
                                        let value = row[col];
                                        if (typeof value === 'object' && value !== null) {
                                            value = JSON.stringify(value);
                                        }
                                        if (value === undefined) value = null;
                                        values.push(value);
                                        rowParams.push(`$${param++}`);
                                    });
                                    placeholders.push(`(${rowParams.join(', ')})`);
                                });

                                const sql = `
                                    INSERT INTO reconciliation_requests (${columns.join(', ')})
                                    VALUES ${placeholders.join(', ')}
                                    ON CONFLICT (id) DO UPDATE SET ${updateSets}
                                `;
                                await pool.query(sql, values);
                            }
                        }
                    } else {
                        await syncTable('reconciliation_requests', cleanRequests, [
                            { name: 'id' }, { name: 'cashier_id' }, { name: 'system_sales' },
                            { name: 'total_cash' }, { name: 'total_bank' }, { name: 'details_json' },
                            { name: 'notes' }, { name: 'status' }, { name: 'request_date' },
                            { name: 'created_at' }, { name: 'updated_at' }
                        ]);
                    }
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
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleUpdateRequestStatus(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const id = payload.id;
                const status = payload.status;
                const restoredFromReconciliationId = payload.restored_from_reconciliation_id ?? payload.restoredFromReconciliationId ?? null;
                const restoredReasonRaw = payload.restored_reason ?? payload.restoredReason ?? null;
                const restoredReason = restoredReasonRaw === null || restoredReasonRaw === undefined
                    ? null
                    : String(restoredReasonRaw).trim();

                if (!id || !status) {
                    throw new Error('Invalid request status payload');
                }

                console.log(`🔄 [Real-time Sync] Updating request ${id} to status: ${status}`);

                const pool = this.dbManager.pool; // Check for Postgres (Render)
                const shouldWriteRestoreMetadata = status === 'pending'
                    && (restoredFromReconciliationId !== null || restoredReason !== null);

                if (pool) {
                    if (shouldWriteRestoreMetadata) {
                        try {
                            const result = await pool.query(
                                `UPDATE reconciliation_requests
                                 SET status = $1,
                                     restored_at = CURRENT_TIMESTAMP,
                                     restored_from_reconciliation_id = $2,
                                     restored_reason = $3,
                                     updated_at = CURRENT_TIMESTAMP
                                 WHERE id = $4`,
                                [status, restoredFromReconciliationId, restoredReason, id]
                            );
                            console.log(`✅ [Real-time Sync HOOK] Request ${id} restored on PostgreSQL (Server Mode). RowCount: ${result.rowCount}`);
                        } catch (restoreError) {
                            if (
                                String(restoreError.message || '').includes('restored_at')
                                || String(restoreError.message || '').includes('restored_from_reconciliation_id')
                                || String(restoreError.message || '').includes('restored_reason')
                            ) {
                                const result = await pool.query(
                                    "UPDATE reconciliation_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                                    [status, id]
                                );
                                console.log(`⚠️ [Real-time Sync HOOK] Request ${id} updated without restore metadata on PostgreSQL. RowCount: ${result.rowCount}`);
                            } else {
                                throw restoreError;
                            }
                        }
                    } else {
                        const result = await pool.query(
                            "UPDATE reconciliation_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                            [status, id]
                        );
                        console.log(`✅ [Real-time Sync HOOK] Request ${id} updated to '${status}' on PostgreSQL (Server Mode). RowCount: ${result.rowCount}`);
                    }
                } else {
                    if (shouldWriteRestoreMetadata) {
                        try {
                            const stmt = this.dbManager.db.prepare(`
                                UPDATE reconciliation_requests
                                SET status = ?,
                                    restored_at = CURRENT_TIMESTAMP,
                                    restored_from_reconciliation_id = ?,
                                    restored_reason = ?,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            `);
                            const info = stmt.run(status, restoredFromReconciliationId, restoredReason, id);
                            console.log(`✅ [Real-time Sync HOOK] Request ${id} restored on SQLite (Local Mode). Changes: ${info.changes}`);
                        } catch (restoreError) {
                            if (
                                String(restoreError.message || '').includes('restored_at')
                                || String(restoreError.message || '').includes('restored_from_reconciliation_id')
                                || String(restoreError.message || '').includes('restored_reason')
                            ) {
                                const stmt = this.dbManager.db.prepare("UPDATE reconciliation_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                                const info = stmt.run(status, id);
                                console.log(`⚠️ [Real-time Sync HOOK] Request ${id} updated without restore metadata on SQLite (Local Mode). Changes: ${info.changes}`);
                            } else {
                                throw restoreError;
                            }
                        }
                    } else {
                        const stmt = this.dbManager.db.prepare("UPDATE reconciliation_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                        const info = stmt.run(status, id);
                        console.log(`✅ [Real-time Sync HOOK] Request ${id} updated to '${status}' on SQLite (Local Mode). Changes: ${info.changes}`);
                    }
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

    async sendOneSignalNotification(title, message, data = {}) {
        try {
            const appId = "1b7778f5-0f25-4df8-a281-611b682a964c";
            const restApiKey = process.env.ONESIGNAL_REST_API_KEY || "YOUR_REST_API_KEY_HERE";

            const notificationPayload = {
                app_id: appId,
                headings: { en: title, ar: title },
                contents: { en: message, ar: message },
                data: data,
                priority: 10,
                android_visibility: 1,
                lockscreen_visibility: 1,
                // Send to all subscribed users (no filter)
                included_segments: ["All"]
            };

            const response = await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${restApiKey}`
                },
                body: JSON.stringify(notificationPayload)
            });


            const result = await response.json();

            if (response.ok) {
                // Log only ID to keep console clean
                // console.log('✅ Notification Sent:', result.id);
                return { success: true, result };
            } else {
                console.error('❌ Notification Failed:', result);
                return { success: false, error: result };
            }
        } catch (error) {
            console.error('❌ Notification Error:', error.message);
            return { success: false, error: error.message };
        }
    }

    sendJson(res, data, options = {}) {
        console.log('📤 [sendJson] Sending:', Object.keys(data), res.headersSent ? '⚠️ Headers already sent!' : '✅ OK');
        if (!res.headersSent) {
            res.writeHead(options.statusCode || 200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...(options.headers || {})
            });
            res.end(JSON.stringify(data));
        } else {
            console.error('❌ [sendJson] Cannot send - headers already sent!');
        }
    }




    async handleCreateReconciliationRequest(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
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

                // Prepare details JSON for all other lists
                const details = {
                    cash_breakdown: data.cash_breakdown || [],
                    bank_receipts: data.bank_receipts || [],
                    postpaid_items: data.postpaid_items || [],
                    customer_receipts: data.customer_receipts || [],
                    return_items: data.return_items || [],
                    supplier_items: data.supplier_items || []
                };

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

                    await this.sendOneSignalNotification(
                        'طلب تصفية جديد 🔔',
                        `قام ${cashierName} بإرسال طلب تصفية جديد. اضغط للمراجعة.`
                    );
                } catch (e) { console.error('Notification Error', e); }

                this.sendJson(res, { success: true, id: insertedId });



            } catch (error) {
                console.error('❌ [API] Error creating reconciliation request:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleGetReconciliationRequests(res, query) {
        try {
            console.log('📋 [API] Getting reconciliation requests, query:', query);

            let statusFilter = 'pending';
            if (query && query.status) statusFilter = query.status;

            const pool = this.dbManager.pool;
            let requests = [];

            // Try to fetch with branch info from cashiers table (no JOIN needed)
            try {
                if (pool) {
                    // Postgres Logic
                    let sql = `
                        SELECT r.*, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                    `;
                    const params = [];
                    if (statusFilter !== 'all') {
                        sql += ' WHERE r.status = $1';
                        params.push(statusFilter);
                    }
                    sql += ' ORDER BY r.created_at DESC';

                    const result = await pool.query(sql, params);
                    requests = result.rows;
                } else {
                    // SQLite Logic
                    let sql = `
                        SELECT r.*, c.name as cashier_name, c.branch_id
                        FROM reconciliation_requests r
                        LEFT JOIN cashiers c ON r.cashier_id = c.id
                    `;
                    const params = [];
                    if (statusFilter !== 'all') {
                        sql += ' WHERE r.status = ?';
                        params.push(statusFilter);
                    }
                    sql += ' ORDER BY r.created_at DESC';

                    requests = this.dbManager.db.prepare(sql).all(params);
                }
            } catch (queryError) {
                console.warn('⚠️ [API] Could not fetch cashier info, falling back to basic query:', queryError.message);

                // Fallback: Fetch without cashier info
                if (pool) {
                    let sql = `SELECT * FROM reconciliation_requests`;
                    const params = [];
                    if (statusFilter !== 'all') {
                        sql += ' WHERE status = $1';
                        params.push(statusFilter);
                    }
                    sql += ' ORDER BY created_at DESC';

                    const result = await pool.query(sql, params);
                    requests = result.rows;
                } else {
                    let sql = `SELECT * FROM reconciliation_requests`;
                    const params = [];
                    if (statusFilter !== 'all') {
                        sql += ' WHERE status = ?';
                        params.push(statusFilter);
                    }
                    sql += ' ORDER BY created_at DESC';

                    requests = this.dbManager.db.prepare(sql).all(params);
                }
            }

            console.log(`📋 [API] Found ${requests.length} requests`);

            const enrichedRequests = requests.map(req => ({
                ...req,
                cashier_name: req.cashier_name || 'غير معروف',
                branch_id: req.branch_id || null, // Send branch_id instead of branch_name
                details: req.details_json ? (typeof req.details_json === 'string' ? JSON.parse(req.details_json) : req.details_json) : {}
            }));

            console.log('✅ [API] Sending enriched requests');
            this.sendJson(res, { success: true, data: enrichedRequests });
        } catch (error) {
            console.error('❌ [API] Error fetching requests:', error);
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    // Mark reconciliation request as completed (used by Desktop App)
    async handleCompleteReconciliationRequest(res, id) {
        try {
            console.log(`📝 [API] Completing reconciliation request: ${id}`);

            let result = null;
            if (this.dbManager.pool) {
                result = await this.dbManager.pool.query(
                    "UPDATE reconciliation_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    [id]
                );
            } else {
                const stmt = this.dbManager.db.prepare("UPDATE reconciliation_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                result = await stmt.run(id);
            }

            const changed = this.dbManager.pool
                ? Number(result?.rowCount || 0)
                : Number(result?.changes || 0);

            if (changed > 0) {
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
