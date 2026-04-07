const test = require('node:test');
const assert = require('node:assert/strict');
const LocalWebServer = require('../src/local-server');

function createDbManager(branchRows) {
  return {
    db: {
      prepare(sql) {
        return {
          async all() {
            if (sql.includes('FROM cashiers')) {
              return [];
            }

            if (sql.includes('FROM branches')) {
              return branchRows;
            }

            if (sql.includes('FROM accountants')) {
              return [];
            }

            if (sql.includes('FROM atms')) {
              return [];
            }

            if (sql.includes('manual_postpaid_sales')) {
              return [];
            }

            if (sql.includes('manual_customer_receipts')) {
              return [];
            }

            return [];
          }
        };
      }
    }
  };
}

function createResponse() {
  return {
    headersSent: false,
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}

test('handleGetLookups hides experimental branches by default', async () => {
  const server = new LocalWebServer(createDbManager([
    { id: 1, name: 'الفرع الرئيسي' },
    { id: 2, name: 'SYNC TEST BRANCH' },
    { id: 3, name: 'فرع تجريبي' }
  ]));

  const res = createResponse();
  await server.handleGetLookups(res);

  const payload = JSON.parse(res.body);
  assert.equal(payload.success, true);
  assert.deepEqual(payload.branches.map((branch) => branch.name), ['الفرع الرئيسي']);
});

test('handleGetLookups can include experimental branches when requested', async () => {
  const server = new LocalWebServer(createDbManager([
    { id: 1, name: 'الفرع الرئيسي' },
    { id: 2, name: 'SYNC TEST BRANCH' }
  ]));

  const res = createResponse();
  await server.handleGetLookups(res, { includeTestBranches: '1' });

  const payload = JSON.parse(res.body);
  assert.equal(payload.success, true);
  assert.equal(payload.branches.length, 2);
  assert.ok(payload.branches.some((branch) => branch.name === 'SYNC TEST BRANCH'));
});
