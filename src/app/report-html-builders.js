function buildReconciliationReportHtml(options) {
  const {
    reconciliations,
    companyName,
    summary,
    reportDate,
    sortMeta = null,
    includeSummary = true,
    includeDetails = true,
    formatCurrency,
    formatDate
  } = options;

  return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>تقرير التصفيات - ${companyName}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .company-header { text-align: center; margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; }
                .company-name { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
                .report-title { font-size: 20px; color: #34495e; margin-bottom: 10px; }
                .report-meta { margin: 6px 0 0 0; color: #586674; font-size: 13px; }
                .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background-color: #f2f2f2; }
                .text-success { color: green; }
                .text-danger { color: red; }
                @media print {
                    body { margin: 0; margin-bottom: 25mm; }
                    .page-footer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        height: 20mm;
                        background: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        color: #666;
                        border-top: 1px solid #ddd;
                        z-index: 1000;
                    }
                }
                @page { margin-bottom: 25mm; }
                .page-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 20mm;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    z-index: 1000;
                }
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">تقرير التصفيات</div>
                <p>تاريخ التقرير: ${reportDate}</p>
                <p class="report-meta">الفرز الحالي: ${sortMeta && sortMeta.displayText ? sortMeta.displayText : 'التاريخ (تنازلي)'}</p>
            </div>

            ${includeSummary ? `
            <div class="summary">
                <div class="summary-card">
                    <h3>${summary.totalReconciliations}</h3>
                    <p>إجمالي التصفيات</p>
                </div>
                <div class="summary-card">
                    <h3>${formatCurrency(summary.totalReceipts)}</h3>
                    <p>إجمالي المقبوضات</p>
                </div>
                <div class="summary-card">
                    <h3>${formatCurrency(summary.totalSystemSales)}</h3>
                    <p>مبيعات النظام</p>
                </div>
                <div class="summary-card">
                    <h3 class="${summary.totalSurplusDeficit >= 0 ? 'text-success' : 'text-danger'}">
                        ${formatCurrency(summary.totalSurplusDeficit)}
                    </h3>
                    <p>الفائض/العجز</p>
                </div>
            </div>
            ` : ''}

            ${includeDetails ? `
            <table>
                <thead>
                    <tr>
                        <th>رقم التصفية</th>
                        <th>التاريخ</th>
                        <th>الفرع</th>
                        <th>الكاشير</th>
                        <th>المحاسب</th>
                        <th>إجمالي المقبوضات</th>
                        <th>مبيعات النظام</th>
                        <th>الفائض/العجز</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${reconciliations.map((r) => `
                        <tr>
                            <td>${r.status === 'completed' && r.reconciliation_number ? `#${r.reconciliation_number}` : 'مسودة'}</td>
                            <td>${formatDate(r.reconciliation_date)}</td>
                            <td>${r.branch_name || 'غير محدد'}</td>
                            <td>${r.cashier_name} (${r.cashier_number})</td>
                            <td>${r.accountant_name}</td>
                            <td>${formatCurrency(r.total_receipts)}</td>
                            <td>${formatCurrency(r.system_sales)}</td>
                            <td class="${r.surplus_deficit >= 0 ? 'text-success' : 'text-danger'}">
                                ${formatCurrency(r.surplus_deficit)}
                            </td>
                            <td>${r.status === 'completed' ? 'مكتملة' : 'مسودة'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : `
            <div style="margin-top: 24px; padding: 16px; border: 1px dashed #bbb; border-radius: 8px; text-align: center;">
                تم إيقاف عرض التفاصيل حسب إعدادات التقارير.
            </div>
            `}

            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
}

function buildAdvancedReportHtml(options) {
  const { title, companyName, reportDate, tableHtml } = options;

  return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>${title} - ${companyName}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .company-header { text-align: center; margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; }
                .company-name { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
                .report-title { font-size: 20px; color: #34495e; margin-bottom: 10px; }
                .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background-color: #f2f2f2; }
                .text-success { color: green; }
                .text-danger { color: red; }
                .text-warning { color: orange; }
                @media print {
                    body { margin: 0; margin-bottom: 25mm; }
                    .page-footer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        height: 20mm;
                        background: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        color: #666;
                        border-top: 1px solid #ddd;
                        z-index: 1000;
                    }
                }
                @page { margin-bottom: 25mm; }
                .page-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 20mm;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    z-index: 1000;
                }
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">${title}</div>
                <p>تاريخ التقرير: ${reportDate}</p>
            </div>

            ${tableHtml}

            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
}

module.exports = {
  buildReconciliationReportHtml,
  buildAdvancedReportHtml
};
