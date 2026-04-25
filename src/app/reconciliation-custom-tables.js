const CUSTOM_TABLES_DATASET_KEY = 'reconciliationCustomTables';

const CUSTOM_TABLE_TEMPLATES = Object.freeze({
  amount_only: Object.freeze({
    key: 'amount_only',
    label: 'بيان + مبلغ',
    description: 'جدول يحتوي على بيان ومبلغ فقط',
    fields: Object.freeze([
      Object.freeze({ key: 'label', label: 'البيان', type: 'text', required: true, tableLabel: 'البيان' }),
      Object.freeze({ key: 'amount', label: 'المبلغ', type: 'number', required: true, tableLabel: 'المبلغ', isAmount: true })
    ])
  }),
  name_amount: Object.freeze({
    key: 'name_amount',
    label: 'اسم + مبلغ',
    description: 'جدول يحتوي على اسم ومبلغ',
    fields: Object.freeze([
      Object.freeze({ key: 'name', label: 'الاسم', type: 'text', required: true, tableLabel: 'الاسم' }),
      Object.freeze({ key: 'amount', label: 'المبلغ', type: 'number', required: true, tableLabel: 'المبلغ', isAmount: true })
    ])
  }),
  invoice_amount_note: Object.freeze({
    key: 'invoice_amount_note',
    label: 'مرجع + مبلغ + ملاحظة',
    description: 'جدول يحتوي على رقم مرجعي ومبلغ وملاحظة',
    fields: Object.freeze([
      Object.freeze({ key: 'reference', label: 'المرجع', type: 'text', required: true, tableLabel: 'المرجع' }),
      Object.freeze({ key: 'amount', label: 'المبلغ', type: 'number', required: true, tableLabel: 'المبلغ', isAmount: true }),
      Object.freeze({ key: 'notes', label: 'ملاحظة', type: 'text', required: false, tableLabel: 'ملاحظة' })
    ])
  })
});

function normalizeSign(value, fallback = 0) {
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

function parseJsonSafe(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function resolveTemplateKey(rawTemplateKey) {
  const normalizedKey = String(rawTemplateKey || '').trim().toLowerCase();
  return CUSTOM_TABLE_TEMPLATES[normalizedKey] ? normalizedKey : 'amount_only';
}

function getCustomTableTemplate(templateKey) {
  return CUSTOM_TABLE_TEMPLATES[resolveTemplateKey(templateKey)];
}

function formatCustomTableTemplateLabel(templateKey) {
  return getCustomTableTemplate(templateKey).label;
}

function sanitizeTableName(tableName) {
  return String(tableName || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateCustomTableKey(tableName = 'custom_table') {
  const sanitizedBase = sanitizeTableName(tableName)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const timestamp = Date.now().toString(36);
  return `${sanitizedBase || 'custom_table'}_${timestamp}_${randomSuffix}`;
}

function normalizeDefinitionConfig(rawConfig, templateKey) {
  const parsedConfig = parseJsonSafe(rawConfig, {});
  const safeConfig = parsedConfig && typeof parsedConfig === 'object' ? { ...parsedConfig } : {};
  safeConfig.template_key = resolveTemplateKey(templateKey);
  return safeConfig;
}

function normalizeCustomTableDefinition(rawDefinition = {}, index = 0) {
  const templateKey = resolveTemplateKey(
    rawDefinition.entry_template
    || rawDefinition.template_key
    || rawDefinition.template
  );
  const tableName = sanitizeTableName(rawDefinition.table_name || rawDefinition.name || `جدول إضافي ${index + 1}`);
  const config = normalizeDefinitionConfig(rawDefinition.config_json || rawDefinition.config, templateKey);

  const numericId = Number.parseInt(rawDefinition.id, 10);
  const parsedDisplayOrder = Number.parseInt(rawDefinition.display_order, 10);
  const parsedActive = Number.parseInt(rawDefinition.is_active, 10);

  return {
    id: Number.isFinite(numericId) && numericId > 0 ? numericId : null,
    table_key: String(rawDefinition.table_key || generateCustomTableKey(tableName)).trim(),
    table_name: tableName,
    entry_template: templateKey,
    default_sign: normalizeSign(rawDefinition.default_sign, 0),
    display_order: Number.isFinite(parsedDisplayOrder) ? parsedDisplayOrder : index + 1,
    is_active: parsedActive === 0 ? 0 : 1,
    config,
    config_json: JSON.stringify(config)
  };
}

function normalizeCustomTableDefinitions(definitions = []) {
  if (!Array.isArray(definitions)) {
    return [];
  }

  return definitions
    .map((definition, index) => normalizeCustomTableDefinition(definition, index))
    .sort((left, right) => {
      const orderDiff = left.display_order - right.display_order;
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return String(left.table_name || '').localeCompare(String(right.table_name || ''), 'ar');
    });
}

function buildCustomFormulaFields(definitions = []) {
  return normalizeCustomTableDefinitions(definitions)
    .filter((definition) => definition.is_active !== 0)
    .map((definition) => ({
      settingKey: `custom_sign__${definition.table_key}`,
      fieldId: `formulaCustom_${definition.table_key}`,
      bucketKey: `custom:${definition.table_key}`,
      label: definition.table_name,
      defaultSign: normalizeSign(definition.default_sign, 0),
      isCustom: true,
      tableKey: definition.table_key
    }));
}

function getCustomTableDefinitionsFromDocument(documentObj) {
  if (!documentObj || typeof documentObj !== 'object') {
    return [];
  }

  if (Array.isArray(documentObj.__reconciliationCustomTableDefinitions)) {
    return normalizeCustomTableDefinitions(documentObj.__reconciliationCustomTableDefinitions);
  }

  const datasetValue = documentObj.body?.dataset
    ? documentObj.body.dataset[CUSTOM_TABLES_DATASET_KEY]
    : null;
  const parsed = parseJsonSafe(datasetValue, []);
  const normalized = normalizeCustomTableDefinitions(parsed);
  documentObj.__reconciliationCustomTableDefinitions = normalized;
  return normalized;
}

function setCustomTableDefinitionsInDocument(documentObj, definitions = []) {
  if (!documentObj || typeof documentObj !== 'object') {
    return [];
  }

  const normalized = normalizeCustomTableDefinitions(definitions);
  documentObj.__reconciliationCustomTableDefinitions = normalized;

  if (documentObj.body?.dataset) {
    documentObj.body.dataset[CUSTOM_TABLES_DATASET_KEY] = JSON.stringify(normalized);
  }

  return normalized;
}

module.exports = {
  CUSTOM_TABLES_DATASET_KEY,
  CUSTOM_TABLE_TEMPLATES,
  generateCustomTableKey,
  getCustomTableTemplate,
  formatCustomTableTemplateLabel,
  normalizeCustomTableDefinition,
  normalizeCustomTableDefinitions,
  buildCustomFormulaFields,
  getCustomTableDefinitionsFromDocument,
  setCustomTableDefinitionsInDocument
};
