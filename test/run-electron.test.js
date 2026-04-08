const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDependencySignature,
  isTruthy
} = require('../scripts/run-electron');

test('run-electron helpers stay deterministic enough for startup checks', () => {
  assert.equal(isTruthy('1'), true);
  assert.equal(isTruthy('true'), true);
  assert.equal(isTruthy('off'), false);

  const signature = buildDependencySignature();
  assert.equal(typeof signature, 'string');
  assert.match(signature, /^[a-f0-9]{40}$/);
});
