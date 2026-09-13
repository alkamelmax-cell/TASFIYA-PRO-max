'use strict';

function normalizeId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
}

function normalizeName(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueRawNames(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value == null ? '' : value))
    .filter((value) => normalizeName(value))));
}

function uniqueAliasNames(values) {
  const aliases = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = String(value == null ? '' : value).trim();
    const normalized = normalizeName(value);
    if (raw) aliases.add(raw);
    if (normalized) aliases.add(normalized);
  }
  return Array.from(aliases);
}

function ensureSupplierIdentitySchema(db) {
  const addColumn = (table, column, definition) => {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('suppliers', 'supplier_account_id', 'INTEGER');
  addColumn('manual_supplier_transactions', 'supplier_account_id', 'INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      merged_into_supplier_id INTEGER,
      merged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_accounts_branch_name
      ON supplier_accounts(branch_id, supplier_name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS supplier_identity_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      alias_name TEXT NOT NULL,
      canonical_supplier_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_alias_branch_name
      ON supplier_identity_aliases(branch_id, alias_name COLLATE NOCASE);
  `);
}

function ensureHistorySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_merge_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      branch_id INTEGER DEFAULT 0,
      target_name TEXT NOT NULL,
      target_supplier_id INTEGER DEFAULT 0,
      source_names_json TEXT NOT NULL,
      affected_rows_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      undone_at DATETIME,
      undo_details_json TEXT
    )
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(ledger_merge_history)').all().map((row) => row.name));
  if (!columns.has('target_supplier_id')) db.exec('ALTER TABLE ledger_merge_history ADD COLUMN target_supplier_id INTEGER DEFAULT 0');
}

function resolveOrCreateTarget(db, branchId, targetName) {
  let account = db.prepare(`
    SELECT sa.id, sa.supplier_name, sa.merged_into_supplier_id
    FROM supplier_identity_aliases a
    JOIN supplier_accounts sa ON sa.id = a.canonical_supplier_id
    WHERE a.branch_id = ? AND a.alias_name = ? COLLATE NOCASE
      AND COALESCE(a.is_active, 1) = 1
    ORDER BY a.updated_at DESC, a.id DESC LIMIT 1
  `).get(branchId, targetName);
  if (!account) account = db.prepare(`
    SELECT id, supplier_name, merged_into_supplier_id FROM supplier_accounts
    WHERE branch_id = ? AND supplier_name = ? COLLATE NOCASE LIMIT 1
  `).get(branchId, targetName);
  const visited = new Set();
  while (account && normalizeId(account.merged_into_supplier_id) && !visited.has(account.id)) {
    visited.add(account.id);
    account = db.prepare(`
      SELECT id, supplier_name, merged_into_supplier_id
      FROM supplier_accounts WHERE id = ? AND branch_id = ? LIMIT 1
    `).get(normalizeId(account.merged_into_supplier_id), branchId);
  }
  if (!account) {
    const result = db.prepare(`
      INSERT INTO supplier_accounts (branch_id, supplier_name, is_active)
      VALUES (?, ?, 1)
    `).run(branchId, targetName);
    account = { id: Number(result.lastInsertRowid || 0), supplier_name: targetName, merged_into_supplier_id: 0 };
  }
  const canonicalName = normalizeName(account.supplier_name) || targetName;
  db.prepare(`
    UPDATE supplier_accounts
    SET supplier_name = ?, is_active = 1, merged_into_supplier_id = NULL,
        merged_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(canonicalName, account.id);
  return { id: normalizeId(account.id), supplier_name: canonicalName };
}

function selectAffectedRows(db, table, alias, names, branchId, reconciled) {
  const placeholders = names.map(() => '?').join(',');
  const joins = reconciled
    ? `JOIN reconciliations r ON r.id = ${alias}.reconciliation_id JOIN cashiers c ON c.id = r.cashier_id`
    : '';
  const branchClause = reconciled ? 'COALESCE(c.branch_id, 0) = ?' : `COALESCE(${alias}.branch_id, 0) = ?`;
  return db.prepare(`
    SELECT ${alias}.id, ${alias}.supplier_name AS old_name,
           COALESCE(${alias}.supplier_account_id, 0) AS old_supplier_account_id
    FROM ${table} ${alias} ${joins}
    WHERE ${alias}.supplier_name IN (${placeholders}) AND ${branchClause}
  `).all(...names, branchId);
}

function updateAffectedRows(db, table, rows, target, setUpdatedAt) {
  const statement = db.prepare(`
    UPDATE ${table}
    SET supplier_account_id = ?, supplier_name = ?${setUpdatedAt ? ', updated_at = CURRENT_TIMESTAMP' : ''}
    WHERE id = ?
  `);
  let changes = 0;
  for (const row of rows) changes += statement.run(target.id, target.supplier_name, row.id).changes;
  return changes;
}

function executeSupplierUnification(db, payload = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('قاعدة البيانات غير جاهزة');
  const branchId = normalizeId(payload.branchId);
  const rawTargetName = String(payload.targetName == null ? '' : payload.targetName);
  const targetName = normalizeName(rawTargetName);
  const sourceNames = uniqueRawNames(payload.sourceNames).filter((name) => name !== rawTargetName);
  if (!branchId) throw new Error('الفرع المحدد غير صالح');
  if (!targetName) throw new Error('اسم المورد الأساسي غير صالح');
  if (!sourceNames.length) throw new Error('لم يتم تحديد موردين مختلفين للتوحيد');

  ensureSupplierIdentitySchema(db);
  ensureHistorySchema(db);
  return db.transaction(() => {
    const target = resolveOrCreateTarget(db, branchId, targetName);
    const allNames = uniqueRawNames([rawTargetName, ...sourceNames]);
    const affected = {
      suppliers: selectAffectedRows(db, 'suppliers', 's', allNames, branchId, true),
      manual_supplier_transactions: selectAffectedRows(db, 'manual_supplier_transactions', 'mst', allNames, branchId, false),
      supplier_accounts: db.prepare(`
        SELECT id, supplier_name AS old_name, COALESCE(is_active, 1) AS old_is_active,
               COALESCE(merged_into_supplier_id, 0) AS old_merged_into_supplier_id,
               merged_at AS old_merged_at
        FROM supplier_accounts
        WHERE branch_id = ? AND id <> ?
          AND supplier_name IN (${allNames.map(() => '?').join(',')})
      `).all(branchId, target.id, ...allNames)
    };
    const expected = affected.suppliers.length + affected.manual_supplier_transactions.length;
    if (!expected) throw new Error('لم يتم العثور على قيود مورد مطابقة داخل الفرع المحدد');

    const reconciledChanges = updateAffectedRows(db, 'suppliers', affected.suppliers, target, false);
    const manualChanges = updateAffectedRows(db, 'manual_supplier_transactions', affected.manual_supplier_transactions, target, true);
    const mergeAccount = db.prepare(`
      UPDATE supplier_accounts
      SET is_active = 0, merged_into_supplier_id = ?, merged_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    let accountChanges = 0;
    for (const account of affected.supplier_accounts) accountChanges += mergeAccount.run(target.id, account.id).changes;
    const upsertAlias = db.prepare(`
      INSERT INTO supplier_identity_aliases
        (branch_id, alias_name, canonical_supplier_id, is_active, updated_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(branch_id, alias_name)
      DO UPDATE SET canonical_supplier_id = excluded.canonical_supplier_id,
                    is_active = 1, updated_at = CURRENT_TIMESTAMP
    `);
    const aliasNames = uniqueAliasNames(allNames);
    for (const name of aliasNames) upsertAlias.run(branchId, name, target.id);

    const verifySupplier = db.prepare('SELECT supplier_account_id, supplier_name FROM suppliers WHERE id = ?');
    const verifyManual = db.prepare('SELECT supplier_account_id, supplier_name FROM manual_supplier_transactions WHERE id = ?');
    for (const row of affected.suppliers) {
      const current = verifySupplier.get(row.id);
      if (!current || normalizeId(current.supplier_account_id) !== target.id || normalizeName(current.supplier_name) !== target.supplier_name) {
        throw new Error('فشل فحص سلامة قيود المورد المرتبطة بالتصفيات');
      }
    }
    for (const row of affected.manual_supplier_transactions) {
      const current = verifyManual.get(row.id);
      if (!current || normalizeId(current.supplier_account_id) !== target.id || normalizeName(current.supplier_name) !== target.supplier_name) {
        throw new Error('فشل فحص سلامة القيود اليدوية للمورد');
      }
    }

    const history = db.prepare(`
      INSERT INTO ledger_merge_history
        (entity_type, branch_id, target_name, target_supplier_id, source_names_json, affected_rows_json)
      VALUES ('supplier', ?, ?, ?, ?, ?)
    `).run(branchId, target.supplier_name, target.id, JSON.stringify(sourceNames), JSON.stringify(affected));
    return {
      reconciledChanges,
      manualChanges,
      accountChanges,
      totalChanges: reconciledChanges + manualChanges,
      aliasesRecorded: aliasNames.length,
      targetSupplierId: target.id,
      targetName: target.supplier_name,
      mergeHistoryId: Number(history.lastInsertRowid || 0)
    };
  })();
}

module.exports = { executeSupplierUnification, ensureSupplierIdentitySchema, normalizeName };
