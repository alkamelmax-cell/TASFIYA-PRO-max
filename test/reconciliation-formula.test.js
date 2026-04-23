const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeFormulaSign,
  normalizeFormulaSettings,
  parseStoredFormulaSettings,
  getFormulaPresetSettings,
  getEffectiveFormulaSettingsFromDocument,
  setActiveFormulaSettingsInDocument,
  clearActiveFormulaSettingsInDocument,
  applyFormulaPresetToDocument,
  calculateReconciliationSummaryByFormula,
  buildFormulaPreviewText
} = require('../src/app/reconciliation-formula');

test('normalizeFormulaSign handles add, subtract and ignore values', () => {
  assert.equal(normalizeFormulaSign('+'), 1);
  assert.equal(normalizeFormulaSign('-1'), -1);
  assert.equal(normalizeFormulaSign('0'), 0);
  assert.equal(normalizeFormulaSign('unknown', -1), -1);
});

test('normalizeFormulaSettings applies defaults for missing fields', () => {
  const settings = normalizeFormulaSettings({
    bank_receipts_sign: '-1',
    cash_receipts_sign: '1'
  });

  assert.equal(settings.bank_receipts_sign, -1);
  assert.equal(settings.cash_receipts_sign, 1);
  assert.equal(settings.postpaid_sales_sign, 1);
  assert.equal(settings.customer_receipts_sign, -1);
  assert.equal(settings.return_invoices_sign, 1);
  assert.equal(settings.suppliers_sign, 0);
});

test('calculateReconciliationSummaryByFormula applies signs correctly', () => {
  const result = calculateReconciliationSummaryByFormula(
    {
      bankTotal: 100,
      cashTotal: 50,
      postpaidTotal: 200,
      customerTotal: 40,
      returnTotal: 10,
      supplierTotal: 30
    },
    250,
    {
      bank_receipts_sign: 1,
      cash_receipts_sign: 1,
      postpaid_sales_sign: 1,
      customer_receipts_sign: -1,
      return_invoices_sign: 1,
      suppliers_sign: 0
    }
  );

  assert.equal(result.totalReceipts, 320);
  assert.equal(result.surplusDeficit, 70);
});

test('buildFormulaPreviewText includes ignored terms', () => {
  const preview = buildFormulaPreviewText({
    bank_receipts_sign: 1,
    cash_receipts_sign: 1,
    postpaid_sales_sign: 1,
    customer_receipts_sign: -1,
    return_invoices_sign: 1,
    suppliers_sign: 0
  });

  assert.match(preview, /إجمالي المقبوضات/);
  assert.match(preview, /غير مشمول: الموردين/);
});

test('getFormulaPresetSettings returns suppliers as expense preset', () => {
  const preset = getFormulaPresetSettings('suppliers_as_expense');
  assert.equal(preset.suppliers_sign, -1);
  assert.equal(preset.customer_receipts_sign, -1);
});

test('applyFormulaPresetToDocument updates all formula select values', () => {
  const elements = {
    formulaBankReceipts: { value: '1' },
    formulaCashReceipts: { value: '1' },
    formulaPostpaidSales: { value: '1' },
    formulaCustomerReceipts: { value: '-1' },
    formulaReturnInvoices: { value: '1' },
    formulaSuppliers: { value: '0' }
  };
  const document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };

  const applied = applyFormulaPresetToDocument(document, 'collections_focus');
  assert.equal(applied.postpaid_sales_sign, 0);
  assert.equal(applied.customer_receipts_sign, 1);
  assert.equal(elements.formulaCustomerReceipts.value, '1');
  assert.equal(elements.formulaPostpaidSales.value, '0');
  assert.equal(elements.formulaSuppliers.value, '0');
});

test('parseStoredFormulaSettings parses json string safely', () => {
  const parsed = parseStoredFormulaSettings('{"bank_receipts_sign":1,"cash_receipts_sign":1}');
  assert.equal(parsed.bank_receipts_sign, 1);
  assert.equal(parsed.cash_receipts_sign, 1);
  assert.equal(parsed.customer_receipts_sign, -1);
  assert.equal(parseStoredFormulaSettings('{bad-json}'), null);
});

test('getEffectiveFormulaSettingsFromDocument prefers active reconciliation formula', () => {
  const elements = {
    formulaBankReceipts: { value: '-1' },
    formulaCashReceipts: { value: '-1' },
    formulaPostpaidSales: { value: '-1' },
    formulaCustomerReceipts: { value: '1' },
    formulaReturnInvoices: { value: '-1' },
    formulaSuppliers: { value: '1' }
  };

  const document = {
    body: { dataset: {} },
    getElementById(id) {
      return elements[id] || null;
    }
  };

  setActiveFormulaSettingsInDocument(document, {
    bank_receipts_sign: 1,
    cash_receipts_sign: 1,
    postpaid_sales_sign: 1,
    customer_receipts_sign: -1,
    return_invoices_sign: 1,
    suppliers_sign: 0
  });

  const effective = getEffectiveFormulaSettingsFromDocument(document);
  assert.equal(effective.bank_receipts_sign, 1);
  assert.equal(effective.cash_receipts_sign, 1);
  assert.equal(effective.suppliers_sign, 0);

  clearActiveFormulaSettingsInDocument(document);
  const fallback = getEffectiveFormulaSettingsFromDocument(document);
  assert.equal(fallback.bank_receipts_sign, -1);
  assert.equal(fallback.customer_receipts_sign, 1);
});
