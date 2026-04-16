function createPrintSectionFinancialBuilders(context) {
  const safeFieldValue = context.safeFieldValue;
  const safeDateFormat = context.safeDateFormat;
  const formatCurrency = context.formatCurrency;
  const formatNumber = context.formatNumber;
  const logger = context.logger || console;

function generateBankReceiptsSection(bankReceipts) {
  const total = bankReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">💳 المقبوضات البنكية (${bankReceipts.length})</h3>
      <div class="section-content">`;

  if (bankReceipts.length === 0) {
    html += `<div class="empty-section">لا توجد مقبوضات بنكية</div>`;
  } else {
    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>نوع العملية</th>
                      <th>اسم الجهاز</th>
                      <th>البنك</th>
                      <th>المبلغ</th>
                      <th>التاريخ</th>
                  </tr>
              </thead>
              <tbody>`;

    bankReceipts.forEach((receipt, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة مقبوض بنكي:', receipt);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td>${safeFieldValue(receipt, 'operation_type')}</td>
                      <td>${safeFieldValue(receipt, 'atm_name')}</td>
                      <td>${safeFieldValue(receipt, 'bank_name')}</td>
                      <td class="currency">${formatCurrency(receipt.amount)}</td>
                      <td>${safeDateFormat(receipt.created_at)}</td>
                  </tr>`;
    });

    html += `
                  <tr class="total-row">
                      <td colspan="4">الإجمالي</td>
                      <td class="currency">${formatCurrency(total)}</td>
                      <td></td>
                  </tr>
              </tbody>
          </table>`;
  }

  html += `
      </div>
  </div>`;
  return html;
}

function generateCashReceiptsSection(cashReceipts) {
  const total = cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
  const totalQuantity = cashReceipts.reduce((sum, receipt) => sum + (receipt.quantity || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">💰 المقبوضات النقدية (${cashReceipts.length})</h3>
      <div class="section-content">`;

  if (cashReceipts.length === 0) {
    html += `<div class="empty-section">لا توجد مقبوضات نقدية</div>`;
  } else {
    const sortedCashReceipts = [...cashReceipts].sort((a, b) => (b.denomination || 0) - (a.denomination || 0));

    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>الفئة</th>
                      <th>الكمية</th>
                      <th>المجموع</th>
                      <th>التاريخ</th>
                  </tr>
              </thead>
              <tbody>`;

    sortedCashReceipts.forEach((receipt, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة مقبوض نقدي:', receipt);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td>${formatNumber(safeFieldValue(receipt, 'denomination', '0'))} ريال</td>
                      <td>${formatNumber(receipt.quantity || 0)}</td>
                      <td class="currency">${formatNumber(formatCurrency(receipt.total_amount))} ريال</td>
                      <td>${safeDateFormat(receipt.created_at)}</td>
                  </tr>`;
    });

    html += `
                  <tr class="total-row">
                      <td>-</td>
                      <td>الإجمالي</td>
                      <td>${formatNumber(totalQuantity)}</td>
                      <td class="currency">${formatNumber(formatCurrency(total))} ريال</td>
                      <td></td>
                  </tr>
              </tbody>
          </table>`;
  }

  html += `
      </div>
  </div>`;
  return html;
}

function generatePostpaidSalesSection(postpaidSales) {
  const total = postpaidSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">📱 المبيعات الآجلة (${postpaidSales.length})</h3>
      <div class="section-content">`;

  if (postpaidSales.length === 0) {
    html += `<div class="empty-section">لا توجد مبيعات آجلة</div>`;
  } else {
    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>اسم العميل</th>
                      <th>المبلغ</th>
                      <th>التاريخ</th>
                  </tr>
              </thead>
              <tbody>`;

    postpaidSales.forEach((sale, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة مبيعة آجلة:', sale);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td><div class="print-checkbox"></div>${safeFieldValue(sale, 'customer_name')}</td>
                      <td class="currency">${formatCurrency(sale.amount)}</td>
                      <td>${safeDateFormat(sale.created_at)}</td>
                  </tr>`;
    });

    html += `
                  <tr class="total-row">
                      <td colspan="2">الإجمالي</td>
                      <td class="currency">${formatCurrency(total)}</td>
                      <td></td>
                  </tr>
              </tbody>
          </table>`;
  }

  html += `
      </div>
  </div>`;
  return html;
}

function generateCustomerReceiptsSection(customerReceipts) {
  const total = customerReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">👥 مقبوضات العملاء (${customerReceipts.length})</h3>
      <div class="section-content">`;

  if (customerReceipts.length === 0) {
    html += `<div class="empty-section">لا توجد مقبوضات عملاء</div>`;
  } else {
    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>اسم العميل</th>
                      <th>المبلغ</th>
                      <th>نوع الدفع</th>
                  </tr>
              </thead>
              <tbody>`;

    customerReceipts.forEach((receipt, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة مقبوض عميل:', receipt);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td><div class="print-checkbox"></div>${safeFieldValue(receipt, 'customer_name')}</td>
                      <td class="currency">${formatCurrency(receipt.amount)}</td>
                      <td>${safeFieldValue(receipt, 'payment_type')}</td>
                  </tr>`;
    });

    html += `
                  <tr class="total-row">
                      <td colspan="2">الإجمالي</td>
                      <td class="currency">${formatCurrency(total)}</td>
                      <td></td>
                  </tr>
              </tbody>
          </table>`;
  }

  html += `
      </div>
  </div>`;
  return html;
}

  return {
    generateBankReceiptsSection,
    generateCashReceiptsSection,
    generatePostpaidSalesSection,
    generateCustomerReceiptsSection
  };
}

module.exports = {
  createPrintSectionFinancialBuilders
};
