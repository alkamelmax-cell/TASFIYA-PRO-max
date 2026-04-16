const {
  buildPrintDocumentStart,
  buildPrintPreviewControls,
  buildPrintHeader,
  buildPrintFooter
} = require('./print-html-template-builders');

function createPrintHtmlGenerator(deps) {
  const logger = deps.logger || console;

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
      suppliers
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
