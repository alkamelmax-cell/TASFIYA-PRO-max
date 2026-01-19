const { Pool } = require('pg');

class PostgresManager {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString: connectionString,
            ssl: {
                rejectUnauthorized: false // Required for Neon
            }
        });
        this.db = this;
    }

    async initialize() {
        try {
            const client = await this.pool.connect();
            console.log('✅ [DB] Connected to Neon PostgreSQL');
            client.release();
            await this.createTables();
            await this.migrateSchema();
            await this.insertDefaultData();
            return true;
        } catch (error) {
            console.error('❌ [DB] Connection to Neon failed:', error);
            return false;
        }
    }

    async migrateSchema() {
        try {
            const client = await this.pool.connect();
            // Fix denomination column type from INTEGER to DECIMAL to support fraction coins (0.5, 0.25)
            // This is safe to run multiple times (it will just set the type)
            await client.query('ALTER TABLE cash_receipts ALTER COLUMN denomination TYPE DECIMAL(10,2)');

            // Ensure username is UNIQUE for admins (Critical for Sync ON CONFLICT logic)
            try {
                // First, remove any duplicate usernames (keep the one with highest ID = latest)
                await client.query(`
                    DELETE FROM admins a 
                    USING admins b 
                    WHERE a.id < b.id AND a.username = b.username
                `);
                console.log('[DB] Cleaned up duplicate usernames');
                
                // Now add UNIQUE constraint
                await client.query('ALTER TABLE admins ADD CONSTRAINT admins_username_key UNIQUE (username)');
                console.log('✅ [DB] Added UNIQUE constraint on admins.username');
            } catch (e) {
                // Ignore if constraint already exists
                if (!e.message.includes('already exists')) {
                    console.log('[DB] Username constraint note:', e.message);
                }
            }

            client.release();
            console.log('✅ [DB] Schema migration applied (cash_receipts modified).');
        } catch (error) {
            // Usually fails if table doesn't exist yet (handled by createTables) or other minor reasons. 
            // We can logging it as a note or ignoring if it's "column already exists" type errors.
            // console.log('[DB] Migration note:', error.message); 
        }
    }

    // Adaptor: SQLite (?) to Postgres ($1, $2)
    _prepareWithExecutor(sql, executor) {
        // Convert ? placeholders to $1, $2, etc
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => '$' + paramIndex++);

        // Helper to unwrap params
        const unwrapParams = (args) => {
            if (args.length === 1 && Array.isArray(args[0])) {
                return args[0];
            }
            return args;
        };

        return {
            get: async (...args) => {
                const params = unwrapParams(args);
                try {
                    const res = params.length > 0
                        ? await executor.query(pgSql, params)
                        : await executor.query(pgSql);
                    return res.rows[0];
                } catch (e) { console.error('PG Get Error:', e.message, pgSql, 'Params:', params); throw e; }
            },
            all: async (...args) => {
                const params = unwrapParams(args);
                try {
                    const res = params.length > 0
                        ? await executor.query(pgSql, params)
                        : await executor.query(pgSql);
                    return res.rows;
                } catch (e) { console.error('PG All Error:', e.message, pgSql, 'Params:', params); throw e; }
            },
            run: async (...args) => {
                const params = unwrapParams(args);
                let finalSql = pgSql;
                try {
                    const isInsert = finalSql.trim().toUpperCase().startsWith('INSERT');

                    if (isInsert && !finalSql.match(/RETURNING/i)) {
                        finalSql += ' RETURNING id';
                    }

                    const res = params.length > 0
                        ? await executor.query(finalSql, params)
                        : await executor.query(finalSql);

                    let lastId = 0;
                    if (isInsert && res.rows.length > 0) {
                        lastId = res.rows[0].id;
                    }
                    return { changes: res.rowCount, lastInsertRowid: lastId };
                } catch (e) { console.error('PG Run Error:', e.message, finalSql, 'Params:', params); throw e; }
            }
        };
    }

    prepare(sql) {
        return this._prepareWithExecutor(sql, this.pool);
    }

    async asyncTransaction(callback) {
        return this.transaction(callback);
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const trxDb = {
                prepare: (sql) => this._prepareWithExecutor(sql, client)
            };

            const result = await callback(trxDb);

            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async exec(sql) {
        return this.pool.query(sql);
    }

    async createTables() {
        console.log('🔄 [DB] Syncing Schema to Neon...');

        const queries = [
            `CREATE TABLE IF NOT EXISTS manual_postpaid_sales (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS manual_customer_receipts (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                active INTEGER DEFAULT 1,
                permissions TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS branches (
                id SERIAL PRIMARY KEY,
                branch_name TEXT NOT NULL,
                branch_address TEXT,
                branch_phone TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS cashiers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cashier_number TEXT UNIQUE NOT NULL,
                branch_id INTEGER REFERENCES branches(id),
                active INTEGER DEFAULT 1,
                pin_code TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS accountants (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS atms (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                bank_name TEXT NOT NULL,
                location TEXT DEFAULT 'غير محدد',
                branch_id INTEGER REFERENCES branches(id),
                active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS reconciliations (
                id SERIAL PRIMARY KEY,
                reconciliation_number INTEGER NULL,
                cashier_id INTEGER NOT NULL REFERENCES cashiers(id),
                accountant_id INTEGER NOT NULL REFERENCES accountants(id),
                reconciliation_date DATE NOT NULL,
                system_sales DECIMAL(10,2) DEFAULT 0,
                total_receipts DECIMAL(10,2) DEFAULT 0,
                surplus_deficit DECIMAL(10,2) DEFAULT 0,
                status TEXT DEFAULT 'draft',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_date TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS reconciliation_requests (
                id SERIAL PRIMARY KEY,
                cashier_id INTEGER NOT NULL REFERENCES cashiers(id),
                request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                system_sales DECIMAL(10,2) DEFAULT 0,
                total_cash DECIMAL(10,2) DEFAULT 0,
                total_bank DECIMAL(10,2) DEFAULT 0,
                status TEXT DEFAULT 'pending',
                details_json TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS system_settings (
                id SERIAL PRIMARY KEY,
                category TEXT NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, setting_key)
            )`,
            `CREATE TABLE IF NOT EXISTS bank_receipts (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                operation_type TEXT NOT NULL,
                atm_id INTEGER REFERENCES atms(id),
                amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS cash_receipts (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                denomination DECIMAL(10,2) NOT NULL,
                quantity INTEGER NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS postpaid_sales (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS customer_receipts (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_type TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS manual_postpaid_sales (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS manual_customer_receipts (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS return_invoices (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                invoice_number TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                reconciliation_id INTEGER NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
                supplier_name TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const q of queries) {
            await this.pool.query(q);
        }
    }

    async insertDefaultData() {
        try {
            // Insert default admin if not exists
            const adminCount = await this.prepare('SELECT COUNT(*) as count FROM admins').get();
            if (adminCount.count == 0) { // == loose check for string/int return
                await this.prepare(`INSERT INTO admins (name, username, password) VALUES (?, ?, ?)`)
                    .run('المدير العام', 'admin', 'admin123');
                console.log('✅ Default admin created');
            }

            // Insert default branch
            const branchCount = await this.prepare('SELECT COUNT(*) as count FROM branches').get();
            if (branchCount.count == 0) {
                await this.prepare(`INSERT INTO branches (branch_name, branch_address, branch_phone, is_active) VALUES (?, ?, ?, ?)`)
                    .run('الفرع الرئيسي', 'الرياض - حي الملك فهد', '011-1234567', 1);
                console.log('✅ Default branch created');
            }

            // Insert default cashier
            const cashierCount = await this.prepare('SELECT COUNT(*) as count FROM cashiers').get();
            if (cashierCount.count == 0) {
                const defaultBranch = await this.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
                await this.prepare(`INSERT INTO cashiers (name, cashier_number, branch_id) VALUES (?, ?, ?)`)
                    .run('كاشير 1', '001', defaultBranch ? defaultBranch.id : null);
                console.log('✅ Default cashier created');
            }

            // Insert default accountant
            const accountantCount = await this.prepare('SELECT COUNT(*) as count FROM accountants').get();
            if (accountantCount.count == 0) {
                await this.prepare(`INSERT INTO accountants (name) VALUES (?)`).run('محاسب 1');
                console.log('✅ Default accountant created');
            }

            // Insert default ATM
            const atmCount = await this.prepare('SELECT COUNT(*) as count FROM atms').get();
            if (atmCount.count == 0) {
                const defaultBranch = await this.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
                const branchId = defaultBranch ? defaultBranch.id : 1;
                await this.prepare(`INSERT INTO atms (name, bank_name, location, branch_id) VALUES (?, ?, ?, ?)`)
                    .run('جهاز 1', 'البنك الأهلي', 'الفرع الرئيسي', branchId);
                console.log('✅ Default ATM created');
            }

        } catch (error) {
            console.error('❌ Error inserting default data:', error);
        }
    }
}

module.exports = PostgresManager;
