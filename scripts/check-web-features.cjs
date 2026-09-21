'use strict';
// No migrations, HTTP listener or accounting writes in this preflight.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function readConfig(configPath) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    const url = new URL(config.databaseUrl);
    assert(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL configuration required');
    assert(['127.0.0.1', '[::1]'].includes(url.hostname), 'Local PostgreSQL configuration required');
    return config;
}

function checkPdf(server, report, label) {
    assert(Buffer.isBuffer(report.buffer), `${label}: missing PDF buffer`);
    assert.equal(report.buffer.subarray(0, 5).toString(), '%PDF-', `${label}: invalid PDF`);
    assert(report.buffer.length > 1000, `${label}: incomplete PDF`);
    let delivered = false;
    server.sendPdfBuffer({ method: 'GET', headers: {} }, {
        writeHead(status, headers) {
            assert.equal(status, 200);
            // Node rejects raw Arabic in HTTP headers; test the actual delivery path.
            for (const [key, value] of Object.entries(headers)) require('node:http').validateHeaderValue(key, value);
            assert.equal(headers['Content-Type'], 'application/pdf');
        },
        end(buffer) { assert.equal(buffer, report.buffer); delivered = true; }
    }, report);
    assert(delivered);
    console.log(`PASS ${label}: PDF and HTTP headers (${report.buffer.length} bytes)`);
}

async function run(targetRoot, candidateRoot, configPath) {
    const config = readConfig(configPath);
    process.env.DATABASE_URL = config.databaseUrl;
    const Db = require(path.join(targetRoot, 'src', 'postgres-database.js'));
    const Server = require(path.join(candidateRoot, 'src', 'local-server.js'));
    const db = new Db(config.databaseUrl);
    const originalPool = db.pool;
    let client;
    let server;
    try {
        client = await originalPool.connect();
        await client.query('SET default_transaction_read_only = on');
        await client.query("SET statement_timeout = '30s'");
        assert.equal((await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
        // All existing adapter queries must use this read-only session.
        db.pool = { query: client.query.bind(client) };
        server = new Server(db, 0);
        const latest = (await client.query('SELECT id, reconciliation_date::date::text AS date FROM reconciliations ORDER BY reconciliation_date DESC, id DESC LIMIT 1')).rows[0];
        assert(latest, 'No reconciliation found: cannot validate migrated reports');
        checkPdf(server, await server.reconciliationPdfService.getReport(latest.id), 'reconciliation');
        const query = { dateFrom: latest.date, dateTo: latest.date };
        for (const type of ['atm', 'cashbox']) {
            checkPdf(server, await server.operationalReportsPdfService.getReport(type, query), type);
        }
        const customer = (await client.query("SELECT customer_name FROM postpaid_sales WHERE NULLIF(TRIM(customer_name), '') IS NOT NULL ORDER BY id DESC LIMIT 1")).rows[0];
        assert(customer, 'No customer found: cannot validate customer ledger');
        const rows = await server.loadCustomerLedgerData({ customerName: customer.customer_name, ...query });
        const buffer = await server.reportPdfRenderer.renderCustomerLedger({ customerName: customer.customer_name, ...query, rows });
        checkPdf(server, {
            buffer, fileName: 'كشف-حساب-اختبار.pdf', fallbackFileName: 'customer-ledger.pdf',
            etag: '"preflight"'
        }, 'customer-ledger');
        console.log('PASS local database and all four report types (read-only checks)');
    } finally {
        if (server) {
            await server.reconciliationPdfService.close();
            await server.operationalReportsPdfService.close();
        }
        if (client) client.release(true);
        await originalPool.end();
    }
}

if (require.main === module) {
    const timer = setTimeout(() => { console.error('Preflight timed out; live server was not changed.'); process.exit(1); }, 180000);
    run(...process.argv.slice(2)).catch(error => {
        console.error(`PREFLIGHT FAILED: ${String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[DATABASE_URL HIDDEN]')}`);
        process.exitCode = 1;
    }).finally(() => clearTimeout(timer));
}
module.exports = { readConfig, checkPdf, run };
