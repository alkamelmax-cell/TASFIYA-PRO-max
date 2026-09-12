const assert = require('assert');
const { buildPdfContentDisposition } = require('./report-pdf-templates');

function run() {
    const header = buildPdfContentDisposition(
        'inline',
        'كشف-حساب-الكاشير-رحال-2026-09-12.pdf',
        'customer-ledger-الكاشير-رحال.pdf'
    );

    assert.match(header, /^inline; filename="[ -~]+\.pdf"; filename\*=UTF-8''/);
    assert(!/[^\x00-\x7F]/.test(header.split('; filename*=')[0]));
    assert(header.includes('%D9%83%D8%B4%D9%81'));

    console.log('PDF content-disposition tests passed');
}

run();
