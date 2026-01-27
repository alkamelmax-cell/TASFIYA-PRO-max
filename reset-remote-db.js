const { Pool } = require('pg');

// Render Database Connection String
// ملاحظة: هذا الكود سيعمل محلياً إذا كان لديك المتغير، أو سيتم رفعه وتشغيله هناك.
// للأمان سنستخدم الاتصال المباشر إذا كان متاحاً في البيئة.

async function resetRemoteDatabase() {
    console.log('🚨 Starting Remote Database Factory Reset...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL environment variable is not set correctly.');
        console.log('ℹ️ Usage: You must provide the Render connection string to run this script.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Render
        }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to Database');

        const tablesToClear = [
            'reconciliation_requests',
            'reconciliations',
            'customer_receipts',
            'postpaid_sales',
            'manual_customer_receipts',
            'manual_postpaid_sales',
            'cash_receipts',
            'bank_receipts',
            'return_invoices',
            // 'suppliers', // Optional: Uncomment if you want to clear suppliers too
        ];

        console.log('🧹 Clearing tables...');

        await client.query('BEGIN');

        for (const table of tablesToClear) {
            try {
                // TRUNCATE is faster and resets sequences/IDs usually (with RESTART IDENTITY)
                // But simple DELETE is safer if foreign keys exist without CASCADE
                await client.query(`DELETE FROM ${table}`);
                console.log(`   - Cleared ${table}`);
            } catch (err) {
                console.warn(`   ⚠️ Error clearing ${table}: ${err.message}`);
            }
        }

        await client.query('COMMIT');
        console.log('✅ FACTORY RESET COMPLETE - All sales data wiped.');

        client.release();
    } catch (err) {
        console.error('❌ database reset failed:', err);
    } finally {
        await pool.end();
    }
}

resetRemoteDatabase();
