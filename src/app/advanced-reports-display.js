function createAdvancedReportsDisplayHandlers(context) {
  const doc = context.document;
  const formatCurrency = context.formatCurrency;
  const generateAdvancedReportSummary = context.generateAdvancedReportSummary;
  const ADVANCED_REPORT_ITEMS_PER_PAGE = context.itemsPerPage || 15;
  const state = context.state;
  const logger = context.logger || console;

  async function displayAdvancedReportResults(data, reportType, title) {
    logger.log('📊 [DISPLAY] عرض نتائج التقرير المتقدم:', reportType);

    state.currentAdvancedReportData = data;
    state.currentAdvancedReportType = reportType;
    state.currentAdvancedReportPage = 1;

    doc.getElementById('advancedReportsResults').style.display = 'block';
    doc.getElementById('advancedReportTitle').textContent = title;
    displayAdvancedReportActiveFilters(state.currentAdvancedReportFilters);

    const summary = generateAdvancedReportSummary(data, reportType);
    displayAdvancedReportSummary(summary, reportType);
    displayAdvancedReportTable(data, reportType);

    doc.getElementById('advancedReportsResults').scrollIntoView({ behavior: 'smooth' });
  }

  function getAdvancedReportType() {
    return state.currentAdvancedReportType;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayAdvancedReportActiveFilters(filters) {
    const filtersWrap = doc.getElementById('advancedReportActiveFiltersWrap');
    const filtersContainer = doc.getElementById('advancedReportActiveFilters');
    if (!filtersWrap || !filtersContainer) {
      return;
    }

    const normalizedFilters = Array.isArray(filters)
      ? filters.filter((item) => item && item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
      : [];

    if (normalizedFilters.length === 0) {
      filtersWrap.style.display = 'none';
      filtersContainer.innerHTML = '';
      return;
    }

    filtersWrap.style.display = 'block';
    filtersContainer.innerHTML = normalizedFilters.map((item) => `
      <span class="advanced-filter-chip">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>
    `).join('');
  }

  function updateAdvancedReportMeta(totalItems, totalPages, currentPage) {
    const metaBar = doc.getElementById('advancedReportMetaBar');
    const countEl = doc.getElementById('advancedReportMetaCount');
    const pageEl = doc.getElementById('advancedReportMetaPage');
    const rangeEl = doc.getElementById('advancedReportMetaRange');
    if (!metaBar || !countEl || !pageEl || !rangeEl) {
      return;
    }

    const normalizedTotalItems = Number(totalItems || 0);
    if (normalizedTotalItems <= 0) {
      metaBar.style.display = 'none';
      countEl.textContent = '0';
      pageEl.textContent = '1/1';
      rangeEl.textContent = '0-0';
      return;
    }

    const normalizedTotalPages = Math.max(1, Number(totalPages || 1));
    const normalizedCurrentPage = Math.min(Math.max(1, Number(currentPage || 1)), normalizedTotalPages);
    const startItem = ((normalizedCurrentPage - 1) * ADVANCED_REPORT_ITEMS_PER_PAGE) + 1;
    const endItem = Math.min(normalizedCurrentPage * ADVANCED_REPORT_ITEMS_PER_PAGE, normalizedTotalItems);

    countEl.textContent = String(normalizedTotalItems);
    pageEl.textContent = `${normalizedCurrentPage}/${normalizedTotalPages}`;
    rangeEl.textContent = `${startItem}-${endItem}`;
    metaBar.style.display = 'flex';
  }

  function setupAdvancedReportPagination(data) {
    const paginationNav = doc.getElementById('advancedReportPaginationNav');
    const paginationContainer = doc.getElementById('advancedReportPagination');
    const paginationInfo = doc.getElementById('advancedReportPaginationInfo');
    if (!paginationContainer) {
      return;
    }

    const totalItems = Number(data?.length || 0);
    const totalPages = Math.ceil(totalItems / ADVANCED_REPORT_ITEMS_PER_PAGE);

    const normalizedPage = Math.min(Math.max(1, state.currentAdvancedReportPage || 1), Math.max(totalPages, 1));
    state.currentAdvancedReportPage = normalizedPage;

    const startItem = totalItems > 0 ? ((normalizedPage - 1) * ADVANCED_REPORT_ITEMS_PER_PAGE) + 1 : 0;
    const endItem = totalItems > 0
      ? Math.min(normalizedPage * ADVANCED_REPORT_ITEMS_PER_PAGE, totalItems)
      : 0;

    if (paginationInfo) {
      paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} نتيجة`;
    }

    paginationContainer.innerHTML = '';
    if (totalPages <= 1) {
      if (paginationNav) {
        paginationNav.style.display = 'none';
      }
      return;
    }

    if (paginationNav) {
      paginationNav.style.display = 'block';
    }

    let paginationHtml = '';
    paginationHtml += `<li class="page-item ${normalizedPage === 1 ? 'disabled' : ''}">`;
    paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${normalizedPage - 1}); return false;" aria-label="السابق">`;
    paginationHtml += '<span aria-hidden="true">&laquo;</span></a></li>\n';

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= normalizedPage - 2 && i <= normalizedPage + 2)) {
        paginationHtml += `<li class="page-item ${i === normalizedPage ? 'active' : ''}">`;
        paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${i}); return false;">${i}</a></li>\n`;
      } else if (i === normalizedPage - 3 || i === normalizedPage + 3) {
        paginationHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>\n';
      }
    }

    paginationHtml += `<li class="page-item ${normalizedPage === totalPages ? 'disabled' : ''}">`;
    paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${normalizedPage + 1}); return false;" aria-label="التالي">`;
    paginationHtml += '<span aria-hidden="true">&raquo;</span></a></li>\n';

    paginationContainer.innerHTML = paginationHtml;
  }

  function changeAdvancedReportPage(page) {
    if (!state.currentAdvancedReportData) {
      return;
    }

    const totalPages = Math.ceil(state.currentAdvancedReportData.length / ADVANCED_REPORT_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) {
      return;
    }

    state.currentAdvancedReportPage = page;
    displayAdvancedReportTable(state.currentAdvancedReportData, getAdvancedReportType());
  }

  function displayAdvancedReportSummary(summary, reportType) {
    const summaryContainer = doc.getElementById('advancedReportSummary');
    let summaryHtml = '';

    switch (reportType) {
      case 'time':
        summaryHtml = `
              <div class="col-md-3">
                  <div class="card bg-primary text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.totalPeriods}</h4>
                          <p class="mb-0">عدد الفترات</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-success text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.totalReconciliations}</h4>
                          <p class="mb-0">إجمالي التصفيات</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-info text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.avgDailyReceipts}</h4>
                          <p class="mb-0">متوسط المقبوضات</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-warning text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.overallAccuracy}%</h4>
                          <p class="mb-0">معدل الدقة</p>
                      </div>
                  </div>
              </div>
          `;
        break;
      case 'atm':
        summaryHtml = `
              <div class="col-md-3">
                  <div class="card bg-primary text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.totalAtms}</h4>
                          <p class="mb-0">عدد الأجهزة</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-success text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.totalTransactions}</h4>
                          <p class="mb-0">إجمالي المعاملات</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-info text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${formatCurrency(summary.totalAmount)}</h4>
                          <p class="mb-0">إجمالي المبلغ</p>
                      </div>
                  </div>
              </div>
              <div class="col-md-3">
                  <div class="card bg-warning text-white">
                      <div class="card-body text-center">
                          <h4 class="mb-1">${summary.avgTransactionAmount}</h4>
                          <p class="mb-0">متوسط المعاملة</p>
                      </div>
                  </div>
              </div>
          `;
        break;
      default:
        summaryHtml = '';
    }

    summaryContainer.innerHTML = summaryHtml;
  }

  function displayAdvancedReportTable(data, reportType) {
    const tableHead = doc.getElementById('advancedReportTableHead');
    const tableBody = doc.getElementById('advancedReportTableBody');
    const totalItems = Array.isArray(data) ? data.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / ADVANCED_REPORT_ITEMS_PER_PAGE));
    state.currentAdvancedReportPage = Math.min(Math.max(1, state.currentAdvancedReportPage || 1), totalPages);
    const startIndex = (state.currentAdvancedReportPage - 1) * ADVANCED_REPORT_ITEMS_PER_PAGE;
    const endIndex = startIndex + ADVANCED_REPORT_ITEMS_PER_PAGE;
    const pageData = Array.isArray(data) ? data.slice(startIndex, endIndex) : [];

    let headersHtml = '';
    let bodyHtml = '';

    switch (reportType) {
      case 'time':
        headersHtml = `
              <tr>
                  <th>الفترة</th>
                  <th>عدد التصفيات</th>
                  <th>الكاشير النشطين</th>
                  <th>إجمالي المقبوضات</th>
                  <th>متوسط المقبوضات</th>
                  <th>الفائض/العجز</th>
                  <th>معدل الدقة</th>
              </tr>
          `;

        pageData.forEach((item) => {
          const surplusDeficitClass = item.total_surplus_deficit >= 0 ? 'text-success' : 'text-danger';
          bodyHtml += `
                  <tr>
                      <td>${item.period_label}</td>
                      <td>${item.total_reconciliations}</td>
                      <td>${item.active_cashiers}</td>
                      <td class="text-currency">${formatCurrency(item.total_receipts)}</td>
                      <td class="text-currency">${formatCurrency(item.avg_receipts)}</td>
                      <td class="text-currency ${surplusDeficitClass}">${formatCurrency(item.total_surplus_deficit)}</td>
                      <td>${item.accuracy_rate}%</td>
                  </tr>
              `;
        });
        break;
      case 'atm':
        headersHtml = `
              <tr>
                  <th>اسم الجهاز</th>
                  <th>الفرع</th>
                  <th>الموقع</th>
                  <th>عدد المعاملات</th>
                  <th>إجمالي المبلغ</th>
                  <th>متوسط المعاملة</th>
                  <th>المتوسط اليومي</th>
                  <th>معدل الاستخدام</th>
              </tr>
          `;

        pageData.forEach((item) => {
          bodyHtml += `
                  <tr>
                      <td>${item.atm_name}</td>
                      <td>
                          <span class="badge bg-info">
                              ${item.atm_branch_name || 'غير محدد'}
                          </span>
                      </td>
                      <td>${item.atm_location}</td>
                      <td>${item.total_transactions}</td>
                      <td class="text-currency">${formatCurrency(item.total_amount)}</td>
                      <td class="text-currency">${formatCurrency(item.avg_transaction_amount)}</td>
                      <td class="text-currency">${item.daily_avg}</td>
                      <td>${item.utilization_rate}%</td>
                  </tr>
              `;
        });
        break;
      default:
        headersHtml = '';
        bodyHtml = '';
    }

    tableHead.innerHTML = headersHtml;
    tableBody.innerHTML = bodyHtml;
    updateAdvancedReportMeta(totalItems, totalPages, state.currentAdvancedReportPage);
    setupAdvancedReportPagination(data);
  }

  return {
    displayAdvancedReportResults,
    getAdvancedReportType,
    setupAdvancedReportPagination,
    changeAdvancedReportPage,
    displayAdvancedReportSummary,
    displayAdvancedReportTable
  };
}

module.exports = {
  createAdvancedReportsDisplayHandlers
};
