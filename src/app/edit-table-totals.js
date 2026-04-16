const {
  getEffectiveFormulaSettingsFromDocument,
  calculateReconciliationSummaryByFormula
} = require('./reconciliation-formula');

function createEditTableTotalsHandlers(deps) {
  const document = deps.document;
  const formatCurrency = deps.formatCurrency;
  const logger = deps.logger || console;

  function updateEditTotals() {
    logger.log('🧮 [TOTALS] تحديث الإجماليات...');

    try {
      const bankTotal = parseFloat(document.getElementById('editBankReceiptsTotal').textContent) || 0;
      const cashTotal = parseFloat(document.getElementById('editCashReceiptsTotal').textContent) || 0;
      const postpaidTotal = parseFloat(document.getElementById('editPostpaidSalesTotal').textContent) || 0;
      const customerTotal = parseFloat(document.getElementById('editCustomerReceiptsTotal').textContent) || 0;
      const returnTotal = parseFloat(document.getElementById('editReturnInvoicesTotal').textContent) || 0;
      const supplierTotal = parseFloat(document.getElementById('editSuppliersTotal').textContent) || 0;

      const systemSalesElement = document.getElementById('editSystemSales');
      const systemSales = parseFloat(systemSalesElement.value) || 0;
      const formulaSettings = getEffectiveFormulaSettingsFromDocument(document);
      const formulaResult = calculateReconciliationSummaryByFormula(
        {
          bankTotal,
          cashTotal,
          postpaidTotal,
          customerTotal,
          returnTotal,
          supplierTotal
        },
        systemSales,
        formulaSettings
      );
      const totalReceipts = formulaResult.totalReceipts;
      const surplusDeficit = formulaResult.surplusDeficit;

      const totalReceiptsElement = document.getElementById('editTotalReceipts');
      const surplusDeficitElement = document.getElementById('editSurplusDeficit');

      if (totalReceiptsElement) {
        totalReceiptsElement.textContent = `${formatCurrency(totalReceipts)} ريال`;
      }

      if (surplusDeficitElement) {
        surplusDeficitElement.textContent = `${formatCurrency(surplusDeficit)} ريال`;
        surplusDeficitElement.classList.remove('text-success', 'text-danger', 'text-primary', 'text-warning');

        if (surplusDeficit > 0) {
          surplusDeficitElement.classList.add('text-success');
          surplusDeficitElement.title = 'فائض - المقبوضات أكثر من مبيعات النظام';
        } else if (surplusDeficit < 0) {
          surplusDeficitElement.classList.add('text-danger');
          surplusDeficitElement.title = 'عجز - المقبوضات أقل من مبيعات النظام';
        } else {
          surplusDeficitElement.classList.add('text-primary');
          surplusDeficitElement.title = 'متوازن - المقبوضات تساوي مبيعات النظام';
        }
      }

      if (systemSalesElement) {
        systemSalesElement.classList.remove('is-valid', 'is-invalid');
        if (systemSales >= 0) {
          systemSalesElement.classList.add('is-valid');
        } else {
          systemSalesElement.classList.add('is-invalid');
        }
      }

      logger.log('📊 [TOTALS] تفاصيل الحسابات:', {
        bankTotal: formatCurrency(bankTotal),
        cashTotal: formatCurrency(cashTotal),
        postpaidTotal: formatCurrency(postpaidTotal),
        customerTotal: formatCurrency(customerTotal),
        returnTotal: formatCurrency(returnTotal),
        supplierTotal: formatCurrency(supplierTotal),
        totalReceipts: formatCurrency(totalReceipts),
        systemSales: formatCurrency(systemSales),
        surplusDeficit: formatCurrency(surplusDeficit),
        formulaSettings,
        calculation: formulaResult.contributions
      });
    } catch (error) {
      logger.error('❌ [TOTALS] خطأ في تحديث الإجماليات:', error);
    }
  }

  return {
    updateEditTotals
  };
}

module.exports = {
  createEditTableTotalsHandlers
};
