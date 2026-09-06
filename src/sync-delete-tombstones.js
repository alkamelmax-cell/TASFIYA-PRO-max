const { EXPLICIT_DELETE_ID_TABLES } = require('./sync-write-detector');

const TOMBSTONE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sync_deleted_rows (
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  deleted_at DATETIME NOT NULL,
  PRIMARY KEY (table_name, row_key)
)`;

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalInteger(value) {
  const parsed = parsePositiveInteger(value);
  return parsed === null ? null : parsed;
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDeletedReconciliation(row = {}) {
  const id = parsePositiveInteger(row.id);
  if (id === null) {
    return null;
  }

  return {
    id,
    reconciliation_number: normalizeOptionalInteger(row.reconciliation_number),
    cashier_id: normalizeOptionalInteger(row.cashier_id),
    accountant_id: normalizeOptionalInteger(row.accountant_id),
    reconciliation_date: normalizeOptionalText(row.reconciliation_date),
    status: normalizeOptionalText(row.status),
    created_at: normalizeOptionalText(row.created_at),
    updated_at: normalizeOptionalText(row.updated_at)
  };
}

function encodeDeletedRowKey(tableName, value) {
  if (tableName === 'reconciliations' && value && typeof value === 'object') {
    const normalized = normalizeDeletedReconciliation(value);
    return normalized ? JSON.stringify(normalized) : null;
  }

  const id = parsePositiveInteger(value && typeof value === 'object' ? value.id : value);
  return id === null ? null : String(id);
}

function ensureSyncDeleteTombstoneSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    return false;
  }

  try {
    db.exec(TOMBSTONE_TABLE_SQL);
    return true;
  } catch (error) {
    console.warn('⚠️ [SYNC] Delete tombstone storage unavailable:', error.message);
    return false;
  }
}

function getDeleteTargetTable(sql) {
  const match = String(sql || '')
    .trim()
    .match(/^delete\s+from\s+["'`\[]?([a-zA-Z0-9_]+)["'`\]]?/i);

  const tableName = match ? String(match[1]).toLowerCase() : '';
  return EXPLICIT_DELETE_ID_TABLES.has(tableName) ? tableName : null;
}

function buildDeletedRowsSelectSql(sql, tableName) {
  const trimmedSql = String(sql || '').trim().replace(/;+\s*$/g, '');
  const tablePattern = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = trimmedSql.match(new RegExp(`^delete\\s+from\\s+["'\`\\[]?${tablePattern}["'\`\\]]?`, 'i'));

  if (!match) {
    return null;
  }

  const suffix = trimmedSql.slice(match[0].length);
  if (/\breturning\b/i.test(suffix)) {
    return null;
  }

  if (tableName === 'reconciliations') {
    return `SELECT id, reconciliation_number, cashier_id, accountant_id, reconciliation_date, status, created_at, updated_at FROM ${tableName}${suffix}`;
  }

  return `SELECT id FROM ${tableName}${suffix}`;
}

function readIdsToBeDeleted(db, sql, params = []) {
  const tableName = getDeleteTargetTable(sql);
  if (!tableName || !db || typeof db.prepare !== 'function') {
    return { tableName, ids: [] };
  }

  const selectSql = buildDeletedRowsSelectSql(sql, tableName);
  if (!selectSql) {
    return { tableName, ids: [] };
  }

  try {
    const rows = db.prepare(selectSql).all(...(Array.isArray(params) ? params : []));
    const records = Array.from(new Map(
      (Array.isArray(rows) ? rows : [])
        .map((row) => {
          if (tableName === 'reconciliations') {
            const normalized = normalizeDeletedReconciliation(row);
            return normalized ? [String(normalized.id), normalized] : null;
          }

          const id = parsePositiveInteger(row && row.id);
          return id === null ? null : [String(id), id];
        })
        .filter(Boolean)
    ).values());
    const ids = records
      .map((record) => parsePositiveInteger(record && typeof record === 'object' ? record.id : record))
      .filter((id) => id !== null);
    return { tableName, ids, records };
  } catch (error) {
    console.warn(`⚠️ [SYNC] Could not inspect deleted ${tableName} rows:`, error.message);
    return { tableName, ids: [], records: [] };
  }
}

function recordDeleteTombstones(db, tableName, records = [], options = {}) {
  const normalizedTableName = String(tableName || '').toLowerCase();
  const rowKeys = Array.from(new Set(
    (Array.isArray(records) ? records : [])
      .map((record) => encodeDeletedRowKey(normalizedTableName, record))
      .filter((rowKey) => typeof rowKey === 'string' && rowKey.length > 0)
  ));

  if (!EXPLICIT_DELETE_ID_TABLES.has(normalizedTableName) || rowKeys.length === 0) {
    return [];
  }

  if (!ensureSyncDeleteTombstoneSchema(db)) {
    return [];
  }

  const deletedAt = options.deletedAt || new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO sync_deleted_rows (table_name, row_key, deleted_at)
      VALUES (?, ?, ?)
    `);

    const writeRows = (keys) => {
      keys.forEach((rowKey) => stmt.run(normalizedTableName, rowKey, deletedAt));
    };

    if (typeof db.transaction === 'function') {
      db.transaction(writeRows)(rowKeys);
    } else {
      writeRows(rowKeys);
    }

    return rowKeys.map((rowKey) => ({ tableName: normalizedTableName, rowKey }));
  } catch (error) {
    console.warn(`⚠️ [SYNC] Could not record deleted ${normalizedTableName} rows:`, error.message);
    return [];
  }
}

function recordDeleteTombstonesForSql(db, sql, params = [], options = {}) {
  const { tableName, records, ids } = readIdsToBeDeleted(db, sql, params);
  return recordDeleteTombstones(db, tableName, records && records.length > 0 ? records : ids, options);
}

function readDeleteTombstones(db, allowedTables = EXPLICIT_DELETE_ID_TABLES) {
  if (!db || typeof db.prepare !== 'function') {
    return new Map();
  }

  try {
    ensureSyncDeleteTombstoneSchema(db);
    const rows = db.prepare(`
      SELECT table_name, row_key
      FROM sync_deleted_rows
      ORDER BY deleted_at ASC
    `).all();

    const result = new Map();
    for (const row of rows || []) {
      const tableName = String(row.table_name || '').toLowerCase();
      const rowKey = String(row.row_key || '').trim();
      if (!allowedTables.has(tableName) || !rowKey) {
        continue;
      }

      if (!result.has(tableName)) {
        result.set(tableName, []);
      }
      result.get(tableName).push(rowKey);
    }

    return result;
  } catch (_error) {
    return new Map();
  }
}

function clearDeleteTombstones(db, tableName, rowKeys = []) {
  if (!db || typeof db.prepare !== 'function' || !Array.isArray(rowKeys) || rowKeys.length === 0) {
    return;
  }

  try {
    ensureSyncDeleteTombstoneSchema(db);
    const stmt = db.prepare('DELETE FROM sync_deleted_rows WHERE table_name = ? AND row_key = ?');
    const deleteRows = (keys) => {
      keys.forEach((rowKey) => stmt.run(tableName, String(rowKey)));
    };

    if (typeof db.transaction === 'function') {
      db.transaction(deleteRows)(rowKeys);
    } else {
      deleteRows(rowKeys);
    }
  } catch (error) {
    console.warn(`⚠️ [SYNC] Failed to clear delete tombstones for ${tableName}:`, error.message);
  }
}

module.exports = {
  buildDeletedRowsSelectSql,
  clearDeleteTombstones,
  encodeDeletedRowKey,
  ensureSyncDeleteTombstoneSchema,
  getDeleteTargetTable,
  normalizeDeletedReconciliation,
  readDeleteTombstones,
  readIdsToBeDeleted,
  recordDeleteTombstones,
  recordDeleteTombstonesForSql
};
