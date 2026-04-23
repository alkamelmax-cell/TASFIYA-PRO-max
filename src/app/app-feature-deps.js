const formatting = require('./formatting');
const reportMetrics = require('./report-metrics');
const reportExportUtils = require('./report-export-utils');
const reportHtmlBuilders = require('./report-html-builders');
const performancePdfBuilders = require('./performance-pdf-builders');
const { generateNonColoredPrintStyles } = require('./print-styles');

function createAppFeatureDeps() {
  return {
    formatting: {
      formatDate: formatting.formatDate,
      formatCurrency: formatting.formatCurrency,
      formatDateTime: formatting.formatDateTime,
      formatNumber: formatting.formatNumber,
      formatDecimal: formatting.formatDecimal,
      getCurrentDate: formatting.getCurrentDate,
      getCurrentDateTime: formatting.getCurrentDateTime
    },
    report: {
      ...reportMetrics,
      ...reportExportUtils,
      ...reportHtmlBuilders,
      ...performancePdfBuilders
    },
    printStyleDeps: {
      generateNonColoredPrintStyles
    }
  };
}

module.exports = {
  createAppFeatureDeps
};
