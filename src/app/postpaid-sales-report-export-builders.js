function createPostpaidSalesReportExportBuilders(context) {
  const getCompanyName = context.getCompanyName;
  const getCurrentDate = context.getCurrentDate;
  const formatDecimal = context.formatDecimal;
  const formatDate = context.formatDate;
  const getPostpaidSalesReportFilters = context.getPostpaidSalesReportFilters;
  const buildFilterInfo = context.buildFilterInfo;
  const buildExcelFilterInfo = context.buildExcelFilterInfo;

  function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function calculateSummary(data) {
    const totalCustomers = data.length;
    const totalPostpaid = data.reduce((sum, item) => sum + normalizeNumber(item.total_postpaid), 0);
    const totalReceipts = data.reduce((sum, item) => sum + normalizeNumber(item.total_receipts), 0);
    const totalNetBalance = data.reduce((sum, item) => sum + normalizeNumber(item.net_balance), 0);
    const customersWithOutstandingBalance = data.filter((item) => normalizeNumber(item.net_balance) > 0).length;
    const highestBalance = totalCustomers > 0
      ? Math.max(...data.map((item) => normalizeNumber(item.net_balance)))
      : 0;

    return {
      totalCustomers,
      totalPostpaid,
      totalReceipts,
      totalNetBalance,
      customersWithOutstandingBalance,
      highestBalance
    };
  }

  async function generatePostpaidSalesReportHtml(data) {
    const companyName = await getCompanyName();
    const summary = calculateSummary(data);
    const filters = getPostpaidSalesReportFilters();
    const filterInfo = buildFilterInfo(filters);

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>تقرير صافي أرصدة العملاء الآجلة - ${companyName}</title>
            <style>
                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    direction: rtl;
                    text-align: right;
                    margin: 0;
                    padding: 20px;
                    background: white;
                    color: #333;
                    line-height: 1.6;
                }
                .company-header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    border-bottom: 3px solid #007bff;
                }
                .company-name {
                    font-size: 28px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 10px;
                }
                .report-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 10px;
                }
                .report-info {
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .summary-section {
                    display: flex;
                    justify-content: space-around;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin: 30px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .summary-item {
                    text-align: center;
                    padding: 15px;
                    min-width: 150px;
                }
                .summary-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 5px;
                }
                .summary-label {
                    font-size: 14px;
                    color: #666;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    background: white;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 12px 8px;
                    text-align: right;
                }
                th {
                    background: #007bff;
                    color: white;
                    font-weight: bold;
                    text-align: center;
                }
                tr:nth-child(even) {
                    background: #f8f9fa;
                }
                .amount-postpaid {
                    font-weight: bold;
                    color: #495057;
                }
                .amount-receipt {
                    font-weight: bold;
                    color: #198754;
                }
                .amount-balance-positive {
                    font-weight: bold;
                    color: #dc3545;
                }
                .amount-balance-negative {
                    font-weight: bold;
                    color: #198754;
                }
                .page-footer {
                    position: fixed;
                    bottom: 20px;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    padding-top: 10px;
                }
                @media print {
                    body { margin: 0; }
                    .page-footer { position: fixed; bottom: 0; }
                }
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">📱 تقرير صافي أرصدة العملاء الآجلة</div>
                <div class="report-info">تاريخ التقرير: ${getCurrentDate()}</div>
                ${filterInfo ? `<div class="report-info">المرشحات المطبقة: ${filterInfo}</div>` : ''}
            </div>

            <div class="summary-section">
                <div class="summary-item">
                    <div class="summary-value">${summary.totalCustomers}</div>
                    <div class="summary-label">عدد العملاء</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(summary.totalPostpaid)}</div>
                    <div class="summary-label">إجمالي الآجل</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(summary.totalReceipts)}</div>
                    <div class="summary-label">إجمالي التحصيل</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(summary.totalNetBalance)}</div>
                    <div class="summary-label">صافي الأرصدة</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${summary.customersWithOutstandingBalance}</div>
                    <div class="summary-label">عملاء عليهم رصيد</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(summary.highestBalance)}</div>
                    <div class="summary-label">أعلى رصيد</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>رقم</th>
                        <th>اسم العميل</th>
                        <th>إجمالي الآجل</th>
                        <th>إجمالي التحصيل</th>
                        <th>صافي الرصيد</th>
                        <th>الفرع/الفروع</th>
                        <th>عدد الحركات</th>
                        <th>آخر حركة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map((item, index) => {
                      const netBalance = normalizeNumber(item.net_balance);
                      const balanceClass = netBalance > 0 ? 'amount-balance-positive' : netBalance < 0 ? 'amount-balance-negative' : '';
                      return `
                        <tr>
                            <td style="text-align: center;">${index + 1}</td>
                            <td>${item.customer_name || 'غير محدد'}</td>
                            <td class="amount-postpaid" style="text-align: center;">${formatDecimal(item.total_postpaid)}</td>
                            <td class="amount-receipt" style="text-align: center;">${formatDecimal(item.total_receipts)}</td>
                            <td class="${balanceClass}" style="text-align: center;">${formatDecimal(netBalance)}</td>
                            <td style="text-align: center;">${item.branch_label || 'غير محدد'}</td>
                            <td style="text-align: center;">${item.movements_count || 0}</td>
                            <td style="text-align: center;">${item.last_tx_date ? formatDate(item.last_tx_date) : 'غير محدد'}</td>
                        </tr>
                    `;
                    }).join('')}
                </tbody>
            </table>

            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
  }

  function preparePostpaidSalesReportExcelData(data) {
    const summary = calculateSummary(data);
    const filters = getPostpaidSalesReportFilters();
    const filterInfo = buildExcelFilterInfo(filters);

    return {
      title: 'تقرير صافي أرصدة العملاء الآجلة',
      date: getCurrentDate(),
      filters: filterInfo,
      summary: {
        totalCustomers: summary.totalCustomers,
        totalPostpaid: formatDecimal(summary.totalPostpaid),
        totalReceipts: formatDecimal(summary.totalReceipts),
        totalNetBalance: formatDecimal(summary.totalNetBalance),
        customersWithOutstandingBalance: summary.customersWithOutstandingBalance,
        highestBalance: formatDecimal(summary.highestBalance)
      },
      headers: [
        'رقم',
        'اسم العميل',
        'إجمالي الآجل',
        'إجمالي التحصيل',
        'صافي الرصيد',
        'الفرع/الفروع',
        'عدد الحركات',
        'آخر حركة'
      ],
      rows: data.map((item, index) => [
        index + 1,
        item.customer_name || 'غير محدد',
        formatDecimal(item.total_postpaid),
        formatDecimal(item.total_receipts),
        formatDecimal(item.net_balance),
        item.branch_label || 'غير محدد',
        item.movements_count || 0,
        item.last_tx_date ? formatDate(item.last_tx_date) : 'غير محدد'
      ])
    };
  }

  return {
    generatePostpaidSalesReportHtml,
    preparePostpaidSalesReportExcelData
  };
}

module.exports = {
  createPostpaidSalesReportExportBuilders
};
