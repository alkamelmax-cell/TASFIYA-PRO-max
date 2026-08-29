const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

function createPostpaidSalesReportFilters(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const state = context.state;
  const logger = context.logger || console;
  const DEFAULT_REPORT_MODE = 'current_balance';
  const PERIOD_REPORT_MODE = 'period_activity';

  function getElement(id) {
    return doc.getElementById(id);
  }

  function normalizeReportMode(value) {
    return value === PERIOD_REPORT_MODE ? PERIOD_REPORT_MODE : DEFAULT_REPORT_MODE;
  }

  function getSelectedReportMode() {
    const modeField = getElement('postpaidSalesReportMode');
    return normalizeReportMode(modeField ? modeField.value : DEFAULT_REPORT_MODE);
  }

  function applyPostpaidSalesReportModeUi(reportMode) {
    const normalizedMode = normalizeReportMode(reportMode);
    const showDateRange = normalizedMode === PERIOD_REPORT_MODE;
    const dateRangeRow = getElement('postpaidSalesDateRangeRow');
    const dateFromInput = getElement('postpaidSalesDateFrom');
    const dateToInput = getElement('postpaidSalesDateTo');

    if (dateRangeRow) {
      dateRangeRow.style.display = showDateRange ? '' : 'none';
    }

    if (dateFromInput) {
      dateFromInput.disabled = !showDateRange;
      if (!showDateRange) {
        dateFromInput.value = '';
      }
    }

    if (dateToInput) {
      dateToInput.disabled = !showDateRange;
      if (!showDateRange) {
        dateToInput.value = '';
      }
    }

    return normalizedMode;
  }

  function ensurePeriodDateRangeDefaults() {
    const dateFromInput = getElement('postpaidSalesDateFrom');
    const dateToInput = getElement('postpaidSalesDateTo');
    if (!dateFromInput || !dateToInput) {
      return;
    }

    if (dateFromInput.value && dateToInput.value) {
      return;
    }

    const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());
    if (!fiscalYearRange) {
      return;
    }

    if (!dateFromInput.value) {
      dateFromInput.value = fiscalYearRange.from;
    }
    if (!dateToInput.value) {
      dateToInput.value = fiscalYearRange.to;
    }
  }

  function handlePostpaidSalesReportModeChange() {
    const mode = getSelectedReportMode();
    const appliedMode = applyPostpaidSalesReportModeUi(mode);
    if (appliedMode === PERIOD_REPORT_MODE) {
      ensurePeriodDateRangeDefaults();
    }
    return appliedMode;
  }

  function getPostpaidSalesReportFilters() {
    const reportMode = getSelectedReportMode();
    const isPeriodMode = reportMode === PERIOD_REPORT_MODE;

    return {
      reportMode,
      searchName: (getElement('postpaidSalesSearchName')?.value || '').trim(),
      cashierFilter: getElement('postpaidSalesCashierFilter')?.value || '',
      branchFilter: getElement('postpaidSalesBranchFilter')?.value || '',
      dateFrom: isPeriodMode ? (getElement('postpaidSalesDateFrom')?.value || '') : '',
      dateTo: isPeriodMode ? (getElement('postpaidSalesDateTo')?.value || '') : ''
    };
  }

  function clearPostpaidSalesReportFilters() {
    logger.log('🗑️ [POSTPAID-SALES] مسح مرشحات تقرير المبيعات الآجلة...');

    const searchInput = getElement('postpaidSalesSearchName');
    const cashierSelect = getElement('postpaidSalesCashierFilter');
    const branchSelect = getElement('postpaidSalesBranchFilter');
    const modeSelect = getElement('postpaidSalesReportMode');

    if (searchInput) searchInput.value = '';
    if (cashierSelect) cashierSelect.value = '';
    if (branchSelect) branchSelect.value = '';
    if (modeSelect) {
      modeSelect.value = DEFAULT_REPORT_MODE;
    }
    applyPostpaidSalesReportModeUi(DEFAULT_REPORT_MODE);

    const resultsCard = getElement('postpaidSalesReportResultsCard');
    if (resultsCard) {
      resultsCard.style.display = 'none';
    }
    state.currentData = [];
    state.currentPage = 1;

    logger.log('✅ [POSTPAID-SALES] تم مسح المرشحات بنجاح');
  }

  async function loadPostpaidSalesReportFilters() {
    try {
      logger.log('📋 [POSTPAID-SALES] تحميل مرشحات تقرير المبيعات الآجلة...');

      const cashiers = await ipc.invoke(
        'db-query',
        'SELECT id, name FROM cashiers WHERE active = 1 ORDER BY name'
      );
      const cashierSelect = getElement('postpaidSalesCashierFilter');
      if (cashierSelect) {
        cashierSelect.innerHTML = '<option value="">جميع الكاشير</option>';
        cashiers.forEach((cashier) => {
          const option = doc.createElement('option');
          option.value = cashier.id;
          option.textContent = cashier.name;
          cashierSelect.appendChild(option);
        });
      }

      const branches = await ipc.invoke(
        'db-query',
        'SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name'
      );
      const branchSelect = getElement('postpaidSalesBranchFilter');
      if (branchSelect) {
        branchSelect.innerHTML = '<option value="">جميع الفروع</option>';
        branches.forEach((branch) => {
          const option = doc.createElement('option');
          option.value = branch.id;
          option.textContent = branch.branch_name;
          branchSelect.appendChild(option);
        });
      }

      const modeSelect = getElement('postpaidSalesReportMode');
      if (modeSelect && !modeSelect.value) {
        modeSelect.value = DEFAULT_REPORT_MODE;
      }

      const appliedMode = applyPostpaidSalesReportModeUi(getSelectedReportMode());
      if (appliedMode === PERIOD_REPORT_MODE) {
        ensurePeriodDateRangeDefaults();
      }

      logger.log('✅ [POSTPAID-SALES] تم تحميل المرشحات بنجاح');
    } catch (error) {
      logger.error('❌ [POSTPAID-SALES] خطأ في تحميل المرشحات:', error);
    }
  }

  function applyPostpaidSalesFilters(data, filters) {
    logger.log('🔍 [POSTPAID-SALES] تطبيق المرشحات على البيانات...');
    let filteredData = [...data];
    if (filters.searchName) {
      const searchTerm = filters.searchName.toLowerCase();
      filteredData = filteredData.filter((item) => item.customer_name.toLowerCase().includes(searchTerm));
    }
    logger.log(`🔍 [POSTPAID-SALES] تم تصفية البيانات: ${filteredData.length} من ${data.length} سجل`);
    return filteredData;
  }

  function buildFilterInfo(filters) {
    let filterInfo = '';
    const isPeriodMode = filters.reportMode === PERIOD_REPORT_MODE;

    filterInfo += `الوضع: ${isPeriodMode ? 'حركة فترة' : 'الرصيد الحالي'} | `;

    if (filters.searchName) {
      filterInfo += `البحث: ${filters.searchName} | `;
    }
    if (isPeriodMode && filters.dateFrom && filters.dateTo) {
      filterInfo += `الفترة: ${filters.dateFrom} إلى ${filters.dateTo} | `;
    }
    if (filters.cashierFilter) {
      const cashierSelect = getElement('postpaidSalesCashierFilter');
      const cashierName = cashierSelect && cashierSelect.options[cashierSelect.selectedIndex]
        ? cashierSelect.options[cashierSelect.selectedIndex].text
        : 'كاشير محدد';
      filterInfo += `الكاشير: ${cashierName} | `;
    }
    if (filters.branchFilter) {
      const branchSelect = getElement('postpaidSalesBranchFilter');
      const branchName = branchSelect && branchSelect.options[branchSelect.selectedIndex]
        ? branchSelect.options[branchSelect.selectedIndex].text
        : 'فرع محدد';
      filterInfo += `الفرع: ${branchName} | `;
    }
    return filterInfo.replace(/ \| $/, '');
  }

  function buildExcelFilterInfo(filters) {
    if (!filters.searchName && !filters.dateFrom && !filters.dateTo && !filters.cashierFilter && !filters.branchFilter) {
      return 'جميع البيانات';
    }
    return buildFilterInfo(filters);
  }

  return {
    getPostpaidSalesReportFilters,
    clearPostpaidSalesReportFilters,
    loadPostpaidSalesReportFilters,
    handlePostpaidSalesReportModeChange,
    applyPostpaidSalesFilters,
    buildFilterInfo,
    buildExcelFilterInfo
  };
}

module.exports = {
  createPostpaidSalesReportFilters
};
