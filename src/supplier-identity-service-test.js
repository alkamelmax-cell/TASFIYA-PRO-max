'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { executeSupplierUnification } = require('./app/supplier-identity-service');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE cashiers (id INTEGER PRIMARY KEY, branch_id INTEGER);
  CREATE TABLE reconciliations (id INTEGER PRIMARY KEY, cashier_id INTEGER);
  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY, reconciliation_id INTEGER, supplier_name TEXT,
    supplier_account_id INTEGER
  );
  CREATE TABLE manual_supplier_transactions (
    id INTEGER PRIMARY KEY, supplier_name TEXT, supplier_account_id INTEGER,
    branch_id INTEGER, updated_at DATETIME
  );
  INSERT INTO cashiers VALUES (1, 4);
  INSERT INTO reconciliations VALUES (10, 1);
  INSERT INTO suppliers VALUES (100, 10, 'شركة التوريد', NULL);
  INSERT INTO suppliers VALUES (101, 10, ' شركة\u200B  التوريد ', NULL);
  INSERT INTO manual_supplier_transactions VALUES (200, 'مؤسسة التوريد', NULL, 4, NULL);
`);

const result = executeSupplierUnification(db, {
  branchId: 4,
  targetName: 'شركة التوريد',
  sourceNames: [' شركة\u200B  التوريد ', 'مؤسسة التوريد']
});
assert.strictEqual(result.totalChanges, 3);
assert.ok(result.targetSupplierId > 0);
assert.strictEqual(db.prepare('SELECT COUNT(DISTINCT supplier_name) AS count FROM suppliers').get().count, 1);
assert.strictEqual(db.prepare('SELECT supplier_name FROM manual_supplier_transactions WHERE id = 200').get().supplier_name, 'شركة التوريد');
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM supplier_identity_aliases WHERE canonical_supplier_id = ?').get(result.targetSupplierId).count, 3);
assert.strictEqual(db.prepare('SELECT target_supplier_id FROM ledger_merge_history').get().target_supplier_id, result.targetSupplierId);
assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM ledger_merge_history WHERE entity_type = 'supplier'").get().count, 1);
db.close();
console.log('Supplier identity unification tests passed');
