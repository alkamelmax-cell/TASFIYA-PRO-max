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

  return {
    rows,
    prepare(sql) {
      if (sql.includes('SELECT id FROM reconciliation_requests')) {
        return {
          all() {
            return rows.map((row) => ({ id: row.id }));
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

function createPushDb(tables = {}) {
  return {
    prepare(sql) {
      const selectMatch = sql.match(/SELECT\s+(\*|id)\s+FROM\s+([a-z_]+)/i);
      if (!selectMatch) {
        throw new Error(`Unexpected SQL in push test double: ${sql}`);
      }

      const column = selectMatch[1].toLowerCase();
      const table = selectMatch[2];
      const rows = (tables[table] || []).map((row) => ({ ...row }));

      return {
        all() {
          if (column === 'id') {
            return rows.map((row) => ({ id: row.id }));
          }

          return rows;
        }
      };
    }
  };
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

test('pushLocalData sends branch-based active cashbox ids alongside legacy ids', async () => {
  const { BackgroundSync } = loadBackgroundSyncWithMocks(async () => ({
    ok: true,
    async json() {
      return { success: true };
    }
  }));

  const db = createPushDb({
    admins: [{ id: 1, username: 'admin' }],
    branches: [{ id: 5, branch_name: 'الرياض' }, { id: 8, branch_name: 'جدة' }],
    cashiers: [],
    accountants: [],
    atms: [],
    branch_cashboxes: [
      { id: 91, branch_id: 5, cashbox_name: 'صندوق الرياض' },
      { id: 92, branch_id: 8, cashbox_name: 'صندوق جدة' }
    ],
    reconciliations: [],
    postpaid_sales: [],
    customer_receipts: [],
    manual_postpaid_sales: [],
    manual_customer_receipts: [],
    cash_receipts: [],
    bank_receipts: [],
    cashbox_vouchers: [],
    cashbox_voucher_audit_log: [],
    reconciliation_requests: []
  });

  const sync = new BackgroundSync({ db });
  const payloads = [];

  sync.sendPayload = async (payload) => {
    payloads.push(payload);
  };
  sync.sendInBatches = async () => {};

  await sync.pushLocalData(db);

  const cleanupPayload = payloads.find((payload) => Object.prototype.hasOwnProperty.call(payload, 'active_branch_cashboxes_ids'));
  assert.ok(cleanupPayload, 'expected cleanup payload to be sent');
  assert.deepEqual(cleanupPayload.active_branch_cashboxes_ids, [91, 92]);
  assert.deepEqual(cleanupPayload.active_branch_cashboxes_branch_ids, [5, 8]);
});
