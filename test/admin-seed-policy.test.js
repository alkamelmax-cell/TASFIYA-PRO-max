const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAdminSeedPolicy } = require('../src/security/admin-seed-policy');

test('seeds default admin in development', () => {
  const result = resolveAdminSeedPolicy({ env: { NODE_ENV: 'development' } });
  assert.equal(result.shouldSeed, true);
  assert.equal(result.username, 'admin');
  assert.equal(result.password, 'admin123');
  assert.equal(result.source, 'development-default');
});

test('seeds default admin for unpackaged electron app', () => {
  const result = resolveAdminSeedPolicy({ env: {}, app: { isPackaged: false } });
  assert.equal(result.shouldSeed, true);
  assert.equal(result.source, 'development-default');
});

test('uses bootstrap env credentials in production', () => {
  const result = resolveAdminSeedPolicy({
    env: {
      NODE_ENV: 'production',
      INITIAL_ADMIN_PASSWORD: 'secret',
      INITIAL_ADMIN_USERNAME: 'owner',
      INITIAL_ADMIN_NAME: 'Owner'
    },
    app: { isPackaged: true }
  });

  assert.equal(result.shouldSeed, true);
  assert.equal(result.username, 'owner');
  assert.equal(result.password, 'secret');
  assert.equal(result.name, 'Owner');
  assert.equal(result.source, 'bootstrap-env');
});

test('disables auto seed in production without bootstrap env', () => {
  const result = resolveAdminSeedPolicy({
    env: { NODE_ENV: 'production' },
    app: { isPackaged: true }
  });
  assert.equal(result.shouldSeed, false);
  assert.equal(result.source, 'disabled');
});
