const assert = require('node:assert/strict');
const test = require('node:test');
const LocalWebServer = require('../src/local-server');

function response() {
    return { statusCode: 0, headers: {}, body: null, writeHead(code, headers = {}) { this.statusCode = code; this.headers = headers; }, end(body) { this.body = body; } };
}

test('serves an operational PDF inline with byte-viewer headers', async () => {
    const server = new LocalWebServer({ db: { prepare() { throw new Error('unexpected database call'); } } });
    const buffer = Buffer.from('%PDF-1.4\nreport\n%%EOF');
    server.operationalReportsPdfService = { async getReport() { return { buffer, etag: '"etag"', cacheStatus: 'MISS', fileName: 'تقرير.pdf', fallbackFileName: 'tasfiya-atm-report.pdf' }; }, async close() {} };
    const res = response();
    await server.handleGetOperationalReportPdf({ method: 'GET', headers: {} }, res, 'atm', {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/pdf');
    assert.equal(res.headers['Accept-Ranges'], 'bytes');
    assert.match(res.headers['Content-Disposition'], /^inline;/);
    assert.deepEqual(res.body, buffer);
});
