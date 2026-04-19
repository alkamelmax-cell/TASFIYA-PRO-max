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
      if (sql.includes('SELECT id, details_json FROM reconciliation_requests')) {
        return {
          all() {
            return rows.map((row) => ({ id: row.id, details_json: row.details_json }));
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
      if (sql === 'SELECT * FROM admins') return { all: () => [] };
      if (sql === 'SELECT * FROM branches') return { all: () => [] };
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
      if (sql === 'SELECT * FROM admins') return { all: () => [] };
      if (sql === 'SELECT * FROM branches') return { all: () => [] };
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
