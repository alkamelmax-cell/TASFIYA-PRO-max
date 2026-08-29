function createPrintSectionPartnerBuilders(context) {
  const safeFieldValue = context.safeFieldValue;
  const safeDateFormat = context.safeDateFormat;
  const formatCurrency = context.formatCurrency;
  const logger = context.logger || console;

function generateReturnInvoicesSection(returnInvoices) {
  const total = returnInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">↩️ فواتير المرتجع (${returnInvoices.length})</h3>
      <div class="section-content">`;

  if (returnInvoices.length === 0) {
    html += `<div class="empty-section">لا توجد فواتير مرتجع</div>`;
  } else {
    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>رقم الفاتورة</th>
                      <th>المبلغ</th>
                      <th>التاريخ</th>
                  </tr>
              </thead>
              <tbody>`;

    returnInvoices.forEach((invoice, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة فاتورة مرتجع:', invoice);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td>${safeFieldValue(invoice, 'invoice_number')}</td>
                      <td class="currency">${formatCurrency(invoice.amount)}</td>
                      <td>${safeDateFormat(invoice.created_at)}</td>
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

function generateSuppliersSection(suppliers) {
  const total = suppliers.reduce((sum, supplier) => sum + (supplier.amount || 0), 0);
  let html = `
  <div class="section">
      <h3 class="section-title">🏪 الموردين (${suppliers.length})</h3>
      <div class="section-content">`;

  if (suppliers.length === 0) {
    html += `<div class="empty-section">لا توجد معاملات موردين</div>`;
  } else {
    html += `
          <table>
              <thead>
                  <tr>
                      <th>الرقم</th>
                      <th>اسم المورد</th>
                      <th>المبلغ</th>
                      <th>التاريخ</th>
                  </tr>
              </thead>
              <tbody>`;

    suppliers.forEach((supplier, index) => {
      logger.log('🔍 [NEW-PRINT] معالجة مورد:', supplier);
      html += `
                  <tr>
                      <td>${index + 1}</td>
                      <td>${safeFieldValue(supplier, 'supplier_name')}</td>
                      <td class="currency">${formatCurrency(supplier.amount)}</td>
                      <td>${safeDateFormat(supplier.created_at)}</td>
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

function generateSignaturesSection() {
  return `
      <div class="signatures-section">
          <div class="signatures-title">التوقيعات</div>
          <div class="signature-row">
              <div class="signature-item">
                  <div class="signature-label">توقيع المحاسب:</div>
                  <div class="signature-line"></div>
              </div>
              <div class="signature-item">
                  <div class="signature-label">توقيع المدير:</div>
                  <div class="signature-line"></div>
              </div>
              <div class="signature-item">
                  <div class="signature-label">توقيع الكاشير:</div>
                  <div class="signature-line"></div>
              </div>
          </div>
      </div>
  `;
}

function generateSummarySection(reconciliation) {
  const surplusDeficit = reconciliation.surplus_deficit || 0;
  const surplusDeficitClass = surplusDeficit >= 0 ? 'currency' : 'deficit';
  const surplusDeficitText = surplusDeficit >= 0 ? 'فائض' : 'عجز';

  return `
  <div class="summary-section">
      <h3 style="margin-bottom: 20px; font-size: 1.5em;">📈 ملخص التصفية</h3>
      <div class="summary-grid">
          <div class="summary-item">
              <div class="summary-label">إجمالي المقبوضات</div>
              <div class="summary-value">${formatCurrency(reconciliation.total_receipts)}</div>
          </div>
          <div class="summary-item">
              <div class="summary-label">مبيعات النظام</div>
              <div class="summary-value">${formatCurrency(reconciliation.system_sales)}</div>
          </div>
          <div class="summary-item">
              <div class="summary-label">${surplusDeficitText}</div>
              <div class="summary-value ${surplusDeficitClass}">${formatCurrency(Math.abs(surplusDeficit))}</div>
          </div>
          <div class="summary-item">
              <div class="summary-label">حالة التصفية</div>
              <div class="summary-value">${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}</div>
          </div>
      </div>
  </div>

  ${generateSignaturesSection()}`;
}

  return {
    generateReturnInvoicesSection,
    generateSuppliersSection,
    generateSignaturesSection,
    generateSummarySection
  };
}

module.exports = {
  createPrintSectionPartnerBuilders
};
