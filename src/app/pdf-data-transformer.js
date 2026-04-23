const {
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  normalizeFormulaSettings,
  calculateReconciliationSummaryByFormula
} = require('./reconciliation-formula');

function createPdfDataTransformer(deps = {}) {
  const logger = deps.logger || console;
  const getCurrentCompanyName = deps.getCurrentCompanyName || (() => null);
  const defaultCompanyName = deps.defaultCompanyName || 'نظام تصفية الكاشير';

  function sumAmounts(list, field) {
    return (list || []).reduce((sum, item) => sum + (item[field] || 0), 0);
  }

  function transformDataForPDFGenerator(printData) {
    logger.log('🔄 [PDF-TRANSFORM] تحويل البيانات لمولد PDF...');

    try {
      const reconciliation = printData.reconciliation || {};
      const bankReceipts = printData.bankReceipts || [];
      const cashReceipts = printData.cashReceipts || [];
      const postpaidSales = printData.postpaidSales || [];
      const customerReceipts = printData.customerReceipts || [];
      const returnInvoices = printData.returnInvoices || [];
      const suppliers = printData.suppliers || [];

      const bankTotal = sumAmounts(bankReceipts, 'amount');
      const cashTotal = sumAmounts(cashReceipts, 'total_amount');
      const postpaidTotal = sumAmounts(postpaidSales, 'amount');
      const customerTotal = sumAmounts(customerReceipts, 'amount');
      const returnTotal = sumAmounts(returnInvoices, 'amount');
      const supplierTotal = sumAmounts(suppliers, 'amount');
      const incomingFormulaSettings = printData.formulaSettings
        || printData.summary?.formulaSettings
        || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      const formulaSettings = normalizeFormulaSettings(incomingFormulaSettings);
      const formulaResult = calculateReconciliationSummaryByFormula(
        {
          bankTotal,
          cashTotal,
          postpaidTotal,
          customerTotal,
          returnTotal,
          supplierTotal
        },
        reconciliation.system_sales || 0,
        formulaSettings
      );

      const persistedTotalReceipts = Number(reconciliation.total_receipts);
      const persistedSurplusDeficit = Number(reconciliation.surplus_deficit);
      const totalReceipts = Number.isFinite(persistedTotalReceipts)
        ? persistedTotalReceipts
        : formulaResult.totalReceipts;
      const systemSales = Number(reconciliation.system_sales) || 0;
      const surplusDeficit = Number.isFinite(persistedSurplusDeficit)
        ? persistedSurplusDeficit
        : formulaResult.surplusDeficit;

      const transformedData = {
        reconciliationId: reconciliation.id,
        cashierName: reconciliation.cashier_name,
        cashierNumber: reconciliation.cashier_number,
        accountantName: reconciliation.accountant_name,
        reconciliationDate: reconciliation.reconciliation_date,
        companyName: reconciliation.company_name || getCurrentCompanyName() || defaultCompanyName,
        timeRangeStart: reconciliation.time_range_start,
        timeRangeEnd: reconciliation.time_range_end,
        filterNotes: reconciliation.filter_notes,
        bankReceipts,
        cashReceipts,
        postpaidSales,
        customerReceipts,
        returnInvoices,
        suppliers,
        summary: {
          bankTotal,
          cashTotal,
          postpaidTotal,
          customerTotal,
          returnTotal,
          supplierTotal,
          totalReceipts,
          systemSales,
          surplusDeficit,
          formulaSettings
        }
      };

      logger.log('🔍 [PDF-TRANSFORM] فحص الحقول الجديدة:', {
        timeRangeStart: transformedData.timeRangeStart,
        timeRangeEnd: transformedData.timeRangeEnd,
        filterNotes: transformedData.filterNotes,
        originalData: {
          time_range_start: reconciliation.time_range_start,
          time_range_end: reconciliation.time_range_end,
          filter_notes: reconciliation.filter_notes
        }
      });

      logger.log('✅ [PDF-TRANSFORM] تم تحويل البيانات بنجاح:', {
        reconciliationId: transformedData.reconciliationId,
        cashierName: transformedData.cashierName,
        totalReceipts: transformedData.summary.totalReceipts,
        surplusDeficit: transformedData.summary.surplusDeficit
      });

      return transformedData;
    } catch (error) {
      logger.error('❌ [PDF-TRANSFORM] خطأ في تحويل البيانات:', error);
      throw error;
    }
  }

  return {
    transformDataForPDFGenerator
  };
}

module.exports = {
  createPdfDataTransformer
};
