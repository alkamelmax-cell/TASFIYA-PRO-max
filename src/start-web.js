const LocalWebServer = require('./local-server');

(async () => {
    try {
        let dbManager;

        // Check for Neon/Postgres Connection String
        if (process.env.DATABASE_URL) {
            console.log('🌍 Deployment detected: Using Neon PostgreSQL');
            const PostgresManager = require('./postgres-database');
            dbManager = new PostgresManager(process.env.DATABASE_URL);
        } else {
            console.log('📂 Local mode: Using SQLite');
            const DatabaseManager = require('./database');
            dbManager = new DatabaseManager();
        }

        // Initialize (Await is safe for both: Async for PG, Sync value for SQLite)
        const dbInitialized = await dbManager.initialize();

        if (!dbInitialized) {
            console.error('❌ Failed to initialize database. Exiting.');
            process.exit(1);
        }

        // Get Port from Environment (Render uses PORT env var)
        const port = process.env.PORT || 4000;

        // Initialize Web Server
        const webServer = new LocalWebServer(dbManager, port);

        // Start Server
        webServer.start();

        console.log(`🚀 Web Server running on port ${port}`);
        console.log(`📂 Working Directory: ${process.cwd()}`);

    } catch (error) {
        console.error('❌ Startup Error:', error);
        process.exit(1);
    }
})();
