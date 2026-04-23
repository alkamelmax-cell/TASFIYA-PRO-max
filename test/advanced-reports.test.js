const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdvancedReportsHandlers } = require('../src/app/advanced-reports');

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    ...initial,
    scrollIntoView() {}
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

function createDialog() {
  return {
    validations: [],
    infos: [],
    errors: [],
    loadings: 0,
    closes: 0,
    showValidationError(message) {
      this.validations.push(message);
    },
    showInfo(message) {
      this.infos.push(message);
    },
    showError(message) {
      this.errors.push(message);
    },
    showErrorToast(message) {
      this.errors.push(message);
    },
    showSuccessToast() {},
    showLoading() {
      this.loadings += 1;
    },
    close() {
      this.closes += 1;
    }
  };
}

test('handleGenerateTimeReport validates date range', async () => {
  const elements = {
    timeReportType: createElement({ value: 'daily' }),
    timeReportFrom: createElement({ value: '' }),
    timeReportTo: createElement({ value: '' }),
    advancedReportsResults: createElement(),
    advancedReportTitle: createElement(),
    advancedReportSummary: createElement(),
    advancedReportTableHead: createElement(),
    advancedReportTableBody: createElement(),
    advancedReportPagination: createElement()
  };

  const dialog = createDialog();
  const handlers = createAdvancedReportsHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    windowObj: {},
    getDialogUtils: () => dialog,
    getReportTypeLabel: () => 'يومي',
    formatDecimal: (v) => Number(v).toFixed(2),
    formatPeriodLabel: (v) => v,
    getDaysBetween: () => 1,
    formatCurrency: (v) => String(v),
    generateAdvancedReportSummary: () => ({}),
    prepareAdvancedReportExcelData: () => [],
    determineReportType: () => 'time',
    getCompanyName: async () => 'الشركة',
    getCurrentDate: () => '2026-02-25',
    generateAdvancedReportTableHtml: () => '<table></table>',
    buildAdvancedReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  await handlers.handleGenerateTimeReport();
  assert.equal(dialog.validations.length, 1);
});

test('handleGenerateAtmReport renders report title and table', async () => {
  const elements = {
    atmReportFilter: createElement({ value: '1' }),
    atmReportFrom: createElement({ value: '2026-02-01' }),
    atmReportTo: createElement({ value: '2026-02-25' }),
    advancedReportsResults: createElement(),
    advancedReportTitle: createElement(),
    advancedReportSummary: createElement(),
    advancedReportTableHead: createElement(),
    advancedReportTableBody: createElement(),
    advancedReportPagination: createElement()
  };

  const dialog = createDialog();
  const handlers = createAdvancedReportsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, payload) => {
        if (channel === 'db-all' && typeof payload === 'string') {
          return [{
            atm_id: 1,
            atm_name: 'ATM-1',
            atm_location: 'المدخل',
            atm_branch_name: 'الرئيسي',
            total_reconciliations: 3,
            total_transactions: 10,
            total_amount: 5000,
            avg_transaction_amount: 500,
            first_date: '2026-02-01',
            last_date: '2026-02-25'
          }];
        }

        if (channel === 'db-get') {
          return { name: 'ATM-1' };
        }

        return [];
      }
    },
    windowObj: {},
    getDialogUtils: () => dialog,
    getReportTypeLabel: () => 'يومي',
    formatDecimal: (v) => Number(v).toFixed(2),
    formatPeriodLabel: (v) => v,
    getDaysBetween: () => 5,
    formatCurrency: (v) => String(v),
    generateAdvancedReportSummary: () => ({
      totalAtms: 1,
      totalTransactions: 10,
      totalAmount: 5000,
      avgTransactionAmount: 500
    }),
    prepareAdvancedReportExcelData: () => [],
    determineReportType: () => 'atm',
    getCompanyName: async () => 'الشركة',
    getCurrentDate: () => '2026-02-25',
    generateAdvancedReportTableHtml: () => '<table></table>',
    buildAdvancedReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  await handlers.handleGenerateAtmReport();
  assert.equal(elements.advancedReportsResults.style.display, 'block');
  assert.ok(elements.advancedReportTitle.textContent.includes('ATM-1'));
  assert.ok(elements.advancedReportTableBody.innerHTML.includes('ATM-1'));
});

test('module exposes changeAdvancedReportPage on window object', () => {
  const windowObj = {};
  createAdvancedReportsHandlers({
    document: createDocument({
      timeReportType: createElement({ value: 'daily' }),
      timeReportFrom: createElement({ value: '' }),
      timeReportTo: createElement({ value: '' }),
      atmReportFilter: createElement({ value: '' }),
      atmReportFrom: createElement({ value: '' }),
      atmReportTo: createElement({ value: '' }),
      advancedReportsResults: createElement(),
      advancedReportTitle: createElement(),
      advancedReportSummary: createElement(),
      advancedReportTableHead: createElement(),
      advancedReportTableBody: createElement(),
      advancedReportPagination: createElement()
    }),
    ipcRenderer: { invoke: async () => [] },
    windowObj,
    getDialogUtils: () => createDialog(),
    getReportTypeLabel: () => 'يومي',
    formatDecimal: (v) => Number(v).toFixed(2),
    formatPeriodLabel: (v) => v,
    getDaysBetween: () => 1,
    formatCurrency: (v) => String(v),
    generateAdvancedReportSummary: () => ({}),
    prepareAdvancedReportExcelData: () => [],
    determineReportType: () => 'time',
    getCompanyName: async () => 'الشركة',
    getCurrentDate: () => '2026-02-25',
    generateAdvancedReportTableHtml: () => '<table></table>',
    buildAdvancedReportHtml: () => '<html></html>',
    logger: { log() {}, error() {} }
  });

  assert.equal(typeof windowObj.changeAdvancedReportPage, 'function');
});
