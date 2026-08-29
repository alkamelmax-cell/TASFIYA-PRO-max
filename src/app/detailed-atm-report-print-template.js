const { getDetailedAtmReportPrintStyles } = require('./detailed-atm-report-print-style');

function createDetailedAtmReportPrintTemplate(context) {
  const getDetailedAtmReportFilters = context.getDetailedAtmReportFilters;
  const getFilteredDetailedReportData = context.getFilteredDetailedReportData;
  const getCompanyName = context.getCompanyName;
  const formatCurrency = context.formatCurrency;
  const getCurrentDateTime = context.getCurrentDateTime;

  async function generateDetailedAtmReportPrintContent() {
    const filters = getDetailedAtmReportFilters();
    const filteredDetailedReportData = getFilteredDetailedReportData();
    const feesModeEnabled = filters.feesMode === 'with_fees';
    const totalGrossAmount = filteredDetailedReportData.reduce((sum, item) => sum + (Number(item.gross_amount ?? item.amount) || 0), 0);
    const totalFeeAmount = filteredDetailedReportData.reduce((sum, item) => sum + (Number(item.fee_amount) || 0), 0);
    const totalFeeVatAmount = filteredDetailedReportData.reduce((sum, item) => sum + (Number(item.fee_vat_amount) || 0), 0);
    const totalNetAmount = filteredDetailedReportData.reduce((sum, item) => sum + (Number(item.net_amount ?? item.amount) || 0), 0);
    const totalAmount = filteredDetailedReportData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const companyName = await getCompanyName();

    let content = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>التقرير التحليلي المفصل لأجهزة الصراف الآلي - ${companyName}</title>
            <style>${getDetailedAtmReportPrintStyles()}</style>
        </head>
        <body>
            <div class="print-controls no-print">
                <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
                <button class="close-btn" onclick="window.close()">❌ إغلاق</button>
            </div>

            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">التقرير التحليلي المفصل لأجهزة الصراف الآلي</div>
                <div class="report-subtitle">تقرير شامل لجميع عمليات أجهزة الصراف الآلي</div>
            </div>

            <div class="report-info">
                <div class="info-row"><span class="info-label">فترة التقرير:</span><span class="info-value">من ${filters.dateFrom} إلى ${filters.dateTo}</span></div>
                <div class="info-row"><span class="info-label">إجمالي العمليات:</span><span class="info-value">${filteredDetailedReportData.length} عملية</span></div>
                ${feesModeEnabled
                  ? `
                <div class="info-row"><span class="info-label">إجمالي قبل الرسوم:</span><span class="info-value">${formatCurrency(totalGrossAmount)}</span></div>
                <div class="info-row"><span class="info-label">إجمالي الرسوم البنكية:</span><span class="info-value">${formatCurrency(totalFeeAmount)}</span></div>
                <div class="info-row"><span class="info-label">إجمالي ضريبة الرسوم:</span><span class="info-value">${formatCurrency(totalFeeVatAmount)}</span></div>
                <div class="info-row"><span class="info-label">إجمالي بعد الرسوم:</span><span class="info-value">${formatCurrency(totalNetAmount)}</span></div>
                  `
                  : `
                <div class="info-row"><span class="info-label">إجمالي المبلغ:</span><span class="info-value">${formatCurrency(totalAmount)}</span></div>
                  `}
                <div class="info-row"><span class="info-label">تاريخ إنشاء التقرير:</span><span class="info-value">${getCurrentDateTime()}</span></div>
            </div>

            <table class="data-table">
                <thead>
                    ${feesModeEnabled ? `
                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>نوع العملية</th>
                        <th>الجهاز</th>
                        <th>الفرع</th>
                        <th>الموقع</th>
                        <th>البنك</th>
                        <th>قبل الرسوم</th>
                        <th>الرسوم</th>
                        <th>الضريبة</th>
                        <th>بعد الرسوم</th>
                        <th>الكاشير</th>
                        <th>رقم التصفية</th>
                    </tr>
                    ` : `
                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>نوع العملية</th>
                        <th>الجهاز</th>
                        <th>الفرع</th>
                        <th>الموقع</th>
                        <th>البنك</th>
                        <th>المبلغ</th>
                        <th>الكاشير</th>
                        <th>رقم التصفية</th>
                    </tr>
                    `}
                </thead>
                <tbody>
    `;

    filteredDetailedReportData.forEach((item) => {
      let operationTypeHtml = '';
      const operationType = item.operation_type.toLowerCase();
      if (operationType.includes('مدى')) {
        operationTypeHtml = `<span class="operation-mada">${item.operation_type}</span>`;
      } else if (operationType.includes('فيزا')) {
        operationTypeHtml = `<span class="operation-visa">${item.operation_type}</span>`;
      } else if (operationType.includes('ماستر')) {
        operationTypeHtml = `<span class="operation-mastercard">${item.operation_type}</span>`;
      } else {
        operationTypeHtml = item.operation_type;
      }

      content += feesModeEnabled ? `
            <tr>
                <td>${item.formatted_datetime}</td>
                <td>${operationTypeHtml}</td>
                <td>${item.atm_name}</td>
                <td style="font-weight: 600; color: #17a2b8;">${item.atm_branch_name || 'غير محدد'}</td>
                <td>${item.atm_location || 'غير محدد'}</td>
                <td>${item.bank_name}</td>
                <td style="text-align: left; font-weight: 600;">${item.formatted_gross_amount || item.formatted_amount}</td>
                <td style="text-align: left; color: #b35a00;">${item.formatted_fee_amount || formatCurrency(item.fee_amount || 0)}</td>
                <td style="text-align: left; color: #b42318;">${item.formatted_fee_vat_amount || formatCurrency(item.fee_vat_amount || 0)}</td>
                <td style="text-align: left; color: #067647; font-weight: 700;">${item.formatted_net_amount || formatCurrency(item.net_amount || 0)}</td>
                <td>${item.cashier_name} (${item.cashier_number})</td>
                <td style="font-weight: 600; color: #3498db;">#${item.reconciliation_id}</td>
            </tr>
        ` : `
            <tr>
                <td>${item.formatted_datetime}</td>
                <td>${operationTypeHtml}</td>
                <td>${item.atm_name}</td>
                <td style="font-weight: 600; color: #17a2b8;">${item.atm_branch_name || 'غير محدد'}</td>
                <td>${item.atm_location || 'غير محدد'}</td>
                <td>${item.bank_name}</td>
                <td style="text-align: left; font-weight: 600;">${item.formatted_amount}</td>
                <td>${item.cashier_name} (${item.cashier_number})</td>
                <td style="font-weight: 600; color: #3498db;">#${item.reconciliation_id}</td>
            </tr>
        `;
    });

    content += `
                </tbody>
            </table>

            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;

    return content;
  }

  return {
    generateDetailedAtmReportPrintContent
  };
}

module.exports = {
  createDetailedAtmReportPrintTemplate
};
