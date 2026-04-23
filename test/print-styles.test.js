const test = require('node:test');
const assert = require('node:assert/strict');
const { generateNonColoredPrintStyles } = require('../src/app/print-styles');

test('generateNonColoredPrintStyles returns empty string for color printing', () => {
  assert.equal(generateNonColoredPrintStyles(true), '');
});

test('generateNonColoredPrintStyles returns style payload for non-colored printing', () => {
  const css = generateNonColoredPrintStyles(false);
  assert.ok(css.includes('non-colored-print-styles'));
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('.currency'));
});
