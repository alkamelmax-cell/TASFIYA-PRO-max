const BANK_FEE_OPERATION_OPTIONS = Object.freeze([
  { value: '', label: 'جميع العمليات' },
  { value: 'مدى', label: 'مدى' },
  { value: 'فيزا', label: 'فيزا' },
  { value: 'ماستر كارد', label: 'ماستر كارد' },
  { value: 'أمريكان إكسبريس', label: 'أمريكان إكسبريس' },
  { value: 'تحويل', label: 'تحويل' }
]);

const BANK_FEE_OPERATION_ALIASES = Object.freeze([
  { canonical: 'مدى', aliases: ['مدى', 'mada'] },
  { canonical: 'فيزا', aliases: ['فيزا', 'visa'] },
  { canonical: 'ماستر كارد', aliases: ['ماستر', 'ماستر كارد', 'mastercard', 'master card', 'master'] },
  { canonical: 'أمريكان إكسبريس', aliases: ['أمريكان إكسبريس', 'american express', 'amex'] },
  { canonical: 'تحويل', aliases: ['تحويل', 'transfer'] }
]);

function roundCurrency(value) {
  const numeric = Number(value) || 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function roundPercent(value, precision = 8) {
  const numeric = Number(value) || 0;
  const factor = 10 ** precision;
  return Math.round((numeric + Number.EPSILON) * factor) / factor;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/[\u200e\u200f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeComparableText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeOperationComparableText(value) {
  return normalizeComparableText(value)
    .replace(/[()[\]{}\-_/\\|:+.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactOperationComparableText(value) {
  return normalizeOperationComparableText(value).replace(/\s+/g, '');
}

function doesOperationAliasMatch(value, alias) {
  const comparableValue = normalizeOperationComparableText(value);
  const comparableAlias = normalizeOperationComparableText(alias);

  if (!comparableValue || !comparableAlias) {
    return false;
  }

  const compactValue = compactOperationComparableText(comparableValue);
  const compactAlias = compactOperationComparableText(comparableAlias);

  return comparableValue === comparableAlias
    || compactValue === compactAlias
    || comparableValue.includes(comparableAlias)
    || compactValue.includes(compactAlias);
}

function normalizeOperationType(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return '';
  }

  const matchedOperation = BANK_FEE_OPERATION_ALIASES.find((entry) => (
    entry.aliases.some((alias) => doesOperationAliasMatch(normalizedValue, alias))
  ));

  return matchedOperation ? matchedOperation.canonical : normalizedValue;
}

function normalizePercent(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return roundPercent(numeric);
}

function createEmptyBankFeeRule() {
  return {
    bank_name: '',
    operation_type: '',
    fee_percent: 0,
    fee_vat_percent: 15
  };
}

function normalizeBankFeeRule(rawRule = {}) {
  const defaultRule = createEmptyBankFeeRule();
  return {
    bank_name: normalizeText(rawRule.bank_name || rawRule.bankName || defaultRule.bank_name),
    operation_type: normalizeOperationType(rawRule.operation_type || rawRule.operationType || defaultRule.operation_type),
    fee_percent: normalizePercent(rawRule.fee_percent ?? rawRule.feePercent, defaultRule.fee_percent),
    fee_vat_percent: normalizePercent(rawRule.fee_vat_percent ?? rawRule.feeVatPercent, defaultRule.fee_vat_percent)
  };
}

function normalizeBankFeeSettings(rawSettings = {}) {
  const rawRules = Array.isArray(rawSettings)
    ? rawSettings
    : Array.isArray(rawSettings.rules)
      ? rawSettings.rules
      : [];

  const rules = rawRules
    .map((rule) => normalizeBankFeeRule(rule))
    .filter((rule) => rule.bank_name || rule.operation_type || rule.fee_percent > 0);

  return { rules };
}

function parseStoredBankFeeSettings(rawSettings) {
  if (rawSettings === null || rawSettings === undefined || rawSettings === '') {
    return normalizeBankFeeSettings();
  }

  if (typeof rawSettings === 'string') {
    try {
      return normalizeBankFeeSettings(JSON.parse(rawSettings));
    } catch (error) {
      return normalizeBankFeeSettings();
    }
  }

  if (typeof rawSettings === 'object') {
    return normalizeBankFeeSettings(rawSettings);
  }

  return normalizeBankFeeSettings();
}

function doesComparableTextMatch(ruleValue, actualValue) {
  if (!ruleValue) {
    return true;
  }
  if (!actualValue) {
    return false;
  }
  return actualValue === ruleValue || actualValue.includes(ruleValue) || ruleValue.includes(actualValue);
}

function getBankFeeRuleSpecificity(rule, bankName, operationType) {
  const comparableRuleBank = normalizeComparableText(rule.bank_name);
  const comparableActualBank = normalizeComparableText(bankName);
  if (!doesComparableTextMatch(comparableRuleBank, comparableActualBank)) {
    return -1;
  }

  const comparableRuleOperation = normalizeComparableText(normalizeOperationType(rule.operation_type));
  const comparableActualOperation = normalizeComparableText(normalizeOperationType(operationType));
  if (comparableRuleOperation && comparableRuleOperation !== comparableActualOperation) {
    return -1;
  }

  let score = 0;
  if (comparableRuleBank) score += 2;
  if (comparableRuleOperation) score += 1;
  return score;
}

function findMatchingBankFeeRule(bankName, operationType, settings = {}) {
  const normalizedSettings = normalizeBankFeeSettings(settings);
  let matchedRule = null;
  let highestScore = -1;

  normalizedSettings.rules.forEach((rule) => {
    const score = getBankFeeRuleSpecificity(rule, bankName, operationType);
    if (score > highestScore) {
      highestScore = score;
      matchedRule = rule;
    }
  });

  return matchedRule;
}

function calculateBankFeeBreakdown(amount, bankName, operationType, settings = {}) {
  const grossAmount = roundCurrency(amount);
  const matchedRule = findMatchingBankFeeRule(bankName, operationType, settings);
  const feePercent = matchedRule ? normalizePercent(matchedRule.fee_percent, 0) : 0;
  const feeVatPercent = matchedRule ? normalizePercent(matchedRule.fee_vat_percent, 15) : 0;
  const feeAmount = roundCurrency(grossAmount * (feePercent / 100));
  const feeVatAmount = roundCurrency(feeAmount * (feeVatPercent / 100));
  const totalDeductions = roundCurrency(feeAmount + feeVatAmount);
  const netAmount = roundCurrency(grossAmount - totalDeductions);

  return {
    grossAmount,
    feePercent,
    feeAmount,
    feeVatPercent,
    feeVatAmount,
    totalDeductions,
    netAmount,
    matchedRule
  };
}

module.exports = {
  BANK_FEE_OPERATION_OPTIONS,
  createEmptyBankFeeRule,
  normalizeBankFeeRule,
  normalizeBankFeeSettings,
  parseStoredBankFeeSettings,
  findMatchingBankFeeRule,
  calculateBankFeeBreakdown
};
