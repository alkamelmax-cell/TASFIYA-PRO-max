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
            return true;
        } catch (error) {
            console.error('❌ [DB] Connection to Neon failed:', error);
            return false;
        }
    }

    // Adaptor: SQLite (?) to Postgres ($1, $2)
    // Now accepts an executor (pool or client)
    _prepareWithExecutor(sql, executor) {
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => '$' + paramIndex++);

        return {
            get: async (...params) => {
                try {
                    const res = await executor.query(pgSql, params);
                    return res.rows[0];
                } catch (e) { console.error('PG Get Error:', e.message, pgSql); throw e; }
            },
            all: async (...params) => {
                try {
                    const res = await executor.query(pgSql, params);
                    return res.rows;
                } catch (e) { console.error('PG All Error:', e.message, pgSql); throw e; }
            },
            run: async (...params) => {
                try {
                    let finalSql = pgSql;
                    const isInsert = finalSql.trim().toUpperCase().startsWith('INSERT');

                    if (isInsert && !finalSql.match(/RETURNING/i)) {
                        finalSql += ' RETURNING id';
                    }

                    const res = await executor.query(finalSql, params);

                    let lastId = 0;
                    if (isInsert && res.rows.length > 0) {
                        lastId = res.rows[0].id;
                    }
                    return { changes: res.rowCount, lastInsertRowid: lastId };
                } catch (e) { console.error('PG Run Error:', e.message, finalSql); throw e; }
            }
        };
    }

    prepare(sql) {
        return this._prepareWithExecutor(sql, this.pool);
    }

    // Transaction support
    // Returns the result of the callback
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

    async asyncTransaction(callback) {
        return this.transaction(callback);
    }

    async exec(sql) {
        return this.pool.query(sql);
    }

    async createTables() {
        console.log('🔄 [DB] Syncing Schema...');
        // Add all tables here or ensure migration script runs
        // For brevity, skipping full schema re-dump here as it should be managed by migration files or full initialization
        // but keeping the core ones for stability if this is first run.
        const queries = [
            `CREATE TABLE IF NOT EXISTS cashiers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cashier_number TEXT UNIQUE NOT NULL,
                branch_id INTEGER,
                active INTEGER DEFAULT 1,
                pin_code TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS reconciliations_requests (
                id SERIAL PRIMARY KEY,
                cashier_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                details_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const q of queries) {
            await this.pool.query(q);
        }
    }
}

module.exports = PostgresManager;
