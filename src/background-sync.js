const { app } = require('electron');

const { ipcMain } = require('electron');
const fetch = require('node-fetch');

// Configuration
const REMOTE_URL = 'https://tasfiya-pro-max.onrender.com/api/sync/users'; // Ensure this matches your Render URL
const SYNC_INTERVAL_MS = 30000; // 30 seconds

class BackgroundSync {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.interval = null;
        this.isSyncing = false;
    }

    start() {
        if (this.interval) clearInterval(this.interval);
        console.log('🔄 [SYNC] Background sync started...');
        this.interval = setInterval(() => this.doSync(), SYNC_INTERVAL_MS);
        this.doSync(); // Run immediately on start
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        console.log('⏹️ [SYNC] Background sync stopped.');
    }

    async doSync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const db = this.dbManager.db;

            // 1. Fetch Lookups (Small data, send all at once)
            const admins = db.prepare('SELECT * FROM admins').all();
            const branches = db.prepare('SELECT * FROM branches').all();
            const cashiers = db.prepare('SELECT * FROM cashiers').all();
            const accountants = db.prepare('SELECT * FROM accountants').all();
            const atms = db.prepare('SELECT * FROM atms').all();

            await this.sendPayload({ admins, branches, cashiers, accountants, atms });

            // 2. Fetch & Send Reconciliations (Chunked) - ALL History
            const reconciliations = db.prepare("SELECT * FROM reconciliations WHERE status = 'completed' ORDER BY id DESC").all();
            await this.sendInBatches('reconciliations', reconciliations, 200);

            // 3. Fetch & Send Details (Chunked) - Independent Full History
            const manual_postpaid_sales = db.prepare('SELECT * FROM manual_postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('manual_postpaid_sales', manual_postpaid_sales, 500);

            const manual_customer_receipts = db.prepare('SELECT * FROM manual_customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('manual_customer_receipts', manual_customer_receipts, 500);

            const postpaid_sales = db.prepare('SELECT * FROM postpaid_sales ORDER BY id DESC').all();
            await this.sendInBatches('postpaid_sales', postpaid_sales, 500);

            const customer_receipts = db.prepare('SELECT * FROM customer_receipts ORDER BY id DESC').all();
            await this.sendInBatches('customer_receipts', customer_receipts, 500);

            // 4. Fetch Details Linked to Reconciliations (Optional optimization: only sync relevant ones, but full sync is safer)
            // For now, let's sync ALL cash/bank receipts too, to ensure reports work fully
            const cash_receipts = db.prepare('SELECT * FROM cash_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('cash_receipts', cash_receipts, 500);

            const bank_receipts = db.prepare('SELECT * FROM bank_receipts ORDER BY id DESC LIMIT 10000').all();
            await this.sendInBatches('bank_receipts', bank_receipts, 500);

            console.log('✅ [SYNC] Full sync completed successfully');

        } catch (error) {
            console.error('⚠️ [SYNC] Error:', error.message);
        } finally {
            this.isSyncing = false;
        }
    }

    // Helper: Send a specific payload
    async sendPayload(payload) {
        // Filter out empty arrays to save bandwidth
        const dataToSend = {};
        let hasData = false;
        for (const key in payload) {
            if (payload[key] && payload[key].length > 0) {
                dataToSend[key] = payload[key];
                hasData = true;
            }
        }
        if (!hasData) return;

        try {
            const res = await fetch(REMOTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });
            if (!res.ok) throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
            // console.log(`📤 [SYNC] Sent ${Object.keys(dataToSend).join(', ')}`);
        } catch (e) {
        } else {
            console.error('❌ [SYNC] Error:', e.message);
        }
    }
}

// Run immediately once
doSync();

// Schedule
setInterval(doSync, SYNC_INTERVAL_MS);
}

module.exports = { startBackgroundSync };
