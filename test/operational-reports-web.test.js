const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', 'src', 'web-dashboard');

test('ATM and cashbox pages include view and share actions', () => {
    for (const file of ['atm-reports.html', 'cashbox-reports.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(html, /pdf-document-client\.js/);
        assert.match(html, /operational-report-share\.js/);
        assert.match(html, />\s*عرض PDF\s*</);
        assert.match(html, />\s*مشاركة\s*</);
    }
});

test('operational PDF client is network-first in the service worker', () => {
    const source = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    assert.match(source, /operational-report-share\.js/);
    assert.match(source, /v4\.15-operational-pdf/);
});
