const { Pool } = require('pg');
const { resolveAdminSeedPolicy } = require('./security/admin-seed-policy');
const { hashSecret, isHashedSecret } = require('./security/auth-service');

class PostgresManager {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString: connectionString,
            ssl: {
                rejectUnauthorized: false // Required for Neon/Render
            },
            max: 10, // Max number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 15000, // Give cold-started hosted databases more time to accept the first connection
        });

        // The pool will emit an error on behalf of any idle clients
        // it contains if a backend error or network partition happens
        this.pool.on('error', (err, client) => {
            console.error('❌ [DB-POOL] Unexpected error on idle client', err);
            // process.exit(-1); // Do not exit, just log it. The pool will discard the client.
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
            try {
                await this.repairCashboxSyncData();
            } catch (repairError) {
                console.error('⚠️ [DB] Cashbox sync repair failed during startup:', repairError);
            }
            await this.migrateSensitiveCredentials();
            return true;
        } catch (error) {
            console.error('❌ [DB] Connection to Neon failed:', error);
            return false;
        }
    }

    async migrateSchema() {
        try {
            const client = await this.pool.connect();
            // Fix cash_receipts numeric column types to support fractional values
            // Safe to run multiple times
            await client.query('ALTER TABLE cash_receipts ALTER COLUMN denomination TYPE DECIMAL(10,2)');
            await client.query('ALTER TABLE cash_receipts ALTER COLUMN quantity TYPE DECIMAL(10,2) USING quantity::DECIMAL(10,2)');

            // New request-linking and restoration metadata columns
            await client.query(`
              ALTER TABLE reconciliations
              ADD COLUMN IF NOT EXISTS origin_request_id INTEGER
            `);
            await client.query(`
              ALTER TABLE reconciliation_requests
              ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP
            `);
            await client.query(`
              ALTER TABLE reconciliation_requests
              ADD COLUMN IF NOT EXISTS restored_from_reconciliation_id INTEGER
            `);
            await client.query(`
              ALTER TABLE reconciliation_requests
              ADD COLUMN IF NOT EXISTS restored_reason TEXT
            `);
            await client.query(`
              ALTER TABLE cashbox_vouchers
              ADD COLUMN IF NOT EXISTS sync_key TEXT
            `);
            await client.query(`
              CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique
              ON cashbox_vouchers(sync_key)
              WHERE sync_key IS NOT NULL AND BTRIM(sync_key) != ''
            `);

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
            `CREATE TABLE IF NOT EXISTS branch_cashboxes (
                id SERIAL PRIMARY KEY,
                branch_id INTEGER NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
                cashbox_name TEXT NOT NULL,
                opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
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
                origin_request_id INTEGER,
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
                restored_at TIMESTAMP,
                restored_from_reconciliation_id INTEGER,
                restored_reason TEXT,
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
                quantity DECIMAL(10,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        const indexQueries = [
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
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_type_sequence_unique ON cashbox_vouchers(voucher_type, voucher_sequence_number)',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_source_unique ON cashbox_vouchers(source_reconciliation_id, source_entry_key)'
        ];

        for (const query of indexQueries) {
            await this.pool.query(query);
        }
    }

    async insertDefaultData() {
        try {
            // Insert default admin if not exists
            const adminCount = await this.prepare('SELECT COUNT(*) as count FROM admins').get();
            if (adminCount.count == 0) { // == loose check for string/int return
                const adminSeed = resolveAdminSeedPolicy({ env: process.env });
                if (adminSeed.shouldSeed) {
                    await this.prepare(`INSERT INTO admins (name, username, password) VALUES (?, ?, ?)`)
                        .run(adminSeed.name, adminSeed.username, hashSecret(adminSeed.password));
                    console.log(`✅ Default admin created (${adminSeed.source})`);
                } else {
                    console.log('⚠️ [DB] Default admin credentials disabled in this environment');
                }
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

    async repairCashboxSyncData() {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const insertedResult = await client.query(`
                WITH inserted AS (
                    INSERT INTO branch_cashboxes (
                        branch_id,
                        cashbox_name,
                        opening_balance,
                        is_active,
                        created_at,
                        updated_at
                    )
                    SELECT
                        b.id,
                        'صندوق ' || COALESCE(NULLIF(TRIM(b.branch_name), ''), 'الفرع'),
                        0,
                        COALESCE(b.is_active, 1),
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    FROM branches b
                    LEFT JOIN branch_cashboxes cb ON cb.branch_id = b.id
                    WHERE cb.id IS NULL
                    RETURNING id, branch_id
                )
                SELECT COUNT(*)::int AS inserted_count
                FROM inserted
            `);

            const repairedResult = await client.query(`
                WITH repaired AS (
                    UPDATE cashbox_vouchers v
                    SET
                        cashbox_id = canonical_cb.id,
                        updated_at = CURRENT_TIMESTAMP
                    FROM branch_cashboxes canonical_cb
                    WHERE canonical_cb.branch_id = v.branch_id
                      AND (
                          NOT EXISTS (
                              SELECT 1
                              FROM branch_cashboxes current_cb
                              WHERE current_cb.id = v.cashbox_id
                          )
                          OR EXISTS (
                              SELECT 1
                              FROM branch_cashboxes current_cb
                              WHERE current_cb.id = v.cashbox_id
                                AND current_cb.branch_id IS DISTINCT FROM v.branch_id
                          )
                      )
                    RETURNING v.id
                )
                SELECT COUNT(*)::int AS repaired_count
                FROM repaired
            `);

            const syncKeyResult = await client.query(`
                WITH updated AS (
                    UPDATE cashbox_vouchers v
                    SET sync_key = CASE
                        WHEN COALESCE(BTRIM(v.sync_key), '') != '' THEN v.sync_key
                        WHEN v.source_reconciliation_id IS NOT NULL
                             AND COALESCE(BTRIM(v.source_entry_key), '') != ''
                            THEN 'recon:' || CAST(v.source_reconciliation_id AS TEXT) || ':' || REPLACE(BTRIM(v.source_entry_key), ' ', '%20')
                        ELSE 'manual:' || REPLACE(
                                COALESCE(
                                    TO_CHAR(v.created_at, 'YYYY-MM-DD HH24:MI:SS'),
                                    TO_CHAR(v.voucher_date, 'YYYY-MM-DD'),
                                    'no-timestamp'
                                ),
                                ' ',
                                '%20'
                            )
                             || ':' || CAST(v.id AS TEXT)
                    END
                    WHERE COALESCE(BTRIM(v.sync_key), '') = ''
                    RETURNING v.id
                )
                SELECT COUNT(*)::int AS updated_count
                FROM updated
            `);

            await client.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbox_vouchers_sync_key_unique
                ON cashbox_vouchers(sync_key)
                WHERE sync_key IS NOT NULL AND BTRIM(sync_key) != ''
            `);

            await client.query('COMMIT');

            const insertedCount = Number(insertedResult.rows?.[0]?.inserted_count || 0);
            const repairedCount = Number(repairedResult.rows?.[0]?.repaired_count || 0);
            const syncKeyCount = Number(syncKeyResult.rows?.[0]?.updated_count || 0);

            console.log(`🧰 [DB] Cashbox sync repair complete: branch_cashboxes_created=${insertedCount}, vouchers_relinked=${repairedCount}, voucher_sync_keys_backfilled=${syncKeyCount}`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async migrateSensitiveCredentials() {
        try {
            const adminRows = await this.prepare(`
                SELECT id, password
                FROM admins
                WHERE password IS NOT NULL AND TRIM(password) != ''
            `).all();

            let migratedAdmins = 0;
            for (const admin of adminRows) {
                if (!isHashedSecret(admin.password)) {
                    await this.prepare(`
                        UPDATE admins
                        SET password = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(hashSecret(admin.password), admin.id);
                    migratedAdmins += 1;
                }
            }

            const cashierRows = await this.prepare(`
                SELECT id, pin_code
                FROM cashiers
                WHERE pin_code IS NOT NULL AND TRIM(pin_code) != ''
            `).all();

            let migratedCashiers = 0;
            for (const cashier of cashierRows) {
                if (!isHashedSecret(cashier.pin_code)) {
                    await this.prepare(`
                        UPDATE cashiers
                        SET pin_code = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(hashSecret(cashier.pin_code), cashier.id);
                    migratedCashiers += 1;
                }
            }

            if (migratedAdmins > 0 || migratedCashiers > 0) {
                console.log(`🔐 [DB] Migrated sensitive credentials on PostgreSQL: admins=${migratedAdmins}, cashiers=${migratedCashiers}`);
            }
        } catch (error) {
            console.error('⚠️ [DB] Failed to migrate sensitive credentials on PostgreSQL:', error);
        }
    }
}

module.exports = PostgresManager;
