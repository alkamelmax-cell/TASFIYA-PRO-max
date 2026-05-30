const test = require('node:test');
const assert = require('node:assert/strict');
const LocalWebServer = require('../src/local-server');

function createResponse() {
  return {
    headersSent: false,
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

test('customer lookup cache avoids repeated database reads and supports 304 responses', async () => {
  let customerQueryCount = 0;
  const dbManager = {
    db: {
      prepare(sql) {
        return {
          all() {
            if (sql.includes('FROM customers')) {
              customerQueryCount += 1;
              return [
                { id: 1, customer_name: 'عميل تجريبي', customer_code: 'C1-000001', branch_id: 7 }
              ];
            }

            return [];
          },
          get() {
            return null;
          }
        };
      }
    }
  };

  const server = new LocalWebServer(dbManager, 4000, {
    lookupCacheTtlMs: 60_000
  });
  const req = {
    headers: {},
    authUser: { id: 12, role: 'cashier', branch_id: 7 }
  };

  const first = createResponse();
  await server.handleGetCustomerList(req, first, { compact: '1' });
  assert.equal(first.statusCode, 200);
  assert.equal(customerQueryCount, 1);
  assert.ok(first.headers.ETag);

  const second = createResponse();
  await server.handleGetCustomerList(req, second, { compact: '1' });
  assert.equal(second.statusCode, 200);
  assert.equal(customerQueryCount, 1);
  assert.equal(second.headers['X-Tasfiya-Cache'], 'hit');

  const third = createResponse();
  await server.handleGetCustomerList(
    { ...req, headers: { 'if-none-match': first.headers.ETag } },
    third,
    { compact: '1' }
  );
  assert.equal(third.statusCode, 304);
  assert.equal(customerQueryCount, 1);
});

test('cashiers list cache protects the login screen from repeated database reads', async () => {
  let cashierQueryCount = 0;
  const dbManager = {
    db: {
      prepare(sql) {
        return {
          all() {
            if (sql.includes('FROM cashiers')) {
              cashierQueryCount += 1;
              return [
                {
                  id: 1,
                  name: 'الكاشير',
                  cashier_number: '1001',
                  active: 1,
                  pin_code: 'hashed-pin',
                  branch_name: 'الفرع الرئيسي'
                }
              ];
            }

            return [];
          },
          get() {
            return null;
          }
        };
      }
    }
  };

  const server = new LocalWebServer(dbManager, 4000, {
    lookupCacheTtlMs: 60_000
  });

  const first = createResponse();
  await server.handleGetCashiersList({ headers: {} }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(cashierQueryCount, 1);
  assert.ok(first.headers.ETag);

  const second = createResponse();
  await server.handleGetCashiersList({ headers: {} }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(cashierQueryCount, 1);
  assert.equal(second.headers['X-Tasfiya-Cache'], 'hit');

  const third = createResponse();
  await server.handleGetCashiersList({ headers: { 'if-none-match': first.headers.ETag } }, third);
  assert.equal(third.statusCode, 304);
  assert.equal(cashierQueryCount, 1);
});
