const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeCashboxReport,
  prepareCashboxReportExcelData,
  buildCashboxReportHtml
} = require('../src/app/cashbox-report-utils');

test('summarizeCashboxReport calculates totals and closing balance', () => {
  const summary = summarizeCashboxReport({
    openingBalance: 100,
    vouchers: [
      { voucher_type: 'receipt', amount: 50 },
      { voucher_type: 'payment', amount: 20 },
      { voucher_type: 'receipt', amount: '30.5' }
    ]
  });

  assert.equal(summary.vouchersCount, 3);
  assert.equal(summary.openingBalance, 100);
  assert.equal(summary.totalReceipts, 80.5);
  assert.equal(summary.totalPayments, 20);
  assert.equal(summary.netMovement, 60.5);
  assert.equal(summary.closingBalance, 160.5);
});

test('prepareCashboxReportExcelData includes voucher rows and summary metadata', () => {
  const excelData = prepareCashboxReportExcelData({
    vouchers: [
      {
        voucher_number: 7,
        voucher_type: 'receipt',
        branch_name: 'الرياض',
        cashbox_name: 'صندوق الرياض',
        counterparty_name: 'أحمد',
        voucher_date: '2026-03-25',
        reference_no: 'REF-7',
        description: 'توريد نقدي',
        amount: 250,
        created_by: 'admin'
      }
    ],
    summary: {
      vouchersCount: 1,
      openingBalance: 100,
      totalReceipts: 250,
      totalPayments: 0,
      netMovement: 250,
      closingBalance: 350
    },
    meta: [
      { label: 'الفرع', value: 'الرياض' }
    ]
  });

  assert.equal(excelData.headers[0], 'رقم السند');
  assert.equal(excelData.rows[0][0], 'قبض-000007');
  assert.ok(excelData.rows.some((row) => row[0] === 'إجمالي القبض' && row[1] === 250));
  assert.ok(excelData.rows.some((row) => row[0] === 'الفرع' && row[1] === 'الرياض'));
});

test('buildCashboxReportHtml renders report title, company, and escaped details', () => {
  const html = buildCashboxReportHtml({
    title: 'تقرير صندوق الرياض',
    companyName: 'شركة الاختبار',
    reportDate: '25/03/2026',
    summary: {
      vouchersCount: 1,
      openingBalance: 100,
      totalReceipts: 250,
      totalPayments: 0,
      netMovement: 250,
      closingBalance: 350
    },
    meta: [
      { label: 'الفرع', value: 'الرياض' }
    ],
    vouchers: [
      {
        voucher_number: 7,
        voucher_type: 'receipt',
        branch_name: 'الرياض',
        cashbox_name: 'صندوق الرياض',
        counterparty_name: '<أحمد>',
        voucher_date: '2026-03-25',
        reference_no: 'REF-7',
        description: 'توريد نقدي',
        amount: 250,
        created_by: 'admin'
      }
    ],
    formatDate: () => '25/03/2026',
    formatCurrency: (value) => Number(value).toFixed(2)
  });

  assert.match(html, /تقرير صندوق الرياض/);
  assert.match(html, /شركة الاختبار/);
  assert.match(html, /قبض-000007/);
  assert.match(html, /إجمالي الحركات/);
  assert.match(html, /مدين/);
  assert.match(html, /دائن/);
  assert.match(html, /&lt;أحمد&gt;/);
});
