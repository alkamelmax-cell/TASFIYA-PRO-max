const test = require('node:test');
const assert = require('node:assert/strict');

const { mapDbErrorMessage } = require('../src/app/db-error-messages');

test('mapDbErrorMessage translates invalid printer device error', () => {
  const result = mapDbErrorMessage('Invalid deviceName provided');
  assert.equal(
    result,
    'اسم الطابعة المحدد غير صالح أو غير متصل. اختر طابعة متاحة أو اترك الاختيار على الطابعة الافتراضية.'
  );
});
