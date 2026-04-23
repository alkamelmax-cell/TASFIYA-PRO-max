const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppFeatureDeps } = require('../src/app/app-feature-deps');
const formatting = require('../src/app/formatting');
const reportMetrics = require('../src/app/report-metrics');
const reportExportUtils = require('../src/app/report-export-utils');
const reportHtmlBuilders = require('../src/app/report-html-builders');
const performancePdfBuilders = require('../src/app/performance-pdf-builders');
const printStyles = require('../src/app/print-styles');

test('createAppFeatureDeps groups formatting and report dependencies', () => {
  const deps = createAppFeatureDeps();

  assert.equal(deps.formatting.formatDate, formatting.formatDate);
  assert.equal(deps.formatting.formatCurrency, formatting.formatCurrency);
  assert.equal(deps.formatting.getCurrentDateTime, formatting.getCurrentDateTime);

  assert.equal(deps.report.calculatePerformanceScore, reportMetrics.calculatePerformanceScore);
  assert.equal(deps.report.generateReportSummary, reportExportUtils.generateReportSummary);
  assert.equal(deps.report.buildAdvancedReportHtml, reportHtmlBuilders.buildAdvancedReportHtml);
  assert.equal(
    deps.report.buildPerformanceComprehensivePdfContent,
    performancePdfBuilders.buildPerformanceComprehensivePdfContent
  );

  assert.equal(
    deps.printStyleDeps.generateNonColoredPrintStyles,
    printStyles.generateNonColoredPrintStyles
  );
});
