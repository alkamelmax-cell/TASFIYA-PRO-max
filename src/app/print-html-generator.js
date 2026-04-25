const {
  buildPrintDocumentStart,
  buildPrintPreviewControls,
  buildPrintHeader,
  buildPrintFooter
} = require('./print-html-template-builders');

function createPrintHtmlGenerator(deps) {
  const logger = deps.logger || console;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatEntryValue(entry, fieldKey, isAmount = false) {
    if (isAmount) {
      return escapeHtml(String(entry.amount ?? 0));
    }
    return escapeHtml(entry.payload?.[fieldKey] || '-');
  }

  function generateCustomTablesSection(customTables = []) {
    if (!Array.isArray(customTables) || customTables.length === 0) {
      return '';
    }

    const sectionsHtml = customTables.map((section) => {
      const definition = section?.definition || {};
      const entries = Array.isArray(section?.entries) ? section.entries : [];
      const templateKey = String(definition.entry_template || 'amount_only');
      const fields = (() => {
        if (templateKey === 'invoice_amount_note') {
          return [
            { key: 'reference', label: 'المرجع' },
            { key: 'amount', label: 'المبلغ', isAmount: true },
            { key: 'notes', label: 'ملاحظة' }
          ];
        }
        if (templateKey === 'name_amount') {
          return [
            { key: 'name', label: 'الاسم' },
            { key: 'amount', label: 'المبلغ', isAmount: true }
          ];
        }
        return [
          { key: 'label', label: 'البيان' },
          { key: 'amount', label: 'المبلغ', isAmount: true }
        ];
      })();

      const rowsHtml = entries.map((entry) => `
        <tr>
          ${fields.map((field) => `<td>${formatEntryValue(entry, field.key, field.isAmount)}</td>`).join('')}
        </tr>
      `).join('');
      const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

      return `
        <div class="section">
          <h3>${escapeHtml(definition.table_name || 'جدول إضافي')}</h3>
          <table class="data-table">
            <thead>
              <tr>${fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="${Math.max(fields.length - 1, 1)}">المجموع</th>
                <th>${escapeHtml(String(total.toFixed(2)))}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }).join('');

    return sectionsHtml;
  }

  function getEnhancedFontSizeForPrint(fontSize) {
    const optimizedFontSizes = {
      small: '12px',
      normal: '14px',
      large: '16px',
      'extra-large': '18px'
    };
    return optimizedFontSizes[fontSize] || optimizedFontSizes.normal;
  }

  function generatePrintHTML(printOptions, isPreview = false) {
    logger.log('📄 [NEW-PRINT] إنشاء محتوى HTML للطباعة');
    logger.log('📝 [NEW-PRINT] حجم الخط المختار:', printOptions.fontSize || 'normal');
    logger.log('📏 [NEW-PRINT] حجم الخط المحسوب:', getEnhancedFontSizeForPrint(printOptions.fontSize || 'normal'));

    const currentPrintReconciliation = deps.getCurrentPrintReconciliation();
    if (!currentPrintReconciliation) {
      throw new Error('لا توجد بيانات تصفية للطباعة');
    }

    const {
      reconciliation,
      bankReceipts,
      cashReceipts,
      postpaidSales,
      customerReceipts,
      returnInvoices,
      suppliers,
      customTables
    } = currentPrintReconciliation;
    const { sections, options } = printOptions;

    const currentDate = deps.getCurrentDate();
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    const fontSize = getEnhancedFontSizeForPrint(options.fontSize || 'normal');

    let htmlContent = buildPrintDocumentStart(reconciliation, fontSize, options.colors);

    if (isPreview) {
      htmlContent += buildPrintPreviewControls();
    }

    htmlContent += buildPrintHeader(reconciliation, currentDate, currentTime, deps.formatDate);

    if (sections.bankReceipts && bankReceipts.length > 0) {
      htmlContent += deps.generateBankReceiptsSection(bankReceipts);
    }

    if (sections.cashReceipts && cashReceipts.length > 0) {
      htmlContent += deps.generateCashReceiptsSection(cashReceipts);
    }

    if (sections.postpaidSales && postpaidSales.length > 0) {
      htmlContent += deps.generatePostpaidSalesSection(postpaidSales);
    }

    if (sections.customerReceipts && customerReceipts.length > 0) {
      htmlContent += deps.generateCustomerReceiptsSection(customerReceipts);
    }

    if (sections.returnInvoices && returnInvoices.length > 0) {
      htmlContent += deps.generateReturnInvoicesSection(returnInvoices);
    }

    if (sections.suppliers && suppliers.length > 0) {
      htmlContent += deps.generateSuppliersSection(suppliers);
    }

    if (sections.customTables && customTables && customTables.length > 0) {
      htmlContent += generateCustomTablesSection(customTables);
    }

    if (sections.summary) {
      htmlContent += deps.generateSummarySection(reconciliation);
    }

    htmlContent += buildPrintFooter(
      currentDate,
      currentTime,
      deps.generateNonColoredPrintStyles(!options.colors)
    );

    return htmlContent;
  }

  return {
    getEnhancedFontSizeForPrint,
    generatePrintHTML
  };
}

module.exports = {
  createPrintHtmlGenerator
};
