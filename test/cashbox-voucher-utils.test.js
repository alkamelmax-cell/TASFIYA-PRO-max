const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCashboxVoucherLabel,
  getCashboxVoucherChangedFields,
  buildCashboxVoucherAuditNote
} = require('../src/app/cashbox-voucher-utils');

test('buildCashboxVoucherLabel prefers independent sequence number with fallback', () => {
  assert.equal(buildCashboxVoucherLabel('receipt', 5, 99), 'قبض-000005');
  assert.equal(buildCashboxVoucherLabel('payment', null, 12), 'صرف-000012');
});

test('getCashboxVoucherChangedFields returns Arabic field labels for changed values', () => {
  const changedFields = getCashboxVoucherChangedFields(
    {
      branch_id: 1,
      counterparty_type: 'cashier',
      counterparty_name: 'أحمد',
      cashier_id: 10,
      amount: 200,
      voucher_date: '2026-03-25',
      reference_no: 'R1',
      description: 'قديم'
    },
    {
      branchId: 2,
      counterpartyName: 'محمد',
      cashierId: 11,
      amount: 250,
      voucherDate: '2026-03-26',
      referenceNo: 'R2',
      description: 'جديد'
    }
  );

  assert.deepEqual(changedFields, ['الفرع', 'الكاشير', 'المبلغ', 'التاريخ', 'المرجع', 'البيان']);
});

test('buildCashboxVoucherAuditNote builds readable audit messages', () => {
  assert.equal(
    buildCashboxVoucherAuditNote({
      actionType: 'create',
      voucherType: 'receipt',
      voucherSequenceNumber: 3
    }),
    'إنشاء سند قبض قبض-000003'
  );

  assert.equal(
    buildCashboxVoucherAuditNote({
      actionType: 'delete',
      voucherType: 'payment',
      voucherSequenceNumber: 7
    }),
    'حذف سند صرف صرف-000007'
  );

  assert.match(
    buildCashboxVoucherAuditNote({
      actionType: 'update',
      voucherType: 'receipt',
      voucherSequenceNumber: 8,
      previousVoucher: {
        branch_id: 1,
        counterparty_type: 'cashier',
        counterparty_name: 'أحمد',
        cashier_id: 10,
        amount: 100,
        voucher_date: '2026-03-25',
        reference_no: '',
        description: ''
      },
      nextValues: {
        branchId: 1,
        counterpartyName: 'أحمد',
        cashierId: 10,
        amount: 150,
        voucherDate: '2026-03-26',
        referenceNo: 'R5',
        description: ''
      }
    }),
    /تعديل سند قبض قبض-000008: المبلغ، التاريخ، المرجع/
  );
});
