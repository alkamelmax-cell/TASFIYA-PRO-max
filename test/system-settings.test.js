const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemSettingsHandlers } = require('../src/app/system-settings');

function createClassList() {
  const set = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => set.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => set.delete(token));
    },
    contains(token) {
      return set.has(token);
    }
  };
}

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    checked: false,
    innerHTML: '',
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    ...initial
  };
}

function createDocument(elements) {
  const attrs = {};
  return {
    body: { classList: createClassList() },
    documentElement: {
      setAttribute(key, value) {
        attrs[key] = value;
      }
    },
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-formula-preset]') {
        return elements.__formulaPresetButtons || [];
      }
      return [];
    },
    querySelector() {
      return null;
    },
    getAttr(key) {
      return attrs[key];
    }
  };
}

function createDialogTracker() {
  return {
    loading: 0,
    closed: 0,
    success: [],
    errors: [],
    showLoading() { this.loading += 1; },
    close() { this.closed += 1; },
    showSuccessToast(message) { this.success.push(message); },
    showError(message) { this.errors.push(message); },
    showErrorToast(message) { this.errors.push(message); },
    showValidationError(message) { this.errors.push(message); },
    showConfirm: async () => true
  };
}

function createStorage() {
  const map = new Map();
  return {
    setItem(key, value) {
      map.set(key, String(value));
    },
    getItem(key) {
      return map.get(key) || null;
    }
  };
}

test('applyTheme updates classes and stores selected theme', () => {
  const elements = {};
  const document = createDocument(elements);
  const storage = createStorage();
  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: { invoke: async () => null },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: createDialogTracker,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  handlers.applyTheme('dark');
  assert.equal(document.body.classList.contains('theme-dark'), true);
  assert.equal(document.getAttr('data-theme'), 'dark');
  assert.equal(storage.getItem('theme'), 'dark');
});

test('applyTheme applies sender-rich variant and preserves sender base class', () => {
  const elements = {};
  const document = createDocument(elements);
  const storage = createStorage();
  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: { invoke: async () => null },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: createDialogTracker,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  handlers.applyTheme('sender-rich');
  assert.equal(document.body.classList.contains('theme-sender'), true);
  assert.equal(document.body.classList.contains('theme-sender-rich'), true);
  assert.equal(document.getAttr('data-theme'), 'sender-rich');
  assert.equal(storage.getItem('theme'), 'sender-rich');
});

test('loadSystemSettings applies values and refreshes system info fields', async () => {
  const elements = {
    companyName: createElement(),
    systemTheme: createElement(),
    systemLanguage: createElement(),
    nodeVersion: createElement(),
    electronVersion: createElement(),
    osInfo: createElement(),
    memoryUsage: createElement(),
    uptime: createElement(),
    dbSize: createElement(),
    recordCount: createElement(),
    lastDbUpdate: createElement(),
    dbConnections: createElement(),
    lastUpdateDate: createElement()
  };
  const document = createDocument(elements);
  const storage = createStorage();
  const windowObj = { matchMedia: () => ({ matches: false, addListener() {} }) };

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-all') {
          const category = params[0];
          if (category === 'general') {
            return [
              { setting_key: 'company_name', setting_value: 'شركة الاختبار' },
              { setting_key: 'system_theme', setting_value: 'light' },
              { setting_key: 'system_language', setting_value: 'ar' }
            ];
          }
          return [];
        }
        if (channel === 'get-system-info') {
          return {
            nodeVersion: 'v22',
            electronVersion: 'v35',
            osInfo: 'Windows',
            memoryUsage: '100MB',
            uptime: '1h'
          };
        }
        if (channel === 'get-database-stats') {
          return { size: '10MB', recordCount: '20' };
        }
        return null;
      }
    },
    windowObj,
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: createDialogTracker,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.loadSystemSettings();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.companyName.value, 'شركة الاختبار');
  assert.equal(windowObj.currentCompanyName, 'شركة الاختبار');
  assert.equal(elements.nodeVersion.textContent, 'v22');
  assert.equal(elements.dbSize.textContent, '10MB');
  assert.equal(elements.lastUpdateDate.textContent, '2026-02-25');
});

test('handleSaveGeneralSettings persists settings and applies runtime values', async () => {
  const elements = {};
  const document = createDocument(elements);
  const storage = createStorage();
  const dialog = createDialogTracker();
  const dbRunCalls = [];
  const windowObj = { matchMedia: () => ({ matches: false, addListener() {} }) };

  function MockFormData(target) {
    this.target = target;
  }
  MockFormData.prototype.get = function get(key) {
    return this.target.values[key];
  };

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj,
    localStorageObj: storage,
    FormDataCtor: MockFormData,
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleSaveGeneralSettings({
    preventDefault() {},
    target: {
      values: {
        companyName: 'الشركة الجديدة',
        companyPhone: '010',
        companyEmail: 'mail@test.com',
        companyWebsite: 'example.com',
        companyAddress: 'Riyadh',
        systemLanguage: 'ar',
        systemTheme: 'dark'
      }
    }
  });

  assert.equal(dbRunCalls.length, 7);
  assert.equal(windowObj.currentCompanyName, 'الشركة الجديدة');
  assert.equal(storage.getItem('theme'), 'dark');
  assert.equal(dialog.success.length, 1);
});

test('handleSavePrintSettings persists print keys and applies runtime print settings', async () => {
  const elements = {
    paperSize: createElement({ value: 'A3' }),
    paperOrientation: createElement({ value: 'landscape' }),
    fontFamily: createElement({ value: 'Arial' }),
    fontSize: createElement({ value: 'large' }),
    marginTop: createElement({ value: '12' }),
    marginBottom: createElement({ value: '14' }),
    marginLeft: createElement({ value: '10' }),
    marginRight: createElement({ value: '11' }),
    printHeader: createElement({ checked: true }),
    printFooter: createElement({ checked: false }),
    printLogo: createElement({ checked: true }),
    printPageNumbers: createElement({ checked: true }),
    printDate: createElement({ checked: false }),
    printBorders: createElement({ checked: true }),
    colorPrintCheck: createElement({ checked: true }),
    copiesInput: createElement({ value: '3' }),
    duplexSelect: createElement({ value: 'longEdge' }),
    printerSelect: createElement({ value: 'HP-Test' })
  };
  const document = createDocument(elements);
  const dialog = createDialogTracker();
  const dbRunCalls = [];
  const updatePrintSettingsCalls = [];

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        if (channel === 'update-print-settings') {
          updatePrintSettingsCalls.push(query);
          return { success: true };
        }
        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleSavePrintSettings({
    preventDefault() {}
  });

  const printRows = dbRunCalls
    .filter((call) => (
      Array.isArray(call.params)
      && call.params[0] === 'print'
      && typeof call.query === 'string'
      && call.query.includes('INSERT OR REPLACE INTO system_settings')
    ))
    .map((call) => [call.params[1], call.params[2]]);
  const printMap = Object.fromEntries(printRows);

  assert.equal(printMap.paper_size, 'A3');
  assert.equal(printMap.paper_orientation, 'landscape');
  assert.equal(printMap.font_family, 'Arial');
  assert.equal(printMap.font_size, 'large');
  assert.equal(printMap.margin_top, '12');
  assert.equal(printMap.margin_bottom, '14');
  assert.equal(printMap.margin_left, '10');
  assert.equal(printMap.margin_right, '11');
  assert.equal(printMap.color_print, 'true');
  assert.equal(printMap.copies, '3');
  assert.equal(printMap.duplex, 'longEdge');
  assert.equal(printMap.printer_name, 'HP-Test');

  assert.equal(updatePrintSettingsCalls.length, 1);
  assert.deepEqual(updatePrintSettingsCalls[0], {
    copies: 3,
    paperSize: 'A3',
    orientation: 'landscape',
    color: true,
    duplex: 'longEdge',
    printerName: 'HP-Test',
    fontSize: 'large',
    fontFamily: 'Arial',
    margins: {
      top: 12,
      right: 11,
      bottom: 14,
      left: 10
    }
  });
  assert.equal(dialog.success.length, 1);
});

test('handleSaveReportsSettings persists bank fee rules JSON', async () => {
  const feeRuleRow = {
    querySelector(selector) {
      const fields = {
        '[data-bank-fee-field="bank_name"]': { value: 'الراجحي' },
        '[data-bank-fee-field="operation_type"]': { value: 'مدى' },
        '[data-bank-fee-field="fee_percent"]': { value: '1.25' },
        '[data-bank-fee-field="fee_vat_percent"]': { value: '15' }
      };
      return fields[selector] || null;
    }
  };

  const elements = {
    defaultReportFormat: createElement({ value: 'excel' }),
    defaultDateRange: createElement({ value: 'month' }),
    reportsPath: createElement({ value: 'C:/reports' }),
    includeCharts: createElement({ checked: true }),
    includeSummary: createElement({ checked: false }),
    includeDetails: createElement({ checked: true }),
    autoOpenReports: createElement({ checked: true }),
    saveReportHistory: createElement({ checked: false }),
    compressReports: createElement({ checked: true }),
    detailedAtmFeesDefaultMode: createElement({ value: 'remember_last' }),
    bankFeeRulesTableBody: createElement({
      querySelectorAll(selector) {
        if (selector === 'tr[data-bank-fee-rule-row="true"]') {
          return [feeRuleRow];
        }
        return [];
      }
    })
  };

  const document = createDocument(elements);
  const dialog = createDialogTracker();
  const dbRunCalls = [];

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleSaveReportsSettings({
    preventDefault() {}
  });

  const reportsRows = dbRunCalls
    .filter((call) => Array.isArray(call.params) && call.params[0] === 'reports')
    .map((call) => [call.params[1], call.params[2]]);
  const reportsMap = Object.fromEntries(reportsRows);

  assert.equal(reportsMap.default_format, 'excel');
  assert.equal(reportsMap.default_date_range, 'month');
  assert.equal(reportsMap.include_summary, 'false');
  assert.equal(reportsMap.compress_reports, 'true');
  assert.equal(reportsMap.detailed_atm_fees_mode_default, 'remember_last');
  assert.match(reportsMap.bank_fee_rules_json, /الراجحي/);
  assert.match(reportsMap.bank_fee_rules_json, /1\.25/);
  assert.equal(dialog.success.length, 1);
});

test('handleSaveReconciliationFormulaSettings persists formula settings and updates preview', async () => {
  const elements = {
    formulaBankReceipts: createElement({ value: '-1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '-1' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };
  const document = createDocument(elements);
  const storage = createStorage();
  const dialog = createDialogTracker();
  const dbRunCalls = [];
  const updateSummaryCalls = [];
  const windowObj = {
    matchMedia: () => ({ matches: false, addListener() {} }),
    updateSummary: () => updateSummaryCalls.push(true)
  };

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj,
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleSaveReconciliationFormulaSettings({
    preventDefault() {}
  });

  const formulaCalls = dbRunCalls.filter((call) => call.params[0] === 'reconciliation_formula');
  assert.equal(formulaCalls.length, 7);
  assert.match(elements.reconciliationFormulaPreview.textContent, /إجمالي المقبوضات/);
  assert.equal(updateSummaryCalls.length, 1);
  assert.equal(dialog.success.length, 1);
});

test('handleApplyReconciliationFormulaPreset applies preset values and updates summary', async () => {
  const elements = {
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '-1' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };
  const document = createDocument(elements);
  const storage = createStorage();
  const dialog = createDialogTracker();
  const updateSummaryCalls = [];
  const windowObj = {
    matchMedia: () => ({ matches: false, addListener() {} }),
    updateSummary: () => updateSummaryCalls.push(true)
  };

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: { invoke: async () => ({ changes: 1 }) },
    windowObj,
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  handlers.handleApplyReconciliationFormulaPreset({
    currentTarget: {
      dataset: {
        formulaPreset: 'suppliers_as_expense',
        formulaPresetName: 'الموردين كمصروف'
      }
    }
  });

  assert.equal(elements.formulaSuppliers.value, '-1');
  assert.match(elements.reconciliationFormulaPreview.textContent, /إجمالي المقبوضات/);
  assert.equal(updateSummaryCalls.length, 1);
  assert.equal(dialog.success.length, 1);
});

test('handleApplyAndSaveReconciliationFormulaPreset saves selected preset immediately', async () => {
  const presetButtons = [
    {
      dataset: { formulaPreset: 'default', formulaPresetName: 'الافتراضي' },
      classList: { toggle() {} }
    },
    {
      dataset: { formulaPreset: 'suppliers_as_expense', formulaPresetName: 'الموردين كمصروف' },
      classList: { toggle() {} }
    }
  ];

  const elements = {
    selectedFormulaPreset: createElement({ value: 'suppliers_as_expense' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '-1' }),
    reconciliationFormulaPreview: createElement({ textContent: '' }),
    __formulaPresetButtons: presetButtons
  };
  const document = createDocument(elements);
  const storage = createStorage();
  const dialog = createDialogTracker();
  const dbRunCalls = [];
  const updateSummaryCalls = [];
  const windowObj = {
    matchMedia: () => ({ matches: false, addListener() {} }),
    updateSummary: () => updateSummaryCalls.push(true)
  };

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-run') {
          dbRunCalls.push({ query, params });
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj,
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleApplyAndSaveReconciliationFormulaPreset({
    preventDefault() {}
  });

  const formulaCalls = dbRunCalls.filter((call) => call.params[0] === 'reconciliation_formula');
  assert.equal(formulaCalls.length, 7);
  assert.equal(elements.formulaSuppliers.value, '-1');
  assert.equal(updateSummaryCalls.length, 1);
  assert.equal(dialog.success.length, 1);
});

test('handleCreateFormulaProfile adds new profile to table/list and selects it', async () => {
  const elements = {
    selectedFormulaProfileId: createElement({ value: '' }),
    formulaProfileSelect: createElement({ value: '' }),
    formulaProfilesTableBody: createElement({ innerHTML: '' }),
    formulaProfileName: createElement({ value: 'معادلة فرع جديد' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '-1' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const document = createDocument(elements);
  const dialog = createDialogTracker();
  const storage = createStorage();

  const profiles = [
    {
      id: 1,
      formula_name: 'المعادلة الافتراضية 1',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: 0
      }),
      is_default: 1,
      is_active: 1
    }
  ];

  const handlers = createSystemSettingsHandlers({
    document,
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-query') {
          if (query.includes('FROM reconciliation_formula_profiles')) {
            return profiles
              .filter((profile) => profile.is_active === 1)
              .map((profile) => ({
                id: profile.id,
                formula_name: profile.formula_name,
                settings_json: profile.settings_json,
                is_default: profile.is_default,
                branches_count: profile.branches_count || 0,
                reconciliations_count: profile.reconciliations_count || 0
              }));
          }
        }

        if (channel === 'db-get') {
          if (query.includes('WHERE formula_name = ?')) {
            const match = profiles.find((profile) => profile.formula_name === params[0]);
            return match ? { id: match.id } : null;
          }
          return null;
        }

        if (channel === 'db-run') {
          if (query.includes('INSERT INTO reconciliation_formula_profiles')) {
            const nextId = profiles.length + 1;
            profiles.push({
              id: nextId,
              formula_name: params[0],
              settings_json: params[1],
              is_default: 0,
              is_active: 1
            });
            return { changes: 1, lastInsertRowid: nextId };
          }
          return { changes: 1 };
        }

        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: storage,
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleCreateFormulaProfile({ preventDefault() {} });

  assert.equal(profiles.length, 2);
  assert.equal(profiles[1].formula_name, 'معادلة فرع جديد');
  assert.equal(elements.selectedFormulaProfileId.value, '2');
  assert.equal(elements.formulaProfileSelect.value, '2');
  assert.match(elements.formulaProfileSelect.innerHTML, /معادلة فرع جديد/);
  assert.match(elements.formulaProfilesTableBody.innerHTML, /معادلة فرع جديد/);
  assert.equal(dialog.success.length, 1);
});

test('handleCreateFormulaProfile rejects duplicate name', async () => {
  const dialog = createDialogTracker();
  const elements = {
    selectedFormulaProfileId: createElement({ value: '' }),
    formulaProfileSelect: createElement({ value: '' }),
    formulaProfilesTableBody: createElement({ innerHTML: '' }),
    formulaProfileName: createElement({ value: 'المعادلة الافتراضية 1' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '0' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const profiles = [
    {
      id: 1,
      formula_name: 'المعادلة الافتراضية 1',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: 0
      }),
      is_default: 1,
      is_active: 1
    }
  ];

  const handlers = createSystemSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query) => {
        if (channel === 'db-query' && query.includes('FROM reconciliation_formula_profiles')) {
          return profiles;
        }
        if (channel === 'db-run') {
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleCreateFormulaProfile({ preventDefault() {} });

  assert.equal(dialog.errors.length > 0, true);
  assert.match(dialog.errors[0], /اسم المعادلة موجود/);

});

test('handleCreateFormulaProfile rejects duplicate formula signature', async () => {
  const dialog = createDialogTracker();
  const elements = {
    selectedFormulaProfileId: createElement({ value: '' }),
    formulaProfileSelect: createElement({ value: '' }),
    formulaProfilesTableBody: createElement({ innerHTML: '' }),
    formulaProfileName: createElement({ value: 'معادلة جديدة بنفس الصيغة' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '0' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const profiles = [
    {
      id: 1,
      formula_name: 'المعادلة الافتراضية 1',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: 0
      }),
      is_default: 1,
      is_active: 1
    }
  ];

  const handlers = createSystemSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query) => {
        if (channel === 'db-query' && query.includes('FROM reconciliation_formula_profiles')) {
          return profiles;
        }
        if (channel === 'db-run') {
          return { changes: 1 };
        }
        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleCreateFormulaProfile({ preventDefault() {} });

  assert.equal(dialog.errors.length > 0, true);
  assert.match(dialog.errors[0], /مطابقة/);
});

test('handleOpenEditFormulaProfileModal blocks linked profile edit', async () => {
  const dialog = createDialogTracker();
  const elements = {
    selectedFormulaProfileId: createElement({ value: '2' }),
    formulaProfileSelect: createElement({ value: '2' }),
    formulaProfileName: createElement({ value: 'مرتبطة' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '0' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const linkedProfile = {
    id: 2,
    formula_name: 'مرتبطة',
    settings_json: JSON.stringify({
      bank_receipts_sign: 1,
      cash_receipts_sign: 1,
      postpaid_sales_sign: 1,
      customer_receipts_sign: -1,
      return_invoices_sign: 1,
      suppliers_sign: 0
    }),
    is_default: 0,
    is_active: 1,
    branches_count: 1,
    reconciliations_count: 3
  };

  const handlers = createSystemSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-get' && query.includes('FROM reconciliation_formula_profiles p')) {
          if (Number.parseInt(params[0], 10) === 2) {
            return linkedProfile;
          }
        }
        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleOpenEditFormulaProfileModal({ preventDefault() {} }, 2);

  assert.equal(dialog.errors.length > 0, true);
  assert.match(dialog.errors[0], /لا يمكن تعديل المعادلة/);
});

test('handleSaveReconciliationFormulaSettings requires selected profile in management UI', async () => {
  const dialog = createDialogTracker();
  const dbRunCalls = [];
  const elements = {
    selectedFormulaProfileId: createElement({ value: '' }),
    formulaProfileSelect: createElement({ value: '' }),
    formulaProfilesTableBody: createElement({ innerHTML: '' }),
    formulaProfileName: createElement({ value: 'معادلة بدون تحديد' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '0' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const handlers = createSystemSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        if (channel === 'db-run') {
          dbRunCalls.push(true);
          return { changes: 1 };
        }
        return [];
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleSaveReconciliationFormulaSettings({ preventDefault() {} });

  assert.equal(dbRunCalls.length, 0);
  assert.equal(dialog.errors.length > 0, true);
  assert.match(dialog.errors[0], /اختر معادلة من الجدول/);
});

test('handleDeleteFormulaProfile blocks linked profile and deletes unlinked profile', async () => {
  const dialog = createDialogTracker();
  const elements = {
    selectedFormulaProfileId: createElement({ value: '2' }),
    formulaProfileSelect: createElement({ value: '2', innerHTML: '' }),
    formulaProfilesTableBody: createElement({ innerHTML: '' }),
    formulaProfileName: createElement({ value: 'معادلة مرتبطة' }),
    formulaBankReceipts: createElement({ value: '1' }),
    formulaCashReceipts: createElement({ value: '1' }),
    formulaPostpaidSales: createElement({ value: '1' }),
    formulaCustomerReceipts: createElement({ value: '-1' }),
    formulaReturnInvoices: createElement({ value: '1' }),
    formulaSuppliers: createElement({ value: '0' }),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const profiles = [
    {
      id: 1,
      formula_name: 'الافتراضية',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: 0
      }),
      is_default: 1,
      is_active: 1,
      branches_count: 2,
      reconciliations_count: 8
    },
    {
      id: 2,
      formula_name: 'مرتبطة',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: 0
      }),
      is_default: 0,
      is_active: 1,
      branches_count: 1,
      reconciliations_count: 0
    },
    {
      id: 3,
      formula_name: 'غير مرتبطة',
      settings_json: JSON.stringify({
        bank_receipts_sign: 1,
        cash_receipts_sign: 1,
        postpaid_sales_sign: 1,
        customer_receipts_sign: -1,
        return_invoices_sign: 1,
        suppliers_sign: -1
      }),
      is_default: 0,
      is_active: 1,
      branches_count: 0,
      reconciliations_count: 0
    }
  ];

  const handlers = createSystemSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, query, params) => {
        if (channel === 'db-query' && query.includes('FROM reconciliation_formula_profiles')) {
          return profiles
            .filter((profile) => profile.is_active === 1)
            .map((profile) => ({
              id: profile.id,
              formula_name: profile.formula_name,
              settings_json: profile.settings_json,
              is_default: profile.is_default,
              branches_count: profile.branches_count,
              reconciliations_count: profile.reconciliations_count
            }));
        }

        if (channel === 'db-get' && query.includes('FROM reconciliation_formula_profiles p')) {
          const profileId = Number.parseInt(params[0], 10);
          const profile = profiles.find((item) => item.id === profileId && item.is_active === 1);
          if (!profile) {
            return null;
          }
          return {
            id: profile.id,
            formula_name: profile.formula_name,
            settings_json: profile.settings_json,
            is_default: profile.is_default,
            branches_count: profile.branches_count,
            reconciliations_count: profile.reconciliations_count
          };
        }

        if (channel === 'db-run' && query.includes('UPDATE reconciliation_formula_profiles')) {
          const profileId = Number.parseInt(params[0], 10);
          const profile = profiles.find((item) => item.id === profileId);
          if (profile) {
            profile.is_active = 0;
          }
          return { changes: 1 };
        }

        if (channel === 'db-run') {
          return { changes: 1 };
        }

        return null;
      }
    },
    windowObj: { matchMedia: () => ({ matches: false, addListener() {} }) },
    localStorageObj: createStorage(),
    FormDataCtor: function MockFormData() {},
    FileReaderCtor: function MockReader() {},
    getDialogUtils: () => dialog,
    getCurrentDate: () => '2026-02-25',
    getCurrentDateTime: () => '2026-02-25 10:00:00'
  });

  await handlers.handleDeleteFormulaProfile({ preventDefault() {} });
  assert.equal(dialog.errors.length > 0, true);
  assert.match(dialog.errors[0], /لا يمكن حذف المعادلة/);

  elements.selectedFormulaProfileId.value = '3';
  elements.formulaProfileSelect.value = '3';
  elements.formulaProfileName.value = 'غير مرتبطة';

  await handlers.handleDeleteFormulaProfile({ preventDefault() {} });

  const deleted = profiles.find((profile) => profile.id === 3);
  assert.equal(deleted.is_active, 0);
  assert.equal(elements.selectedFormulaProfileId.value, '1');
  assert.equal(elements.formulaProfileSelect.value, '1');
  assert.equal(dialog.success.length, 1);
});

