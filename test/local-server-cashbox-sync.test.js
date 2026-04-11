const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const LocalWebServer = require('../src/local-server');

function createSyncPool(initialState = {}) {
  const state = {
    branches: (initialState.branches || []).map((branch) => ({ ...branch })),
    branchCashboxes: (initialState.branchCashboxes || []).map((cashbox) => ({ ...cashbox })),
    cashboxVouchers: (initialState.cashboxVouchers || []).map((voucher) => ({ ...voucher })),
    cleanupCalls: []
  };
  let nextCashboxId = initialState.nextCashboxId || 200;

  return {
    state,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.startsWith('CREATE TABLE IF NOT EXISTS')
        || normalized.startsWith('CREATE INDEX IF NOT EXISTS')
        || normalized.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS')
      ) {
        return { rowCount: 0, rows: [] };
      }

      if (normalized === 'SELECT id, branch_id FROM branch_cashboxes') {
        return {
          rowCount: state.branchCashboxes.length,
          rows: state.branchCashboxes.map((cashbox) => ({
            id: cashbox.id,
            branch_id: cashbox.branch_id
          }))
        };
      }

      if (normalized === 'SELECT id, branch_id FROM branch_cashboxes WHERE branch_id = ANY($1::int[])') {
        const activeBranchIds = new Set((params[0] || []).map((value) => Number(value)));
        const rows = state.branchCashboxes
          .filter((cashbox) => activeBranchIds.has(Number(cashbox.branch_id)))
          .map((cashbox) => ({ id: cashbox.id, branch_id: cashbox.branch_id }));
        return { rowCount: rows.length, rows };
      }

      if (normalized === 'SELECT id, branch_name, is_active FROM branches WHERE id = ANY($1::int[])') {
        const branchIds = new Set((params[0] || []).map((value) => Number(value)));
        const rows = state.branches
          .filter((branch) => branchIds.has(Number(branch.id)))
          .map((branch) => ({
            id: branch.id,
            branch_name: branch.branch_name,
            is_active: branch.is_active
          }));
        return { rowCount: rows.length, rows };
      }

      if (normalized === 'DELETE FROM branch_cashboxes WHERE branch_id != ALL($1::int[])') {
        const activeBranchIds = new Set((params[0] || []).map((value) => Number(value)));
        const before = state.branchCashboxes.length;
        state.branchCashboxes = state.branchCashboxes.filter((cashbox) => activeBranchIds.has(Number(cashbox.branch_id)));
        const rowCount = before - state.branchCashboxes.length;
        state.cleanupCalls.push({ table: 'branch_cashboxes', ids: [...activeBranchIds] });
        return { rowCount, rows: [] };
      }

      if (normalized.startsWith('INSERT INTO branch_cashboxes (')) {
        const columnsPerRow = 6;
        for (let index = 0; index < params.length; index += columnsPerRow) {
          const branchId = Number(params[index]);
          const nextRow = {
            branch_id: branchId,
            cashbox_name: params[index + 1],
            opening_balance: params[index + 2],
            is_active: params[index + 3],
            created_at: params[index + 4],
            updated_at: params[index + 5]
          };

          const existing = state.branchCashboxes.find((cashbox) => Number(cashbox.branch_id) === branchId);
          if (existing) {
            Object.assign(existing, nextRow);
          } else {
            state.branchCashboxes.push({
              id: nextCashboxId++,
              ...nextRow
            });
          }
        }

        return { rowCount: params.length / columnsPerRow, rows: [] };
      }

      if (normalized.startsWith('INSERT INTO cashbox_vouchers (')) {
        const columns = [
          'id',
          'voucher_number',
          'voucher_sequence_number',
          'voucher_type',
          'cashbox_id',
          'branch_id',
          'counterparty_type',
          'counterparty_name',
          'cashier_id',
          'amount',
          'reference_no',
          'description',
          'voucher_date',
          'created_by',
          'created_at',
          'updated_at',
          'source_reconciliation_id',
          'source_entry_key',
          'is_auto_generated'
        ];

        for (let index = 0; index < params.length; index += columns.length) {
          const voucher = {};
          columns.forEach((column, columnIndex) => {
            voucher[column] = params[index + columnIndex];
          });

          const hasCashbox = state.branchCashboxes.some((cashbox) => Number(cashbox.id) === Number(voucher.cashbox_id));
          if (!hasCashbox) {
            throw new Error(`cashbox_id ${voucher.cashbox_id} does not exist`);
          }

          const existing = state.cashboxVouchers.find((row) => Number(row.id) === Number(voucher.id));
          if (existing) {
            Object.assign(existing, voucher);
          } else {
            state.cashboxVouchers.push(voucher);
          }
        }

        return { rowCount: params.length / columns.length, rows: [] };
      }

      throw new Error(`Unhandled SQL in test double: ${normalized}`);
    }
  };
}

function createResponse() {
  let resolveResponse;

  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const res = {
    headersSent: false,
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.headersSent = true;
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
      resolveResponse(JSON.parse(body));
    }
  };

  return { res, responsePromise };
}

async function sendSync(server, payload) {
  const req = new EventEmitter();
  req.headers = {};
  const { res, responsePromise } = createResponse();

  server.handleSyncUsers(req, res);

  process.nextTick(() => {
    req.emit('data', Buffer.from(JSON.stringify(payload)));
    req.emit('end');
  });

  return responsePromise;
}

test('legacy active_branch_cashboxes_ids payload does not delete canonical Render cashboxes', async () => {
  const pool = createSyncPool({
    branches: [{ id: 7, branch_name: 'فرع الرياض', is_active: 1 }],
    nextCashboxId: 300
  });
  const server = new LocalWebServer({ pool }, 0);

  const initialResponse = await sendSync(server, {
    branch_cashboxes: [
      {
        id: 1,
        branch_id: 7,
        cashbox_name: 'صندوق المكتب',
        opening_balance: 25,
        is_active: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z'
      }
    ]
  });

  assert.equal(initialResponse.success, true);
  assert.equal(pool.state.branchCashboxes.length, 1);

  const canonicalCashboxId = pool.state.branchCashboxes[0].id;
  const cleanupCountBeforeLegacyPayload = pool.state.cleanupCalls.length;

  const legacyResponse = await sendSync(server, {
    active_branch_cashboxes_ids: [1]
  });

  assert.equal(legacyResponse.success, true);
  assert.equal(pool.state.branchCashboxes.length, 1);
  assert.equal(pool.state.branchCashboxes[0].id, canonicalCashboxId);
  assert.equal(pool.state.cleanupCalls.length, cleanupCountBeforeLegacyPayload);
});

test('cashbox vouchers are remapped to the canonical server cashbox id by branch', async () => {
  const pool = createSyncPool({
    branches: [{ id: 7, branch_name: 'فرع الرياض', is_active: 1 }],
    nextCashboxId: 500
  });
  const server = new LocalWebServer({ pool }, 0);

  const response = await sendSync(server, {
    cashbox_vouchers: [
      {
        id: 44,
        voucher_number: 1001,
        voucher_sequence_number: 88,
        voucher_type: 'receipt',
        cashbox_id: 1,
        branch_id: 7,
        counterparty_type: 'customer',
        counterparty_name: 'عميل تجريبي',
        cashier_id: null,
        amount: 125.5,
        reference_no: 'REF-1',
        description: 'voucher remap test',
        voucher_date: '2026-04-10',
        created_by: 'tester',
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
        source_reconciliation_id: null,
        source_entry_key: null,
        is_auto_generated: 0
      }
    ]
  });

  assert.equal(response.success, true);
  assert.equal(pool.state.branchCashboxes.length, 1);
  assert.equal(pool.state.cashboxVouchers.length, 1);
  assert.equal(pool.state.cashboxVouchers[0].cashbox_id, pool.state.branchCashboxes[0].id);
  assert.notEqual(pool.state.cashboxVouchers[0].cashbox_id, 1);
});
