// @ts-nocheck

const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');

class LocalWebServer {
    constructor(dbManager, port = 4000) {
        this.dbManager = dbManager;
        this.port = port;
        this.server = null;
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
                "CREATE INDEX IF NOT EXISTS idx_postpaid_rec_id ON postpaid_sales(reconciliation_id)",
                "CREATE INDEX IF NOT EXISTS idx_receipts_customer ON customer_receipts(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_receipts_rec_id ON customer_receipts(reconciliation_id)",

                // Manual Transactions
                "CREATE INDEX IF NOT EXISTS idx_manual_postpaid_customer ON manual_postpaid_sales(customer_name)",
                "CREATE INDEX IF NOT EXISTS idx_manual_receipts_customer ON manual_customer_receipts(customer_name)"
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

    async start() {
        // Optimize Database Performance on Startup
        await this.ensureIndexes();

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

                if (pathname === '/api/cashiers/set-pin' && req.method === 'POST') {
                    await this.handleSetCashierPin(req, res);
                    return;
                }

                if (pathname === '/cashiers-management.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'cashiers-management.html'), 'text/html');
                    return;
                }

                if (pathname === '/api/cashiers-list' && req.method === 'GET') {
                    await this.handleGetCashiersList(res);
                    return;
                }

                // Protected Routes (Basic check, real auth would verify token)
                if (pathname === '/' || pathname === '/index.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'index.html'), 'text/html');
                    return;
                }

                if (pathname === '/atm-reports.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'atm-reports.html'), 'text/html');
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
                    await this.handleGetCustomersSummary(res);
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
                    await this.handleGetCustomerList(res, parsedUrl.query);
                    return;
                }
                else if (pathname === '/api/atms') {
                    await this.handleGetAtms(res, parsedUrl.query);
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
                // Check admins table
                const admin = await this.dbManager.db.prepare("SELECT id, name, username, COALESCE(role, 'admin') as role, permissions FROM admins WHERE username = ? AND password = ?").get(username, password);

                if (admin) {
                    // Parse permissions if string
                    if (admin.permissions && typeof admin.permissions === 'string') {
                        try { admin.permissions = JSON.parse(admin.permissions); } catch (e) { }
                    }
                    this.sendJson(res, { success: true, user: admin });
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

                const cashier = await this.dbManager.db.prepare("SELECT * FROM cashiers WHERE id = ?").get(cashierId);

                if (!cashier) {
                    return this.sendJson(res, { success: false, error: 'الكاشير غير موجود' });
                }

                if (!cashier.pin_code) {
                    return this.sendJson(res, { success: false, error: 'لم يتم تعيين رمز لهذا الكاشير بعد' });
                }

                if (String(cashier.pin_code) === String(pin)) {
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
                    this.sendJson(res, { success: true, user: userObj });
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
                this.dbManager.db.prepare("UPDATE cashiers SET pin_code = ? WHERE id = ?").run(pin, cashierId);
                this.sendJson(res, { success: true });
            } catch (error) {
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleGetCashiersList(res) {
        try {
            const cashiers = this.dbManager.db.prepare(`
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
    async handleGetCustomersSummary(res) {
        try {
            // Determine DB type for compatibility
            // SQLite uses MAX(a,b,c), Postgres uses GREATEST(a,b,c)
            // Postgres throws error on empty string for timestamp, SQLite accepts it
            const isPostgres = !!process.env.DATABASE_URL;
            const greatestFunc = isPostgres ? 'GREATEST' : 'MAX';
            const defaultDate = isPostgres ? "'1970-01-01 00:00:00'" : "''";

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
                GROUP BY t.customer_name
            ) AS final_result
            WHERE balance != 0 OR transaction_count > 0
            ORDER BY balance DESC
            `;

            const data = await this.dbManager.db.prepare(sql).all();
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







    // ======================================
    // Reconciliation Requests Logic
    // ======================================

    async handleCreateReconciliationRequest(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                // Validate
                // Validate (Allow system_sales to be 0 or missing)
                if (!data.cashier_id) {
                    throw new Error('بيانات غير مكتملة: الكاشير مطلوب');
                }

                const stmt = this.dbManager.db.prepare(`
                    INSERT INTO reconciliation_requests
                (cashier_id, system_sales, total_cash, total_bank, details_json, notes, status, request_date)
            VALUES(?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                `);

                // Save ALL details, not just cash/bank
                const details = JSON.stringify({
                    cash_breakdown: data.cash_breakdown || [],
                    bank_receipts: data.bank_receipts || [],
                    postpaid_items: data.postpaid_items || [],          // Added
                    customer_receipts: data.customer_receipts || [],    // Added
                    return_items: data.return_items || [],              // Added
                    supplier_items: data.supplier_items || []           // Added
                });

                await stmt.run(
                    data.cashier_id,
                    data.system_sales,
                    data.total_cash || 0,
                    data.total_bank || 0,
                    details,
                    data.notes || ''
                );


                // Get cashier name for notification
                const cashier = await this.dbManager.db.prepare("SELECT name FROM cashiers WHERE id = ?").get(data.cashier_id);
                const cashierName = cashier ? cashier.name : 'كاشير';

                // Send OneSignal notification to admins
                await this.sendOneSignalNotification(
                    '📋 طلب تصفية جديد',
                    `تم استلام طلب تصفية جديد من ${cashierName}`,
                    {
                        type: 'new_reconciliation_request',
                        cashier_id: data.cashier_id,
                        cashier_name: cashierName
                    }
                );

                // Trigger instant sync to push this new request to cloud immediately
                try {
                    const { triggerInstantSync } = require('./background-sync');
                    triggerInstantSync();
                    console.log('⚡ [WEB] Instant sync triggered after new request');
                } catch (syncErr) { console.warn('⚠️ [WEB] Failed to trigger instant sync:', syncErr.message); }

                this.sendJson(res, { success: true });

            } catch (error) {
                console.error('Create Request Error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    // 🔒 SYSTEM FACTORY RESET (Protected by Secret Key)
    async handleFactoryReset(req, res) {
        // 1. Security Check
        const secretKey = req.headers['x-admin-secret'];
        const MASTER_KEY = 'TASFIYA_MASTER_KEY_2025'; // المفتاح السري

        if (secretKey !== MASTER_KEY) {
            console.warn('⚠️ [SECURITY] محاولة غير مصرح بها لعمل إعادة ضبط المصنع');
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'غير مصرح: مفتاح الأمان غير صحيح' }));
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

    async handleGetReconciliationRequests(res, query = {}) {
        try {
            const statusFilter = query.status || 'pending';
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 20;
            const offset = (page - 1) * limit;

            const pool = this.dbManager.pool;

            if (pool) {
                // POSTGRESQL MODE
                // Count total
                const countSql = `SELECT COUNT(*) as total FROM reconciliation_requests WHERE status = $1`;
                const countResult = await pool.query(countSql, [statusFilter]);
                const total = parseInt(countResult.rows[0].total);

                // Get paginated data
                const sql = `
                    SELECT r.*, c.name as cashier_name, b.branch_name 
                    FROM reconciliation_requests r
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    LEFT JOIN branches b ON c.branch_id = b.id
                    WHERE r.status = $1
                    ORDER BY r.created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                const result = await pool.query(sql, [statusFilter, limit, offset]);
                const requests = result.rows;

                requests.forEach(r => {
                    try {
                        if (typeof r.details_json === 'string') {
                            r.details = JSON.parse(r.details_json);
                        } else {
                            r.details = r.details_json || {};
                        }
                    } catch (e) { r.details = {}; }
                });

                this.sendJson(res, {
                    success: true,
                    data: requests,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                });

            } else {
                // SQLITE MODE
                // Count total
                const countSql = `SELECT COUNT(*) as total FROM reconciliation_requests WHERE status = ?`;
                const countResult = this.dbManager.db.prepare(countSql).get(statusFilter);
                const total = countResult.total;

                // Get paginated data
                const sql = `
                    SELECT r.*, c.name as cashier_name, b.branch_name 
                    FROM reconciliation_requests r
                    LEFT JOIN cashiers c ON r.cashier_id = c.id
                    LEFT JOIN branches b ON c.branch_id = b.id
                    WHERE r.status = ?
                    ORDER BY r.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                const requests = await this.dbManager.db.prepare(sql).all(statusFilter, limit, offset);

                requests.forEach(r => {
                    try { r.details = JSON.parse(r.details_json); } catch (e) { r.details = {}; }
                });

                this.sendJson(res, {
                    success: true,
                    data: requests,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                });
            }

        } catch (error) {
            console.error('[Get Requests] Error:', error);
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

            // CRITICAL: Also delete from remote server to prevent re-sync
            try {
                const remoteUrl = 'https://tasfiya-pro-max.onrender.com/api/reconciliation-requests/' + id;
                const fetch = require('node-fetch');
                await fetch(remoteUrl, { method: 'DELETE' });
                console.log(`✅ [DELETE] Also deleted from cloud: ID ${id}`);
            } catch (cloudErr) {
                console.warn(`⚠️ [DELETE] Cloud deletion failed (ID ${id}):`, cloudErr.message);
                // Don't fail the whole request if cloud is down, but log it
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

    async handleGetAtms(res, query) {
        try {
            let atms;

            // If cashierId is provided, filter by their branch
            if (query && query.cashierId) {
                // 1. Get Cashier Branch
                const cashier = await this.dbManager.db.prepare("SELECT branch_id FROM cashiers WHERE id = ?").get(query.cashierId);

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

    async handleGetCustomerList(res, queryParams = {}) {
        try {
            console.log('🔍 [Customers API] Params:', queryParams);
            let customers = [];

            // Check if we should filter by cashier's branch
            if (queryParams && queryParams.cashierId) {
                const cashier = await this.dbManager.db.prepare('SELECT branch_id FROM cashiers WHERE id = ?').get(queryParams.cashierId);

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

                if (!pool) {
                    throw new Error('Database pool not available');
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
                                        if (typeof v === 'object' && v !== null) return JSON.stringify(v);
                                        if (v === undefined) return null;
                                        return v;
                                    });
                                    const singlePlaceholders = singleVals.map((_, idx) => `$${idx + 1}`).join(', ');
                                    await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${singlePlaceholders}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSets}`, singleVals);
                                    successCount++;
                                } catch (e) {
                                    errorCount++;
                                    if (table === 'admins') {
                                        console.error(`❌ [SYNC] Admin insert failed:`, e.message, 'Data:', item);
                                    }
                                }
                            }
                        }
                    }
                    console.log(`✅ [SYNC] ${table}: Processed ${successCount} items.`);
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


                if (data.admins) {
                    // For admins, use username as conflict key to handle duplicate usernames
                    await syncTable('admins', data.admins, [
                        { name: 'id' }, { name: 'name' }, { name: 'username' },
                        { name: 'password' }, { name: 'role' }, { name: 'active' } // Permissions excluded to protect web edits
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
                    await syncTable('reconciliation_requests', data.reconciliation_requests, [
                        { name: 'id' }, { name: 'cashier_id' }, { name: 'system_sales' },
                        { name: 'total_cash' }, { name: 'total_bank' }, { name: 'details_json' },
                        { name: 'notes' }, { name: 'status' }, { name: 'request_date' },
                        { name: 'created_at' }, { name: 'updated_at' }
                    ]);
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

                if (user.id) {
                    // Update
                    this.dbManager.db.prepare(`
                        UPDATE admins 
                        SET name = ?, username = ?, role = ?, active = ?, permissions = ?
                        WHERE id = ?
                    `).run(user.name, user.username, user.role, user.active ? 1 : 0,
                        JSON.stringify(user.permissions || []), user.id);
                } else {
                    // Insert
                    this.dbManager.db.prepare(`
                        INSERT INTO admins (name, username, password, role, active, permissions)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(user.name, user.username, user.password || 'admin123',
                        user.role, user.active ? 1 : 0, JSON.stringify(user.permissions || []));
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

    sendJson(res, data) {
        console.log('📤 [sendJson] Sending:', Object.keys(data), res.headersSent ? '⚠️ Headers already sent!' : '✅ OK');
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
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
                    await this.sendOneSignalNotification(
                        'طلب تصفية جديد 🔔',
                        `وصل طلب تصفية جديد من الكاشير (رقم: ${data.cashier_id})`
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

            if (pool) {
                // Postgres Logic
                let sql = `
                    SELECT r.*, c.name as cashier_name 
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
                    SELECT r.*, c.name as cashier_name 
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

            console.log(`📋 [API] Found ${requests.length} requests`);

            const enrichedRequests = requests.map(req => ({
                ...req,
                cashier_name: req.cashier_name || 'غير معروف',
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

            const stmt = this.dbManager.db.prepare('UPDATE reconciliation_requests SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            const result = stmt.run(id);

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
