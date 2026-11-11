'use strict';
const fs = require('node:fs');
const path = require('node:path');

async function run(targetRoot, configPath) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    const url = new URL(config.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new Error('Local PostgreSQL configuration required');
    }
    const Db = require(path.join(targetRoot, 'src', 'postgres-database.js'));
    const db = new Db(config.databaseUrl);
    try {
        await db.pool.query('ALTER TABLE bank_receipts ADD COLUMN IF NOT EXISTS balance_number TEXT');
        console.log('Bank balance number column is ready');
    } finally {
        await db.pool.end();
    }
}

run(...process.argv.slice(2)).catch(error => {
    console.error(`Schema update failed: ${String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[DATABASE_URL HIDDEN]')}`);
    process.exitCode = 1;
});
