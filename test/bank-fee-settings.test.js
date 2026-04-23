const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBankFeeSettings,
  parseStoredBankFeeSettings,
  findMatchingBankFeeRule,
  calculateBankFeeBreakdown
} = require('../src/app/bank-fee-settings');

test('normalizeBankFeeSettings keeps only meaningful fee rules', () => {
  const settings = normalizeBankFeeSettings({
    rules: [
      { bank_name: '', operation_type: '', fee_percent: '', fee_vat_percent: '' },
      { bank_name: 'الراجحي', operation_type: 'mada', fee_percent: '1.5', fee_vat_percent: '15' }
    ]
  });

  assert.equal(settings.rules.length, 1);
  assert.equal(settings.rules[0].bank_name, 'الراجحي');
  assert.equal(settings.rules[0].operation_type, 'مدى');
  assert.equal(settings.rules[0].fee_percent, 1.5);
  assert.equal(settings.rules[0].fee_vat_percent, 15);
});

test('parseStoredBankFeeSettings parses JSON safely', () => {
  const parsed = parseStoredBankFeeSettings('{"rules":[{"bank_name":"الأهلي","operation_type":"فيزا","fee_percent":2.25,"fee_vat_percent":15}]}');

  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0].bank_name, 'الأهلي');
  assert.equal(parsed.rules[0].operation_type, 'فيزا');
  assert.equal(parseStoredBankFeeSettings('{bad json}').rules.length, 0);
});

test('findMatchingBankFeeRule prefers the most specific bank and operation rule', () => {
  const settings = normalizeBankFeeSettings({
    rules: [
      { bank_name: '', operation_type: 'مدى', fee_percent: 1.0, fee_vat_percent: 15 },
      { bank_name: 'الراجحي', operation_type: '', fee_percent: 1.1, fee_vat_percent: 15 },
      { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: 1.2, fee_vat_percent: 15 }
    ]
  });

  const matched = findMatchingBankFeeRule('مصرف الراجحي', 'مدى', settings);
  assert.equal(matched.fee_percent, 1.2);
});

test('findMatchingBankFeeRule matches mixed Arabic and English operation labels from web app', () => {
  const settings = normalizeBankFeeSettings({
    rules: [
      { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: 1.25, fee_vat_percent: 15 },
      { bank_name: 'الأهلي', operation_type: 'فيزا', fee_percent: 2.1, fee_vat_percent: 15 }
    ]
  });

  const madaMatched = findMatchingBankFeeRule('مصرف الراجحي', 'مدى(mada)', settings);
  const visaMatched = findMatchingBankFeeRule('البنك الأهلي', 'Visa (فيزا)', settings);

  assert.equal(madaMatched.fee_percent, 1.25);
  assert.equal(visaMatched.fee_percent, 2.1);
});

test('calculateBankFeeBreakdown computes fee, VAT and net amount', () => {
  const breakdown = calculateBankFeeBreakdown(1000, 'الراجحي', 'فيزا', {
    rules: [
      { bank_name: 'الراجحي', operation_type: 'فيزا', fee_percent: 2.5, fee_vat_percent: 15 }
    ]
  });

  assert.equal(breakdown.grossAmount, 1000);
  assert.equal(breakdown.feeAmount, 25);
  assert.equal(breakdown.feeVatAmount, 3.75);
  assert.equal(breakdown.totalDeductions, 28.75);
  assert.equal(breakdown.netAmount, 971.25);
});

test('calculateBankFeeBreakdown applies fees when operation label contains aliases in parentheses', () => {
  const breakdown = calculateBankFeeBreakdown(100, 'الراجحي', 'مدى(mada)', {
    rules: [
      { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: 1.5, fee_vat_percent: 15 }
    ]
  });

  assert.equal(breakdown.feePercent, 1.5);
  assert.equal(breakdown.feeAmount, 1.5);
  assert.equal(breakdown.feeVatAmount, 0.23);
  assert.equal(breakdown.netAmount, 98.27);
});

test('normalizeBankFeeSettings preserves small percentage values without forcing two decimals', () => {
  const settings = normalizeBankFeeSettings({
    rules: [
      { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: '0.008', fee_vat_percent: '15' }
    ]
  });

  assert.equal(settings.rules[0].fee_percent, 0.008);
  assert.equal(settings.rules[0].fee_vat_percent, 15);
});
