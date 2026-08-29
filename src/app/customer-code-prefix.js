const DEFAULT_CUSTOMER_CODE_WIDTH = 6;
const BRANCH_CUSTOMER_CODE_PREFIX_REGEX = /^C([1-9]\d*)$/;
const CUSTOMER_CODE_PREFIX_REGEX = /^C(\d+)$/;

function normalizeCustomerCodePrefix(value, options = {}) {
  const allowZero = options.allowZero === true;
  let normalizedValue = String(value == null ? '' : value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!normalizedValue) {
    return '';
  }

  if (/^\d+$/.test(normalizedValue)) {
    normalizedValue = `C${normalizedValue}`;
  }

  const match = normalizedValue.match(allowZero
    ? CUSTOMER_CODE_PREFIX_REGEX
    : BRANCH_CUSTOMER_CODE_PREFIX_REGEX);
  if (!match) {
    return '';
  }

  const numericSegment = Number(match[1]);
  if (!Number.isFinite(numericSegment) || numericSegment < 0 || (!allowZero && numericSegment === 0)) {
    return '';
  }

  return `C${Math.floor(numericSegment)}`;
}

function isValidCustomerCodePrefix(value, options = {}) {
  return normalizeCustomerCodePrefix(value, options).length > 0;
}

function extractCustomerCodePrefix(customerCode, options = {}) {
  const normalizedCode = String(customerCode == null ? '' : customerCode).trim().toUpperCase();
  const match = normalizedCode.match(/^C(\d+)-/);
  return match ? normalizeCustomerCodePrefix(`C${match[1]}`, { allowZero: options.allowZero === true }) : '';
}

function buildCustomerCodeFromPrefix(prefix, sequence = 1, width = DEFAULT_CUSTOMER_CODE_WIDTH) {
  const normalizedPrefix = normalizeCustomerCodePrefix(prefix, { allowZero: true }) || 'C0';
  const numericSequence = Number(sequence);
  const safeSequence = Number.isFinite(numericSequence) && numericSequence > 0
    ? Math.floor(numericSequence)
    : 1;
  return `${normalizedPrefix}-${String(safeSequence).padStart(width, '0')}`;
}

function getNextCustomerCodePrefix(prefixes = []) {
  const usedPrefixes = new Set(
    (Array.isArray(prefixes) ? prefixes : [])
      .map((prefix) => normalizeCustomerCodePrefix(prefix))
      .filter(Boolean)
  );

  let nextSegment = 1;
  while (usedPrefixes.has(`C${nextSegment}`)) {
    nextSegment += 1;
  }

  return `C${nextSegment}`;
}

module.exports = {
  DEFAULT_CUSTOMER_CODE_WIDTH,
  normalizeCustomerCodePrefix,
  isValidCustomerCodePrefix,
  extractCustomerCodePrefix,
  buildCustomerCodeFromPrefix,
  getNextCustomerCodePrefix
};
