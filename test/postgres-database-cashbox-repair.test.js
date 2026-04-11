const test = require('node:test');
const assert = require('node:assert/strict');

const PostgresManager = require('../src/postgres-database');

function createRepairPool() {
  const log = [];
  const client = {
    released: false,
    async query(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      log.push(normalized);

      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }

      if (normalized.includes('WITH inserted AS ( INSERT INTO branch_cashboxes')) {
        return {
          rowCount: 1,
          rows: [{ inserted_count: 2 }]
        };
      }

      if (normalized.includes('WITH repaired AS ( UPDATE cashbox_vouchers v')) {
        return {
          rowCount: 1,
          rows: [{ repaired_count: 3 }]
        };
      }

      throw new Error(`Unexpected SQL in repair pool: ${normalized}`);
    },
    release() {
      this.released = true;
    }
  };

  return {
    log,
    client,
    on() {},
    async connect() {
      return client;
    }
  };
}

test('repairCashboxSyncData creates missing cashboxes and relinks mismatched vouchers without deletes', async () => {
  const manager = new PostgresManager('postgres://example.test/db');
  const repairPool = createRepairPool();
  manager.pool = repairPool;

  await manager.repairCashboxSyncData();

  assert.equal(repairPool.log[0], 'BEGIN');
  assert.ok(repairPool.log.some((sql) => sql.includes('INSERT INTO branch_cashboxes')));
  assert.ok(repairPool.log.some((sql) => sql.includes('UPDATE cashbox_vouchers v')));
  assert.ok(repairPool.log.includes('COMMIT'));
  assert.ok(!repairPool.log.some((sql) => sql.includes('DELETE FROM cashbox_vouchers')));
  assert.ok(!repairPool.log.some((sql) => sql.includes('DELETE FROM cashbox_voucher_audit_log')));
  assert.equal(repairPool.client.released, true);
});

test('initialize runs cashbox repair after defaults and before credential migration', async () => {
  const manager = new PostgresManager('postgres://example.test/db');
  manager.pool = {
    on() {},
    async connect() {
      return {
        release() {}
      };
    }
  };

  const steps = [];
  manager.createTables = async () => { steps.push('createTables'); };
  manager.migrateSchema = async () => { steps.push('migrateSchema'); };
  manager.insertDefaultData = async () => { steps.push('insertDefaultData'); };
  manager.repairCashboxSyncData = async () => { steps.push('repairCashboxSyncData'); };
  manager.migrateSensitiveCredentials = async () => { steps.push('migrateSensitiveCredentials'); };

  const initialized = await manager.initialize();

  assert.equal(initialized, true);
  assert.deepEqual(steps, [
    'createTables',
    'migrateSchema',
    'insertDefaultData',
    'repairCashboxSyncData',
    'migrateSensitiveCredentials'
  ]);
});
