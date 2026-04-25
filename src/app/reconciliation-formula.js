const {
  buildCustomFormulaFields,
  getCustomTableDefinitionsFromDocument
} = require('./reconciliation-custom-tables');

const RECONCILIATION_FORMULA_FIELDS = Object.freeze([
  {
    settingKey: 'bank_receipts_sign',
    fieldId: 'formulaBankReceipts',
    bucketKey: 'bankTotal',
    label: 'المقبوضات البنكية',
    defaultSign: 1
  },
  {
    settingKey: 'cash_receipts_sign',
    fieldId: 'formulaCashReceipts',
    bucketKey: 'cashTotal',
    label: 'المقبوضات النقدية',
    defaultSign: 1
  },
  {
    settingKey: 'postpaid_sales_sign',
    fieldId: 'formulaPostpaidSales',
    bucketKey: 'postpaidTotal',
    label: 'المبيعات الآجلة',
    defaultSign: 1
  },
  {
    settingKey: 'customer_receipts_sign',
    fieldId: 'formulaCustomerReceipts',
    bucketKey: 'customerTotal',
    label: 'مقبوضات العملاء',
    defaultSign: -1
  },
  {
    settingKey: 'return_invoices_sign',
    fieldId: 'formulaReturnInvoices',
    bucketKey: 'returnTotal',
    label: 'فواتير المرتجع',
    defaultSign: 1
  },
  {
    settingKey: 'suppliers_sign',
    fieldId: 'formulaSuppliers',
    bucketKey: 'supplierTotal',
    label: 'الموردين',
    defaultSign: 0
  }
]);

const DEFAULT_RECONCILIATION_FORMULA_SETTINGS = Object.freeze(
  Object.freeze({
    ...RECONCILIATION_FORMULA_FIELDS.reduce((acc, field) => {
      acc[field.settingKey] = field.defaultSign;
      return acc;
    }, {}),
    custom_table_signs: Object.freeze({})
  })
);

const RECONCILIATION_FORMULA_PRESETS = Object.freeze({
  default: Object.freeze({
    bank_receipts_sign: 1,
    cash_receipts_sign: 1,
    postpaid_sales_sign: 1,
    customer_receipts_sign: -1,
    return_invoices_sign: 1,
    suppliers_sign: 0
  }),
  suppliers_as_expense: Object.freeze({
    bank_receipts_sign: 1,
    cash_receipts_sign: 1,
    postpaid_sales_sign: 1,
    customer_receipts_sign: -1,
    return_invoices_sign: 1,
    suppliers_sign: -1
  }),
  collections_focus: Object.freeze({
    bank_receipts_sign: 1,
    cash_receipts_sign: 1,
    postpaid_sales_sign: 0,
    customer_receipts_sign: 1,
    return_invoices_sign: 0,
    suppliers_sign: 0
  })
});

const ACTIVE_RECONCILIATION_FORMULA_DATASET_KEY = 'activeReconciliationFormula';

function normalizeFormulaSign(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalizedText = String(value).trim().toLowerCase();
  if (['+', '+1', '1', 'add', 'plus', 'true'].includes(normalizedText)) return 1;
  if (['-', '-1', 'subtract', 'minus', 'true-negative'].includes(normalizedText)) return -1;
  if (['0', 'ignore', 'none', 'off', 'false'].includes(normalizedText)) return 0;

  const numeric = Number(normalizedText);
  if (numeric > 0) return 1;
  if (numeric < 0) return -1;
  if (numeric === 0) return 0;

  return fallback;
}

function getFormulaFields(customDefinitions = []) {
  return [
    ...RECONCILIATION_FORMULA_FIELDS,
    ...buildCustomFormulaFields(customDefinitions)
  ];
}

function getRawCustomFormulaSigns(rawSettings = {}) {
  if (!rawSettings || typeof rawSettings !== 'object') {
    return {};
  }

  if (rawSettings.custom_table_signs && typeof rawSettings.custom_table_signs === 'object') {
    return rawSettings.custom_table_signs;
  }

  if (rawSettings.custom_table_signs_json) {
    try {
      const parsed = JSON.parse(rawSettings.custom_table_signs_json);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_error) {
      return {};
    }
  }

  return {};
}

function getFormulaSignForField(formulaSettings, field) {
  if (!field || !formulaSettings || typeof formulaSettings !== 'object') {
    return 0;
  }

  if (field.isCustom) {
    return normalizeFormulaSign(
      formulaSettings.custom_table_signs?.[field.tableKey],
      field.defaultSign
    );
  }

  return normalizeFormulaSign(formulaSettings[field.settingKey], field.defaultSign);
}

function normalizeFormulaSettings(rawSettings = {}, customDefinitions = []) {
  const normalized = RECONCILIATION_FORMULA_FIELDS.reduce((acc, field) => {
    const rawValue = rawSettings[field.settingKey];
    acc[field.settingKey] = normalizeFormulaSign(rawValue, field.defaultSign);
    return acc;
  }, {});

  const rawCustomSigns = getRawCustomFormulaSigns(rawSettings);
  normalized.custom_table_signs = {};

  buildCustomFormulaFields(customDefinitions).forEach((field) => {
    const rawValue = rawCustomSigns[field.tableKey] ?? rawSettings[field.settingKey];
    normalized.custom_table_signs[field.tableKey] = normalizeFormulaSign(rawValue, field.defaultSign);
  });

  return normalized;
}

function parseStoredFormulaSettings(rawSettings, customDefinitions = []) {
  if (rawSettings === null || rawSettings === undefined || rawSettings === '') {
    return null;
  }

  if (typeof rawSettings === 'string') {
    try {
      const parsed = JSON.parse(rawSettings);
      return normalizeFormulaSettings(parsed, customDefinitions);
    } catch (error) {
      return null;
    }
  }

  if (typeof rawSettings === 'object') {
    return normalizeFormulaSettings(rawSettings, customDefinitions);
  }

  return null;
}

function getFormulaPresetSettings(presetKey = 'default', customDefinitions = []) {
  const key = typeof presetKey === 'string' ? presetKey.trim() : 'default';
  const preset = RECONCILIATION_FORMULA_PRESETS[key] || RECONCILIATION_FORMULA_PRESETS.default;
  return normalizeFormulaSettings(preset, customDefinitions);
}

function resolveDocumentCustomDefinitions(documentObj) {
  return getCustomTableDefinitionsFromDocument(documentObj);
}

function getFormulaSettingsFromDocument(documentObj, customDefinitions = resolveDocumentCustomDefinitions(documentObj)) {
  if (!documentObj || typeof documentObj.getElementById !== 'function') {
    return normalizeFormulaSettings(DEFAULT_RECONCILIATION_FORMULA_SETTINGS, customDefinitions);
  }

  const rawSettings = { custom_table_signs: {} };
  getFormulaFields(customDefinitions).forEach((field) => {
    const element = documentObj.getElementById(field.fieldId);
    if (field.isCustom) {
      rawSettings.custom_table_signs[field.tableKey] = element ? element.value : field.defaultSign;
      return;
    }

    rawSettings[field.settingKey] = element ? element.value : field.defaultSign;
  });

  return normalizeFormulaSettings(rawSettings, customDefinitions);
}

function getActiveFormulaSettingsFromDocument(documentObj) {
  if (!documentObj || typeof documentObj !== 'object') {
    return null;
  }

  const customDefinitions = resolveDocumentCustomDefinitions(documentObj);
  const inMemory = parseStoredFormulaSettings(documentObj.__activeReconciliationFormulaSettings, customDefinitions);
  if (inMemory) {
    return inMemory;
  }

  const datasetValue = documentObj.body
    && documentObj.body.dataset
    ? documentObj.body.dataset[ACTIVE_RECONCILIATION_FORMULA_DATASET_KEY]
    : null;
  const parsedFromDataset = parseStoredFormulaSettings(datasetValue, customDefinitions);
  if (parsedFromDataset) {
    documentObj.__activeReconciliationFormulaSettings = parsedFromDataset;
    return parsedFromDataset;
  }

  return null;
}

function setActiveFormulaSettingsInDocument(documentObj, formulaSettings) {
  if (!documentObj || typeof documentObj !== 'object') {
    return null;
  }

  const parsed = parseStoredFormulaSettings(formulaSettings, resolveDocumentCustomDefinitions(documentObj));
  if (!parsed) {
    clearActiveFormulaSettingsInDocument(documentObj);
    return null;
  }

  documentObj.__activeReconciliationFormulaSettings = parsed;

  if (documentObj.body && documentObj.body.dataset) {
    documentObj.body.dataset[ACTIVE_RECONCILIATION_FORMULA_DATASET_KEY] = JSON.stringify(parsed);
  }

  return parsed;
}

function clearActiveFormulaSettingsInDocument(documentObj) {
  if (!documentObj || typeof documentObj !== 'object') {
    return;
  }

  documentObj.__activeReconciliationFormulaSettings = null;

  if (documentObj.body && documentObj.body.dataset) {
    delete documentObj.body.dataset[ACTIVE_RECONCILIATION_FORMULA_DATASET_KEY];
  }

  if (documentObj.body && typeof documentObj.body.removeAttribute === 'function') {
    documentObj.body.removeAttribute('data-active-reconciliation-formula');
  }
}

function getEffectiveFormulaSettingsFromDocument(documentObj) {
  const activeFormula = getActiveFormulaSettingsFromDocument(documentObj);
  if (activeFormula) {
    return activeFormula;
  }
  return getFormulaSettingsFromDocument(documentObj);
}

function applyFormulaPresetToDocument(
  documentObj,
  presetKey = 'default',
  customDefinitions = resolveDocumentCustomDefinitions(documentObj)
) {
  const presetSettings = getFormulaPresetSettings(presetKey, customDefinitions);

  if (!documentObj || typeof documentObj.getElementById !== 'function') {
    return presetSettings;
  }

  getFormulaFields(customDefinitions).forEach((field) => {
    const element = documentObj.getElementById(field.fieldId);
    if (element) {
      element.value = String(getFormulaSignForField(presetSettings, field));
    }
  });

  return presetSettings;
}

function calculateTotalReceiptsByFormula(
  buckets = {},
  formulaSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  customDefinitions = []
) {
  const fields = getFormulaFields(customDefinitions);
  const normalizedFormula = normalizeFormulaSettings(formulaSettings, customDefinitions);
  const normalizedBuckets = {
    bankTotal: Number(buckets.bankTotal) || 0,
    cashTotal: Number(buckets.cashTotal) || 0,
    postpaidTotal: Number(buckets.postpaidTotal) || 0,
    customerTotal: Number(buckets.customerTotal) || 0,
    returnTotal: Number(buckets.returnTotal) || 0,
    supplierTotal: Number(buckets.supplierTotal) || 0
  };

  buildCustomFormulaFields(customDefinitions).forEach((field) => {
    normalizedBuckets[field.bucketKey] = Number(
      buckets[field.bucketKey]
      ?? buckets.custom_table_totals?.[field.tableKey]
      ?? buckets.customTableTotals?.[field.tableKey]
    ) || 0;
  });

  let totalReceipts = 0;
  const contributions = {};

  fields.forEach((field) => {
    const amount = normalizedBuckets[field.bucketKey] || 0;
    const sign = getFormulaSignForField(normalizedFormula, field);
    const contribution = amount * sign;

    contributions[field.bucketKey] = {
      amount,
      sign,
      contribution
    };

    totalReceipts += contribution;
  });

  return {
    totalReceipts,
    contributions,
    formulaSettings: normalizedFormula,
    buckets: normalizedBuckets
  };
}

function calculateReconciliationSummaryByFormula(
  buckets = {},
  systemSalesValue = 0,
  formulaSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  customDefinitions = []
) {
  const formulaResult = calculateTotalReceiptsByFormula(buckets, formulaSettings, customDefinitions);
  const systemSales = Number(systemSalesValue) || 0;
  const surplusDeficit = formulaResult.totalReceipts - systemSales;

  return {
    ...formulaResult,
    systemSales,
    surplusDeficit
  };
}

function buildFormulaPreviewText(
  formulaSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  customDefinitions = []
) {
  const normalized = normalizeFormulaSettings(formulaSettings, customDefinitions);
  const terms = [];
  const ignored = [];

  getFormulaFields(customDefinitions).forEach((field) => {
    const sign = getFormulaSignForField(normalized, field);
    if (sign === 0) {
      ignored.push(field.label);
      return;
    }

    terms.push(`${sign > 0 ? '+' : '-'} ${field.label}`);
  });

  const expression = terms.length > 0
    ? terms.map((term, index) => (index === 0 ? term.replace(/^\+\s*/, '') : term)).join(' ')
    : '0';

  const ignoredText = ignored.length > 0 ? ` (غير مشمول: ${ignored.join('، ')})` : '';
  return `إجمالي المقبوضات = ${expression}${ignoredText}`;
}

function getFormulaSignMeta(sign) {
  if (sign > 0) {
    return { symbol: '+', className: 'is-add' };
  }
  if (sign < 0) {
    return { symbol: '-', className: 'is-subtract' };
  }
  return { symbol: '0', className: 'is-ignore' };
}

function updateFormulaTokenIndicatorsInDocument(
  documentObj,
  formulaSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  customDefinitions = resolveDocumentCustomDefinitions(documentObj)
) {
  if (!documentObj || typeof documentObj.querySelector !== 'function') {
    return;
  }

  const normalized = normalizeFormulaSettings(formulaSettings, customDefinitions);

  getFormulaFields(customDefinitions).forEach((field) => {
    const indicator = documentObj.querySelector(`[data-formula-token-for="${field.fieldId}"]`);
    if (!indicator) {
      return;
    }

    const meta = getFormulaSignMeta(getFormulaSignForField(normalized, field));
    indicator.textContent = meta.symbol;

    if (indicator.classList && typeof indicator.classList.remove === 'function') {
      indicator.classList.remove('is-add', 'is-subtract', 'is-ignore');
      indicator.classList.add(meta.className);
    }
  });
}

function updateFormulaPreviewInDocument(
  documentObj,
  formulaSettings = DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  customDefinitions = resolveDocumentCustomDefinitions(documentObj)
) {
  if (!documentObj) {
    return;
  }

  const normalized = normalizeFormulaSettings(formulaSettings, customDefinitions);
  updateFormulaTokenIndicatorsInDocument(documentObj, normalized, customDefinitions);

  if (typeof documentObj.getElementById !== 'function') {
    return;
  }

  const previewEl = documentObj.getElementById('reconciliationFormulaPreview');
  if (!previewEl) {
    return;
  }

  previewEl.textContent = buildFormulaPreviewText(normalized, customDefinitions);
}

module.exports = {
  RECONCILIATION_FORMULA_FIELDS,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  RECONCILIATION_FORMULA_PRESETS,
  ACTIVE_RECONCILIATION_FORMULA_DATASET_KEY,
  getFormulaFields,
  normalizeFormulaSign,
  normalizeFormulaSettings,
  parseStoredFormulaSettings,
  getFormulaPresetSettings,
  getFormulaSettingsFromDocument,
  getActiveFormulaSettingsFromDocument,
  getEffectiveFormulaSettingsFromDocument,
  setActiveFormulaSettingsInDocument,
  clearActiveFormulaSettingsInDocument,
  applyFormulaPresetToDocument,
  calculateTotalReceiptsByFormula,
  calculateReconciliationSummaryByFormula,
  buildFormulaPreviewText,
  getFormulaSignForField,
  updateFormulaTokenIndicatorsInDocument,
  updateFormulaPreviewInDocument
};
