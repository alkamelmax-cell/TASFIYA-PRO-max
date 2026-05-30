const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootstrapWebServer,
  initializeDatabaseWithRetry
} = require('../src/start-web');

test('initializeDatabaseWithRetry retries until the database becomes ready', async () => {
  let attempts = 0;
  const events = [];

  const dbManager = {
    async initialize() {
      attempts += 1;
      return attempts >= 3;
    }
  };

  const webServer = {
    setDatabaseReady(metadata) {
      events.push({ type: 'ready', metadata });
    },
    setDatabaseUnavailable(error, status) {
      events.push({ type: 'unavailable', status, message: error && error.message });
    },
    async ensureIndexes() {
      events.push({ type: 'indexes' });
    }
  };

  await initializeDatabaseWithRetry({
    dbManager,
    webServer,
    databaseMode: 'postgres',
    retryDelayMs: 0,
    maxAttempts: 3,
    logger: {
      log() { },
      error() { }
    }
  });

  assert.equal(attempts, 3);
  assert.ok(events.some((event) => event.type === 'ready'));
  assert.ok(events.some((event) => event.type === 'indexes'));
});

test('initializeDatabaseWithRetry reports the original database initialization error', async () => {
  const quotaError = new Error('database quota exceeded');
  const events = [];

  const dbManager = {
    lastInitializationError: quotaError,
    async initialize() {
      return false;
    }
  };

  const webServer = {
    setDatabaseReady() { },
    setDatabaseUnavailable(error, status) {
      events.push({ status, message: error && error.message });
    },
    async ensureIndexes() { }
  };

  await assert.rejects(
    () => initializeDatabaseWithRetry({
      dbManager,
      webServer,
      databaseMode: 'postgres',
      retryDelayMs: 0,
      maxAttempts: 1,
      logger: {
        log() { },
        error() { }
      }
    }),
    /database quota exceeded/
  );

  assert.deepEqual(events, [{ status: 'failed', message: 'database quota exceeded' }]);
});

test('bootstrapWebServer starts listening before postgres initialization finishes', async () => {
  let initializeCalls = 0;
  let started = false;
  let markedReady = false;

  const fakeWebServer = {
    port: 10000,
    async start() {
      started = true;
    },
    setDatabaseReady() {
      markedReady = true;
    },
    setDatabaseUnavailable() { },
    async ensureIndexes() { }
  };

  const result = await bootstrapWebServer({
    env: {
      DATABASE_URL: 'postgres://example',
      PORT: '10000'
    },
    createDbManager() {
      return {
        databaseMode: 'postgres',
        dbManager: {
          pool: {},
          async initialize() {
            initializeCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 25));
            return true;
          }
        }
      };
    },
    createWebServer() {
      return fakeWebServer;
    },
    logger: {
      log() { },
      error() { }
    },
    retryDelayMs: 0
  });

  assert.equal(started, true);
  assert.equal(markedReady, false);

  await result.databaseInitPromise;

  assert.equal(initializeCalls, 1);
  assert.equal(markedReady, true);
});
