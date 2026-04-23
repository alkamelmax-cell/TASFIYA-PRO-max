const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportsManagementHandlers } = require('../src/app/reports-management');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    className: '',
    children: [],
    style: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
    },
    getContext() {
      return {
        font: '',
        textAlign: '',
        fillText() {}
      };
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createElement();
    }
  };
}

function createBaseElements() {
  return {
    reportDateFrom: createElement(),
    reportDateTo: createElement(),
    reportBranchFilter: createElement(),
    reportCashierFilter: createElement(),
    reportAccountantFilter: createElement(),
    reportStatusFilter: createElement(),
    reportMinAmount: createElement(),
    reportMaxAmount: createElement(),
    reportSearchText: createElement(),
    reportResultsCard: createElement({ style: { display: 'none' } }),
    reportSummary: createElement(),
    reportResultsTableBody: createElement(),
    reportPagination: createElement(),
    reportPaginationInfo: createElement(),
    reportChartsSection: createElement({ style: { display: 'none' } }),
    toggleSummaryViewBtn: createElement(),
    toggleChartViewBtn: createElement(),
    cashierDistributionChart: createElement({ width: 100, height: 100 }),
    salesTrendChart: createElement({ width: 100, height: 100 }),
    atmReportFilter: createElement(),
    timeReportFrom: createElement(),
    timeReportTo: createElement(),
    atmReportFrom: createElement(),
    atmReportTo: createElement()
  };
}

test('handleGenerateReport builds report table and displays card', async () => {
  const elements = createBaseElements();
  const dialog = {
    validations: [],
    showLoading() {},
    close() {},
    showSuccessToast() {},
    showValidationError(message) { this.validations.push(message); },
    showError() {},
    showErrorToast() {}
  };

  const windowObj = {};
  const handlers = createReportsManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-all') {
          return [{
            id: 5,
            reconciliation_number: 'R-5',
            reconciliation_date: '2026-02-25',
            cashier_name: 'Cashier',
            cashier_number: 'C-1',
            accountant_name: 'Accountant',
            total_receipts: 200,
            system_sales: 180,
            surplus_deficit: 20,
            status: 'completed'
          }];
        }
        return [];
      }
    },
    windowObj,
    getDialogUtils: () => dialog,
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    getCompanyName: async () => 'Company',
    getCurrentDate: () => '2026-02-25',
    generateReportSummary: () => ({
      totalReconciliations: 1,
      totalReceipts: 200,
      totalSystemSales: 180,
      totalSurplusDeficit: 20
    }),
    prepareExcelData: () => [],
    buildReconciliationReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  await handlers.handleGenerateReport();
  assert.equal(elements.reportResultsCard.style.display, 'block');
  assert.equal(elements.reportResultsTableBody.children.length, 1);
  assert.equal(typeof windowObj.changeReportPage, 'function');
});

test('handleExportReportPdf validates empty report data', async () => {
  const elements = createBaseElements();
  const dialog = {
    validations: [],
    showValidationError(message) { this.validations.push(message); },
    showLoading() {},
    close() {},
    showSuccessToast() {},
    showError() {},
    showErrorToast() {}
  };

  const handlers = createReportsManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => ({ success: true }) },
    windowObj: {},
    getDialogUtils: () => dialog,
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    getCompanyName: async () => 'Company',
    getCurrentDate: () => '2026-02-25',
    generateReportSummary: () => ({ totalReconciliations: 0, totalReceipts: 0, totalSystemSales: 0, totalSurplusDeficit: 0 }),
    prepareExcelData: () => [],
    buildReconciliationReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  await handlers.handleExportReportPdf();
  assert.equal(dialog.validations.length, 1);
});

test('handleClearReportFilters resets filters and hides results card', () => {
  const elements = createBaseElements();
  elements.reportDateFrom.value = '2026-02-01';
  elements.reportDateTo.value = '2026-02-25';
  elements.reportResultsCard.style.display = 'block';

  const handlers = createReportsManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    windowObj: {},
    getDialogUtils: () => ({
      showSuccessToast() {},
      showValidationError() {},
      showLoading() {},
      close() {},
      showError() {},
      showErrorToast() {}
    }),
    formatDate: (v) => v,
    formatCurrency: (v) => String(v),
    getCompanyName: async () => 'Company',
    getCurrentDate: () => '2026-02-25',
    generateReportSummary: () => ({ totalReconciliations: 0, totalReceipts: 0, totalSystemSales: 0, totalSurplusDeficit: 0 }),
    prepareExcelData: () => [],
    buildReconciliationReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  handlers.handleClearReportFilters();
  assert.equal(elements.reportDateFrom.value, '');
  assert.equal(elements.reportDateTo.value, '');
  assert.equal(elements.reportResultsCard.style.display, 'none');
});
