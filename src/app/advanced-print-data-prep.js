function createAdvancedPrintDataPrepHandlers(context) {
  const windowObj = context.windowObj || globalThis;
  const logger = context.logger || console;
  const defaultCompanyName = context.defaultCompanyName || 'نظام تصفية الكاشير';

  function getAllSectionsEnabled() {
    return {
      bankReceipts: true,
      cashReceipts: true,
      postpaidSales: true,
      customerReceipts: true,
      returnInvoices: true,
      suppliers: true,
      summary: true
    };
  }

  function preparePrintData(reconciliationData, options = {}) {
    logger.log('📋 [PRINT] تحضير بيانات الطباعة...');

    const {
      reconciliation,
      bankReceipts,
      cashReceipts,
      postpaidSales,
      customerReceipts,
      returnInvoices,
      suppliers
    } = reconciliationData;

    const defaultSections = getAllSectionsEnabled();
    const sectionsToInclude = { ...defaultSections, ...(options.sections || {}) };
    const sections = {};

    if (sectionsToInclude.bankReceipts && bankReceipts && bankReceipts.length > 0) {
      sections.bankReceipts = bankReceipts;
      logger.log(`📊 [PRINT] تضمين ${bankReceipts.length} مقبوضة بنكية`);
    }

    if (sectionsToInclude.cashReceipts && cashReceipts && cashReceipts.length > 0) {
      sections.cashReceipts = cashReceipts;
      logger.log(`📊 [PRINT] تضمين ${cashReceipts.length} مقبوضة نقدية`);
    }

    if (sectionsToInclude.postpaidSales && postpaidSales && postpaidSales.length > 0) {
      sections.postpaidSales = postpaidSales;
      logger.log(`📊 [PRINT] تضمين ${postpaidSales.length} مبيعة آجلة`);
    }

    if (sectionsToInclude.customerReceipts && customerReceipts && customerReceipts.length > 0) {
      sections.customerReceipts = customerReceipts;
      logger.log(`📊 [PRINT] تضمين ${customerReceipts.length} مقبوضة عميل`);
    }

    if (sectionsToInclude.returnInvoices && returnInvoices && returnInvoices.length > 0) {
      sections.returnInvoices = returnInvoices;
      logger.log(`📊 [PRINT] تضمين ${returnInvoices.length} فاتورة مرتجع`);
    }

    if (sectionsToInclude.suppliers && suppliers && suppliers.length > 0) {
      sections.suppliers = suppliers;
      logger.log(`📊 [PRINT] تضمين ${suppliers.length} مورد`);
    }

    const enhancedReconciliation = {
      ...reconciliation,
      company_name: windowObj.currentCompanyName || defaultCompanyName
    };

    const printData = {
      reconciliation: enhancedReconciliation,
      sections,
      options: {
        includeSummary: sectionsToInclude.summary !== false,
        pageSize: options.pageSize || 'A4',
        orientation: options.orientation || 'portrait',
        margins: options.margins || 'normal',
        fontSize: options.fontSize || 'normal',
        ...options
      },
      isColorPrint: options.color !== false
    };

    logger.log('✅ [PRINT] تم تحضير بيانات الطباعة بنجاح');
    return printData;
  }

  return {
    getAllSectionsEnabled,
    preparePrintData
  };
}

module.exports = {
  createAdvancedPrintDataPrepHandlers
};
