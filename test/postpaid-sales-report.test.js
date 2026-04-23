const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostpaidSalesReportHandlers } = require('../src/app/postpaid-sales-report');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    options: [{ text: '' }],
    selectedIndex: 0,
    ...initial
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

function createHandlers(overrides = {}) {
  const elements = overrides.elements || {
    postpaidSalesSearchName: createElement(),
    postpaidSalesReportMode: createElement({ value: 'current_balance' }),
    postpaidSalesCashierFilter: createElement(),
    postpaidSalesBranchFilter: createElement(),
    postpaidSalesDateFrom: createElement(),
    postpaidSalesDateTo: createElement(),
    postpaidSalesDateRangeRow: createElement({ style: { display: 'none' } }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'block' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  return createPostpaidSalesReportHandlers({
    document: createDocument(elements),
    ipcRenderer: overrides.ipcRenderer || { invoke: async () => [] },
    getDialogUtils: () => ({
      showValidationError() {},
      showLoading() {},
      close() {},
      showInfo() {},
      showError() {},
      showSuccess() {},
      showSuccessToast() {}
    }),
    getCompanyName: async () => 'شركة الاختبار',
    getCurrentDate: () => '2026-02-24',
    formatDecimal: (v) => Number(v || 0).toFixed(2),
    formatDate: (v) => String(v),
    logger: { log() {}, error() {} },
    ...overrides
  });
}

test('clearPostpaidSalesReportFilters resets values and hides card', () => {
  const elements = {
    postpaidSalesSearchName: createElement({ value: 'abc' }),
    postpaidSalesReportMode: createElement({ value: 'period_activity' }),
    postpaidSalesCashierFilter: createElement({ value: '1' }),
    postpaidSalesBranchFilter: createElement({ value: '2' }),
    postpaidSalesDateFrom: createElement({ value: '2026-02-01' }),
    postpaidSalesDateTo: createElement({ value: '2026-02-24' }),
    postpaidSalesDateRangeRow: createElement({ style: { display: '' } }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'block' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const handlers = createHandlers({ elements });
  handlers.clearPostpaidSalesReportFilters();

  assert.equal(elements.postpaidSalesSearchName.value, '');
  assert.equal(elements.postpaidSalesReportMode.value, 'current_balance');
  assert.equal(elements.postpaidSalesCashierFilter.value, '');
  assert.equal(elements.postpaidSalesBranchFilter.value, '');
  assert.equal(elements.postpaidSalesDateFrom.value, '');
  assert.equal(elements.postpaidSalesDateTo.value, '');
  assert.equal(elements.postpaidSalesDateRangeRow.style.display, 'none');
  assert.equal(elements.postpaidSalesReportResultsCard.style.display, 'none');
});

test('getPostpaidSalesReportFilters ignores date range in current balance mode', () => {
  const elements = {
    postpaidSalesSearchName: createElement({ value: 'عميل' }),
    postpaidSalesReportMode: createElement({ value: 'current_balance' }),
    postpaidSalesCashierFilter: createElement({ value: '1' }),
    postpaidSalesBranchFilter: createElement({ value: '2' }),
    postpaidSalesDateFrom: createElement({ value: '2026-02-01' }),
    postpaidSalesDateTo: createElement({ value: '2026-02-24' }),
    postpaidSalesDateRangeRow: createElement({ style: { display: 'none' } }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'none' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const handlers = createHandlers({ elements });
  const filters = handlers.getPostpaidSalesReportFilters();

  assert.equal(filters.reportMode, 'current_balance');
  assert.equal(filters.dateFrom, '');
  assert.equal(filters.dateTo, '');
});

test('handleGeneratePostpaidSalesReport requires full date range in period activity mode', async () => {
  const elements = {
    postpaidSalesSearchName: createElement(),
    postpaidSalesReportMode: createElement({ value: 'period_activity' }),
    postpaidSalesCashierFilter: createElement({ value: '' }),
    postpaidSalesBranchFilter: createElement({ value: '' }),
    postpaidSalesDateFrom: createElement({ value: '2026-01-01' }),
    postpaidSalesDateTo: createElement({ value: '' }),
    postpaidSalesDateRangeRow: createElement({ style: { display: '' } }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'none' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const dialog = {
    validationErrors: [],
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showLoading() {},
    close() {},
    showInfo() {},
    showError() {},
    showSuccess() {},
    showSuccessToast() {}
  };

  const handlers = createHandlers({
    elements,
    getDialogUtils: () => dialog,
    ipcRenderer: {
      invoke: async () => []
    }
  });

  await handlers.handleGeneratePostpaidSalesReport();

  assert.equal(dialog.validationErrors.length, 1);
  assert.match(dialog.validationErrors[0], /يرجى تحديد من وإلى تاريخ/);
});

test('generatePostpaidSalesReportData builds query params from filters', async () => {
  const calls = [];
  const handlers = createHandlers({
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        calls.push([channel, query, params]);
        return [];
      }
    }
  });

  await handlers.generatePostpaidSalesReportData({
    searchName: 'عميل',
    cashierFilter: '3',
    branchFilter: '2',
    dateFrom: '2026-02-01',
    dateTo: '2026-02-24'
  });

  assert.equal(calls[0][0], 'db-query');
  assert.match(calls[0][1], /FROM postpaid_sales ps/);
  assert.match(calls[0][1], /FROM customer_receipts cr/);
  assert.doesNotMatch(calls[0][1], /manual_postpaid_sales/);
  assert.match(calls[0][1], /SUM\(CASE WHEN tx_type = 'postpaid' THEN amount ELSE -amount END\)/);
  assert.match(calls[0][1], /GROUP BY customer_name/);
  assert.match(calls[0][1], /customer_name LIKE \?/);
  assert.deepEqual(calls[0][2], ['3', '2', '2026-02-01', '2026-02-24', '3', '2', '2026-02-01', '2026-02-24', '%عميل%']);
});

test('generatePostpaidSalesReportData includes manual transactions when cashier filter is empty', async () => {
  const handlers = createHandlers({
    ipcRenderer: {
      invoke: async () => [{
        customer_name: 'عميل 1',
        total_postpaid: 120,
        total_receipts: 20,
        net_balance: 100,
        movements_count: 3,
        last_tx_date: '2026-02-24',
        branches_count: 2,
        branch_names: 'الفرع الرئيسي,فرع 2'
      }]
    }
  });

  const data = await handlers.generatePostpaidSalesReportData({
    searchName: '',
    cashierFilter: '',
    branchFilter: '',
    dateFrom: '',
    dateTo: ''
  });

  assert.equal(data.length, 1);
  assert.equal(data[0].net_balance, 100);
  assert.equal(data[0].branch_label, 'متعدد (2)');
});

test('preparePostpaidSalesReportExcelData includes filters and rows', () => {
  const elements = {
    postpaidSalesSearchName: createElement({ value: 'عميل' }),
    postpaidSalesCashierFilter: createElement({
      value: '1',
      selectedIndex: 1,
      options: [{ text: 'جميع الكاشير' }, { text: 'أحمد' }]
    }),
    postpaidSalesBranchFilter: createElement({
      value: '2',
      selectedIndex: 1,
      options: [{ text: 'جميع الفروع' }, { text: 'الفرع الرئيسي' }]
    }),
    postpaidSalesDateFrom: createElement({ value: '2026-02-01' }),
    postpaidSalesDateTo: createElement({ value: '2026-02-24' }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'none' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const handlers = createHandlers({ elements });
  const excel = handlers.preparePostpaidSalesReportExcelData([
    {
      customer_name: 'عميل 1',
      total_postpaid: 250,
      total_receipts: 100,
      net_balance: 150,
      branch_label: 'الفرع الرئيسي',
      movements_count: 4,
      last_tx_date: '2026-02-24'
    }
  ]);

  assert.equal(excel.title, 'تقرير صافي أرصدة العملاء الآجلة');
  assert.match(excel.filters, /البحث: عميل/);
  assert.match(excel.filters, /الكاشير: أحمد/);
  assert.equal(excel.rows.length, 1);
  assert.equal(excel.rows[0][1], 'عميل 1');
  assert.equal(excel.rows[0][2], '250.00');
  assert.equal(excel.rows[0][3], '100.00');
  assert.equal(excel.rows[0][4], '150.00');
});

test('displayPostpaidSalesReportResults renders net balances summary and aggregated columns', () => {
  const elements = {
    postpaidSalesSearchName: createElement(),
    postpaidSalesCashierFilter: createElement(),
    postpaidSalesBranchFilter: createElement(),
    postpaidSalesDateFrom: createElement(),
    postpaidSalesDateTo: createElement(),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'none' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const handlers = createHandlers({ elements });

  handlers.displayPostpaidSalesReportResults([
    {
      customer_name: 'عميل 1',
      total_postpaid: 250,
      total_receipts: 100,
      net_balance: 150,
      branch_label: 'الفرع الرئيسي',
      movements_count: 4,
      last_tx_date: '2026-02-24'
    },
    {
      customer_name: 'عميل 2',
      total_postpaid: 90,
      total_receipts: 90,
      net_balance: 0,
      branch_label: 'فرع 2',
      movements_count: 2,
      last_tx_date: '2026-02-23'
    }
  ]);

  assert.equal(elements.postpaidSalesReportResultsCard.style.display, 'block');
  assert.match(elements.postpaidSalesReportSummary.innerHTML, /صافي الأرصدة/);
  assert.match(elements.postpaidSalesReportSummary.innerHTML, /عملاء عليهم رصيد/);
  assert.match(elements.postpaidSalesReportTableHead.innerHTML, /إجمالي التحصيل/);
  assert.match(elements.postpaidSalesReportTableHead.innerHTML, /صافي الرصيد/);
  assert.match(elements.postpaidSalesReportTableBody.innerHTML, /عميل 1/);
  assert.match(elements.postpaidSalesReportTableBody.innerHTML, /الفرع الرئيسي/);
  assert.match(elements.postpaidSalesReportPaginationInfo.textContent, /من 2 عميل/);
});

test('buildPostpaidSalesThermalPayload creates structured thermal table payload for net balances', async () => {
  const elements = {
    postpaidSalesSearchName: createElement({ value: 'عميل' }),
    postpaidSalesCashierFilter: createElement({
      value: '',
      selectedIndex: 0,
      options: [{ text: 'جميع الكاشير' }]
    }),
    postpaidSalesBranchFilter: createElement({
      value: '',
      selectedIndex: 0,
      options: [{ text: 'جميع الفروع' }]
    }),
    postpaidSalesDateFrom: createElement({ value: '2026-02-01' }),
    postpaidSalesDateTo: createElement({ value: '2026-02-24' }),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'block' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const handlers = createHandlers({ elements });
  handlers.displayPostpaidSalesReportResults([
    {
      customer_name: 'عميل 1',
      total_postpaid: 250,
      total_receipts: 100,
      net_balance: 150,
      branch_label: 'الفرع الرئيسي',
      movements_count: 4,
      last_tx_date: '2026-02-24'
    }
  ]);

  const thermalPayload = await handlers.buildPostpaidSalesThermalPayload();
  const structuredStatement = JSON.parse(thermalPayload.customText);

  assert.equal(thermalPayload.isCustomerStatement, true);
  assert.equal(thermalPayload.customerName, 'صافي أرصدة العملاء');
  assert.equal(structuredStatement.isStructuredStatement, true);
  assert.equal(structuredStatement.statementType, 'postpaid_net_balances');
  assert.equal(structuredStatement.title, 'تقرير صافي أرصدة العملاء الآجلة');
  assert.equal(structuredStatement.tableData.length, 1);
  assert.equal(structuredStatement.tableData[0].customerName, 'عميل 1');
  assert.equal(structuredStatement.tableData[0].netBalance, 150);
  assert.equal(structuredStatement.summary.totalNetBalance, 150);
});

test('handlePreviewPostpaidSalesReportThermal sends preview payload and shows success toast', async () => {
  const elements = {
    postpaidSalesSearchName: createElement(),
    postpaidSalesCashierFilter: createElement({ value: '', selectedIndex: 0, options: [{ text: 'جميع الكاشير' }] }),
    postpaidSalesBranchFilter: createElement({ value: '', selectedIndex: 0, options: [{ text: 'جميع الفروع' }] }),
    postpaidSalesDateFrom: createElement(),
    postpaidSalesDateTo: createElement(),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'block' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const dialog = {
    validationErrors: [],
    loadingCalls: 0,
    closeCalls: 0,
    successToasts: [],
    errors: [],
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showLoading() {
      this.loadingCalls += 1;
    },
    close() {
      this.closeCalls += 1;
    },
    showInfo() {},
    showError(message) {
      this.errors.push(message);
    },
    showSuccess() {},
    showSuccessToast(message) {
      this.successToasts.push(message);
    }
  };

  const invocations = [];
  const handlers = createHandlers({
    elements,
    getDialogUtils: () => dialog,
    ipcRenderer: {
      invoke: async (channel, payload) => {
        invocations.push([channel, payload]);
        if (channel === 'thermal-printer-preview') {
          return { success: true };
        }
        return { success: true };
      }
    }
  });

  handlers.displayPostpaidSalesReportResults([
    {
      customer_name: 'عميل 1',
      total_postpaid: 250,
      total_receipts: 100,
      net_balance: 150,
      branch_label: 'الفرع الرئيسي',
      movements_count: 4,
      last_tx_date: '2026-02-24'
    }
  ]);

  await handlers.handlePreviewPostpaidSalesReportThermal();
  const previewPayload = invocations[0][1];
  const structuredStatement = JSON.parse(previewPayload.customText);

  assert.equal(invocations[0][0], 'thermal-printer-preview');
  assert.equal(structuredStatement.statementType, 'postpaid_net_balances');
  assert.equal(structuredStatement.tableData[0].customerName, 'عميل 1');
  assert.equal(dialog.loadingCalls, 1);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.successToasts.length, 1);
});

test('handlePrintPostpaidSalesReportThermal loads printer settings and prints', async () => {
  const elements = {
    postpaidSalesSearchName: createElement(),
    postpaidSalesCashierFilter: createElement({ value: '', selectedIndex: 0, options: [{ text: 'جميع الكاشير' }] }),
    postpaidSalesBranchFilter: createElement({ value: '', selectedIndex: 0, options: [{ text: 'جميع الفروع' }] }),
    postpaidSalesDateFrom: createElement(),
    postpaidSalesDateTo: createElement(),
    postpaidSalesReportResultsCard: createElement({ style: { display: 'block' } }),
    postpaidSalesReportSummary: createElement(),
    postpaidSalesReportTableHead: createElement(),
    postpaidSalesReportTableBody: createElement(),
    postpaidSalesReportPaginationInfo: createElement(),
    postpaidSalesReportPagination: createElement()
  };

  const dialog = {
    validationErrors: [],
    loadingCalls: 0,
    closeCalls: 0,
    successes: [],
    errors: [],
    showValidationError(message) {
      this.validationErrors.push(message);
    },
    showLoading() {
      this.loadingCalls += 1;
    },
    close() {
      this.closeCalls += 1;
    },
    showInfo() {},
    showError(message) {
      this.errors.push(message);
    },
    showSuccess(message) {
      this.successes.push(message);
    },
    showSuccessToast() {}
  };

  const channels = [];
  const handlers = createHandlers({
    elements,
    getDialogUtils: () => dialog,
    ipcRenderer: {
      invoke: async (channel) => {
        channels.push(channel);
        if (channel === 'thermal-printer-settings-get') {
          return { success: true, settings: { printerName: 'POS-80' } };
        }
        if (channel === 'thermal-printer-print') {
          return { success: true };
        }
        return { success: true };
      }
    }
  });

  handlers.displayPostpaidSalesReportResults([
    {
      customer_name: 'عميل 1',
      total_postpaid: 250,
      total_receipts: 100,
      net_balance: 150,
      branch_label: 'الفرع الرئيسي',
      movements_count: 4,
      last_tx_date: '2026-02-24'
    }
  ]);

  await handlers.handlePrintPostpaidSalesReportThermal();

  assert.deepEqual(channels, ['thermal-printer-settings-get', 'thermal-printer-print']);
  assert.equal(dialog.loadingCalls, 1);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.successes.length, 1);
});
