const test = require('node:test');
const assert = require('node:assert/strict');
const ThermalPrinter80mm = require('../src/thermal-printer-80mm');

test('thermal postpaid balances table uses fixed compact columns', () => {
  const printer = new ThermalPrinter80mm();
  printer.updateSettings({ fontSize: 9, fontName: 'Courier New' });

  const html = printer.generateReceiptHTML({
    reconciliation: {},
    branch: { branch_name: 'فرع الاختبار' },
    customText: JSON.stringify({
      isStructuredStatement: true,
      statementType: 'postpaid_net_balances',
      title: 'تقرير صافي أرصدة العملاء الآجلة',
      companyName: 'شركة اختبار',
      printDate: '07/04/2026',
      branchLabel: 'جميع الفروع',
      cashierLabel: 'جميع الكاشير',
      filterInfo: '',
      tableData: [
        {
          customerName: 'عميل طويل الاسم جدا جدا',
          netBalance: 24719
        }
      ],
      summary: {
        totalCustomers: 1,
        totalPostpaid: 24719,
        totalReceipts: 0,
        totalNetBalance: 24719
      }
    }),
    isCustomerStatement: true
  });

  assert.match(html, /<table class="net-balances-table">/);
  assert.match(html, /<th class="amount-group-head" colspan="2">المبالغ<\/th>/);
  assert.match(html, /<th class="amount-head debit-head">مدين<\/th>/);
  assert.match(html, /<th class="amount-head credit-head">دائن<\/th>/);
  assert.match(html, /border-right: 2px solid #000 !important;/);
  assert.match(html, /white-space: nowrap;/);
  assert.match(html, /font-variant-numeric: tabular-nums;/);
  assert.match(html, /page-break-inside: auto;/);
  assert.match(html, /24,719\.00/);
  assert.match(html, /summary-value/);
  assert.match(html, /max-width: 24mm;/);
});

test('thermal postpaid balances report estimates taller page height for long tables', () => {
  const printer = new ThermalPrinter80mm();
  printer.updateSettings({ fontSize: 9 });

  const shortHeight = printer.estimateThermalPageHeightMicrons({
    isCustomerStatement: true,
    customText: JSON.stringify({
      isStructuredStatement: true,
      statementType: 'postpaid_net_balances',
      tableData: [
        { customerName: 'عميل قصير', netBalance: 100 }
      ],
      summary: { totalCustomers: 1 }
    })
  });

  const longHeight = printer.estimateThermalPageHeightMicrons({
    isCustomerStatement: true,
    customText: JSON.stringify({
      isStructuredStatement: true,
      statementType: 'postpaid_net_balances',
      tableData: Array.from({ length: 45 }, (_, index) => ({
        customerName: `عميل طويل جدًا للاختبار رقم ${index + 1} ويحتاج أكثر من سطر`,
        netBalance: 1000 + index
      })),
      summary: { totalCustomers: 45 }
    })
  });

  assert.equal(shortHeight, 297000);
  assert.ok(longHeight > shortHeight);
});
