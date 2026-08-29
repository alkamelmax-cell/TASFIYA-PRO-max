function createAdvancedReportsDataHandlers(context) {
  const ipc = context.ipcRenderer;
  const formatDecimal = context.formatDecimal;
  const formatPeriodLabel = context.formatPeriodLabel;
  const getDaysBetween = context.getDaysBetween;
  const logger = context.logger || console;

  async function generateTimeBasedReportData(reportType, dateFrom, dateTo) {
    logger.log('📈 [TIME-REPORT] توليد بيانات التقرير الزمني...');

    let periodExpression;
    switch (reportType) {
      case 'daily':
        periodExpression = 'DATE(r.reconciliation_date)';
        break;
      case 'weekly':
        periodExpression = 'strftime("%Y", r.reconciliation_date) || "-W" || strftime("%W", r.reconciliation_date)';
        break;
      case 'monthly':
        periodExpression = 'strftime("%Y-%m", r.reconciliation_date)';
        break;
      default:
        periodExpression = 'DATE(r.reconciliation_date)';
    }

    const query = `
      SELECT
          ${periodExpression} as period,
          COUNT(r.id) as total_reconciliations,
          COUNT(DISTINCT r.cashier_id) as active_cashiers,
          SUM(r.total_receipts) as total_receipts,
          SUM(r.system_sales) as total_system_sales,
          SUM(r.surplus_deficit) as total_surplus_deficit,
          AVG(r.total_receipts) as avg_receipts,
          MIN(r.total_receipts) as min_receipts,
          MAX(r.total_receipts) as max_receipts,
          SUM(CASE WHEN r.surplus_deficit > 0 THEN 1 ELSE 0 END) as surplus_count,
          SUM(CASE WHEN r.surplus_deficit < 0 THEN 1 ELSE 0 END) as deficit_count,
          SUM(CASE WHEN r.surplus_deficit = 0 THEN 1 ELSE 0 END) as balanced_count
      FROM reconciliations r
      WHERE DATE(r.reconciliation_date) BETWEEN ? AND ?
      GROUP BY ${periodExpression}
      ORDER BY period ASC
    `;

    const results = await ipc.invoke('db-all', query, [dateFrom, dateTo]);

    return results.map((row) => ({
      ...row,
      accuracy_rate: formatDecimal(((row.balanced_count + row.surplus_count) / row.total_reconciliations) * 100),
      period_label: formatPeriodLabel(row.period, reportType)
    }));
  }

  async function generateAtmReportData(atmFilter, dateFrom, dateTo) {
    logger.log('🏧 [ATM-REPORT] توليد بيانات تقرير أجهزة الصراف...');

    let atmCondition = '';
    const params = [dateFrom, dateTo];

    if (atmFilter) {
      atmCondition = 'AND a.id = ?';
      params.push(atmFilter);
    }

    const query = `
      SELECT
          a.id as atm_id,
          a.name as atm_name,
          a.location as atm_location,
          b.branch_name as atm_branch_name,
          COUNT(DISTINCT ft.reconciliation_id) as total_reconciliations,
          COUNT(ft.id) as total_transactions,
          SUM(ft.amount) as total_amount,
          AVG(ft.amount) as avg_transaction_amount,
          MIN(ft.amount) as min_transaction,
          MAX(ft.amount) as max_transaction,
          COUNT(DISTINCT ft.cashier_id) as cashiers_used,
          MIN(ft.reconciliation_date) as first_date,
          MAX(ft.reconciliation_date) as last_date
      FROM atms a
      LEFT JOIN branches b ON a.branch_id = b.id
      LEFT JOIN (
          SELECT
              br.id,
              br.atm_id,
              br.amount,
              r.id as reconciliation_id,
              r.cashier_id,
              DATE(r.reconciliation_date) as reconciliation_date
          FROM bank_receipts br
          INNER JOIN reconciliations r ON br.reconciliation_id = r.id
          WHERE DATE(r.reconciliation_date) BETWEEN ? AND ?
      ) ft ON a.id = ft.atm_id
      WHERE a.active = 1 ${atmCondition}
      GROUP BY a.id, a.name, a.location, b.branch_name
      HAVING total_transactions > 0
      ORDER BY total_amount DESC
    `;

    const results = await ipc.invoke('db-all', query, params);

    return results.map((row) => ({
      ...row,
      daily_avg: formatDecimal(
        Number(row.total_amount || 0) / Math.max(1, getDaysBetween(row.first_date, row.last_date))
      ),
      utilization_rate: formatDecimal(
        (Number(row.total_reconciliations || 0) / Math.max(1, getDaysBetween(dateFrom, dateTo))) * 100
      )
    }));
  }

  async function getAtmName(atmId) {
    try {
      const atm = await ipc.invoke('db-get', 'SELECT name FROM atms WHERE id = ?', [atmId]);
      return atm ? atm.name : 'غير معروف';
    } catch (error) {
      logger.error('Error getting ATM name:', error);
      return 'غير معروف';
    }
  }

  return {
    generateTimeBasedReportData,
    generateAtmReportData,
    getAtmName
  };
}

module.exports = {
  createAdvancedReportsDataHandlers
};
