'use strict';

function normalizeId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
}

function normalizeBranchId(value) {
  return normalizeId(value);
}

function normalizeCode(value) {
  const code = String(value == null ? '' : value).trim().toUpperCase();
  return ['', '-', '–', '—'].includes(code) ? '' : code;
}

function normalizeName(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRef(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    customerId: normalizeId(source.customerId ?? source.customer_id),
    customerCode: normalizeCode(source.customerCode ?? source.customer_code),
    customerName: normalizeName(source.customerName ?? source.customer_name),
    branchId: normalizeBranchId(source.forcedBranchId ?? source.branchId ?? source.branch_id)
  };
}

function refKey(ref) {
  if (ref.customerId) return `id:${ref.customerId}`;
  if (ref.customerCode) return `code:${ref.customerCode}`;
  return `name:${ref.customerName}|branch:${ref.branchId}`;
}

function dedupeRefs(values) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const ref = normalizeRef(value);
    if (!ref.customerId && !ref.customerCode && !ref.customerName) continue;
    if (!unique.has(refKey(ref))) unique.set(refKey(ref), ref);
  }
  return Array.from(unique.values());
}

function buildMatcher(alias, refs, branchExpression = '') {
  const clauses = [];
  const params = [];
  for (const ref of refs) {
    const branchClause = branchExpression && ref.branchId ? ` AND COALESCE(${branchExpression}, 0) = ?` : '';
    if (ref.customerId) {
      clauses.push(`(COALESCE(${alias}.customer_id, 0) = ?${branchClause})`);
      params.push(ref.customerId);
      if (branchClause) params.push(ref.branchId);
      if (ref.customerCode) {
        clauses.push(`(COALESCE(${alias}.customer_id, 0) = 0 AND UPPER(TRIM(COALESCE(${alias}.customer_code, ''))) = ?${branchClause})`);
        params.push(ref.customerCode);
        if (branchClause) params.push(ref.branchId);
      }
    } else if (ref.customerCode) {
      clauses.push(`(UPPER(TRIM(COALESCE(${alias}.customer_code, ''))) = ?${branchClause})`);
      params.push(ref.customerCode);
      if (branchClause) params.push(ref.branchId);
    } else if (ref.customerName) {
      clauses.push(`(TRIM(COALESCE(${alias}.customer_name, '')) = ?${branchClause})`);
      params.push(ref.customerName);
      if (branchClause) params.push(ref.branchId);
    }
  }
  return { clause: clauses.length ? clauses.join(' OR ') : '0 = 1', params };
}

function selectMovementRows(db, table, alias, refs, branchId, reconciled) {
  const scopedRefs = refs.map((ref) => ({ ...ref, branchId }));
  const matcher = buildMatcher(alias, scopedRefs, reconciled ? 'c.branch_id' : '');
  const joins = reconciled
    ? `LEFT JOIN reconciliations r ON r.id = ${alias}.reconciliation_id LEFT JOIN cashiers c ON c.id = r.cashier_id`
    : '';
  return db.prepare(`
    SELECT ${alias}.id,
           COALESCE(${alias}.customer_id, 0) AS old_customer_id,
           COALESCE(${alias}.customer_name, '') AS old_name,
           COALESCE(${alias}.customer_code, '') AS old_code
    FROM ${table} ${alias}
    ${joins}
    WHERE ${matcher.clause}
  `).all(...matcher.params);
}

function updateRowsById(db, table, rows, target) {
  if (!rows.length) return 0;
  const statement = db.prepare(`
    UPDATE ${table}
    SET customer_id = ?, customer_name = ?, customer_code = ?
    WHERE id = ?
  `);
  let changed = 0;
  for (const row of rows) {
    changed += statement.run(target.id, target.customer_name, target.customer_code, row.id).changes;
  }
  return changed;
}

function ensureHistorySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_merge_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      branch_id INTEGER DEFAULT 0,
      target_name TEXT NOT NULL,
      target_customer_id INTEGER DEFAULT 0,
      target_customer_code TEXT DEFAULT '',
      source_names_json TEXT NOT NULL,
      affected_rows_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      undone_at DATETIME,
      undo_details_json TEXT
    )
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(ledger_merge_history)').all().map((row) => row.name));
  if (!columns.has('target_customer_id')) db.exec('ALTER TABLE ledger_merge_history ADD COLUMN target_customer_id INTEGER DEFAULT 0');
  if (!columns.has('target_customer_code')) db.exec("ALTER TABLE ledger_merge_history ADD COLUMN target_customer_code TEXT DEFAULT ''");
}

function executeCustomerMerge(db, payload = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('قاعدة البيانات غير جاهزة');
  const branchId = normalizeBranchId(payload.branchId);
  if (!branchId) throw new Error('الفرع المحدد غير صالح');

  const targetRef = normalizeRef(payload.targetRef);
  const sourceRefs = dedupeRefs(payload.sourceRefs).filter((ref) => refKey(ref) !== refKey(targetRef));
  if (!targetRef.customerId || !targetRef.customerCode) throw new Error('اختر العميل الرسمي الذي يحمل كودًا معتمدًا');
  if (!sourceRefs.length) throw new Error('لم يتم تحديد عملاء مختلفين للدمج');

  ensureHistorySchema(db);
  const transaction = db.transaction(() => {
    const target = db.prepare(`
      SELECT id, customer_name, customer_code, branch_id,
             COALESCE(is_active, 1) AS is_active,
             COALESCE(merged_into_customer_id, 0) AS merged_into_customer_id
      FROM customers WHERE id = ? LIMIT 1
    `).get(targetRef.customerId);
    if (!target) throw new Error('تعذر العثور على سجل العميل الأساسي');
    if (normalizeBranchId(target.branch_id) !== branchId) throw new Error('العميل الأساسي لا يتبع الفرع المحدد');
    if (normalizeId(target.merged_into_customer_id)) throw new Error('العميل المختار مدمج مسبقًا في سجل آخر');
    target.customer_name = normalizeName(target.customer_name);
    target.customer_code = normalizeCode(target.customer_code);
    if (!target.customer_name || !target.customer_code) throw new Error('بيانات العميل الأساسي غير مكتملة');

    const allRefs = dedupeRefs([targetRef, ...sourceRefs]);
    const manualBranch = normalizeBranchId(db.prepare('SELECT branch_id FROM cashiers ORDER BY id LIMIT 1').get()?.branch_id);
    const affected = {
      customers: [],
      postpaid_sales: selectMovementRows(db, 'postpaid_sales', 'ps', allRefs, branchId, true),
      customer_receipts: selectMovementRows(db, 'customer_receipts', 'cr', allRefs, branchId, true),
      manual_postpaid_sales: [],
      manual_customer_receipts: []
    };
    if (manualBranch === branchId) {
      affected.manual_postpaid_sales = selectMovementRows(db, 'manual_postpaid_sales', 'mps', allRefs, branchId, false);
      affected.manual_customer_receipts = selectMovementRows(db, 'manual_customer_receipts', 'mcr', allRefs, branchId, false);
    }

    const sourceCustomerIds = sourceRefs.map((ref) => ref.customerId).filter(Boolean);
    if (sourceCustomerIds.length) {
      const placeholders = sourceCustomerIds.map(() => '?').join(',');
      affected.customers = db.prepare(`
        SELECT id, customer_name AS old_name, COALESCE(customer_code, '') AS old_code,
               COALESCE(is_active, 1) AS old_is_active,
               COALESCE(merged_into_customer_id, 0) AS old_merged_into_customer_id,
               merged_at AS old_merged_at
        FROM customers
        WHERE id IN (${placeholders}) AND COALESCE(branch_id, 0) = ? AND id <> ?
      `).all(...sourceCustomerIds, branchId, target.id);
    }
    const conflict = affected.customers.find((row) => normalizeId(row.old_merged_into_customer_id) && normalizeId(row.old_merged_into_customer_id) !== target.id);
    if (conflict) throw new Error(`العميل رقم ${conflict.id} مدمج مسبقًا في عميل آخر`);

    const changes = {
      postpaidChanges: updateRowsById(db, 'postpaid_sales', affected.postpaid_sales, target),
      receiptChanges: updateRowsById(db, 'customer_receipts', affected.customer_receipts, target),
      manualPostpaidChanges: updateRowsById(db, 'manual_postpaid_sales', affected.manual_postpaid_sales, target),
      manualReceiptChanges: updateRowsById(db, 'manual_customer_receipts', affected.manual_customer_receipts, target)
    };
    let registryChanges = 0;
    const mergeCustomer = db.prepare(`UPDATE customers SET is_active = 0, merged_into_customer_id = ?, merged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    for (const row of affected.customers) registryChanges += mergeCustomer.run(target.id, row.id).changes;
    db.prepare(`UPDATE customers SET is_active = 1, merged_into_customer_id = NULL, merged_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(target.id);

    const totalChanges = changes.postpaidChanges + changes.receiptChanges + changes.manualPostpaidChanges + changes.manualReceiptChanges;
    if (!totalChanges) throw new Error('لم يتم العثور على حركات مطابقة داخل الفرع المحدد');
    const sourceLabels = sourceRefs.map((ref) => ref.customerCode ? `${ref.customerCode} - ${ref.customerName}` : ref.customerName);
    const history = db.prepare(`
      INSERT INTO ledger_merge_history
        (entity_type, branch_id, target_name, target_customer_id, target_customer_code, source_names_json, affected_rows_json)
      VALUES ('customer', ?, ?, ?, ?, ?, ?)
    `).run(branchId, target.customer_name, target.id, target.customer_code, JSON.stringify(sourceLabels), JSON.stringify(affected));

    return {
      ...changes,
      manualChanges: changes.manualPostpaidChanges + changes.manualReceiptChanges,
      registryChanges,
      totalChanges,
      mergeHistoryId: Number(history.lastInsertRowid || 0),
      targetIdentity: {
        customer_id: target.id,
        customer_name: target.customer_name,
        customer_code: target.customer_code,
        branch_id: branchId
      }
    };
  });
  return transaction();
}

module.exports = {
  executeCustomerMerge,
  normalizeCode,
  normalizeName,
  normalizeRef
};
