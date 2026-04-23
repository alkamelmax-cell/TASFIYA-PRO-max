const {
  getEffectiveFormulaSettingsFromDocument,
  calculateReconciliationSummaryByFormula
} = require('./reconciliation-formula');

function createReconciliationUiSummaryActions(context) {
  const document = context.document;
  const formatCurrency = context.formatCurrency;
  const getBankReceipts = context.getBankReceipts;
  const getCashReceipts = context.getCashReceipts;
  const getPostpaidSales = context.getPostpaidSales;
  const getCustomerReceipts = context.getCustomerReceipts;
  const getReturnInvoices = context.getReturnInvoices;
  const getSuppliers = context.getSuppliers || (() => []);
  const state = context.state;

  function updateSummary() {
    if (state.isResetting) return;

    const bankTotal = getBankReceipts().reduce((sum, receipt) => sum + receipt.amount, 0);
    const cashTotal = getCashReceipts().reduce((sum, receipt) => sum + receipt.total_amount, 0);
    const postpaidTotal = getPostpaidSales().reduce((sum, sale) => sum + sale.amount, 0);
    const customerTotal = getCustomerReceipts().reduce((sum, receipt) => sum + receipt.amount, 0);
    const returnTotal = getReturnInvoices().reduce((sum, invoice) => sum + invoice.amount, 0);
    const supplierTotal = getSuppliers().reduce((sum, supplier) => sum + (parseFloat(supplier.amount) || 0), 0);

    document.getElementById('summaryBankTotal').textContent = formatCurrency(bankTotal);
    document.getElementById('summaryCashTotal').textContent = formatCurrency(cashTotal);
    document.getElementById('summaryPostpaidTotal').textContent = formatCurrency(postpaidTotal);
    document.getElementById('summaryCustomerTotal').textContent = formatCurrency(customerTotal);
    document.getElementById('summaryReturnTotal').textContent = formatCurrency(returnTotal);

    const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
    const formulaSettings = getEffectiveFormulaSettingsFromDocument(document);
    const { totalReceipts, surplusDeficit } = calculateReconciliationSummaryByFormula(
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

    document.getElementById('totalReceipts').textContent = formatCurrency(totalReceipts);

    const surplusDeficitElement = document.getElementById('surplusDeficit');
    surplusDeficitElement.textContent = formatCurrency(surplusDeficit);

    if (surplusDeficit > 0) {
      surplusDeficitElement.className = 'summary-value text-surplus';
      surplusDeficitElement.textContent = `فائض: ${formatCurrency(surplusDeficit)}`;
    } else if (surplusDeficit < 0) {
      surplusDeficitElement.className = 'summary-value text-deficit';
      surplusDeficitElement.textContent = `عجز: ${formatCurrency(Math.abs(surplusDeficit))}`;
    } else {
      surplusDeficitElement.className = 'summary-value';
      surplusDeficitElement.textContent = 'متوازن: 0.00';
    }
  }

  return {
    updateSummary
  };
}

module.exports = {
  createReconciliationUiSummaryActions
};
