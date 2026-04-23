const test = require('node:test');
const assert = require('node:assert/strict');
const { createDetailedAtmReportManagementHandlers } = require('../src/app/detailed-atm-report-management');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    style: {},
    dataset: {},
    ...initial,
    appendChild(child) {
      this.children.push(child);
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

function createDialogTracker() {
  return {
    validations: [],
    infos: [],
    errors: [],
    success: [],
    loading: 0,
    closed: 0,
    showValidationError(msg) { this.validations.push(msg); },
    showInfo(msg) { this.infos.push(msg); },
    showError(msg) { this.errors.push(msg); },
    showErrorToast(msg) { this.errors.push(msg); },
    showSuccessToast(msg) { this.success.push(msg); },
    showLoading() { this.loading += 1; },
    close() { this.closed += 1; }
  };
}

function createBaseElements() {
  return {
    detailedAtmReportModal: createElement(),
    detailedAtmFilter: createElement(),
    detailedAccountNumberFilter: createElement(),
    detailedOperationTypeFilter: createElement({ value: '' }),
    detailedCashierFilter: createElement({ value: '' }),
    detailedDateFrom: createElement({ value: '2026-02-01' }),
    detailedDateTo: createElement({ value: '2026-02-20' }),
    detailedMinAmount: createElement({ value: '0' }),
    detailedMaxAmount: createElement({ value: '' }),
    detailedExactAmount: createElement({ value: '' }),
    detailedAtmReportResults: createElement({ style: {} }),
    detailedReportTitle: createElement(),
    detailedReportSummary: createElement(),
    detailedAtmReportTableBody: createElement(),
    detailedReportPaginationNav: createElement({ style: {} }),
    detailedReportPaginationInfo: createElement(),
    detailedReportPagination: createElement(),
    detailedReportSearch: createElement({ value: '' }),
    detailedReportSort: createElement({ value: 'date_desc' }),
    detailedReportPageSize: createElement({ value: '50' }),
    detailedFeesMode: createElement({ value: 'without_fees' }),
    detailedAtmReportTableHead: createElement({ innerHTML: '' })
  };
}

test('getDetailedAtmReportFilters parses values correctly', () => {
  const elements = createBaseElements();
  elements.detailedMinAmount.value = '5.5';
  elements.detailedMaxAmount.value = '100';
  elements.detailedAtmFilter.value = '3';
  elements.detailedAccountNumberFilter.value = 'ACC-1';

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {} }
  });

  const filters = handlers.getDetailedAtmReportFilters();
  assert.equal(filters.atmId, '3');
  assert.equal(filters.accountNumber, 'ACC-1');
  assert.equal(filters.minAmount, 5.5);
  assert.equal(filters.maxAmount, 100);
  assert.equal(filters.feesMode, 'without_fees');
});

test('handleGenerateDetailedAtmReport validates invalid date range', async () => {
  const elements = createBaseElements();
  elements.detailedDateFrom.value = '2026-02-20';
  elements.detailedDateTo.value = '2026-02-01';
  const dialog = createDialogTracker();

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} }
  });

  await handlers.handleGenerateDetailedAtmReport();
  assert.equal(dialog.validations.length, 1);
  assert.equal(dialog.loading, 0);
});

test('generateDetailedAtmReportData prioritizes exact amount filter', async () => {
  const elements = createBaseElements();
  elements.detailedExactAmount.value = '25';
  elements.detailedMinAmount.value = '5';
  elements.detailedMaxAmount.value = '50';

  const dbCalls = [];
  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        dbCalls.push({ channel, query, params });
        if (channel === 'db-all') {
          return [{
            amount: 25,
            operation_datetime: '2026-02-20 10:00:00',
            reconciliation_date: '2026-02-20'
          }];
        }
        return [];
      }
    },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {} }
  });

  await handlers.generateDetailedAtmReportData({
    dateFrom: '2026-02-01',
    dateTo: '2026-02-20',
    atmId: '',
    accountNumber: '',
    operationType: '',
    cashierId: '',
    minAmount: 5,
    maxAmount: 50
  });

  const dbAllCall = dbCalls.find((call) => call.channel === 'db-all');
  assert.ok(dbAllCall.query.includes('br.amount = ?'));
  assert.ok(!dbAllCall.query.includes('br.amount >= ?'));
  assert.ok(!dbAllCall.query.includes('br.amount <= ?'));
  assert.ok(dbAllCall.params.includes(25));
});

test('generateDetailedAtmReportData enriches rows with bank fee calculations', async () => {
  const elements = createBaseElements();

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-get') {
          return {
            setting_value: JSON.stringify({
              rules: [
                { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: 1.5, fee_vat_percent: 15 }
              ]
            })
          };
        }

        if (channel === 'db-all') {
          return [{
            amount: 100,
            operation_type: 'مدى',
            bank_name: 'مصرف الراجحي',
            operation_datetime: '2026-02-20 10:00:00',
            reconciliation_date: '2026-02-20'
          }];
        }

        return [];
      }
    },
    windowObj: {},
    formatCurrency: (v) => Number(v).toFixed(2),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {}, warn() {} }
  });

  const data = await handlers.generateDetailedAtmReportData({
    dateFrom: '2026-02-01',
    dateTo: '2026-02-20',
    atmId: '',
    accountNumber: '',
    operationType: '',
    cashierId: '',
    minAmount: 0,
    maxAmount: null
  });

  assert.equal(data.length, 1);
  assert.equal(data[0].gross_amount, 100);
  assert.equal(data[0].fee_amount, 1.5);
  assert.equal(data[0].fee_vat_amount, 0.23);
  assert.equal(data[0].net_amount, 98.27);
  assert.equal(data[0].formatted_net_amount, '98.27');
});

test('loadDetailedAtmReportFilters applies remembered fees mode when configured', async () => {
  const elements = createBaseElements();

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-query') {
          return [];
        }

        if (channel === 'db-get' && Array.isArray(params) && params[1] === 'detailed_atm_fees_mode_default') {
          return { setting_value: 'remember_last' };
        }

        if (channel === 'db-get' && Array.isArray(params) && params[1] === 'detailed_atm_fees_mode_last') {
          return { setting_value: 'with_fees' };
        }

        return null;
      }
    },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {}, warn() {} }
  });

  await handlers.loadDetailedAtmReportFilters();
  assert.equal(elements.detailedFeesMode.value, 'with_fees');
});

test('handleDetailedReportFeesModeChange persists the last selected fees mode', async () => {
  const elements = createBaseElements();
  elements.detailedFeesMode.value = 'with_fees';
  const dbRunCalls = [];

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return [];
      }
    },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {}, warn() {} }
  });

  await handlers.handleDetailedReportFeesModeChange();

  const savedModeRow = dbRunCalls.find((call) => Array.isArray(call.params) && call.params[1] === 'detailed_atm_fees_mode_last');
  assert.ok(savedModeRow);
  assert.equal(savedModeRow.params[2], 'with_fees');
});

test('handleDetailedReportSearch filters loaded data and exposes getter', async () => {
  const elements = createBaseElements();
  const dialog = createDialogTracker();

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-all') {
          return [
            {
              amount: 10,
              operation_type: 'مدى',
              operation_datetime: '2026-02-10 09:00:00',
              atm_name: 'ATM-1',
              atm_location: 'LOC-1',
              atm_branch_name: 'BR-1',
              bank_name: 'BANK',
              cashier_name: 'Ali',
              cashier_number: '001',
              reconciliation_id: 11,
              reconciliation_date: '2026-02-10'
            },
            {
              amount: 20,
              operation_type: 'فيزا',
              operation_datetime: '2026-02-11 09:00:00',
              atm_name: 'ATM-2',
              atm_location: 'LOC-2',
              atm_branch_name: 'BR-2',
              bank_name: 'BANK',
              cashier_name: 'Sara',
              cashier_number: '002',
              reconciliation_id: 22,
              reconciliation_date: '2026-02-11'
            }
          ];
        }
        return [];
      }
    },
    windowObj: {},
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {} }
  });

  await handlers.handleGenerateDetailedAtmReport();
  assert.equal(handlers.getFilteredDetailedReportData().length, 2);

  elements.detailedReportSearch.value = '10';
  handlers.handleDetailedReportSearch();

  const filtered = handlers.getFilteredDetailedReportData();
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].amount, 10);
});

test('viewReconciliationDetails is bound globally and delegates to viewReconciliation', async () => {
  const elements = createBaseElements();
  let delegatedId = null;
  const windowObj = {
    viewReconciliation: async (id) => { delegatedId = id; }
  };

  const handlers = createDetailedAtmReportManagementHandlers({
    document: createDocument(elements),
    ipcRenderer: { invoke: async () => [] },
    windowObj,
    formatCurrency: (v) => String(v),
    formatDate: (v) => v,
    formatDateTime: (v) => v,
    getBootstrap: () => ({ Modal: function Modal() {} }),
    getDialogUtils: createDialogTracker,
    logger: { log() {}, error() {}, warn() {} }
  });

  assert.equal(typeof windowObj.viewReconciliationDetails, 'function');
  assert.equal(typeof handlers.viewReconciliationDetails, 'function');

  await windowObj.viewReconciliationDetails(77);
  assert.equal(delegatedId, 77);
});
