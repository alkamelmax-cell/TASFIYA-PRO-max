const { createAdvancedReportsDataHandlers } = require('./advanced-reports-data');
const { createAdvancedReportsDisplayHandlers } = require('./advanced-reports-display');
const { createAdvancedReportsExportHandlers } = require('./advanced-reports-export');
const { mapDbErrorMessage } = require('./db-error-messages');

function createAdvancedReportsHandlers(deps) {
  const doc = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getReportTypeLabel = deps.getReportTypeLabel;
  const logger = deps.logger || console;

  const state = {
    currentAdvancedReportData: null,
    currentAdvancedReportType: null,
    currentAdvancedReportPage: 1,
    currentAdvancedReportFilters: []
  };

  const dataHandlers = createAdvancedReportsDataHandlers({
    ipcRenderer: deps.ipcRenderer,
    formatDecimal: deps.formatDecimal,
    formatPeriodLabel: deps.formatPeriodLabel,
    getDaysBetween: deps.getDaysBetween,
    logger
  });

  const displayHandlers = createAdvancedReportsDisplayHandlers({
    document: doc,
    formatCurrency: deps.formatCurrency,
    generateAdvancedReportSummary: deps.generateAdvancedReportSummary,
    itemsPerPage: deps.itemsPerPage,
    state,
    logger
  });

  const exportHandlers = createAdvancedReportsExportHandlers({
    document: doc,
    ipcRenderer: deps.ipcRenderer,
    getDialogUtils,
    prepareAdvancedReportExcelData: deps.prepareAdvancedReportExcelData,
    determineReportType: deps.determineReportType,
    getCompanyName: deps.getCompanyName,
    getCurrentDate: deps.getCurrentDate,
    generateAdvancedReportTableHtml: deps.generateAdvancedReportTableHtml,
    buildAdvancedReportHtml: deps.buildAdvancedReportHtml,
    state,
    logger
  });

  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseInputDate(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return null;
    }

    const parts = normalized.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
      return null;
    }

    const [year, month, day] = parts;
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    return new Date(year, month - 1, day);
  }

  function getDaysDiff(fromDate, toDate) {
    const fromUtc = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const toUtc = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
  }

  function resolvePresetRangeKey(fromDate, toDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (toDate.getTime() !== today.getTime()) {
      return null;
    }

    const diffDays = getDaysDiff(fromDate, toDate);
    switch (diffDays) {
      case 0:
        return 'today';
      case 6:
        return 'week';
      case 29:
        return 'month';
      case 89:
        return 'quarter';
      case 364:
        return 'year';
      default:
        return null;
    }
  }

  function applyDateRangePreset(rangeKey, fromInputId, toInputId) {
    const fromInput = doc.getElementById(fromInputId);
    const toInput = doc.getElementById(toInputId);
    if (!fromInput || !toInput) return;

    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);

    switch (rangeKey) {
      case 'today':
        break;
      case 'month':
        startDate.setDate(startDate.getDate() - 29);
        break;
      case 'quarter':
        startDate.setDate(startDate.getDate() - 89);
        break;
      case 'year':
        startDate.setDate(startDate.getDate() - 364);
        break;
      case 'week':
      default:
        startDate.setDate(startDate.getDate() - 6);
        break;
    }

    fromInput.value = formatDateForInput(startDate);
    toInput.value = formatDateForInput(endDate);
  }

  function setActiveDatePresetButton(groupName, activeRangeKey) {
    doc.querySelectorAll(`.advanced-date-preset-btn[data-group="${groupName}"]`).forEach((button) => {
      const isActive = String(button.dataset.range || '') === String(activeRangeKey || '');
      button.classList.toggle('active', isActive);
      button.classList.toggle('btn-secondary', isActive);
      button.classList.toggle('btn-outline-secondary', !isActive);
    });
  }

  function syncDatePresetButtonGroup(groupName, fromInputId, toInputId) {
    const fromInput = doc.getElementById(fromInputId);
    const toInput = doc.getElementById(toInputId);
    if (!fromInput || !toInput) {
      return;
    }

    const fromDate = parseInputDate(fromInput.value);
    const toDate = parseInputDate(toInput.value);
    if (!fromDate || !toDate || fromDate > toDate) {
      setActiveDatePresetButton(groupName, null);
      return;
    }

    const matchedRange = resolvePresetRangeKey(fromDate, toDate);
    setActiveDatePresetButton(groupName, matchedRange);
  }

  function hideAdvancedReportResults() {
    const resultsSection = doc.getElementById('advancedReportsResults');
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }

    const summaryContainer = doc.getElementById('advancedReportSummary');
    const tableHead = doc.getElementById('advancedReportTableHead');
    const tableBody = doc.getElementById('advancedReportTableBody');
    const paginationInfo = doc.getElementById('advancedReportPaginationInfo');
    const paginationList = doc.getElementById('advancedReportPagination');
    const paginationNav = doc.getElementById('advancedReportPaginationNav');
    const filtersWrap = doc.getElementById('advancedReportActiveFiltersWrap');
    const filtersContainer = doc.getElementById('advancedReportActiveFilters');
    const metaBar = doc.getElementById('advancedReportMetaBar');
    const metaCount = doc.getElementById('advancedReportMetaCount');
    const metaPage = doc.getElementById('advancedReportMetaPage');
    const metaRange = doc.getElementById('advancedReportMetaRange');

    if (summaryContainer) summaryContainer.innerHTML = '';
    if (tableHead) tableHead.innerHTML = '';
    if (tableBody) tableBody.innerHTML = '';
    if (paginationInfo) paginationInfo.textContent = '';
    if (paginationList) paginationList.innerHTML = '';
    if (paginationNav) paginationNav.style.display = 'none';
    if (filtersContainer) filtersContainer.innerHTML = '';
    if (filtersWrap) filtersWrap.style.display = 'none';
    if (metaCount) metaCount.textContent = '0';
    if (metaPage) metaPage.textContent = '1/1';
    if (metaRange) metaRange.textContent = '0-0';
    if (metaBar) metaBar.style.display = 'none';

    state.currentAdvancedReportData = null;
    state.currentAdvancedReportType = null;
    state.currentAdvancedReportPage = 1;
    state.currentAdvancedReportFilters = [];
  }

  function handleAdvancedDatePreset(event) {
    const button = event?.currentTarget || event?.target?.closest?.('.advanced-date-preset-btn');
    if (!button) return;

    const rangeKey = String(button.dataset.range || 'week');
    const targetFrom = String(button.dataset.targetFrom || '');
    const targetTo = String(button.dataset.targetTo || '');
    const groupName = String(button.dataset.group || '');
    if (!targetFrom || !targetTo) return;

    applyDateRangePreset(rangeKey, targetFrom, targetTo);
    if (groupName) {
      setActiveDatePresetButton(groupName, rangeKey);
    }
  }

  function handleAdvancedDateInputChange(event) {
    const inputId = String(event?.target?.id || '');
    switch (inputId) {
      case 'timeReportFrom':
      case 'timeReportTo':
        syncDatePresetButtonGroup('time-report-range', 'timeReportFrom', 'timeReportTo');
        break;
      case 'atmReportFrom':
      case 'atmReportTo':
        syncDatePresetButtonGroup('atm-report-range', 'atmReportFrom', 'atmReportTo');
        break;
      default:
        break;
    }
  }

  function handleClearTimeReportFilters() {
    const reportTypeSelect = doc.getElementById('timeReportType');
    if (reportTypeSelect) {
      reportTypeSelect.value = 'daily';
    }

    applyDateRangePreset('week', 'timeReportFrom', 'timeReportTo');
    setActiveDatePresetButton('time-report-range', 'week');
    hideAdvancedReportResults();
    getDialogUtils().showSuccessToast('تم مسح مرشحات التقرير الزمني');
  }

  function handleClearAtmReportFilters() {
    const atmFilterSelect = doc.getElementById('atmReportFilter');
    if (atmFilterSelect) {
      atmFilterSelect.value = '';
    }

    applyDateRangePreset('week', 'atmReportFrom', 'atmReportTo');
    setActiveDatePresetButton('atm-report-range', 'week');
    hideAdvancedReportResults();
    getDialogUtils().showSuccessToast('تم مسح مرشحات تقرير أجهزة الصراف');
  }

  async function handleGenerateTimeReport() {
    logger.log('📈 [TIME-REPORT] إنشاء تقرير المقبوضات عبر الزمن...');

    try {
      const reportType = doc.getElementById('timeReportType').value;
      const dateFrom = doc.getElementById('timeReportFrom').value;
      const dateTo = doc.getElementById('timeReportTo').value;
      const dialogUtils = getDialogUtils();

      if (!dateFrom || !dateTo) {
        dialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
        return;
      }

      if (new Date(dateFrom) > new Date(dateTo)) {
        dialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
      }

      dialogUtils.showLoading('جاري إنشاء تقرير المقبوضات عبر الزمن...', 'يرجى الانتظار');
      const timeReportData = await dataHandlers.generateTimeBasedReportData(reportType, dateFrom, dateTo);
      dialogUtils.close();

      if (timeReportData.length === 0) {
        hideAdvancedReportResults();
        dialogUtils.showInfo('لا توجد بيانات في النطاق الزمني المحدد', 'لا توجد نتائج');
        return;
      }

      state.currentAdvancedReportData = timeReportData;
      state.currentAdvancedReportFilters = [
        { label: 'نوع التقرير', value: getReportTypeLabel(reportType) },
        { label: 'من', value: dateFrom },
        { label: 'إلى', value: dateTo }
      ];
      await displayHandlers.displayAdvancedReportResults(
        timeReportData,
        'time',
        `تقرير المقبوضات ${getReportTypeLabel(reportType)}`
      );
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error generating time report:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء إنشاء التقرير.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء إنشاء التقرير: ${friendly}`, 'خطأ في التقرير');
    }
  }

  async function handleGenerateAtmReport() {
    logger.log('🏧 [ATM-REPORT] إنشاء تقرير أجهزة الصراف...');

    try {
      const atmFilter = doc.getElementById('atmReportFilter').value;
      const dateFrom = doc.getElementById('atmReportFrom').value;
      const dateTo = doc.getElementById('atmReportTo').value;
      const dialogUtils = getDialogUtils();

      if (!dateFrom || !dateTo) {
        dialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
        return;
      }

      if (new Date(dateFrom) > new Date(dateTo)) {
        dialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
      }

      dialogUtils.showLoading('جاري إنشاء تقرير أجهزة الصراف...', 'يرجى الانتظار');
      const atmReportData = await dataHandlers.generateAtmReportData(atmFilter, dateFrom, dateTo);
      dialogUtils.close();

      if (atmReportData.length === 0) {
        hideAdvancedReportResults();
        dialogUtils.showInfo('لا توجد بيانات في النطاق الزمني المحدد', 'لا توجد نتائج');
        return;
      }

      state.currentAdvancedReportData = atmReportData;
      const atmName = atmFilter ? await dataHandlers.getAtmName(atmFilter) : 'جميع الأجهزة';
      state.currentAdvancedReportFilters = [
        { label: 'الجهاز', value: atmName },
        { label: 'من', value: dateFrom },
        { label: 'إلى', value: dateTo }
      ];
      await displayHandlers.displayAdvancedReportResults(atmReportData, 'atm', `تقرير أجهزة الصراف - ${atmName}`);
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error generating ATM report:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء إنشاء التقرير.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء إنشاء التقرير: ${friendly}`, 'خطأ في التقرير');
    }
  }

  windowObj.changeAdvancedReportPage = displayHandlers.changeAdvancedReportPage;

  return {
    handleGenerateTimeReport,
    handleGenerateAtmReport,
    handleAdvancedDatePreset,
    handleAdvancedDateInputChange,
    handleClearTimeReportFilters,
    handleClearAtmReportFilters,
    handleExportAdvancedReportPdf: exportHandlers.handleExportAdvancedReportPdf,
    handleExportAdvancedReportExcel: exportHandlers.handleExportAdvancedReportExcel,
    handlePrintAdvancedReport: exportHandlers.handlePrintAdvancedReport,
    generateTimeBasedReportData: dataHandlers.generateTimeBasedReportData,
    generateAtmReportData: dataHandlers.generateAtmReportData,
    displayAdvancedReportResults: displayHandlers.displayAdvancedReportResults,
    changeAdvancedReportPage: displayHandlers.changeAdvancedReportPage,
    generateAdvancedReportHtml: exportHandlers.generateAdvancedReportHtml
  };
}

module.exports = {
  createAdvancedReportsHandlers
};
