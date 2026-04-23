const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsUiLoader } = require('../src/app/settings-ui-loader');

function createElement(initial = {}) {
  return {
    value: '',
    checked: false,
    ...initial
  };
}

function buildContext(overrides = {}) {
  const elements = {
    companyName: createElement(),
    companyPhone: createElement(),
    systemLanguage: createElement(),
    systemTheme: createElement(),
    copiesInput: createElement(),
    detailedAtmFeesDefaultMode: createElement({ value: 'without_fees' }),
    bankFeeRulesTableBody: createElement({ innerHTML: '' }),
    sessionTimeout: createElement(),
    autoLock: createElement(),
    autoBackup: createElement(),
    backupLocation: createElement(),
    formulaBankReceipts: createElement(),
    formulaCashReceipts: createElement(),
    formulaPostpaidSales: createElement(),
    formulaCustomerReceipts: createElement(),
    formulaReturnInvoices: createElement(),
    formulaSuppliers: createElement(),
    reconciliationFormulaPreview: createElement({ textContent: '' })
  };

  const errors = [];
  const updateSummaryCalls = [];
  const windowObj = {
    updateSummary() {
      updateSummaryCalls.push(true);
    }
  };
  const applyThemeCalls = [];

  const deps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      }
    },
    ipcRenderer: {
      async invoke() {
        return [];
      }
    },
    windowObj,
    getDialogUtils: () => ({
      showError(message) {
        errors.push(message);
      }
    }),
    applyTheme(theme) {
      applyThemeCalls.push(theme);
    },
    logger: { log() {}, error() {} },
    ...overrides
  };

  const handlers = createSettingsUiLoader(deps);
  return { handlers, elements, errors, windowObj, applyThemeCalls, updateSummaryCalls };
}

test('loadAllSettings applies categories and updates global company name', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return [
          { category: 'general', setting_key: 'company_name', setting_value: 'ACME' },
          { category: 'general', setting_key: 'system_theme', setting_value: 'dark' },
          { category: 'print', setting_key: 'copies', setting_value: '2' },
          { category: 'database', setting_key: 'auto_backup', setting_value: 'weekly' }
        ];
      }
    }
  });

  await ctx.handlers.loadAllSettings();

  assert.equal(ctx.elements.companyName.value, 'ACME');
  assert.equal(ctx.elements.systemTheme.value, 'dark');
  assert.equal(ctx.elements.copiesInput.value, '2');
  assert.equal(ctx.elements.autoBackup.value, 'weekly');
  assert.equal(ctx.windowObj.currentCompanyName, 'ACME');
  assert.deepEqual(ctx.applyThemeCalls, ['dark']);
});

test('loadAllSettings maps legacy sender theme to sender-soft', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return [
          { category: 'general', setting_key: 'system_theme', setting_value: 'sender' }
        ];
      }
    }
  });

  await ctx.handlers.loadAllSettings();

  assert.equal(ctx.elements.systemTheme.value, 'sender-soft');
  assert.deepEqual(ctx.applyThemeCalls, ['sender-soft']);
});

test('loadAllSettings renders stored bank fee rules in reports settings UI', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return [
          {
            category: 'reports',
            setting_key: 'detailed_atm_fees_mode_default',
            setting_value: 'remember_last'
          },
          {
            category: 'reports',
            setting_key: 'bank_fee_rules_json',
            setting_value: JSON.stringify({
              rules: [
                { bank_name: 'الراجحي', operation_type: 'مدى', fee_percent: 1.25, fee_vat_percent: 15 }
              ]
            })
          }
        ];
      }
    }
  });

  await ctx.handlers.loadAllSettings();

  assert.equal(ctx.elements.detailedAtmFeesDefaultMode.value, 'remember_last');
  assert.match(ctx.elements.bankFeeRulesTableBody.innerHTML, /الراجحي/);
  assert.match(ctx.elements.bankFeeRulesTableBody.innerHTML, /1\.25/);
});

test('loadAllSettings applies reconciliation formula settings and updates preview', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return [
          { category: 'reconciliation_formula', setting_key: 'bank_receipts_sign', setting_value: '-1' },
          { category: 'reconciliation_formula', setting_key: 'cash_receipts_sign', setting_value: '1' },
          { category: 'reconciliation_formula', setting_key: 'postpaid_sales_sign', setting_value: '1' },
          { category: 'reconciliation_formula', setting_key: 'customer_receipts_sign', setting_value: '-1' },
          { category: 'reconciliation_formula', setting_key: 'return_invoices_sign', setting_value: '1' },
          { category: 'reconciliation_formula', setting_key: 'suppliers_sign', setting_value: '0' }
        ];
      }
    }
  });

  await ctx.handlers.loadAllSettings();

  assert.equal(ctx.elements.formulaBankReceipts.value, '-1');
  assert.equal(ctx.elements.formulaCashReceipts.value, '1');
  assert.equal(ctx.elements.formulaSuppliers.value, '0');
  assert.match(ctx.elements.reconciliationFormulaPreview.textContent, /إجمالي المقبوضات/);
  assert.equal(ctx.updateSummaryCalls.length, 1);
});

test('loadAllSettings reports UI error when fetching settings fails', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        throw new Error('db-failed');
      }
    }
  });

  await ctx.handlers.loadAllSettings();
  assert.equal(ctx.errors.length, 1);
});

test('loadAllSettings applies disabled security settings when values are stored as zero-like values', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke() {
        return [
          { category: 'user', setting_key: 'session_timeout', setting_value: 0 },
          { category: 'user', setting_key: 'auto_lock', setting_value: 'disabled' }
        ];
      }
    }
  });

  await ctx.handlers.loadAllSettings();

  assert.equal(ctx.elements.sessionTimeout.value, '0');
  assert.equal(ctx.elements.autoLock.value, 'disabled');
});
