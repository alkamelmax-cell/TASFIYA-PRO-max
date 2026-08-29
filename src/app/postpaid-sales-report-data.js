function createPostpaidSalesReportDataHelpers(context) {
  const ipc = context.ipcRenderer;
  const logger = context.logger || console;

  function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function normalizeBranchId(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function normalizeCustomerId(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
  }

  function normalizeBranchLabel(value) {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || 'غير محدد';
  }

  function normalizeCustomerName(value) {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || 'غير محدد';
  }

  function normalizeCustomerCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeNameKey(value) {
    return normalizeCustomerName(value).toUpperCase();
  }

  function compareDates(left, right) {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      return leftTime - rightTime;
    }

    return String(left || '').localeCompare(String(right || ''));
  }

  function buildBranchLabel(branchLabels) {
    const labels = Array.from(branchLabels || [])
      .map((value) => normalizeBranchLabel(value))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'ar'));

    return labels.length > 0 ? labels.join('، ') : 'غير محدد';
  }

  function buildReconciledSubquery({ tableName, alias, txType, filters }) {
    const params = [];
    let query = `
            SELECT
                COALESCE(${alias}.customer_id, cust.id, 0) AS customer_id,
                COALESCE(NULLIF(TRIM(${alias}.customer_name), ''), cust.customer_name, '') AS customer_name,
                COALESCE(NULLIF(${alias}.customer_code, ''), cust.customer_code, '') AS customer_code,
                ${alias}.amount AS amount,
                '${txType}' AS tx_type,
                COALESCE(r.reconciliation_date, ${alias}.created_at) AS tx_date,
                COALESCE(c.branch_id, cust.branch_id, 0) AS branch_id,
                COALESCE(b.branch_name, cb.branch_name, 'غير محدد') AS branch_name,
                c.name AS cashier_name
            FROM ${tableName} ${alias}
            LEFT JOIN customers cust ON cust.id = ${alias}.customer_id
            LEFT JOIN branches cb ON cb.id = cust.branch_id
            LEFT JOIN reconciliations r ON ${alias}.reconciliation_id = r.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;

    if (filters.cashierFilter) {
      query += ' AND r.cashier_id = ?';
      params.push(filters.cashierFilter);
    }

    if (filters.dateFrom) {
      query += ` AND DATE(COALESCE(r.reconciliation_date, ${alias}.created_at)) >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ` AND DATE(COALESCE(r.reconciliation_date, ${alias}.created_at)) <= ?`;
      params.push(filters.dateTo);
    }

    return { query, params };
  }

  function buildManualSubquery({ tableName, alias, txType, filters }) {
    const params = [];
    let query = `
            SELECT
                COALESCE(${alias}.customer_id, cust.id, 0) AS customer_id,
                COALESCE(NULLIF(TRIM(${alias}.customer_name), ''), cust.customer_name, '') AS customer_name,
                COALESCE(NULLIF(${alias}.customer_code, ''), cust.customer_code, '') AS customer_code,
                ${alias}.amount AS amount,
                '${txType}' AS tx_type,
                ${alias}.created_at AS tx_date,
                COALESCE(cust.branch_id, (SELECT branch_id FROM cashiers WHERE id = 1), 0) AS branch_id,
                COALESCE(
                    (SELECT branch_name FROM branches WHERE id = cust.branch_id),
                    (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)),
                    'غير محدد'
                ) AS branch_name,
                NULL AS cashier_name
            FROM ${tableName} ${alias}
            LEFT JOIN customers cust ON cust.id = ${alias}.customer_id
            WHERE 1=1
        `;

    if (filters.dateFrom) {
      query += ` AND DATE(${alias}.created_at) >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ` AND DATE(${alias}.created_at) <= ?`;
      params.push(filters.dateTo);
    }

    return { query, params };
  }

  async function generatePostpaidSalesReportData(filters) {
    logger.log('📊 [POSTPAID-SALES] توليد بيانات أرصدة العملاء الآجلة...');

    try {
      const unionQueries = [];
      const params = [];

      const postpaidSalesQuery = buildReconciledSubquery({
        tableName: 'postpaid_sales',
        alias: 'ps',
        txType: 'postpaid',
        filters
      });
      unionQueries.push(postpaidSalesQuery.query);
      params.push(...postpaidSalesQuery.params);

      const receiptsQuery = buildReconciledSubquery({
        tableName: 'customer_receipts',
        alias: 'cr',
        txType: 'receipt',
        filters
      });
      unionQueries.push(receiptsQuery.query);
      params.push(...receiptsQuery.params);

      if (!filters.cashierFilter) {
        const manualPostpaidQuery = buildManualSubquery({
          tableName: 'manual_postpaid_sales',
          alias: 'mps',
          txType: 'postpaid',
          filters
        });
        unionQueries.push(manualPostpaidQuery.query);
        params.push(...manualPostpaidQuery.params);

        const manualReceiptsQuery = buildManualSubquery({
          tableName: 'manual_customer_receipts',
          alias: 'mcr',
          txType: 'receipt',
          filters
        });
        unionQueries.push(manualReceiptsQuery.query);
        params.push(...manualReceiptsQuery.params);
      }

      let query = `
            SELECT
                customer_id,
                customer_name,
                customer_code,
                amount,
                tx_type,
                tx_date,
                branch_id,
                branch_name
            FROM (
                ${unionQueries.join('\nUNION ALL\n')}
            ) tx
            WHERE COALESCE(TRIM(customer_name), '') <> ''
        `;

      if (filters.branchFilter) {
        const rawBranchFilter = String(filters.branchFilter || '').trim();
        query += `
          AND (
            CAST(COALESCE(branch_id, 0) AS TEXT) = ?
            OR TRIM(COALESCE(branch_name, '')) = ?
          )
        `;
        params.push(rawBranchFilter, rawBranchFilter);
      }

      logger.log('🔍 [POSTPAID-SALES] استعلام قاعدة البيانات:', query);
      logger.log('📋 [POSTPAID-SALES] معاملات الاستعلام:', params);

      const results = await ipc.invoke('db-query', query, params);
      const groupedResults = new Map();
      const searchName = String(filters.searchName || '').trim().toUpperCase();

      (Array.isArray(results) ? results : []).forEach((row) => {
        const customerId = normalizeCustomerId(row.customer_id);
        const customerName = normalizeCustomerName(row.customer_name);
        const customerCode = normalizeCustomerCode(row.customer_code);
        const branchId = normalizeBranchId(row.branch_id);
        const branchName = normalizeBranchLabel(row.branch_name);
        const aggregationKey = customerId > 0
          ? `ID:${customerId}`
          : customerCode
            ? `CODE:${customerCode}`
          : `LEGACY:${normalizeNameKey(customerName)}|${branchId}`;

        if (!groupedResults.has(aggregationKey)) {
          groupedResults.set(aggregationKey, {
            customer_id: customerId,
            customer_name: customerName,
            customer_code: customerCode,
            total_postpaid: 0,
            total_receipts: 0,
            net_balance: 0,
            movements_count: 0,
            last_tx_date: null,
            branch_ids: new Set(),
            branch_labels: new Set()
          });
        }

        const entry = groupedResults.get(aggregationKey);
        const amount = normalizeNumber(row.amount);
        const transactionType = String(row.tx_type || '').trim().toLowerCase();
        const txDate = row.tx_date || null;

        entry.customer_id = entry.customer_id || customerId;
        entry.customer_name = entry.customer_name || customerName;
        entry.customer_code = entry.customer_code || customerCode;
        entry.branch_ids.add(branchId);
        entry.branch_labels.add(branchName);
        entry.movements_count += 1;

        if (transactionType === 'postpaid') {
          entry.total_postpaid += amount;
          entry.net_balance += amount;
        } else {
          entry.total_receipts += amount;
          entry.net_balance -= amount;
        }

        if (txDate && (!entry.last_tx_date || compareDates(entry.last_tx_date, txDate) < 0)) {
          entry.last_tx_date = txDate;
        }
      });

      const normalizedResults = Array.from(groupedResults.values())
        .filter((item) => {
          if (!searchName) {
            return true;
          }

          return normalizeNameKey(item.customer_name).includes(searchName)
            || normalizeCustomerCode(item.customer_code).includes(searchName);
        })
        .map((item) => {
          const branchIds = Array.from(item.branch_ids);
          const branchLabel = buildBranchLabel(item.branch_labels);
          return {
            customer_id: normalizeCustomerId(item.customer_id),
            customer_name: item.customer_name || 'غير محدد',
            customer_code: item.customer_code || '',
            branch_id: branchIds.length === 1 ? normalizeBranchId(branchIds[0]) : 0,
            branch_name: branchLabel,
            total_postpaid: normalizeNumber(item.total_postpaid),
            total_receipts: normalizeNumber(item.total_receipts),
            net_balance: normalizeNumber(item.net_balance),
            movements_count: normalizeNumber(item.movements_count),
            last_tx_date: item.last_tx_date || null,
            branch_label: branchLabel
          };
        })
        .sort((left, right) => {
          if (right.net_balance !== left.net_balance) {
            return right.net_balance - left.net_balance;
          }
          if (right.total_postpaid !== left.total_postpaid) {
            return right.total_postpaid - left.total_postpaid;
          }
          const nameCompare = String(left.customer_name || '').localeCompare(String(right.customer_name || ''), 'ar');
          if (nameCompare !== 0) {
            return nameCompare;
          }
          return String(left.branch_label || '').localeCompare(String(right.branch_label || ''), 'ar');
        });

      logger.log(`✅ [POSTPAID-SALES] تم جلب ${normalizedResults.length} عميلًا برصيد صافٍ`);
      return normalizedResults;
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في توليد بيانات التقرير:', error);
      throw error;
    }
  }

  return {
    generatePostpaidSalesReportData
  };
}

module.exports = {
  createPostpaidSalesReportDataHelpers
};
