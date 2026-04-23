const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashSecret,
  hashSecretIfNeeded,
  isHashedSecret,
  verifySecret
} = require('../src/security/auth-service');

test('hashSecret produces a verifiable scrypt hash', () => {
  const hashed = hashSecret('secret123');

  assert.match(hashed, /^scrypt\$/);
  assert.equal(isHashedSecret(hashed), true);
  assert.deepEqual(verifySecret(hashed, 'secret123'), {
    ok: true,
    needsRehash: false
  });
});

test('verifySecret supports legacy plain-text values and flags rehash', () => {
  assert.deepEqual(verifySecret('legacy-pass', 'legacy-pass'), {
    ok: true,
    needsRehash: true
  });
  assert.deepEqual(verifySecret('legacy-pass', 'wrong-pass'), {
    ok: false,
    needsRehash: true
  });
});

test('hashSecretIfNeeded keeps existing hashes intact', () => {
  const hashed = hashSecret('pin1234');
  assert.equal(hashSecretIfNeeded(hashed), hashed);
});
