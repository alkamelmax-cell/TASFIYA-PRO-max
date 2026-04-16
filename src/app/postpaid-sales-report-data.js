function createPostpaidSalesReportDataHelpers(context) {
  const ipc = context.ipcRenderer;
  const logger = context.logger || console;

  function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function buildBranchLabel(rawNames, rawCount) {
    const branchNames = Array.from(new Set(
      String(rawNames || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    ));

    const branchesCount = Number.isFinite(Number(rawCount))
      ? Number(rawCount)
      : branchNames.length;

    if (branchNames.length === 0) {
      return 'غير محدد';
    }

    if (branchNames.length === 1 || branchesCount <= 1) {
      return branchNames[0];
    }

    return `متعدد (${branchNames.length})`;
  }

  function buildReconciledSubquery({ tableName, alias, txType, filters }) {
    const params = [];
    let query = `
            SELECT
                ${alias}.customer_name AS customer_name,
                ${alias}.amount AS amount,
                '${txType}' AS tx_type,
                COALESCE(r.reconciliation_date, ${alias}.created_at) AS tx_date,
                c.branch_id AS branch_id,
                COALESCE(b.branch_name, 'غير محدد') AS branch_name,
                c.name AS cashier_name
            FROM ${tableName} ${alias}
            LEFT JOIN reconciliations r ON ${alias}.reconciliation_id = r.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;

    if (filters.cashierFilter) {
      query += ' AND r.cashier_id = ?';
      params.push(filters.cashierFilter);
    }

    if (filters.branchFilter) {
      query += ' AND c.branch_id = ?';
      params.push(filters.branchFilter);
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
                ${alias}.customer_name AS customer_name,
                ${alias}.amount AS amount,
                '${txType}' AS tx_type,
                ${alias}.created_at AS tx_date,
                COALESCE((SELECT branch_id FROM cashiers WHERE id = 1), 0) AS branch_id,
                COALESCE(
                    (SELECT branch_name FROM branches WHERE id = (SELECT branch_id FROM cashiers WHERE id = 1)),
                    'غير محدد'
                ) AS branch_name,
                NULL AS cashier_name
            FROM ${tableName} ${alias}
            WHERE 1=1
        `;

    if (filters.branchFilter) {
      query += ' AND COALESCE((SELECT branch_id FROM cashiers WHERE id = 1), 0) = ?';
      params.push(filters.branchFilter);
    }

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
                customer_name,
                COALESCE(SUM(CASE WHEN tx_type = 'postpaid' THEN amount ELSE 0 END), 0) AS total_postpaid,
                COALESCE(SUM(CASE WHEN tx_type = 'receipt' THEN amount ELSE 0 END), 0) AS total_receipts,
                COALESCE(SUM(CASE WHEN tx_type = 'postpaid' THEN amount ELSE -amount END), 0) AS net_balance,
                COUNT(*) AS movements_count,
                MAX(tx_date) AS last_tx_date,
                COUNT(DISTINCT CASE WHEN branch_name IS NOT NULL AND TRIM(branch_name) <> '' THEN branch_name END) AS branches_count,
                GROUP_CONCAT(DISTINCT CASE WHEN branch_name IS NOT NULL AND TRIM(branch_name) <> '' THEN branch_name END) AS branch_names
            FROM (
                ${unionQueries.join('\nUNION ALL\n')}
            ) tx
            WHERE 1=1
        `;

      if (filters.searchName) {
        query += ' AND customer_name LIKE ?';
        params.push(`%${filters.searchName}%`);
      }

      query += `
            GROUP BY customer_name
            ORDER BY net_balance DESC, total_postpaid DESC, customer_name ASC
        `;

      logger.log('🔍 [POSTPAID-SALES] استعلام قاعدة البيانات:', query);
      logger.log('📋 [POSTPAID-SALES] معاملات الاستعلام:', params);

      const results = await ipc.invoke('db-query', query, params);
      const normalizedResults = Array.isArray(results)
        ? results.map((row) => ({
          customer_name: row.customer_name || 'غير محدد',
          total_postpaid: normalizeNumber(row.total_postpaid),
          total_receipts: normalizeNumber(row.total_receipts),
          net_balance: normalizeNumber(row.net_balance),
          movements_count: normalizeNumber(row.movements_count),
          last_tx_date: row.last_tx_date || null,
          branches_count: normalizeNumber(row.branches_count),
          branch_names: String(row.branch_names || '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
          branch_label: buildBranchLabel(row.branch_names, row.branches_count)
        }))
        : [];

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
