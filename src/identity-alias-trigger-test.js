'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const DatabaseManager = require('./database');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE customers (id INTEGER PRIMARY KEY, customer_code TEXT, customer_name TEXT);
  CREATE TABLE cashiers (id INTEGER PRIMARY KEY, branch_id INTEGER);
  CREATE TABLE reconciliations (id INTEGER PRIMARY KEY, cashier_id INTEGER);
  CREATE TABLE customer_identity_aliases (
    id INTEGER PRIMARY KEY, branch_id INTEGER, alias_customer_id INTEGER, alias_code TEXT,
    canonical_customer_id INTEGER, is_active INTEGER, updated_at DATETIME
  );
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
  CREATE TABLE supplier_accounts (id INTEGER PRIMARY KEY, supplier_name TEXT);
  CREATE TABLE supplier_identity_aliases (
    id INTEGER PRIMARY KEY, branch_id INTEGER, alias_name TEXT,
    canonical_supplier_id INTEGER, is_active INTEGER
  );
  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY, reconciliation_id INTEGER, supplier_name TEXT, supplier_account_id INTEGER
  );
  CREATE TABLE manual_supplier_transactions (
    id INTEGER PRIMARY KEY, branch_id INTEGER, supplier_name TEXT, supplier_account_id INTEGER
  );

  INSERT INTO customers VALUES (1, 'C4-000001', 'العميل الأساسي');
  INSERT INTO cashiers VALUES (8, 4);
  INSERT INTO reconciliations VALUES (9, 8);
  INSERT INTO customer_identity_aliases VALUES (1, 4, 22, 'C4-000022', 1, 1, CURRENT_TIMESTAMP);
  INSERT INTO supplier_accounts VALUES (6, 'المورد الأساسي');
  INSERT INTO supplier_identity_aliases VALUES (1, 4, 'اسم المورد القديم', 6, 1);
`);

const manager = new DatabaseManager();
manager.db = db;
manager.ensureIdentityAliasTriggers();

db.prepare("INSERT INTO postpaid_sales VALUES (1, 9, 22, 'C4-000022', 'قديم')").run();
db.prepare("INSERT INTO manual_customer_receipts VALUES (2, 22, 'C4-000022', 'قديم')").run();
assert.deepStrictEqual(db.prepare('SELECT customer_id, customer_code, customer_name FROM postpaid_sales').get(), {
  customer_id: 1, customer_code: 'C4-000001', customer_name: 'العميل الأساسي'
});
assert.deepStrictEqual(db.prepare('SELECT customer_id, customer_code, customer_name FROM manual_customer_receipts').get(), {
  customer_id: 1, customer_code: 'C4-000001', customer_name: 'العميل الأساسي'
});

db.prepare("INSERT INTO suppliers VALUES (3, 9, 'اسم المورد القديم', NULL)").run();
db.prepare("INSERT INTO manual_supplier_transactions VALUES (4, 4, 'اسم المورد القديم', NULL)").run();
assert.deepStrictEqual(db.prepare('SELECT supplier_account_id, supplier_name FROM suppliers').get(), {
  supplier_account_id: 6, supplier_name: 'المورد الأساسي'
});
assert.deepStrictEqual(db.prepare('SELECT supplier_account_id, supplier_name FROM manual_supplier_transactions').get(), {
  supplier_account_id: 6, supplier_name: 'المورد الأساسي'
});

db.close();
console.log('Identity alias routing trigger tests passed');
