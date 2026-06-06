const test = require('node:test');
const assert = require('node:assert/strict');
const LocalWebServer = require('../src/local-server');

test('createOrUpdateServerCustomer retries stale PostgreSQL customers sequence repairs', async () => {
  let insertAttempts = 0;
  let sequenceRefreshes = 0;
  const pool = {
    async query(sql, params = []) {
      const normalizedSql = String(sql || '').replace(/\s+/g, ' ').trim();

      if (normalizedSql.includes('SELECT customer_code_prefix FROM branches')) {
        return { rows: [{ customer_code_prefix: 'C2' }] };
      }

      if (normalizedSql.includes('FROM customers') && normalizedSql.includes('customer_code')) {
        return { rows: [] };
      }

      if (normalizedSql.includes('FROM customers') && normalizedSql.includes('TRIM(COALESCE(customer_name')) {
        return { rows: [] };
      }

      if (normalizedSql.startsWith('INSERT INTO customers')) {
        insertAttempts += 1;
        if (insertAttempts <= 2) {
          const error = new Error('duplicate key value violates unique constraint "customers_pkey"');
          error.code = '23505';
          error.constraint = 'customers_pkey';
          throw error;
        }

        return {
          rows: [{
            id: 77,
            customer_name: params[1],
            customer_code: params[0],
            branch_id: params[2]
          }]
        };
      }

      if (normalizedSql.startsWith('SELECT setval(')) {
        sequenceRefreshes += 1;
        assert.deepEqual(params, ['customers', 'id']);
        return { rows: [{ setval: 77 }] };
      }

      throw new Error(`Unexpected SQL in customer sequence test: ${normalizedSql}`);
    }
  };
  const server = new LocalWebServer({ pool }, 0);

  const customer = await server.createOrUpdateServerCustomer({
    customerName: 'عميل جديد',
    customerCode: 'C2-000777',
    branchId: 2
  });

  assert.equal(insertAttempts, 3);
  assert.equal(sequenceRefreshes, 2);
  assert.equal(customer.customer_id, 77);
  assert.equal(customer.customer_code, 'C2-000777');
});

test('ensurePostgresSerialSequences refreshes common serial tables without blocking', async () => {
  const refreshedTables = [];
  const pool = {
    async query(sql, params = []) {
      const normalizedSql = String(sql || '').replace(/\s+/g, ' ').trim();
      assert.ok(normalizedSql.startsWith('SELECT setval('));
      refreshedTables.push(params[0]);
      if (params[0] === 'return_invoices') {
        throw new Error('relation "return_invoices" does not exist');
      }
      return { rows: [{ setval: 1 }] };
    }
  };
  const server = new LocalWebServer({ pool }, 0);

  await server.ensurePostgresSerialSequences();

  assert.ok(refreshedTables.includes('customers'));
  assert.ok(refreshedTables.includes('reconciliation_requests'));
  assert.ok(refreshedTables.includes('return_invoices'));
  assert.ok(refreshedTables.includes('customer_fiscal_opening_balances'));
});
