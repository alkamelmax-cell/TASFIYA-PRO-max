const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadBackgroundSyncWithMocks(fetchImpl) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {},
        ipcMain: {
          handle() {}
        }
      };
    }

    if (request === 'node-fetch') {
      return (...args) => fetchImpl(...args);
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const modulePath = require.resolve('../src/background-sync');
  delete require.cache[modulePath];

  try {
    return require('../src/background-sync');
  } finally {
    Module._load = originalLoad;
  }
}

function createRequestsDb(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const syncServerUrl = 'https://sync.example';

  return {
    rows,
    prepare(sql) {
      if (String(sql).includes("setting_key = 'sync_server_url'")) {
        return {
          get() {
            return { setting_value: syncServerUrl };
          }
        };
      }

      if (sql.includes('SELECT MAX(id) AS max_id FROM reconciliation_requests')) {
        return {
          get() {
            const maxId = rows.reduce((maxValue, row) => Math.max(maxValue, Number(row.id || 0)), 0);
            return { max_id: maxId || null };
          }
        };
      }

      if (sql.includes('SELECT id FROM reconciliation_requests')) {
        return {
          all() {
            return rows.map((row) => ({ id: row.id }));
          }
        };
      }

      if (sql.includes('SELECT id, details_json FROM reconciliation_requests')) {
        return {
          all() {
            return rows.map((row) => ({ id: row.id, details_json: row.details_json ?? null }));
          }
        };
      }

      if (sql.includes('SELECT id, details_json, status FROM reconciliation_requests')) {
        return {
          all() {
            return rows.map((row) => ({
              id: row.id,
              details_json: row.details_json ?? null,
              status: row.status ?? null
            }));
          }
        };
      }

      if (sql.includes('INSERT OR IGNORE INTO reconciliation_requests')) {
        return {
          run(id, cashierId, requestDate, systemSales, totalCash, totalBank, status, detailsJson, notes, createdAt, updatedAt) {
            rows.push({
              id,
              cashier_id: cashierId,
              request_date: requestDate,
              system_sales: systemSales,
              total_cash: totalCash,
              total_bank: totalBank,
              status,
              details_json: detailsJson,
              notes,
              created_at: createdAt,
              updated_at: updatedAt
            });
          }
        };
      }

      if (sql.includes('UPDATE reconciliation_requests')) {
        return {
          run(cashierId, requestDate, systemSales, totalCash, totalBank, status, detailsJson, notes, createdAt, updatedAt, id) {
            const row = rows.find((entry) => entry.id === id);
            Object.assign(row, {
              cashier_id: cashierId,
              request_date: requestDate,
              system_sales: systemSales,
              total_cash: totalCash,
              total_bank: totalBank,
              status,
              details_json: detailsJson,
              notes,
              created_at: createdAt,
              updated_at: updatedAt
            });
          }
        };
      }

      throw new Error(`Unexpected SQL in test double: ${sql}`);
    },
    transaction(fn) {
      return (...args) => fn(...args);
    }
  };
}

test('forceSyncNow waits for the active sync and reports the push result', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({ ok: true }));
  const sync = new BackgroundSync({
    db: {
      prepare(sql) {
        if (String(sql).includes("setting_key = 'sync_server_url'")) {
          return {
            get() {
              return { setting_value: 'https://sync.example' };
            }
          };
        }

        throw new Error(`Unexpected SQL in non-retryable payload test double: ${sql}`);
      }
    }
  });
  let releasePush;
  let pushCalls = 0;

  sync.pullRemoteRequests = async () => ({ success: true });
  sync.pushLocalData = async () => {
    pushCalls += 1;
    await new Promise((resolve) => { releasePush = resolve; });
    return { success: true, totalSent: 1, failedTables: [] };
  };

  const first = sync.forceSyncNow();
  const second = sync.forceSyncNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pushCalls, 1);
  releasePush();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.success, true);
  assert.equal(secondResult.success, true);
  assert.equal(firstResult.push.totalSent, 1);
});

test('forceSyncNow returns a clear result when synchronization is disabled', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({ ok: true }));
  const sync = new BackgroundSync({ db: {} });
  sync.setEnabled(false);

  const result = await sync.forceSyncNow();

  assert.deepEqual(result, { success: false, skipped: true, reason: 'disabled' });
});

test('non-retryable sync cooldown blocks only the exact failed payload, not newer rows', async () => {
  const sentBodies = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    sentBodies.push(JSON.parse(options.body));

    if (sentBodies.length === 1) {
      return {
        ok: true,
        async json() {
          return { success: false, error: 'SYNC_PARTIAL_FAILURE' };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const db = {
    prepare(sql) {
      if (String(sql).includes("setting_key = 'sync_server_url'")) {
        return {
          get() {
            return { setting_value: 'https://sync.example' };
          }
        };
      }

      throw new Error(`Unexpected SQL in cooldown test double: ${sql}`);
    }
  };
  const sync = new BackgroundSync({ db });

  await assert.rejects(
    () => sync.sendPayload({ reconciliations: [{ id: 1, status: 'completed' }] }),
    /SYNC_PARTIAL_FAILURE/
  );

  await sync.sendPayload({ reconciliations: [{ id: 2, status: 'completed' }] });

  assert.equal(sentBodies.length, 2);
  assert.equal(sentBodies[1].reconciliations[0].id, 2);
});

function createDeltaSyncDb(initialTables = {}) {
  const tableNames = [
    'admins',
    'branches',
    'cashiers',
    'accountants',
    'atms',
    'branch_cashboxes',
    'customers',
    'cashbox_vouchers',
    'cashbox_voucher_audit_log',
    'reconciliations',
    'manual_postpaid_sales',
    'manual_customer_receipts',
    'postpaid_sales',
    'customer_receipts',
    'cash_receipts',
    'bank_receipts',
    'return_invoices',
    'suppliers',
    'reconciliation_requests'
  ];
  const tables = Object.fromEntries(tableNames.map((name) => [name, (initialTables[name] || []).map((row) => ({ ...row }))]));
  const metadata = new Map();
  const rowState = new Map();

  const getStateKey = (tableName, rowKey) => `${tableName}\u0000${rowKey}`;

  const thisDb = {
    tables,
    metadata,
    rowState,
    syncServerUrl: 'https://sync.example',
    exec() {},
    transaction(fn) {
      return (...args) => fn(...args);
    },
    prepare(sql) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();

      if (normalizedSql === 'SELECT value FROM sync_metadata WHERE key = ?') {
        return {
          get(key) {
            return metadata.has(key) ? { value: metadata.get(key) } : undefined;
          }
        };
      }

      if (sql.includes('SELECT MAX(id) AS max_id FROM reconciliation_requests')) {
        return {
          get() {
            const requestRows = tables.reconciliation_requests || [];
            const maxId = requestRows.reduce((maxValue, row) => Math.max(maxValue, Number(row.id || 0)), 0);
            return { max_id: maxId || null };
          }
        };
      }

      if (normalizedSql.includes("FROM system_settings WHERE category = 'general' AND setting_key = 'sync_server_url'")) {
        return {
          get() {
            return thisDb.syncServerUrl ? { setting_value: thisDb.syncServerUrl } : undefined;
          }
        };
      }

      if (normalizedSql.startsWith('INSERT INTO sync_metadata')) {
        return {
          run(key, value) {
            metadata.set(key, value);
          }
        };
      }

      if (normalizedSql === "DELETE FROM sync_metadata WHERE key LIKE 'background-sync:%'") {
        return {
          run() {
            for (const key of metadata.keys()) {
              if (String(key).startsWith('background-sync:')) {
                metadata.delete(key);
              }
            }
          }
        };
      }

      if (normalizedSql === 'SELECT 1 AS present FROM sync_row_state LIMIT 1') {
        return {
          get() {
            return rowState.size > 0 ? { present: 1 } : undefined;
          }
        };
      }

      if (normalizedSql === 'DELETE FROM sync_row_state') {
        return {
          run() {
            rowState.clear();
          }
        };
      }

      if (normalizedSql === 'SELECT row_key, row_hash FROM sync_row_state WHERE table_name = ?') {
        return {
          all(tableName) {
            return Array.from(rowState.entries())
              .filter(([key]) => key.startsWith(`${tableName}\u0000`))
              .map(([key, rowHash]) => ({
                row_key: key.slice(tableName.length + 1),
                row_hash: rowHash
              }));
          }
        };
      }

      if (normalizedSql.startsWith('INSERT INTO sync_row_state')) {
        return {
          run(tableName, rowKey, rowHash) {
            rowState.set(getStateKey(tableName, rowKey), rowHash);
          }
        };
      }

      if (normalizedSql === 'DELETE FROM sync_row_state WHERE table_name = ? AND row_key = ?') {
        return {
          run(tableName, rowKey) {
            rowState.delete(getStateKey(tableName, rowKey));
          }
        };
      }

      const selectAllMatch = normalizedSql.match(/^SELECT \* FROM ([a-z_]+)/i);
      if (selectAllMatch) {
        const tableName = selectAllMatch[1];
        return {
          all() {
            return (tables[tableName] || []).map((row) => ({ ...row }));
          }
        };
      }

      const selectIdMatch = normalizedSql.match(/^SELECT id FROM ([a-z_]+)/i);
      if (selectIdMatch) {
        const tableName = selectIdMatch[1];
        return {
          all() {
            return (tables[tableName] || []).map((row) => ({ id: row.id }));
          }
        };
      }

      throw new Error(`Unexpected SQL in delta test double: ${sql}`);
    }
  };

  return thisDb;
}

test('fetchRemoteRequests persists full request fields and executes transaction', async () => {
  const remoteRequests = [
    {
      id: 344,
      cashier_id: 11,
      request_date: '2026-04-05 11:12:31',
      system_sales: '150.50',
      total_cash: '75.25',
      total_bank: '50.00',
      status: 'completed',
      details: { cash_breakdown: [{ val: 50, qty: 1, sub: 50 }] },
      notes: 'updated row',
      created_at: '2026-04-05T07:15:05.163Z',
      updated_at: '2026-04-06T01:00:00.000Z'
    },
    {
      id: 348,
      cashier_id: 12,
      request_date: '2026-04-06 05:22:29',
      system_sales: '3325.30',
      total_cash: '2107.00',
      total_bank: '3183.10',
      status: 'pending',
      details_json: '{"bank_receipts":[]}',
      notes: 'new row',
      created_at: '2026-04-06T02:22:29.725Z',
      updated_at: '2026-04-06T02:22:29.725Z'
    }
  ];

  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: remoteRequests };
    }
  }));

  const db = createRequestsDb([
    {
      id: 344,
      cashier_id: 11,
      request_date: '2026-04-05 11:12:31',
      system_sales: 0,
      total_cash: 0,
      total_bank: 0,
      status: 'pending',
      details_json: '{}',
      notes: '',
      created_at: '2026-04-05T07:15:05.163Z',
      updated_at: '2026-04-05 11:12:31'
    }
  ]);

  const sync = new BackgroundSync({ db });
  await sync.fetchRemoteRequests(db);

  assert.equal(db.rows.length, 2);

  const updatedRow = db.rows.find((row) => row.id === 344);
  assert.equal(updatedRow.status, 'completed');
  assert.equal(updatedRow.system_sales, 150.5);
  assert.equal(updatedRow.total_cash, 75.25);
  assert.equal(updatedRow.total_bank, 50);
  assert.match(updatedRow.details_json, /cash_breakdown/);

  const insertedRow = db.rows.find((row) => row.id === 348);
  assert.equal(insertedRow.cashier_id, 12);
  assert.equal(insertedRow.request_date, '2026-04-06 05:22:29');
  assert.equal(insertedRow.system_sales, 3325.3);
  assert.equal(insertedRow.total_cash, 2107);
  assert.equal(insertedRow.total_bank, 3183.1);
  assert.equal(insertedRow.status, 'pending');
  assert.equal(insertedRow.notes, 'new row');
});

test('fetchRemoteRequests requests all statuses including deleted for mirror sync', async () => {
  let requestedUrl = '';
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (url) => {
    requestedUrl = String(url || '');
    return {
      ok: true,
      async json() {
        return { success: true, data: [] };
      }
    };
  });

  const db = createRequestsDb([]);
  const sync = new BackgroundSync({ db });
  await sync.fetchRemoteRequests(db);

  assert.ok(
    requestedUrl.includes('/api/reconciliation-requests?status=all&include_deleted=1&include_details=raw'),
    `unexpected pull url: ${requestedUrl}`
  );
});

test('fetchRemoteRequests preserves locally completed requests when remote is still pending', async () => {
  const remoteRequests = [
    {
      id: 501,
      cashier_id: 15,
      request_date: '2026-04-07 10:00:00',
      system_sales: '500',
      total_cash: '250',
      total_bank: '250',
      status: 'pending',
      details_json: '{"cash_breakdown":[]}',
      notes: 'remote still pending',
      created_at: '2026-04-07T07:00:00.000Z',
      updated_at: '2026-04-07T07:00:00.000Z'
    }
  ];

  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: remoteRequests };
    }
  }));

  const db = createRequestsDb([
    {
      id: 501,
      cashier_id: 15,
      request_date: '2026-04-07 10:00:00',
      system_sales: 500,
      total_cash: 250,
      total_bank: 250,
      status: 'completed',
      details_json: '{}',
      notes: '',
      created_at: '2026-04-07T07:00:00.000Z',
      updated_at: '2026-04-07T07:05:00.000Z'
    }
  ]);

  const sync = new BackgroundSync({ db });
  await sync.fetchRemoteRequests(db);

  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].status, 'completed');
  assert.equal(db.rows[0].notes, 'remote still pending');
});

test('fetchRemoteRequests preserves locally deleted requests when remote is still active', async () => {
  const remoteRequests = [
    {
      id: 502,
      cashier_id: 16,
      request_date: '2026-04-08 10:00:00',
      system_sales: '700',
      total_cash: '300',
      total_bank: '400',
      status: 'completed',
      details_json: '{}',
      notes: 'remote completed',
      created_at: '2026-04-08T07:00:00.000Z',
      updated_at: '2026-04-08T07:00:00.000Z'
    }
  ];

  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: remoteRequests };
    }
  }));

  const db = createRequestsDb([
    {
      id: 502,
      cashier_id: 16,
      request_date: '2026-04-08 10:00:00',
      system_sales: 700,
      total_cash: 300,
      total_bank: 400,
      status: 'deleted',
      details_json: '{}',
      notes: '',
      created_at: '2026-04-08T07:00:00.000Z',
      updated_at: '2026-04-08T07:10:00.000Z'
    }
  ]);

  const sync = new BackgroundSync({ db });
  await sync.fetchRemoteRequests(db);

  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].status, 'deleted');
});

test('doSync still pulls remote requests when pushLocalData fails', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: [] };
    }
  }));

  const sync = new BackgroundSync({ db: {} });
  let pullCount = 0;

  sync.pushLocalData = async () => {
    throw new Error('push failed');
  };

  sync.fetchRemoteRequests = async () => {
    pullCount += 1;
  };

  await sync.doSync();

  assert.equal(pullCount, 1);
  assert.equal(sync.isSyncing, false);
});

test('doSync pulls remote requests before pushing local data', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: [] };
    }
  }));

  const sync = new BackgroundSync({ db: {} });
  const order = [];

  sync.fetchRemoteRequests = async () => {
    order.push('pull');
  };

  sync.pushLocalData = async () => {
    order.push('push');
  };

  await sync.doSync();

  assert.deepEqual(order, ['pull', 'push']);
});

test('explicit request refresh can pull while periodic table sync is disabled', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true, data: [] };
    }
  }));

  const sync = new BackgroundSync({ db: {} });
  let pullCount = 0;
  sync.fetchRemoteRequests = async () => {
    pullCount += 1;
    return { receivedCount: 2, insertedCount: 2, updatedCount: 0 };
  };
  sync.setEnabled(false);

  const skipped = await sync.pullRemoteRequests();
  assert.deepEqual(skipped, { success: false, skipped: true, reason: 'disabled' });
  assert.equal(pullCount, 0);

  const result = await sync.pullRemoteRequests({ allowWhenDisabled: true });
  assert.equal(result.success, true);
  assert.equal(result.receivedCount, 2);
  assert.equal(pullCount, 1);
});

test('fetchRemoteRequests propagates an HTTP failure instead of reporting a false success', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable'
  }));

  const db = createRequestsDb([]);
  const sync = new BackgroundSync({ db });

  await assert.rejects(
    () => sync.fetchRemoteRequests(db),
    /Pull failed: 503 Service Unavailable/
  );
});

test('pushLocalData sends branch-based active cashbox ids alongside legacy ids', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    sentPayloads.push(body);
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const branchCashboxes = [
    { id: 501, branch_id: 11, cashbox_name: 'Main 11' },
    { id: 502, branch_id: 12, cashbox_name: 'Main 12' }
  ];

  const db = {
    prepare(sql) {
      if (String(sql).includes("setting_key = 'sync_server_url'")) {
        return {
          get() {
            return { setting_value: 'https://sync.example' };
          }
        };
      }
      if (sql === 'SELECT * FROM admins') return { all: () => [] };
      if (sql === 'SELECT * FROM branches') return { all: () => [] };
      if (sql.startsWith('SELECT * FROM customers')) return { all: () => [] };
      if (sql === 'SELECT * FROM cashiers') return { all: () => [] };
      if (sql === 'SELECT * FROM accountants') return { all: () => [] };
      if (sql === 'SELECT * FROM atms') return { all: () => [] };
      if (sql === 'SELECT * FROM branch_cashboxes') return { all: () => branchCashboxes };
      if (sql.startsWith('SELECT id FROM branch_cashboxes')) return { all: () => branchCashboxes.map(row => ({ id: row.id })) };
      if (sql.startsWith('SELECT id FROM')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM reconciliations')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM manual_postpaid_sales')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM manual_customer_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM postpaid_sales')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM customer_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM cash_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM bank_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM cashbox_vouchers')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM cashbox_voucher_audit_log')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM reconciliation_requests')) return { all: () => [] };
      throw new Error(`Unexpected SQL in test double: ${sql}`);
    }
  };

  const sync = new BackgroundSync({ db });
  await sync.pushLocalData(db);

  const cleanupPayload = sentPayloads.find(payload => Object.prototype.hasOwnProperty.call(payload, 'active_branch_cashboxes_ids'));
  assert.ok(cleanupPayload, 'expected cleanup payload with active_branch_cashboxes_ids');
  assert.deepEqual(cleanupPayload.active_branch_cashboxes_ids, [501, 502]);
  assert.deepEqual(cleanupPayload.active_branch_cashboxes_branch_ids, [11, 12]);
  assert.deepEqual(cleanupPayload.active_cashbox_voucher_sync_keys, []);
});

test('pushLocalData sends active cashbox voucher sync keys for mirror-safe deletions', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    sentPayloads.push(body);
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const branchCashboxes = [
    { id: 91, branch_id: 7, cashbox_name: 'Branch 7' }
  ];
  const cashboxVouchers = [
    {
      id: 1001,
      cashbox_id: 91,
      branch_id: 7,
      voucher_type: 'receipt',
      voucher_sequence_number: 11,
      voucher_number: 101,
      source_reconciliation_id: null,
      source_entry_key: null
    },
    {
      id: 1002,
      cashbox_id: 91,
      branch_id: 7,
      voucher_type: 'payment',
      voucher_sequence_number: null,
      voucher_number: 44,
      source_reconciliation_id: null,
      source_entry_key: null
    },
    {
      id: 1003,
      cashbox_id: 91,
      branch_id: 7,
      voucher_type: 'receipt',
      voucher_sequence_number: null,
      voucher_number: 77,
      source_reconciliation_id: 555,
      source_entry_key: 'supplier:9'
    }
  ];

  const db = {
    prepare(sql) {
      if (String(sql).includes("setting_key = 'sync_server_url'")) {
        return {
          get() {
            return { setting_value: 'https://sync.example' };
          }
        };
      }
      if (sql === 'SELECT * FROM admins') return { all: () => [] };
      if (sql === 'SELECT * FROM branches') return { all: () => [] };
      if (sql.startsWith('SELECT * FROM customers')) return { all: () => [] };
      if (sql === 'SELECT * FROM cashiers') return { all: () => [] };
      if (sql === 'SELECT * FROM accountants') return { all: () => [] };
      if (sql === 'SELECT * FROM atms') return { all: () => [] };
      if (sql === 'SELECT * FROM branch_cashboxes') return { all: () => branchCashboxes };
      if (sql.startsWith('SELECT * FROM cashbox_vouchers')) return { all: () => cashboxVouchers };
      if (sql.startsWith('SELECT id FROM branch_cashboxes')) return { all: () => branchCashboxes.map(row => ({ id: row.id })) };
      if (sql.startsWith('SELECT id FROM cashbox_vouchers')) return { all: () => cashboxVouchers.map(row => ({ id: row.id })) };
      if (sql.startsWith('SELECT id FROM')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM reconciliations')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM manual_postpaid_sales')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM manual_customer_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM postpaid_sales')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM customer_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM cash_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM bank_receipts')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM cashbox_voucher_audit_log')) return { all: () => [] };
      if (sql.startsWith('SELECT * FROM reconciliation_requests')) return { all: () => [] };
      throw new Error(`Unexpected SQL in test double: ${sql}`);
    }
  };

  const sync = new BackgroundSync({ db });
  await sync.pushLocalData(db);

  const cleanupPayload = sentPayloads.find(payload => Object.prototype.hasOwnProperty.call(payload, 'active_cashbox_voucher_sync_keys'));
  assert.ok(cleanupPayload, 'expected cleanup payload with active_cashbox_voucher_sync_keys');
  assert.deepEqual(
    cleanupPayload.active_cashbox_voucher_sync_keys.slice().sort(),
    [
      'recon:555:supplier:9',
      'seq:7:receipt:11',
      'num:7:payment:44'
    ].sort()
  );
});

test('pushLocalData sends only changed rows after the first delta baseline', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    sentPayloads.push(options.body ? JSON.parse(options.body) : {});
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const db = createDeltaSyncDb({
    customers: [
      {
        id: 1,
        customer_code: 'C1-000001',
        customer_name: 'عميل أول',
        branch_id: 1,
        phone: '',
        address: '',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 2,
        customer_code: 'C1-000002',
        customer_name: 'عميل ثاني',
        branch_id: 1,
        phone: '',
        address: '',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z'
      }
    ]
  });

  const sync = new BackgroundSync({ db });
  await sync.pushLocalData(db);

  sentPayloads.length = 0;
  await sync.pushLocalData(db);
  assert.equal(sentPayloads.length, 0, 'unchanged second sync should not send payloads');

  db.tables.customers[1].customer_name = 'عميل ثاني معدل';
  db.tables.customers[1].updated_at = '2026-05-02T00:00:00.000Z';

  await sync.pushLocalData(db);

  const customerPayloads = sentPayloads.filter((payload) => Object.prototype.hasOwnProperty.call(payload, 'customers'));
  assert.equal(customerPayloads.length, 1);
  assert.equal(customerPayloads[0].customers.length, 1);
  assert.equal(customerPayloads[0].customers[0].id, 2);
  assert.equal(customerPayloads[0].customers[0].customer_name, 'عميل ثاني معدل');
});

test('changing the remote server rebuilds the baseline and sends reconciliation parents before receipts', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (url, options = {}) => {
    sentPayloads.push({
      url: String(url || ''),
      body: options.body ? JSON.parse(options.body) : {}
    });
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const db = createDeltaSyncDb({
    reconciliations: [{
      id: 3920,
      reconciliation_number: 3920,
      cashier_id: 12,
      status: 'completed'
    }],
    cash_receipts: [{
      id: 18661,
      reconciliation_id: 3920,
      denomination: 1,
      quantity: 297,
      total_amount: 297
    }]
  });
  const sync = new BackgroundSync({ db });

  db.syncServerUrl = 'https://old-sync.example';
  await sync.pushLocalData(db);

  sentPayloads.length = 0;
  await sync.pushLocalData(db);
  assert.equal(sentPayloads.length, 0, 'unchanged rows must stay incremental on the same server');

  db.syncServerUrl = 'https://new-sync.example';
  await sync.pushLocalData(db);

  const reconciliationIndex = sentPayloads.findIndex(({ body }) => Array.isArray(body.reconciliations));
  const cashReceiptIndex = sentPayloads.findIndex(({ body }) => Array.isArray(body.cash_receipts));

  assert.ok(reconciliationIndex >= 0, 'the parent reconciliation must be resent to the new server');
  assert.ok(cashReceiptIndex > reconciliationIndex, 'cash receipts must be sent only after their parent reconciliation');
  assert.equal(sentPayloads[reconciliationIndex].body.reconciliations[0].id, 3920);
  assert.equal(sentPayloads[cashReceiptIndex].body.cash_receipts[0].reconciliation_id, 3920);
  assert.equal(
    sentPayloads.some(({ body }) => Object.prototype.hasOwnProperty.call(body, 'active_reconciliations_ids')),
    false,
    'switching servers must seed data without mirror cleanup or cross-device deletion'
  );
  assert.equal(
    db.metadata.get('background-sync:remote-url'),
    'https://new-sync.example/api/sync/users'
  );
});

test('pushLocalData sends mirror cleanup when a previously synced row is deleted', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    sentPayloads.push(options.body ? JSON.parse(options.body) : {});
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const db = createDeltaSyncDb({
    postpaid_sales: [
      { id: 10, reconciliation_id: 1, customer_name: 'عميل', customer_code: 'C1-000010', amount: 25, notes: '' }
    ]
  });

  const sync = new BackgroundSync({ db });
  await sync.pushLocalData(db);

  sentPayloads.length = 0;
  db.tables.postpaid_sales = [];
  await sync.pushLocalData(db);

  const cleanupPayload = sentPayloads.find((payload) =>
    Object.prototype.hasOwnProperty.call(payload, 'active_postpaid_sales_ids')
  );

  assert.ok(cleanupPayload, 'expected cleanup payload for deleted postpaid row');
  assert.deepEqual(cleanupPayload.active_postpaid_sales_ids, []);
  assert.equal(
    sentPayloads.some((payload) => Object.prototype.hasOwnProperty.call(payload, 'postpaid_sales')),
    false,
    'deleted row should not be resent as table data'
  );
});

test('pushLocalData sends explicit deleted reconciliation ids when the last local reconciliation is removed', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    sentPayloads.push(options.body ? JSON.parse(options.body) : {});
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const db = createDeltaSyncDb({
    reconciliations: [
      {
        id: 77,
        reconciliation_number: 1007,
        cashier_id: 1,
        accountant_id: 1,
        reconciliation_date: '2026-08-19',
        status: 'completed'
      }
    ]
  });

  const sync = new BackgroundSync({ db });
  await sync.pushLocalData(db);

  sentPayloads.length = 0;
  db.tables.reconciliations = [];
  await sync.pushLocalData(db);

  const cleanupPayload = sentPayloads.find((payload) =>
    Object.prototype.hasOwnProperty.call(payload, 'deleted_reconciliations_ids')
  );

  assert.ok(cleanupPayload, 'expected explicit deleted_reconciliations_ids payload');
  assert.deepEqual(cleanupPayload.deleted_reconciliations_ids, [77]);
  assert.deepEqual(cleanupPayload.active_reconciliations_ids, []);
  assert.equal(
    sentPayloads.some((payload) => Object.prototype.hasOwnProperty.call(payload, 'reconciliations')),
    false,
    'deleted reconciliation should not be resent as table data'
  );
});

test('fetchRemoteRequests uses updated_after after an incremental pull watermark', async () => {
  let requestedUrl = '';
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (url) => {
    requestedUrl = String(url || '');
    return {
      ok: true,
      async json() {
        return { success: true, data: [] };
      }
    };
  });

  const db = createRequestsDb([]);
  const metadata = new Map([
    ['background-sync:remote-url', 'https://sync.example/api/sync/users'],
    ['background-sync:requests:last-full-pull-at', new Date().toISOString()],
    ['background-sync:requests:last-pull-at', '2026-05-31T07:10:00.000Z']
  ]);
  const originalPrepare = db.prepare.bind(db);

  db.exec = () => {};
  db.prepare = (sql) => {
    const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
    if (normalizedSql === 'SELECT value FROM sync_metadata WHERE key = ?') {
      return {
        get(key) {
          return metadata.has(key) ? { value: metadata.get(key) } : undefined;
        }
      };
    }

    if (normalizedSql.startsWith('INSERT INTO sync_metadata')) {
      return {
        run(key, value) {
          metadata.set(key, value);
        }
      };
    }

    return originalPrepare(sql);
  };

  const sync = new BackgroundSync({ db });
  await sync.fetchRemoteRequests(db);

  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.searchParams.get('status'), 'all');
  assert.equal(parsedUrl.searchParams.get('include_deleted'), '1');
  assert.equal(parsedUrl.searchParams.get('include_details'), 'raw');
  assert.equal(parsedUrl.searchParams.get('updated_after'), '2026-05-31T07:08:00.000Z');
  assert.equal(
    metadata.get('background-sync:requests:last-pull-at'),
    '2026-05-31T07:10:00.000Z',
    'an empty response must not advance the watermark using the desktop clock'
  );
});

test('fetchRemoteRequests includes the last local request id to survive timestamp skew', async () => {
  let requestedUrl = '';
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (url) => {
    requestedUrl = String(url || '');
    return {
      ok: true,
      async json() {
        return { success: true, data: [] };
      }
    };
  });

  const db = createRequestsDb([{ id: 1378, status: 'pending', details_json: '{}' }]);
  const sync = new BackgroundSync({ db });
  sync.ensureSyncStateSchema = () => true;
  sync.isIntervalDue = () => false;
  sync.readSyncMeta = () => null;
  await sync.fetchRemoteRequests(db);

  assert.equal(new URL(requestedUrl).searchParams.get('after_id'), '1378');
});

test('sendPayload does not retry or repeatedly resend a non-retryable schema failure', async () => {
  let calls = 0;
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => {
    calls += 1;
    return {
      ok: false,
      status: 409,
      statusText: 'Conflict',
      async json() {
        return { error: 'CASHBOX_SYNC_KEY_DUPLICATES' };
      }
    };
  });

  const sync = new BackgroundSync({
    db: {
      prepare(sql) {
        if (String(sql).includes("setting_key = 'sync_server_url'")) {
          return {
            get() {
              return { setting_value: 'https://sync.example' };
            }
          };
        }

        throw new Error(`Unexpected SQL in non-retryable schema test double: ${sql}`);
      }
    }
  });
  await assert.rejects(
    () => sync.sendPayload({ cashbox_vouchers: [{ sync_key: 'seq:4:payment:42' }] }),
    /CASHBOX_SYNC_KEY_DUPLICATES/
  );
  assert.equal(calls, 1, 'a 409 schema failure must not use the transient retry loop');

  await assert.rejects(
    () => sync.sendPayload({ cashbox_vouchers: [{ sync_key: 'seq:4:payment:42' }] }),
    /cooldown active/
  );
  assert.equal(calls, 1, 'the same payload must be held during the non-retryable cooldown');
});

test('device sync identity survives changing the configured server URL', () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => {
    throw new Error('network should not be used by this test');
  });
  const db = createDeltaSyncDb();
  const sync = new BackgroundSync({ db });
  const sourceId = sync.getSyncSourceId();

  db.metadata.set('background-sync:remote-url', 'https://old.example/api/sync/users');
  db.metadata.set('background-sync:last-full-refresh-at', '2026-01-01T00:00:00.000Z');
  db.rowState.set('reconciliations\u00001', 'old-hash');
  db.syncServerUrl = 'https://new.example/';

  assert.equal(sync.ensureRemoteSyncScope(db), true);
  assert.equal(db.rowState.size, 0, 'the delta baseline must be rebuilt for the new server');
  assert.equal(db.metadata.get('sync-client:source-id'), sourceId, 'server switching must not change device ownership');
  assert.equal(db.metadata.get('background-sync:remote-url'), 'https://new.example/api/sync/users');
  assert.equal(sync.getSyncSourceId(), sourceId);
});

test('different desktop databases send distinct source identities for the same local row id', async () => {
  const sentPayloads = [];
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async (_url, options = {}) => {
    sentPayloads.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  });

  const first = new BackgroundSync({ db: createDeltaSyncDb() });
  const second = new BackgroundSync({ db: createDeltaSyncDb() });
  await first.sendPayload({ reconciliations: [{ id: 1, reconciliation_number: 1001 }] });
  await second.sendPayload({ reconciliations: [{ id: 1, reconciliation_number: 2001 }] });

  assert.equal(sentPayloads.length, 2);
  assert.equal(sentPayloads[0]._sync.protocol_version, 2);
  assert.equal(sentPayloads[1]._sync.protocol_version, 2);
  assert.notEqual(
    sentPayloads[0]._sync.source_id,
    sentPayloads[1]._sync.source_id,
    'identical SQLite ids on different devices must not share server ownership'
  );
});
