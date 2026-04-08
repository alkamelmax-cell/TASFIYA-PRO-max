const test = require('node:test');
const assert = require('node:assert/strict');

const LocalWebServer = require('../src/local-server');

test('health endpoints respond while the database is still initializing', async () => {
  const server = new LocalWebServer({}, 0, {
    host: '127.0.0.1',
    databaseReady: false
  });

  await server.start();
  const address = server.server.address();

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(healthResponse.status, 200);

    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.database.ready, false);
    assert.equal(healthPayload.database.status, 'initializing');

    const readinessResponse = await fetch(`http://127.0.0.1:${address.port}/readyz`);
    assert.equal(readinessResponse.status, 503);
  } finally {
    await server.stop();
  }
});

test('database-backed api requests return 503 until the database becomes ready', async () => {
  const server = new LocalWebServer({}, 0, {
    host: '127.0.0.1',
    databaseReady: false
  });

  await server.start();
  const address = server.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cashiers-list`);
    assert.equal(response.status, 503);

    const payload = await response.json();
    assert.equal(payload.code, 'SERVICE_INITIALIZING');
  } finally {
    await server.stop();
  }
});
