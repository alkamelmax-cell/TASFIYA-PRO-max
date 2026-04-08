const LocalWebServer = require('./local-server');

function normalizePort(value, fallback = 4000) {
    const port = Number(value);
    return Number.isFinite(port) ? port : fallback;
}

function normalizeRetryDelay(value, fallback = 5000) {
    const delay = Number(value);
    return Number.isFinite(delay) && delay >= 0 ? delay : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDbManagerFromEnv(env = process.env) {
    if (env.DATABASE_URL) {
        console.log('🌍 Deployment detected: Using Neon PostgreSQL');
        const PostgresManager = require('./postgres-database');
        return {
            dbManager: new PostgresManager(env.DATABASE_URL),
            databaseMode: 'postgres'
        };
    }

    console.log('📂 Local mode: Using SQLite');
    const DatabaseManager = require('./database');
    return {
        dbManager: new DatabaseManager(),
        databaseMode: 'sqlite'
    };
}

function shouldRetryDatabaseInitialization({ databaseMode, env = process.env }) {
    return databaseMode === 'postgres' && Boolean(env.DATABASE_URL);
}

async function initializeDatabaseWithRetry(options) {
    const {
        dbManager,
        webServer,
        databaseMode,
        retryDelayMs = 5000,
        maxAttempts = 1,
        logger = console
    } = options;

    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt += 1;

        try {
            logger.log(`🔄 [DB] Initializing ${databaseMode} database (attempt ${attempt})...`);

            const initialized = await dbManager.initialize();
            if (!initialized) {
                throw new Error(`Failed to initialize ${databaseMode} database`);
            }

            webServer.setDatabaseReady({ status: 'ready' });
            await webServer.ensureIndexes();

            logger.log(`✅ [DB] ${databaseMode} database is ready`);
            return true;
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            const nextStatus = attempt >= maxAttempts ? 'failed' : 'retrying';
            webServer.setDatabaseUnavailable(normalizedError, nextStatus);
            logger.error(`⚠️ [DB] Initialization attempt ${attempt} failed: ${normalizedError.message}`);

            if (attempt >= maxAttempts) {
                throw normalizedError;
            }

            logger.log(`⏳ [DB] Retrying database initialization in ${retryDelayMs}ms...`);
            await sleep(retryDelayMs);
        }
    }

    return false;
}

async function bootstrapWebServer(options = {}) {
    const env = options.env || process.env;
    const createDbManager = options.createDbManager || createDbManagerFromEnv;
    const createWebServer = options.createWebServer || ((dbManager, port, serverOptions) => new LocalWebServer(dbManager, port, serverOptions));
    const logger = options.logger || console;

    const { dbManager, databaseMode } = createDbManager(env);
    const port = normalizePort(env.PORT, 4000);
    const host = env.HOST || '0.0.0.0';
    const retryDelayMs = options.retryDelayMs !== undefined
        ? options.retryDelayMs
        : normalizeRetryDelay(env.DB_INIT_RETRY_MS, 5000);
    const retryInBackground = shouldRetryDatabaseInitialization({ databaseMode, env });
    const maxAttempts = options.maxAttempts !== undefined
        ? options.maxAttempts
        : (retryInBackground ? Number.POSITIVE_INFINITY : 1);

    const webServer = createWebServer(dbManager, port, {
        host,
        explicitPort: Boolean(env.PORT),
        databaseReady: false
    });

    await webServer.start();

    logger.log(`🚀 Web Server listening on ${host}:${webServer.port}`);
    logger.log(`📂 Working Directory: ${process.cwd()}`);

    const databaseInitPromise = initializeDatabaseWithRetry({
        dbManager,
        webServer,
        databaseMode,
        retryDelayMs,
        maxAttempts,
        logger
    });

    if (!retryInBackground) {
        await databaseInitPromise;
    } else {
        databaseInitPromise.catch((error) => {
            logger.error('❌ [DB] Background database initialization stopped unexpectedly:', error);
        });
    }

    return {
        dbManager,
        webServer,
        databaseMode,
        databaseInitPromise
    };
}

if (require.main === module) {
    bootstrapWebServer().catch((error) => {
        console.error('❌ Startup Error:', error);
        process.exit(1);
    });
}

module.exports = {
    bootstrapWebServer,
    createDbManagerFromEnv,
    initializeDatabaseWithRetry,
    normalizePort,
    normalizeRetryDelay,
    shouldRetryDatabaseInitialization,
    sleep
};
