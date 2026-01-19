
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

    start() {
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
                if (pathname.endsWith('.js') || pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/assets/')) {
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
                if (pathname === '/api/reconciliations') {
                    await this.handleGetReconciliations(res, parsedUrl.query);
                }
                else if (pathname === '/api/atm-report') {
                    await this.handleGetAtmReport(res, parsedUrl.query);
                }
                else if (pathname.match(/^\/api\/reconciliation\/\d+$/)) {
                    const id = pathname.split('/').pop();
                    await this.handleGetReconciliationDetails(res, id);
                }
                else if (pathname === '/api/lookups') {
                    await this.handleGetLookups(res);
                }
                else if (pathname === '/api/customer-ledger') {
                    await this.handleGetCustomerLedger(res, parsedUrl.query);
                }
                else if (pathname === '/api/customers-summary') {
                    await this.handleGetCustomersSummary(res);
                }
                // User Management
                else if (pathname === '/users-management.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'users-management.html'), 'text/html');
                }
                else if (pathname === '/api/users') {
                    if (req.method === 'GET') await this.handleGetUsers(res);
                    else if (req.method === 'POST') await this.handleSaveUser(req, res);
                }
                else if (pathname.match(/^\/api\/users\/\d+$/) && req.method === 'DELETE') {
                    const id = pathname.split('/').pop();
                    await this.handleDeleteUser(res, id);
                }

                // --- Reconciliation Requests Feature ---
                else if (pathname === '/request-reconciliation.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'request-reconciliation.html'), 'text/html');
                }
                else if (pathname === '/reconciliation-requests.html') {
                    this.serveFile(res, path.join(__dirname, 'web-dashboard', 'reconciliation-requests.html'), 'text/html');
                }
                else if (pathname === '/api/reconciliation-requests') {
                    if (req.method === 'GET') await this.handleGetReconciliationRequests(res);
                    else if (req.method === 'POST') await this.handleCreateReconciliationRequest(req, res);
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+\/approve$/) && req.method === 'POST') {
                    const id = pathname.split('/')[3]; // /api/reconciliation-requests/ID/approve
                    await this.handleApproveReconciliationRequest(res, id, req);
                }
                else if (pathname.match(/^\/api\/reconciliation-requests\/\d+$/) && req.method === 'DELETE') {
                    const id = pathname.split('/').pop();
                    await this.handleDeleteReconciliationRequest(res, id);
                }
                else if (pathname === '/api/customers') {
                    console.log('🔥 [ROUTER] /api/customers route HIT!');
                    await this.handleGetCustomerList(res, parsedUrl.query);
                }
                else if (pathname === '/api/atms') {
                    await this.handleGetAtms(res);
                }
                else if (pathname === '/api/sync/users' && req.method === 'POST') {
                    await this.handleSyncUsers(req, res);
                }
                // TEMPORARY DEBUG ENDPOINT
                else if (pathname === '/api/debug/admins') {
                    try {
                        const pool = this.dbManager.pool || this.dbManager.db.pool;
                        const countResult = await pool.query('SELECT COUNT(*) as count FROM admins');
                        const sampleResult = await pool.query('SELECT id, username, name, role FROM admins LIMIT 10');
                        const constraintsResult = await pool.query(`
                            SELECT conname, contype 
                            FROM pg_constraint 
                            WHERE conrelid = 'admins'::regclass
                        `);

                        this.sendJson(res, {
                            success: true,
                            count: countResult.rows[0].count,
                            sample: sampleResult.rows,
                            constraints: constraintsResult.rows
                        });
                    } catch (e) {
                        this.sendJson(res, { success: false, error: e.message });
                    }
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

        this.server.listen(this.port, () => {
            console.log(`🌐 [WEB APP] Server running at http://localhost:${this.port}`);
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
                res.writeHead(200, { 'Content-Type': contentType });
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

            const data = await this.dbManager.db.prepare(sql).all(params);
            this.sendJson(res, { success: true, data: data });

        } catch (error) {
            console.error('API Error:', error);
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

            let dateFilterSales = '';
            let dateFilterReceipts = '';
            const paramsSales = [customerName];
            const paramsReceipts = [customerName];

            // Validate dates - ensure they are not empty strings
            if (dateFrom && dateFrom.trim() !== '') {
                dateFilterSales += ' AND ps.created_at >= ?';
                dateFilterReceipts += ' AND cr.created_at >= ?';
                paramsSales.push(dateFrom);
                paramsReceipts.push(dateFrom);
            }
            if (dateTo && dateTo.trim() !== '') {
                dateFilterSales += ' AND ps.created_at <= ?';
                dateFilterReceipts += ' AND cr.created_at <= ?';
                // Add time to end of day
                const dateToEnd = dateTo.includes(' ') ? dateTo : dateTo + ' 23:59:59';
                paramsSales.push(dateToEnd);
                paramsReceipts.push(dateToEnd);
            }

            // Get Debits (Sales) - From Reconciliations
            const sales = await this.dbManager.db.prepare(`
            SELECT 
                ps.id, 
                ps.amount, 
                ps.created_at, 
                'مبيعات آجلة' as type, 
                'فاتورة مبيعات' as description,
                c.name as cashier_name,
                r.reconciliation_number
            FROM postpaid_sales ps 
            LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            WHERE ps.customer_name = ? ${dateFilterSales}
        `).all(paramsSales);

            // Get Manual Debits (Sales) - Fix field references for manual table
            // manual table doesn't have ps alias, so remove it from filter
            const filterSalesManual = dateFilterSales.replace(/ps\./g, '');
            const manualSales = await this.dbManager.db.prepare(`
            SELECT 
                id, 
                amount, 
                created_at, 
                'مبيعات يدوية' as type, 
                reason as description,
                'مسؤول النظام' as cashier_name,
                NULL as reconciliation_number
            FROM manual_postpaid_sales 
            WHERE customer_name = ? ${filterSalesManual}
        `).all(paramsSales);


            // Get Credits (Receipts) - From Reconciliations
            const receipts = await this.dbManager.db.prepare(`
            SELECT 
                cr.id, 
                cr.amount, 
                cr.payment_type, 
                cr.created_at, 
                'سند قبض' as type, 
                'سداد - ' || cr.payment_type as description,
                c.name as cashier_name,
                r.reconciliation_number
            FROM customer_receipts cr 
            LEFT JOIN reconciliations r ON cr.reconciliation_id = r.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            WHERE cr.customer_name = ? ${dateFilterReceipts}
        `).all(paramsReceipts);

            // Get Manual Credits (Receipts) - Fix field references
            const filterReceiptsManual = dateFilterReceipts.replace(/cr\./g, '');
            const manualReceipts = await this.dbManager.db.prepare(`
            SELECT 
                id, 
                amount, 
                'نقدي' as payment_type, 
                created_at, 
                'سند قبض يدوي' as type, 
                reason as description,
                'مسؤول النظام' as cashier_name,
                NULL as reconciliation_number
            FROM manual_customer_receipts 
            WHERE customer_name = ? ${filterReceiptsManual}
        `).all(paramsReceipts);

            // Combine and sort
            const ledger = [
                ...sales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                ...manualSales.map(s => ({ ...s, debit: s.amount, credit: 0 })),
                ...receipts.map(r => ({ ...r, debit: 0, credit: r.amount })),
                ...manualReceipts.map(r => ({ ...r, debit: 0, credit: r.amount }))
            ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            this.sendJson(res, { success: true, data: ledger });
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

            // Complex query to get balance (Sales - Receipts) + Manual Entries
            const sql = `
            SELECT 
                c.name as customer_name,
                COALESCE(sales.total_debit, 0) + COALESCE(manual_sales.total_debit, 0) as total_debit,
                COALESCE(receipts.total_credit, 0) + COALESCE(manual_receipts.total_credit, 0) as total_credit,
                (COALESCE(sales.total_debit, 0) + COALESCE(manual_sales.total_debit, 0)) - (COALESCE(receipts.total_credit, 0) + COALESCE(manual_receipts.total_credit, 0)) as balance,
                ${greatestFunc}(
                    COALESCE(sales.last_date, ${defaultDate}), 
                    COALESCE(receipts.last_date, ${defaultDate}), 
                    COALESCE(manual_sales.last_date, ${defaultDate}), 
                    COALESCE(manual_receipts.last_date, ${defaultDate})
                ) as last_transaction,
                (COALESCE(sales.count, 0) + COALESCE(manual_sales.count, 0) + COALESCE(receipts.count, 0) + COALESCE(manual_receipts.count, 0)) as transaction_count,
                 (
                    SELECT b.branch_name 
                    FROM postpaid_sales ps
                    LEFT JOIN reconciliations r ON ps.reconciliation_id = r.id 
                    LEFT JOIN cashiers ca ON r.cashier_id = ca.id
                    LEFT JOIN branches b ON ca.branch_id = b.id
                    WHERE ps.customer_name = c.name 
                    ORDER BY ps.created_at DESC 
                    LIMIT 1
                 ) as branch_name
            FROM (
                SELECT DISTINCT customer_name as name FROM postpaid_sales
                UNION 
                SELECT DISTINCT customer_name as name FROM customer_receipts
                UNION
                SELECT DISTINCT customer_name as name FROM manual_postpaid_sales
                UNION
                SELECT DISTINCT customer_name as name FROM manual_customer_receipts
            ) c
            LEFT JOIN (
                SELECT customer_name, SUM(amount) as total_debit, MAX(created_at) as last_date, COUNT(*) as count 
                FROM postpaid_sales GROUP BY customer_name
            ) sales ON c.name = sales.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(amount) as total_debit, MAX(created_at) as last_date, COUNT(*) as count 
                FROM manual_postpaid_sales GROUP BY customer_name
            ) manual_sales ON c.name = manual_sales.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(amount) as total_credit, MAX(created_at) as last_date, COUNT(*) as count 
                FROM customer_receipts GROUP BY customer_name
            ) receipts ON c.name = receipts.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(amount) as total_credit, MAX(created_at) as last_date, COUNT(*) as count 
                FROM manual_customer_receipts GROUP BY customer_name
            ) manual_receipts ON c.name = manual_receipts.customer_name
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
            let users = await this.dbManager.db.prepare("SELECT id, name, username, role, permissions, active, created_at FROM admins ORDER BY id DESC").all();

            // Safety Check
            if (!users || !Array.isArray(users)) users = [];

            users.forEach(u => {
                if (u.permissions && typeof u.permissions === 'string') {
                    try { u.permissions = JSON.parse(u.permissions); } catch (e) { u.permissions = []; }
                }
            });
            this.sendJson(res, { success: true, data: users });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleSaveUser(req, res) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const userData = JSON.parse(body);
                const { id, name, username, password, role, permissions } = userData;

                // Convert permissions array to JSON string
                const permsStr = permissions ? JSON.stringify(permissions) : null;

                if (!name || !username) {
                    this.sendJson(res, { success: false, error: 'الاسم واسم المستخدم مطلوبان' });
                    return;
                }

                if (id) {
                    // Update
                    let sql = "UPDATE admins SET name = ?, username = ?, role = ?, permissions = ? WHERE id = ?";
                    let params = [name, username, role || 'admin', permsStr, id];

                    if (password && password.trim() !== '') {
                        sql = "UPDATE admins SET name = ?, username = ?, role = ?, permissions = ?, password = ? WHERE id = ?";
                        params = [name, username, role || 'admin', permsStr, password, id];
                    }

                    this.dbManager.db.prepare(sql).run(...params);
                } else {
                    // Create
                    if (!password) {
                        this.sendJson(res, { success: false, error: 'كلمة المرور مطلوبة للمستخدم الجديد' });
                        return;
                    }
                    this.dbManager.db.prepare(
                        "INSERT INTO admins (name, username, password, role, permissions, active) VALUES (?, ?, ?, ?, ?, 1)"
                    ).run(name, username, password, role || 'admin', permsStr);
                }

                this.sendJson(res, { success: true });
            } catch (error) {
                console.error('Save User Error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleDeleteUser(res, id) {
        try {
            this.dbManager.db.prepare("DELETE FROM admins WHERE id = ?").run(id);
            this.sendJson(res, { success: true });
        } catch (error) {
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

                this.sendJson(res, { success: true });
            } catch (error) {
                console.error('Create Request Error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleGetReconciliationRequests(res) {
        try {
            const sql = `
                SELECT r.*, c.name as cashier_name 
                FROM reconciliation_requests r
                LEFT JOIN cashiers c ON r.cashier_id = c.id
                WHERE r.status = 'pending'
                ORDER BY r.created_at DESC
                `;
            const requests = await this.dbManager.db.prepare(sql).all();

            // Parse JSON details
            requests.forEach(r => {
                try { r.details = JSON.parse(r.details_json); } catch (e) { r.details = {}; }
            });

            this.sendJson(res, { success: true, data: requests });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleApproveReconciliationRequest(res, id, req) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const approvalData = JSON.parse(body);

                // Fetch original request
                const request = await this.dbManager.db.prepare("SELECT * FROM reconciliation_requests WHERE id = ?").get(id);
                if (!request) throw new Error('الطلب غير موجود');

                const details = JSON.parse(request.details_json || '{}');

                // Async Transaction
                await this.dbManager.asyncTransaction(async (tx) => {
                    // Extract Arrays
                    const cashBreakdown = details.cash_breakdown || [];
                    const bankReceipts = details.bank_receipts || [];
                    const postpaidSales = details.postpaid_items || [];
                    const customerReceipts = details.customer_receipts || [];
                    const returns = details.return_items || [];
                    const suppliers = details.supplier_items || [];

                    // Calculate Totals
                    const totalCash = Number(request.total_cash) || 0;
                    const totalBank = Number(request.total_bank) || 0;
                    const totalPostpaid = postpaidSales.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    const totalReturns = returns.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    const totalCustomerReceipts = customerReceipts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    const systemSales = Number(request.system_sales) || 0;

                    const totalCollectedValue = totalCash + totalBank + totalPostpaid - totalCustomerReceipts + totalReturns;
                    const surplus = totalCollectedValue - systemSales;
                    const totalReceiptsLog = totalCash + totalBank;

                    // Get Next Reconciliation Number
                    const maxRec = await tx.prepare("SELECT MAX(reconciliation_number) as max_num FROM reconciliations").get();
                    const newRecNum = (maxRec.max_num || 0) + 1;

                    const cashierId = request.cashier_id;
                    const accountantId = approvalData.accountant_id || 1;
                    const date = new Date().toISOString().split('T')[0];

                    const insertRec = tx.prepare(`
                        INSERT INTO reconciliations
                        (reconciliation_number, cashier_id, accountant_id, reconciliation_date, system_sales, total_receipts, surplus_deficit, status, notes, created_at)
                        VALUES(?, ?, ?, ?, ?, ?, ?, 'completed', ?, CURRENT_TIMESTAMP)
                    `);

                    const recInfo = await insertRec.run(
                        newRecNum, cashierId, accountantId, date, systemSales, totalReceiptsLog, surplus, (request.notes || '')
                    );
                    const recId = recInfo.lastInsertRowid;

                    // Insert Details
                    const insertCash = tx.prepare(`INSERT INTO cash_receipts(reconciliation_id, denomination, quantity, total_amount) VALUES(?, ?, ?, ?)`);
                    for (const item of cashBreakdown) {
                        await insertCash.run(recId, item.value, item.count, item.total);
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
                        if (!atmId && allAtms.length > 0) atmId = allAtms[0].id;
                        await insertBank.run(recId, item.operation_type || 'Unknown', atmId, item.amount);
                    }

                    // Postpaid
                    const insertPostpaid = tx.prepare(`INSERT INTO postpaid_sales(reconciliation_id, customer_name, amount, notes) VALUES(?, ?, ?, ?)`);
                    for (const item of postpaidSales) {
                        await insertPostpaid.run(recId, item.customer_name, item.amount, item.notes || '');
                    }

                    // Customer Receipts
                    const insertCustReceipt = tx.prepare(`INSERT INTO customer_receipts(reconciliation_id, customer_name, amount, payment_type, notes) VALUES(?, ?, ?, ?, ?)`);
                    for (const item of customerReceipts) {
                        await insertCustReceipt.run(recId, item.customer_name, item.amount, item.payment_type || 'cash', item.notes || '');
                    }

                    // Returns
                    const insertReturn = tx.prepare(`INSERT INTO return_invoices(reconciliation_id, invoice_number, amount) VALUES(?, ?, ?)`);
                    for (const item of returns) {
                        await insertReturn.run(recId, item.invoice_number || 'N/A', item.amount);
                    }

                    // Suppliers
                    const insertSupplier = tx.prepare(`INSERT INTO suppliers(reconciliation_id, supplier_name, amount) VALUES(?, ?, ?)`);
                    for (const item of suppliers) {
                        await insertSupplier.run(recId, item.supplier_name, item.amount);
                    }

                    // Archive Request
                    await tx.prepare("UPDATE reconciliation_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
                });

                this.sendJson(res, { success: true });

            } catch (error) {
                console.error('Approval Error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleDeleteReconciliationRequest(res, id) {
        try {
            await this.dbManager.db.prepare("DELETE FROM reconciliation_requests WHERE id = ?").run(id);
            this.sendJson(res, { success: true });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
    }

    async handleGetAtms(res) {
        try {
            const atms = await this.dbManager.db.prepare("SELECT * FROM atms ORDER BY name").all();
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

                // Helper to sync table using Optimized Batch INSERT
                const syncTable = async (table, items, columns, conflictCol = 'id') => {
                    if (!items || items.length === 0) return;

                    console.log(`🔄 [SYNC] Syncing ${table} (${items.length} items) in batches...`);
                    const cols = columns.map(c => c.name);
                    const updateSets = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');

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

                if (data.admins) {
                    // For admins, use username as conflict key to handle duplicate usernames
                    await syncTable('admins', data.admins, [
                        { name: 'id' }, { name: 'name' }, { name: 'username' },
                        { name: 'password' }, { name: 'role' }, { name: 'active' }, { name: 'permissions' }
                    ], 'username'); // Use username instead of id to avoid constraint violations
                }

                if (data.cashiers) {
                    await syncTable('cashiers', data.cashiers, [
                        { name: 'id' }, { name: 'name' }, { name: 'cashier_number' },
                        { name: 'branch_id' }, { name: 'active' }, { name: 'pin_code' }
                    ]);
                }

                if (data.atms) {
                    await syncTable('atms', data.atms, [
                        { name: 'id' }, { name: 'name' }, { name: 'bank_name' },
                        { name: 'location' }, { name: 'branch_id' }, { name: 'active' }
                    ]);
                }

                if (data.reconciliations) {
                    await syncTable('reconciliations', data.reconciliations, [
                        { name: 'id' }, { name: 'reconciliation_number' }, { name: 'cashier_id' },
                        { name: 'accountant_id' }, { name: 'reconciliation_date' }, { name: 'system_sales' },
                        { name: 'total_receipts' }, { name: 'surplus_deficit' }, { name: 'status' }, { name: 'notes' }
                    ]);
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

                console.log('✅ [SYNC] Full sync completed successfully');
                this.sendJson(res, { success: true, message: 'Full sync completed' });
            } catch (error) {
                console.error('❌ [SYNC] Fatal error:', error);
                this.sendJson(res, { success: false, error: error.message });
            }
        });
    }

    async handleGetUsers(res) {
        try {
            const users = this.dbManager.db.prepare(`
                SELECT id, name, username, role, active, permissions, created_at 
                FROM admins 
                ORDER BY id DESC
            `).all();

            this.sendJson(res, { success: true, users });
        } catch (error) {
            this.sendJson(res, { success: false, error: error.message });
        }
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

    sendJson(res, data) {
        console.log('📤 [sendJson] Sending:', Object.keys(data), res.headersSent ? '⚠️ Headers already sent!' : '✅ OK');
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } else {
            console.error('❌ [sendJson] Cannot send - headers already sent!');
        }
    }
}

module.exports = LocalWebServer;
