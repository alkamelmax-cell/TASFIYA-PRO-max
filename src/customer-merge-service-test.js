'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { executeCustomerMerge, normalizeName } = require('./app/customer-merge-service');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY, customer_code TEXT, customer_name TEXT, branch_id INTEGER,
      is_active INTEGER DEFAULT 1, merged_into_customer_id INTEGER, merged_at DATETIME,
      created_at DATETIME, updated_at DATETIME
    );
    CREATE TABLE cashiers (id INTEGER PRIMARY KEY, branch_id INTEGER);
    CREATE TABLE reconciliations (id INTEGER PRIMARY KEY, cashier_id INTEGER);
    CREATE TABLE postpaid_sales (
      id INTEGER PRIMARY KEY, reconciliation_id INTEGER, customer_id INTEGER,
      customer_code TEXT, customer_name TEXT
    );
    CREATE TABLE customer_receipts (
      id INTEGER PRIMARY KEY, reconciliation_id INTEGER, customer_id INTEGER,
      customer_code TEXT, customer_name TEXT
    );
    CREATE TABLE manual_postpaid_sales (
      id INTEGER PRIMARY KEY, customer_id INTEGER, customer_code TEXT, customer_name TEXT
    );
    CREATE TABLE manual_customer_receipts (
      id INTEGER PRIMARY KEY, customer_id INTEGER, customer_code TEXT, customer_name TEXT
    );
    INSERT INTO cashiers VALUES (1, 7);
    INSERT INTO reconciliations VALUES (10, 1);
    INSERT INTO customers VALUES (1, 'C7-000001', 'العميل الأساسي', 7, 1, NULL, NULL, NULL, NULL);
    INSERT INTO customers VALUES (2, 'C7-000002', 'عميل مكرر', 7, 1, NULL, NULL, NULL, NULL);
    INSERT INTO postpaid_sales VALUES (100, 10, 2, 'C7-000002', 'عميل مكرر');
    INSERT INTO customer_receipts VALUES (101, 10, 99, 'C7-000002', 'عميل مكرر');
    INSERT INTO manual_postpaid_sales VALUES (102, 2, 'C7-000002', 'عميل مكرر');
  `);
  return db;
}

{
  const db = createDatabase();
  const result = executeCustomerMerge(db, {
    branchId: 7,
    targetRef: { customerId: 1, customerCode: 'C7-000001', customerName: 'العميل الأساسي' },
    sourceRefs: [{ customerId: 2, customerCode: 'C7-000002', customerName: 'عميل مكرر', branchId: 7 }]
  });
  assert.strictEqual(result.totalChanges, 3);
  assert.strictEqual(result.registryChanges, 1);
  assert.deepStrictEqual(
    db.prepare('SELECT DISTINCT customer_id, customer_code, customer_name FROM postpaid_sales UNION SELECT DISTINCT customer_id, customer_code, customer_name FROM customer_receipts UNION SELECT DISTINCT customer_id, customer_code, customer_name FROM manual_postpaid_sales').all(),
    [{ customer_id: 1, customer_code: 'C7-000001', customer_name: 'العميل الأساسي' }]
  );
  assert.deepStrictEqual(
    db.prepare('SELECT is_active, merged_into_customer_id FROM customers WHERE id = 2').get(),
    { is_active: 0, merged_into_customer_id: 1 }
  );
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM ledger_merge_history WHERE entity_type = 'customer'").get().count, 1);
  db.close();
}

{
  const db = createDatabase();
  assert.throws(() => executeCustomerMerge(db, {
    branchId: 8,
    targetRef: { customerId: 1, customerCode: 'C7-000001' },
    sourceRefs: [{ customerId: 2, customerCode: 'C7-000002' }]
  }), /لا يتبع الفرع/);
  assert.strictEqual(db.prepare('SELECT customer_id FROM postpaid_sales WHERE id = 100').get().customer_id, 2);
  assert.strictEqual(db.prepare('SELECT merged_into_customer_id FROM customers WHERE id = 2').get().merged_into_customer_id, null);
  db.close();
}

{
  const db = createDatabase();
  db.prepare("INSERT INTO postpaid_sales VALUES (200, 10, 2, 'C7-000271', 'عميل بلا سجل رسمي')").run();
  const result = executeCustomerMerge(db, {
    branchId: 7,
    targetRef: { customerId: 0, customerCode: 'C7-000271', customerName: 'عميل بلا سجل رسمي' },
    sourceRefs: [{ customerId: 2, customerCode: 'C7-000002', customerName: 'عميل مكرر', branchId: 7 }]
  });
  const createdTarget = db.prepare("SELECT id, customer_code FROM customers WHERE customer_code = 'C7-000271'").get();
  assert.ok(createdTarget.id > 0);
  assert.strictEqual(result.targetIdentity.customer_id, createdTarget.id);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM postpaid_sales WHERE customer_id = ?').get(createdTarget.id).count, 2);
  assert.strictEqual(db.prepare('SELECT merged_into_customer_id FROM customers WHERE id = 2').get().merged_into_customer_id, createdTarget.id);
  db.close();
}

assert.strictEqual(normalizeName('  مورد\u200B   تجريبي  '), 'مورد تجريبي');
console.log('Atomic customer merge service tests passed');
