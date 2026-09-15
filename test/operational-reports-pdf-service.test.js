const assert = require('node:assert/strict');
const test = require('node:test');
const { OperationalReportsPdfService } = require('../src/operational-reports-pdf-service');

function dbManager() {
    return { db: { prepare(sql) { return {
        async all() {
            if (sql.includes('FROM bank_receipts')) return [{ amount: 125.5, operation_type: 'مدى', reconciliation_date: '2026-09-15', reconciliation_number: 88, atm_name: 'جهاز 1', bank_name: 'الراجحي', branch_name: 'الرئيسي', cashier_name: 'أحمد' }];
            if (sql.includes('FROM cashbox_vouchers')) return [{ voucher_display_number: 15, voucher_type: 'receipt', voucher_date: '2026-09-15', branch_name: 'الرئيسي', counterparty_name: 'عميل', amount: 300, reference_no: 'R-1', description: 'قبض', created_by: 'admin' }];
            return [];
        },
        async get() {
            if (sql.includes('FROM branch_cashboxes')) return { total_opening: 1000 };
            if (sql.includes('FROM system_settings')) return { setting_value: 'شركة الاختبار' };
            return null;
        }
    }; } } };
}

test('builds ATM and cashbox reports through the shared vector renderer', async () => {
    const payloads = [];
    const renderer = { async renderOperationalReport(payload) { payloads.push(payload); return Buffer.from('%PDF-1.4\nreport\n%%EOF'); } };
    const service = new OperationalReportsPdfService(dbManager(), { pdfRenderer: renderer });

    const atm = await service.getReport('atm', { operationType: 'mada' });
    const cashbox = await service.getReport('cashbox', {});

    assert.equal(atm.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(cashbox.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.match(atm.fileName, /تقرير-الصراف/);
    assert.match(cashbox.fileName, /تقرير-الصناديق/);
    assert.equal(payloads[0].summary.total, 125.5);
    assert.equal(payloads[1].summary.currentBalance, 1300);
});
