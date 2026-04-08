const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldUseWebServer } = require('../scripts/run-app');

test('run-app uses web server for deployment-style env vars', () => {
  assert.equal(shouldUseWebServer({ PORT: '10000' }), true);
  assert.equal(shouldUseWebServer({ DATABASE_URL: 'postgres://example' }), true);
  assert.equal(shouldUseWebServer({ RENDER: 'true' }), true);
});

test('run-app falls back to desktop when no web env vars are present', () => {
  assert.equal(shouldUseWebServer({}), false);
});
