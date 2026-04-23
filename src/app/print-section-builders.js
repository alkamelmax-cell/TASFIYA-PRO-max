const { createPrintSectionUtils } = require('./print-section-utils');
const { createPrintSectionFinancialBuilders } = require('./print-section-financial');
const { createPrintSectionPartnerBuilders } = require('./print-section-partners');

function createPrintSectionBuilders(deps) {
  const formatCurrency = deps.formatCurrency;
  const formatNumber = deps.formatNumber;
  const formatDate = deps.formatDate;
  const logger = deps.logger || console;

  const utils = createPrintSectionUtils({
    formatDate
  });

  const financialBuilders = createPrintSectionFinancialBuilders({
    safeFieldValue: utils.safeFieldValue,
    safeDateFormat: utils.safeDateFormat,
    formatCurrency,
    formatNumber,
    logger
  });

  const partnerBuilders = createPrintSectionPartnerBuilders({
    safeFieldValue: utils.safeFieldValue,
    safeDateFormat: utils.safeDateFormat,
    formatCurrency,
    formatNumber,
    logger
  });

  return {
    safeFieldValue: utils.safeFieldValue,
    safeDateFormat: utils.safeDateFormat,
    generateBankReceiptsSection: financialBuilders.generateBankReceiptsSection,
    generateCashReceiptsSection: financialBuilders.generateCashReceiptsSection,
    generatePostpaidSalesSection: financialBuilders.generatePostpaidSalesSection,
    generateCustomerReceiptsSection: financialBuilders.generateCustomerReceiptsSection,
    generateReturnInvoicesSection: partnerBuilders.generateReturnInvoicesSection,
    generateSuppliersSection: partnerBuilders.generateSuppliersSection,
    generateSignaturesSection: partnerBuilders.generateSignaturesSection,
    generateSummarySection: partnerBuilders.generateSummarySection
  };
}

module.exports = {
  createPrintSectionBuilders
};
