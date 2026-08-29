function normalizeCustomerCode(value) {
  const normalizedCode = String(value == null ? '' : value).trim().toUpperCase();
  return ['', '-', '–', '—'].includes(normalizedCode) ? '' : normalizedCode;
}

function normalizeBranchId(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.floor(numericValue) : null;
}

function normalizeCustomerListRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      customer_name: String(row?.customer_name || '').trim(),
      customer_code: normalizeCustomerCode(row?.customer_code)
    }))
    .filter((customer) => customer.customer_name);
}

function buildCustomersByBranchQuery() {
  return `
    SELECT c.customer_name, c.customer_code
    FROM (
      SELECT
        cust.customer_name AS customer_name,
        NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(cust.customer_code, ''))), ''), '-'), '–'), '—') AS customer_code,
        COALESCE(cust.branch_id, 0) AS branch_id
      FROM customers cust

      UNION

      SELECT
        ps.customer_name,
        COALESCE(
          NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(ps.customer_code, ''))), ''), '-'), '–'), '—'),
          NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(cust.customer_code, ''))), ''), '-'), '–'), '—')
        ) AS customer_code,
        ch.branch_id
      FROM postpaid_sales ps
      JOIN reconciliations r ON ps.reconciliation_id = r.id
      JOIN cashiers ch ON r.cashier_id = ch.id
      LEFT JOIN customers cust ON cust.id = ps.customer_id

      UNION

      SELECT
        cr.customer_name,
        COALESCE(
          NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(cr.customer_code, ''))), ''), '-'), '–'), '—'),
          NULLIF(NULLIF(NULLIF(NULLIF(UPPER(TRIM(COALESCE(cust.customer_code, ''))), ''), '-'), '–'), '—')
        ) AS customer_code,
        ch.branch_id
      FROM customer_receipts cr
      JOIN reconciliations r ON cr.reconciliation_id = r.id
      JOIN cashiers ch ON r.cashier_id = ch.id
      LEFT JOIN customers cust ON cust.id = cr.customer_id
    ) c
    WHERE c.customer_name IS NOT NULL
      AND TRIM(c.customer_name) != ''
      AND c.branch_id = ?
    GROUP BY c.customer_name, c.customer_code
    ORDER BY c.customer_name, c.customer_code
  `;
}

function createCustomerOption(doc, customer) {
  const option = doc.createElement('option');
  const customerName = String(customer?.customer_name || '').trim();
  const customerCode = normalizeCustomerCode(customer?.customer_code);
  option.value = customerCode ? `${customerName} - ${customerCode}` : customerName;
  option.label = customerCode ? `${customerCode} - ${customerName}` : customerName;
  if (!option.dataset) {
    option.dataset = {};
  }
  option.dataset.customerName = customerName;
  option.dataset.customerCode = customerCode;
  option.setAttribute?.('data-customer-name', customerName);
  option.setAttribute?.('data-customer-code', customerCode);
  return option;
}

module.exports = {
  buildCustomersByBranchQuery,
  createCustomerOption,
  normalizeBranchId,
  normalizeCustomerCode,
  normalizeCustomerListRows
};
