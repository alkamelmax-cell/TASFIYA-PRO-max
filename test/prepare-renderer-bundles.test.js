const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSkipReason,
  isWebDeploymentEnvironment,
  runRendererBundlePreparation
} = require('../scripts/prepare-renderer-bundles');

test('renderer bundle prep is skipped in deployment environments', () => {
  assert.equal(isWebDeploymentEnvironment({ DATABASE_URL: 'postgres://example' }), true);
  assert.match(
    getSkipReason({ DATABASE_URL: 'postgres://example' }),
    /web deployment environment/i
  );
});

test('renderer bundle prep exits cleanly when skipped', () => {
  const exitCode = runRendererBundlePreparation({
    env: { DATABASE_URL: 'postgres://example' },
    stdio: 'pipe'
  });

  assert.equal(exitCode, 0);
});
