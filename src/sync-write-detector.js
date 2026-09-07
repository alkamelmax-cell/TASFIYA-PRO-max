const SYNC_RELEVANT_TABLES = [
  'admins',
  'branches',
  'cashiers',
  'accountants',
  'atms',
  'branch_cashboxes',
  'customers',
  'cashbox_vouchers',
  'cashbox_voucher_audit_log',
  'reconciliations',
  'bank_receipts',
  'cash_receipts',
  'postpaid_sales',
  'customer_receipts',
  'customer_fiscal_opening_balances',
  'manual_postpaid_sales',
  'manual_customer_receipts',
  'return_invoices',
  'suppliers',
  'reconciliation_requests'
];

const EXPLICIT_DELETE_ID_TABLES = new Set([
  'branch_cashboxes',
  'cashbox_vouchers',
  'reconciliations',
  'postpaid_sales',
  'customer_receipts',
  'manual_postpaid_sales',
  'manual_customer_receipts',
  'customer_fiscal_opening_balances',
  'cash_receipts',
  'bank_receipts',
  'return_invoices',
  'suppliers'
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSyncWriteTables(sql) {
  const normalized = normalizeSql(sql);
  if (!normalized || !/^(insert|update|delete|replace)\b/.test(normalized)) {
    return [];
  }

  return SYNC_RELEVANT_TABLES.filter((tableName) => {
    const tablePattern = escapeRegExp(tableName);
    const writeTargetPattern = new RegExp(
      `\\b(?:into|update|from)\\s+["'\`\\[]?${tablePattern}["'\`\\]]?\\b`,
      'i'
    );
    return writeTargetPattern.test(normalized);
  });
}

function shouldTriggerSyncForSql(sql) {
  return getSyncWriteTables(sql).length > 0;
}

module.exports = {
  EXPLICIT_DELETE_ID_TABLES,
  SYNC_RELEVANT_TABLES,
  getSyncWriteTables,
  normalizeSql,
  shouldTriggerSyncForSql
};
