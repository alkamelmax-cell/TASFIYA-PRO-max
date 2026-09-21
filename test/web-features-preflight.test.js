const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Server = require('../src/local-server');

function fixture({ host = '127.0.0.1', failReport = '', empty = false } = {}) {
    const calls = [];
    let readOnly = false;
    const buffer = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1200)]);
    const report = () => ({ buffer, fileName: 'تقرير.pdf', fallbackFileName: 'report.pdf', etag: '"test"' });
    const client = {
        async query(sql) {
            calls.push(sql);
            if (sql === 'SET default_transaction_read_only = on') { readOnly = true; return {}; }
            if (sql === "SET statement_timeout = '30s'") return {};
            if (sql === 'SHOW default_transaction_read_only') return { rows: [{ default_transaction_read_only: readOnly ? 'on' : 'off' }] };
            assert(readOnly);
            assert.match(sql, /^SELECT /);
            return { rows: empty ? [] : [{ id: 1, date: '2026-09-21', customer_name: 'عميل' }] };
        },
        release() { calls.push('release'); }
    };
    class Db {
        constructor() { this.pool = { connect: async () => client, end: async () => calls.push('end') }; }
        initialize() { throw new Error('Forbidden: preflight must never initialize/migrate the database'); }
    }
    class FakeServer {
        constructor() {
            const get = async label => {
                assert(readOnly);
                calls.push(label);
                if (failReport === label) throw new Error('Missing database column');
                return report();
            };
            this.reconciliationPdfService = { getReport: () => get('reconciliation'), close: async () => {} };
            this.operationalReportsPdfService = { getReport: label => get(label), close: async () => {} };
            this.reportPdfRenderer = { renderCustomerLedger: async () => { await get('ledger'); return buffer; } };
            this.sendPdfBuffer = Server.prototype.sendPdfBuffer;
        }
        async loadCustomerLedgerData() { assert(readOnly); return []; }
    }
    const resultModule = { exports: {} };
    const mockedRequire = name => {
        if (name === 'node:fs') return { readFileSync: () => JSON.stringify({ databaseUrl: `postgresql://user:secret@${host}/tasfiya` }) };
        if (name.endsWith('postgres-database.js')) return Db;
        if (name.endsWith('local-server.js')) return FakeServer;
        return require(name);
    };
    const context = { require: mockedRequire, module: resultModule, process: { env: {} }, Buffer, URL, console: { log() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/check-web-features.cjs'), 'utf8'), context);
    return { api: resultModule.exports, calls };
}

test('preflight tests four PDF types with read-only DB and closes its connection', async () => {
    const { api, calls } = fixture();
    await api.run('target', 'candidate', 'config');
    for (const report of ['reconciliation', 'atm', 'cashbox', 'ledger']) assert(calls.includes(report));
    assert.deepEqual(calls.slice(-2), ['release', 'end']);
});

test('schema/report failure rejects promotion and releases the database', async () => {
    const { api, calls } = fixture({ failReport: 'atm' });
    await assert.rejects(api.run('target', 'candidate', 'config'), /Missing database column/);
    assert.deepEqual(calls.slice(-2), ['release', 'end']);
    assert(!calls.includes('ledger'));
});

test('remote DB is rejected before connecting', async () => {
    const { api, calls } = fixture({ host: 'example.com' });
    await assert.rejects(api.run('target', 'candidate', 'config'), /Local PostgreSQL/);
    assert.deepEqual(calls, []);
});

test('empty restored database cannot pass report validation', async () => {
    const { api, calls } = fixture({ empty: true });
    await assert.rejects(api.run('target', 'candidate', 'config'), /No reconciliation found/);
    assert.deepEqual(calls.slice(-2), ['release', 'end']);
});
