const STORAGE_KEY = 'selectedFiscalYear';
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function normalizeFiscalYear(value) {
  const parsed = Number.parseInt(String(value == null ? '' : value).trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_YEAR || parsed > MAX_YEAR) return null;
  return parsed;
}

function getDefaultFiscalYear() {
  return new Date().getFullYear();
}

function getSelectedFiscalYear(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }
  return normalizeFiscalYear(storage.getItem(STORAGE_KEY));
}

function setSelectedFiscalYear(year, storage = globalThis.localStorage) {
  const normalized = normalizeFiscalYear(year);
  if (!storage || typeof storage.setItem !== 'function') {
    return normalized;
  }

  if (!normalized) {
    if (typeof storage.removeItem === 'function') {
      storage.removeItem(STORAGE_KEY);
    }
    return null;
  }

  storage.setItem(STORAGE_KEY, String(normalized));
  return normalized;
}

function ensureFiscalYearSelection(storage = globalThis.localStorage) {
  const existing = getSelectedFiscalYear(storage);
  if (existing) return existing;
  const fallback = getDefaultFiscalYear();
  setSelectedFiscalYear(fallback, storage);
  return fallback;
}

function getFiscalYearDateRange(year) {
  const normalized = normalizeFiscalYear(year);
  if (!normalized) return null;
  return {
    from: `${normalized}-01-01`,
    to: `${normalized}-12-31`
  };
}

async function resolveAvailableFiscalYears(ipcRenderer) {
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    return null;
  }

  try {
    const rows = await ipcRenderer.invoke(
      'db-query',
      `SELECT DISTINCT strftime('%Y', reconciliation_date) AS year
       FROM reconciliations
       WHERE reconciliation_date IS NOT NULL
       ORDER BY year DESC`
    );
    const years = (rows || [])
      .map((row) => normalizeFiscalYear(row?.year))
      .filter(Boolean);
    return years.length > 0 ? years : null;
  } catch (_error) {
    return null;
  }
}

function buildFiscalYearOptions(minYear, maxYear) {
  const years = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(year);
  }
  return years;
}

function syncFiscalYearSelectDefault(select, year) {
  if (!select || !select.options) return;
  const normalized = normalizeFiscalYear(year);
  Array.from(select.options).forEach((option) => {
    option.defaultSelected = Boolean(normalized) && option.value === String(normalized);
  });
}

function syncFiscalYearSelectValue(document, selectId, year) {
  const select = document?.getElementById(selectId);
  const normalized = normalizeFiscalYear(year);
  if (!select || !normalized) return;
  select.value = String(normalized);
  syncFiscalYearSelectDefault(select, normalized);
}

async function populateFiscalYearSelect({
  document,
  ipcRenderer,
  storage = globalThis.localStorage,
  selectId = 'fiscalYear',
  extraPastYears = 2,
  extraFutureYears = 1
}) {
  const select = document?.getElementById(selectId);
  if (!select) {
    return null;
  }

  const ensuredYear = ensureFiscalYearSelection(storage);
  const currentYear = getDefaultFiscalYear();
  const availableYears = await resolveAvailableFiscalYears(ipcRenderer);
  let years = [];

  if (availableYears && availableYears.length > 0) {
    const yearSet = new Set(availableYears);
    yearSet.add(currentYear);
    yearSet.add(ensuredYear);
    years = Array.from(yearSet).sort((a, b) => b - a);
  } else {
    let minYear = Math.min(currentYear, ensuredYear) - extraPastYears;
    let maxYear = Math.max(currentYear, ensuredYear) + extraFutureYears;
    years = buildFiscalYearOptions(minYear, maxYear);
  }
  select.innerHTML = '';
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  });

  const selectedYear = getSelectedFiscalYear(storage) || ensuredYear;
  if (selectedYear) {
    select.value = String(selectedYear);
  }
  syncFiscalYearSelectDefault(select, selectedYear);

  return normalizeFiscalYear(select.value);
}

function updateFiscalYearDisplay(document, year) {
  const label = document?.getElementById('currentFiscalYear');
  if (!label) return;

  const normalized = normalizeFiscalYear(year);
  label.textContent = normalized ? String(normalized) : '';
}

function applyFiscalYearToDateInputs(document, fromId, toId, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const resolvedYear = normalizeFiscalYear(options.year ?? getSelectedFiscalYear(storage));
  if (!resolvedYear) return false;

  const fromInput = document?.getElementById(fromId);
  const toInput = document?.getElementById(toId);
  if (!fromInput || !toInput) return false;

  if (!options.force && (fromInput.value || toInput.value)) {
    return false;
  }

  const range = getFiscalYearDateRange(resolvedYear);
  if (!range) return false;

  fromInput.value = range.from;
  toInput.value = range.to;
  return true;
}

function applyFiscalYearToAllDateFilters(document, year, options = {}) {
  const force = options.force !== false;
  const pairs = [
    ['reportDateFrom', 'reportDateTo'],
    ['timeReportFrom', 'timeReportTo'],
    ['atmReportFrom', 'atmReportTo'],
    ['detailedDateFrom', 'detailedDateTo'],
    ['performanceDateFrom', 'performanceDateTo'],
    ['postpaidSalesDateFrom', 'postpaidSalesDateTo'],
    ['searchDateFrom', 'searchDateTo']
  ];

  let applied = 0;
  pairs.forEach(([fromId, toId]) => {
    if (applyFiscalYearToDateInputs(document, fromId, toId, { year, force })) {
      applied += 1;
    }
  });
  return applied;
}

module.exports = {
  normalizeFiscalYear,
  getDefaultFiscalYear,
  getSelectedFiscalYear,
  setSelectedFiscalYear,
  ensureFiscalYearSelection,
  getFiscalYearDateRange,
  populateFiscalYearSelect,
  updateFiscalYearDisplay,
  applyFiscalYearToDateInputs,
  applyFiscalYearToAllDateFilters,
  syncFiscalYearSelectDefault,
  syncFiscalYearSelectValue
};
