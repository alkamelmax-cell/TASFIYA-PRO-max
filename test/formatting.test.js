const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  arabicToEnglishNumbers,
  getCurrentDate,
  getCurrentDateTime,
  formatDecimal
} = require('../src/app/formatting');

test('formatCurrency returns fixed 2 decimals', () => {
  assert.equal(formatCurrency(10), '10.00');
  assert.equal(formatCurrency('5.2'), '5.20');
  assert.equal(formatCurrency('abc'), '0.00');
});

test('formatDate and formatDateTime use Gregorian dd/mm/yyyy', () => {
  assert.equal(formatDate('2026-02-24T08:15:00.000Z').match(/^\d{2}\/\d{2}\/\d{4}$/) !== null, true);
  assert.equal(formatDateTime('2026-02-24T08:15:00.000Z').match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/) !== null, true);
});

test('format helpers keep english numerals', () => {
  assert.equal(arabicToEnglishNumbers('١٢٣٤٥'), '12345');
  assert.equal(formatNumber(12345), '12,345');
  assert.equal(formatDecimal(1.239, 2), '1.24');
});

test('current date helpers return strings', () => {
  assert.equal(typeof getCurrentDate(), 'string');
  assert.equal(typeof getCurrentDateTime(), 'string');
});
