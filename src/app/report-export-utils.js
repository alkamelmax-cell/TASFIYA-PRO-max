const { formatCurrency, formatDate } = require('./formatting');
const { determineReportType } = require('./report-metrics');

function generateReportSummary(reconciliations) {
  const asNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const totalReconciliations = reconciliations.length;
  const totalReceipts = reconciliations.reduce((sum, r) => sum + asNumber(r.total_receipts), 0);
  const totalSystemSales = reconciliations.reduce((sum, r) => sum + asNumber(r.system_sales), 0);
  const totalSurplusDeficit = reconciliations.reduce((sum, r) => sum + asNumber(r.surplus_deficit), 0);

  const completedCount = reconciliations.filter((r) => r.status === 'completed').length;
  const draftCount = reconciliations.filter((r) => r.status === 'draft').length;
  const averageReceipts = totalReconciliations > 0 ? totalReceipts / totalReconciliations : 0;

  const cashierStats = {};
  reconciliations.forEach((r) => {
    if (!cashierStats[r.cashier_name]) {
      cashierStats[r.cashier_name] = { count: 0, totalReceipts: 0 };
    }
    cashierStats[r.cashier_name].count += 1;
    cashierStats[r.cashier_name].totalReceipts += asNumber(r.total_receipts);
  });

  return {
    totalReconciliations,
    totalReceipts,
    totalSystemSales,
    totalSurplusDeficit,
    completedCount,
    draftCount,
    averageReceipts,
    cashierStats
  };
}

function prepareExcelData(reconciliations, options = {}) {
  const includeDetails = options.includeDetails !== false;

  if (!includeDetails) {
    const summary = generateReportSummary(reconciliations);
    return {
      headers: ['المؤشر', 'القيمة'],
      rows: [
        ['إجمالي التصفيات', summary.totalReconciliations],
        ['إجمالي المقبوضات', summary.totalReceipts],
        ['مبيعات النظام', summary.totalSystemSales],
        ['الفائض/العجز', summary.totalSurplusDeficit],
        ['عدد المكتملة', summary.completedCount],
        ['عدد المسودات', summary.draftCount]
      ],
      title: 'تقرير التصفيات - ملخص تنفيذي'
    };
  }

  const headers = [
    'رقم التصفية',
    'التاريخ',
    'الفرع',
    'الكاشير',
    'المحاسب',
    'إجمالي المقبوضات',
    'مبيعات النظام',
    'الفائض/العجز',
    'الحالة'
  ];

  const rows = reconciliations.map((r) => [
    r.reconciliation_number || r.id,
    formatDate(r.reconciliation_date),
    r.branch_name || 'غير محدد',
    `${r.cashier_name} (${r.cashier_number})`,
    r.accountant_name,
    Number(r.total_receipts) || 0,
    Number(r.system_sales) || 0,
    Number(r.surplus_deficit) || 0,
    r.status === 'completed' ? 'مكتملة' : 'مسودة'
  ]);

  return {
    headers,
    rows,
    title: 'تقرير التصفيات'
  };
}

function generateAdvancedReportTableHtml(data, reportType) {
  let tableHtml = '<table><thead><tr>';

  switch (reportType) {
    case 'time':
      tableHtml += `
                <th>الفترة</th>
                <th>عدد التصفيات</th>
                <th>الكاشير النشطين</th>
                <th>إجمالي المقبوضات</th>
                <th>متوسط المقبوضات</th>
                <th>الفائض/العجز</th>
                <th>معدل الدقة</th>
            `;
      break;
    case 'atm':
      tableHtml += `
                <th>اسم الجهاز</th>
                <th>الفرع</th>
                <th>الموقع</th>
                <th>عدد المعاملات</th>
                <th>إجمالي المبلغ</th>
                <th>متوسط المعاملة</th>
                <th>المتوسط اليومي</th>
                <th>معدل الاستخدام</th>
            `;
      break;
  }

  tableHtml += '</tr></thead><tbody>';

  data.forEach((item) => {
    tableHtml += '<tr>';
    switch (reportType) {
      case 'time': {
        const timeSurplusClass = item.total_surplus_deficit >= 0 ? 'text-success' : 'text-danger';
        tableHtml += `
                    <td>${item.period_label}</td>
                    <td>${item.total_reconciliations}</td>
                    <td>${item.active_cashiers}</td>
                    <td>${formatCurrency(item.total_receipts)}</td>
                    <td>${formatCurrency(item.avg_receipts)}</td>
                    <td class="${timeSurplusClass}">${formatCurrency(item.total_surplus_deficit)}</td>
                    <td>${item.accuracy_rate}%</td>
                `;
        break;
      }
      case 'atm':
        tableHtml += `
                    <td>${item.atm_name}</td>
                    <td>${item.atm_branch_name || 'غير محدد'}</td>
                    <td>${item.atm_location}</td>
                    <td>${item.total_transactions}</td>
                    <td>${formatCurrency(item.total_amount)}</td>
                    <td>${formatCurrency(item.avg_transaction_amount)}</td>
                    <td>${item.daily_avg}</td>
                    <td>${item.utilization_rate}%</td>
                `;
        break;
    }
    tableHtml += '</tr>';
  });

  tableHtml += '</tbody></table>';
  return tableHtml;
}

function prepareAdvancedReportExcelData(data, title) {
  const reportType = determineReportType(data);
  let headers = [];
  let rows = [];

  switch (reportType) {
    case 'time':
      headers = [
        'الفترة',
        'عدد التصفيات',
        'الكاشير النشطين',
        'إجمالي المقبوضات',
        'متوسط المقبوضات',
        'الفائض/العجز',
        'معدل الدقة (%)'
      ];
      rows = data.map((item) => [
        item.period_label,
        item.total_reconciliations,
        item.active_cashiers,
        item.total_receipts,
        item.avg_receipts,
        item.total_surplus_deficit,
        item.accuracy_rate
      ]);
      break;

    case 'atm':
      headers = [
        'اسم الجهاز',
        'الفرع',
        'الموقع',
        'عدد المعاملات',
        'إجمالي المبلغ',
        'متوسط المعاملة',
        'المتوسط اليومي',
        'معدل الاستخدام (%)'
      ];
      rows = data.map((item) => [
        item.atm_name,
        item.atm_branch_name || 'غير محدد',
        item.atm_location,
        item.total_transactions,
        item.total_amount,
        item.avg_transaction_amount,
        item.daily_avg,
        item.utilization_rate
      ]);
      break;
  }

  return {
    headers,
    rows,
    title
  };
}

module.exports = {
  generateReportSummary,
  prepareExcelData,
  generateAdvancedReportTableHtml,
  prepareAdvancedReportExcelData
};
