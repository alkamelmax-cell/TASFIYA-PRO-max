function createReportsDisplayHandlers(context) {
  const doc = context.document;
  const windowObj = context.windowObj || globalThis;
  const formatDate = context.formatDate;
  const formatCurrency = context.formatCurrency;
  const generateReportSummary = context.generateReportSummary;
  const state = context.state;
  const REPORT_ITEMS_PER_PAGE = context.itemsPerPage || 20;
  const logger = context.logger || console;
  let chartsResizeHandlerBound = false;
  let chartsThemeObserver = null;
  let reportSortHandlersBound = false;
  const REPORT_SORT_LABELS = {
    reconciliation_number: 'رقم التصفية',
    reconciliation_date: 'التاريخ',
    branch_name: 'الفرع',
    cashier_name: 'الكاشير',
    accountant_name: 'المحاسب',
    total_receipts: 'إجمالي المقبوضات',
    system_sales: 'مبيعات النظام',
    surplus_deficit: 'الفائض/العجز',
    status: 'الحالة'
  };

  function isDarkThemeEnabled() {
    return doc?.body?.classList?.contains('theme-dark') === true;
  }

  function getChartPalette() {
    if (isDarkThemeEnabled()) {
      return {
        background: '#1d2a34',
        grid: 'rgba(154, 199, 225, 0.22)',
        axis: '#9fc3d9',
        text: '#d7ebf7',
        primary: '#2f92c3',
        primarySoft: 'rgba(47, 146, 195, 0.22)',
        accent: '#1fc08b'
      };
    }

    return {
      background: '#f8fbfd',
      grid: 'rgba(32, 96, 130, 0.16)',
      axis: '#2b5f79',
      text: '#244d63',
      primary: '#2e789f',
      primarySoft: 'rgba(46, 120, 159, 0.2)',
      accent: '#148f66'
    };
  }

  function prepareChartCanvas(canvas) {
    if (!canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 400));
    const cssHeight = Math.max(180, Math.floor(rect.height || canvas.clientHeight || 220));
    const dpr = windowObj?.devicePixelRatio || globalThis?.devicePixelRatio || 1;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    return { ctx, width: cssWidth, height: cssHeight };
  }

  function drawNoData(canvas, message) {
    const prepared = prepareChartCanvas(canvas);
    if (!prepared) {
      return;
    }

    const { ctx, width, height } = prepared;
    const colors = getChartPalette();
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = colors.text;
    ctx.font = '700 14px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  }

  function aggregateCashierCounts(reconciliations) {
    const counts = new Map();
    reconciliations.forEach((item) => {
      const label = String(item?.cashier_name || 'غير محدد');
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  function aggregateReceiptsTrend(reconciliations) {
    const byDay = new Map();
    reconciliations.forEach((item) => {
      const date = String(item?.reconciliation_date || '').slice(0, 10);
      if (!date) return;
      const amount = Number(item?.total_receipts) || 0;
      byDay.set(date, (byDay.get(date) || 0) + amount);
    });

    const sorted = Array.from(byDay.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length <= 18) {
      return sorted;
    }

    const step = Math.ceil(sorted.length / 18);
    const reduced = [];
    for (let i = 0; i < sorted.length; i += step) {
      reduced.push(sorted[i]);
    }
    const last = sorted[sorted.length - 1];
    if (reduced.length === 0 || reduced[reduced.length - 1].date !== last.date) {
      reduced.push(last);
    }
    return reduced;
  }

  function formatAxisNumber(value) {
    return Math.round(value).toLocaleString('en-US');
  }

  function drawCashierDistributionChart(canvas, reconciliations) {
    const prepared = prepareChartCanvas(canvas);
    if (!prepared) {
      return;
    }

    const series = aggregateCashierCounts(reconciliations);
    if (series.length === 0) {
      drawNoData(canvas, 'لا توجد بيانات كافية لعرض توزيع الكاشير');
      return;
    }

    const { ctx, width, height } = prepared;
    const colors = getChartPalette();
    const padding = { top: 18, right: 14, bottom: 62, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...series.map((item) => item.count));

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i += 1) {
      const y = padding.top + (chartHeight * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    const barGap = 10;
    const barWidth = Math.max(18, (chartWidth - (series.length + 1) * barGap) / series.length);
    const baselineY = height - padding.bottom;
    ctx.font = '700 11px Cairo, sans-serif';
    ctx.textAlign = 'center';

    series.forEach((item, index) => {
      const barX = padding.left + barGap + index * (barWidth + barGap);
      const ratio = item.count / maxValue;
      const barHeight = Math.max(3, ratio * chartHeight);
      const barY = baselineY - barHeight;

      ctx.fillStyle = colors.primarySoft;
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1.3;
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = colors.text;
      ctx.fillText(String(item.count), barX + barWidth / 2, barY - 8);

      const label = item.name.length > 12 ? `${item.name.slice(0, 12)}...` : item.name;
      ctx.fillText(label, barX + barWidth / 2, baselineY + 18);
    });
  }

  function drawSalesTrendChart(canvas, reconciliations) {
    const prepared = prepareChartCanvas(canvas);
    if (!prepared) {
      return;
    }

    const series = aggregateReceiptsTrend(reconciliations);
    if (series.length === 0) {
      drawNoData(canvas, 'لا توجد بيانات كافية لعرض اتجاه المبيعات');
      return;
    }

    const { ctx, width, height } = prepared;
    const colors = getChartPalette();
    const padding = { top: 18, right: 16, bottom: 50, left: 52 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...series.map((item) => item.amount));
    const baselineY = height - padding.bottom;

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i += 1) {
      const y = padding.top + (chartHeight * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const value = maxValue - (maxValue * i) / gridLines;
      ctx.fillStyle = colors.axis;
      ctx.font = '600 10px Cairo, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisNumber(value), padding.left - 6, y + 3);
    }

    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, baselineY);
    ctx.lineTo(width - padding.right, baselineY);
    ctx.stroke();

    if (series.length === 1) {
      const pointX = padding.left + chartWidth / 2;
      const pointY = baselineY - (series[0].amount / maxValue) * chartHeight;
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(pointX, pointY, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const stepX = chartWidth / (series.length - 1);
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((item, index) => {
        const x = padding.left + index * stepX;
        const y = baselineY - (item.amount / maxValue) * chartHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      ctx.fillStyle = colors.accent;
      series.forEach((item, index) => {
        const x = padding.left + index * stepX;
        const y = baselineY - (item.amount / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = colors.axis;
    ctx.font = '600 10px Cairo, sans-serif';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.ceil(series.length / 6));
    series.forEach((item, index) => {
      if (index % labelStep !== 0 && index !== series.length - 1) {
        return;
      }
      const x = padding.left + (series.length === 1 ? chartWidth / 2 : (index * chartWidth) / (series.length - 1));
      const shortDate = item.date.slice(5);
      ctx.fillText(shortDate, x, baselineY + 16);
    });
  }

  function ensureChartsResizeHandler() {
    if (chartsResizeHandlerBound || !windowObj || typeof windowObj.addEventListener !== 'function') {
      return;
    }

    const handleResize = () => {
      const chartsSection = doc.getElementById('reportChartsSection');
      if (
        chartsSection &&
        chartsSection.style.display !== 'none' &&
        Array.isArray(state.currentReportData) &&
        state.currentReportData.length > 0
      ) {
        generateReportCharts(state.currentReportData);
      }
    };

    windowObj.addEventListener('resize', handleResize);
    chartsResizeHandlerBound = true;
  }

  function ensureChartsThemeObserver() {
    const MutationObserverCtor = windowObj?.MutationObserver || globalThis?.MutationObserver;
    if (chartsThemeObserver || !MutationObserverCtor || !doc?.body) {
      return;
    }

    chartsThemeObserver = new MutationObserverCtor((mutations) => {
      const classMutation = mutations.some((mutation) => mutation.attributeName === 'class');
      if (!classMutation) {
        return;
      }

      const chartsSection = doc.getElementById('reportChartsSection');
      if (
        chartsSection &&
        chartsSection.style.display !== 'none' &&
        Array.isArray(state.currentReportData) &&
        state.currentReportData.length > 0
      ) {
        generateReportCharts(state.currentReportData);
      }
    });

    chartsThemeObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }

  function getDefaultSortDirection(sortKey) {
    const descendingKeys = new Set([
      'reconciliation_number',
      'reconciliation_date',
      'total_receipts',
      'system_sales',
      'surplus_deficit'
    ]);
    return descendingKeys.has(sortKey) ? 'desc' : 'asc';
  }

  function getSortColumnLabel(sortKey) {
    return REPORT_SORT_LABELS[sortKey] || 'التاريخ';
  }

  function getSortableHeaderCells() {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return [];
    }

    return Array.from(doc.querySelectorAll('#reportResultsTable thead th[data-sort-key]') || []);
  }

  function ensureReportSortState() {
    if (!state.reportSort || typeof state.reportSort !== 'object') {
      state.reportSort = {
        key: 'reconciliation_date',
        direction: 'desc'
      };
      return;
    }

    const validDirection = state.reportSort.direction === 'asc' ? 'asc' : 'desc';
    const validKey = state.reportSort.key || 'reconciliation_date';
    state.reportSort = {
      key: validKey,
      direction: validDirection
    };
  }

  function getSortableValue(row, sortKey) {
    switch (sortKey) {
      case 'reconciliation_number':
        return Number(row.reconciliation_number || row.id || 0);
      case 'reconciliation_date': {
        const dateValue = Date.parse(row.reconciliation_date || '');
        return Number.isFinite(dateValue) ? dateValue : 0;
      }
      case 'total_receipts':
      case 'system_sales':
      case 'surplus_deficit': {
        const numericValue = Number(row[sortKey]);
        return Number.isFinite(numericValue) ? numericValue : 0;
      }
      case 'status':
        return row.status === 'completed' ? 2 : 1;
      case 'branch_name':
      case 'cashier_name':
      case 'accountant_name':
      default:
        return String(row[sortKey] || '').toLocaleLowerCase('ar');
    }
  }

  function getSortedReportRows(reconciliations) {
    const safeData = Array.isArray(reconciliations) ? reconciliations : [];
    ensureReportSortState();

    const { key: sortKey, direction } = state.reportSort;
    const multiplier = direction === 'asc' ? 1 : -1;

    return [...safeData].sort((first, second) => {
      const firstValue = getSortableValue(first, sortKey);
      const secondValue = getSortableValue(second, sortKey);

      if (firstValue < secondValue) {
        return -1 * multiplier;
      }
      if (firstValue > secondValue) {
        return 1 * multiplier;
      }

      const firstId = Number(first.id || 0);
      const secondId = Number(second.id || 0);
      return secondId - firstId;
    });
  }

  function updateReportSortIndicators() {
    ensureReportSortState();
    const headers = getSortableHeaderCells();
    headers.forEach((headerCell) => {
      const key = headerCell?.dataset?.sortKey || '';
      const currentLabel = typeof headerCell?.textContent === 'string' ? headerCell.textContent.trim() : '';
      const baseLabel = headerCell?.dataset?.sortLabel || currentLabel;
      if (headerCell?.dataset) {
        headerCell.dataset.sortLabel = baseLabel;
      }

      if (key === state.reportSort.key) {
        const arrow = state.reportSort.direction === 'asc' ? '↑' : '↓';
        headerCell.innerHTML = `${baseLabel} <span class="report-sort-indicator">${arrow}</span>`;
        headerCell.setAttribute('aria-sort', state.reportSort.direction === 'asc' ? 'ascending' : 'descending');
      } else {
        headerCell.innerHTML = `${baseLabel} <span class="report-sort-indicator text-muted">↕</span>`;
        headerCell.setAttribute('aria-sort', 'none');
      }
    });
  }

  function sortReportBy(sortKey) {
    if (!sortKey) {
      return;
    }

    ensureReportSortState();
    if (state.reportSort.key === sortKey) {
      state.reportSort.direction = state.reportSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.reportSort.key = sortKey;
      state.reportSort.direction = getDefaultSortDirection(sortKey);
    }

    updateReportSortIndicators();
    state.currentReportPage = 1;
    if (Array.isArray(state.currentReportData)) {
      displayReportTable(state.currentReportData);
    }
  }

  function ensureReportSortHandlers() {
    if (reportSortHandlersBound) {
      updateReportSortIndicators();
      return;
    }

    const headers = getSortableHeaderCells();
    if (headers.length === 0) {
      return;
    }

    headers.forEach((headerCell) => {
      headerCell.classList.add('report-sortable');
      headerCell.addEventListener('click', () => sortReportBy(headerCell?.dataset?.sortKey || ''));
    });

    reportSortHandlersBound = true;
    updateReportSortIndicators();
  }

  function isSettingEnabled(settingKey, fallbackValue = true) {
    if (!state.reportSettings || typeof state.reportSettings !== 'object') {
      return fallbackValue;
    }

    if (Object.prototype.hasOwnProperty.call(state.reportSettings, settingKey)) {
      return state.reportSettings[settingKey] !== false;
    }

    return fallbackValue;
  }

  function applySummaryAndChartsSettings() {
    const summarySection = doc.getElementById('reportSummary');
    const summaryButton = doc.getElementById('toggleSummaryViewBtn');
    const chartsSection = doc.getElementById('reportChartsSection');
    const chartsButton = doc.getElementById('toggleChartViewBtn');

    const includeSummary = isSettingEnabled('include_summary', true);
    const includeCharts = isSettingEnabled('include_charts', true);

    if (summarySection && summaryButton) {
      summarySection.style.display = includeSummary ? 'flex' : 'none';
      summaryButton.disabled = !includeSummary;
      summaryButton.innerHTML = includeSummary
        ? '<i class="icon">📈</i> إخفاء الإحصائيات'
        : '<i class="icon">📈</i> الإحصائيات معطلة';
    }

    if (chartsSection && chartsButton) {
      chartsSection.style.display = 'none';
      chartsButton.disabled = !includeCharts;
      chartsButton.innerHTML = includeCharts
        ? '<i class="icon">📊</i> عرض الرسوم البيانية'
        : '<i class="icon">📊</i> الرسوم البيانية معطلة';
    }
  }

  async function displayReportResults(reconciliations, reportSettings = null) {
    if (reportSettings) {
      state.reportSettings = reportSettings;
    }

    ensureChartsResizeHandler();
    ensureChartsThemeObserver();
    ensureReportSortState();
    ensureReportSortHandlers();
    state.currentReportPage = 1;
    doc.getElementById('reportResultsCard').style.display = 'block';

    const summary = generateReportSummary(reconciliations);
    displayReportSummary(summary);
    applySummaryAndChartsSettings();
    displayReportTable(reconciliations);

    if (
      isSettingEnabled('include_charts', true) &&
      doc.getElementById('reportChartsSection').style.display !== 'none'
    ) {
      generateReportCharts(reconciliations);
    }
  }

  function displayReportSummary(summary) {
    const summaryContainer = doc.getElementById('reportSummary');

    summaryContainer.innerHTML = `
        <div class="col-md-3"><div class="card bg-primary text-white"><div class="card-body"><div class="d-flex justify-content-between"><div><h6 class="card-title">إجمالي التصفيات</h6><h4 class="mb-0">${summary.totalReconciliations}</h4></div><div class="align-self-center"><i class="icon fs-1">📊</i></div></div></div></div></div>
        <div class="col-md-3"><div class="card bg-success text-white"><div class="card-body"><div class="d-flex justify-content-between"><div><h6 class="card-title">إجمالي المقبوضات</h6><h4 class="mb-0">${formatCurrency(summary.totalReceipts)}</h4></div><div class="align-self-center"><i class="icon fs-1">💰</i></div></div></div></div></div>
        <div class="col-md-3"><div class="card bg-info text-white"><div class="card-body"><div class="d-flex justify-content-between"><div><h6 class="card-title">مبيعات النظام</h6><h4 class="mb-0">${formatCurrency(summary.totalSystemSales)}</h4></div><div class="align-self-center"><i class="icon fs-1">🏪</i></div></div></div></div></div>
        <div class="col-md-3"><div class="card ${summary.totalSurplusDeficit >= 0 ? 'bg-success' : 'bg-danger'} text-white"><div class="card-body"><div class="d-flex justify-content-between"><div><h6 class="card-title">${summary.totalSurplusDeficit >= 0 ? 'إجمالي الفائض' : 'إجمالي العجز'}</h6><h4 class="mb-0">${formatCurrency(Math.abs(summary.totalSurplusDeficit))}</h4></div><div class="align-self-center"><i class="icon fs-1">${summary.totalSurplusDeficit >= 0 ? '📈' : '📉'}</i></div></div></div></div></div>
    `;
  }

  function displayReportTable(reconciliations) {
    const tableBody = doc.getElementById('reportResultsTableBody');
    const sortedRows = getSortedReportRows(reconciliations);
    const totalItems = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / REPORT_ITEMS_PER_PAGE));
    state.currentReportPage = Math.min(Math.max(1, state.currentReportPage || 1), totalPages);

    const startIndex = (state.currentReportPage - 1) * REPORT_ITEMS_PER_PAGE;
    const endIndex = startIndex + REPORT_ITEMS_PER_PAGE;
    const pageData = sortedRows.slice(startIndex, endIndex);

    tableBody.innerHTML = '';

    pageData.forEach((reconciliation) => {
      const row = doc.createElement('tr');
      const statusClass = reconciliation.status === 'completed' ? 'bg-success' : 'bg-warning';
      const statusText = reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة';
      const surplusDeficitClass = reconciliation.surplus_deficit >= 0 ? 'text-success' : 'text-danger';

      row.innerHTML = `
            <td>${reconciliation.status === 'completed' && reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : 'مسودة'}</td>
            <td>${formatDate(reconciliation.reconciliation_date)}</td>
            <td>${reconciliation.branch_name || 'غير محدد'}</td>
            <td>${reconciliation.cashier_name} (${reconciliation.cashier_number})</td>
            <td>${reconciliation.accountant_name}</td>
            <td class="text-currency">${formatCurrency(reconciliation.total_receipts)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.system_sales)}</td>
            <td class="text-currency ${surplusDeficitClass}">${formatCurrency(reconciliation.surplus_deficit)}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-primary" onclick="window.viewReconciliation(${reconciliation.id})" title="عرض التفاصيل">👁️</button>
                    <button class="btn btn-sm btn-info" onclick="window.printReconciliation(${reconciliation.id})" title="طباعة">🖨️</button>
                </div>
            </td>
        `;

      tableBody.appendChild(row);
    });

    updateReportPagination(totalItems);
  }

  function updateReportPagination(totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / REPORT_ITEMS_PER_PAGE));
    const paginationContainer = doc.getElementById('reportPagination');
    const paginationInfo = doc.getElementById('reportPaginationInfo');

    const normalizedPage = Math.min(Math.max(1, state.currentReportPage || 1), totalPages);
    state.currentReportPage = normalizedPage;

    if (totalItems <= 0) {
      paginationInfo.textContent = 'عرض 0-0 من 0 نتيجة';
      paginationContainer.innerHTML = '';
      return;
    }

    const startItem = (normalizedPage - 1) * REPORT_ITEMS_PER_PAGE + 1;
    const endItem = Math.min(normalizedPage * REPORT_ITEMS_PER_PAGE, totalItems);
    paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} نتيجة`;

    paginationContainer.innerHTML = '';
    if (totalPages <= 1) {
      return;
    }

    const prevLi = doc.createElement('li');
    prevLi.className = `page-item ${normalizedPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${normalizedPage - 1}); return false;">السابق</a>`;
    paginationContainer.appendChild(prevLi);

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= normalizedPage - 2 && i <= normalizedPage + 2)) {
        const li = doc.createElement('li');
        li.className = `page-item ${i === normalizedPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${i}); return false;">${i}</a>`;
        paginationContainer.appendChild(li);
      } else if (i === normalizedPage - 3 || i === normalizedPage + 3) {
        const li = doc.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = '<span class="page-link">...</span>';
        paginationContainer.appendChild(li);
      }
    }

    const nextLi = doc.createElement('li');
    nextLi.className = `page-item ${normalizedPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${normalizedPage + 1}); return false;">التالي</a>`;
    paginationContainer.appendChild(nextLi);
  }

  function changeReportPage(page) {
    if (!state.currentReportData || state.currentReportData.length === 0) {
      return;
    }

    const totalPages = Math.max(1, Math.ceil(state.currentReportData.length / REPORT_ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) {
      return;
    }

    state.currentReportPage = page;
    displayReportTable(state.currentReportData);
  }

  function toggleSummaryView() {
    const summarySection = doc.getElementById('reportSummary');
    const btn = doc.getElementById('toggleSummaryViewBtn');

    if (!isSettingEnabled('include_summary', true) || !summarySection || !btn) {
      return;
    }

    if (summarySection.style.display === 'none') {
      summarySection.style.display = 'flex';
      btn.innerHTML = '<i class="icon">📈</i> إخفاء الإحصائيات';
    } else {
      summarySection.style.display = 'none';
      btn.innerHTML = '<i class="icon">📈</i> عرض الإحصائيات';
    }
  }

  function toggleChartView() {
    const chartsSection = doc.getElementById('reportChartsSection');
    const btn = doc.getElementById('toggleChartViewBtn');

    if (!isSettingEnabled('include_charts', true) || !chartsSection || !btn) {
      return;
    }

    if (chartsSection.style.display === 'none') {
      chartsSection.style.display = 'block';
      btn.innerHTML = '<i class="icon">📊</i> إخفاء الرسوم البيانية';
      if (state.currentReportData) {
        generateReportCharts(state.currentReportData);
      }
    } else {
      chartsSection.style.display = 'none';
      btn.innerHTML = '<i class="icon">📊</i> عرض الرسوم البيانية';
    }
  }

  function generateReportCharts(reconciliations) {
    logger.log('📊 [CHARTS] إنشاء الرسوم البيانية للتقرير...');

    const cashierChart = doc.getElementById('cashierDistributionChart');
    const salesChart = doc.getElementById('salesTrendChart');
    const safeData = Array.isArray(reconciliations) ? reconciliations : [];

    if (cashierChart) {
      drawCashierDistributionChart(cashierChart, safeData);
    }
    if (salesChart) {
      drawSalesTrendChart(salesChart, safeData);
    }
  }

  function getSortedReportData(reconciliations = null) {
    const sourceRows = Array.isArray(reconciliations) ? reconciliations : state.currentReportData;
    return getSortedReportRows(sourceRows);
  }

  function getCurrentReportSortMeta() {
    ensureReportSortState();
    const key = state.reportSort.key || 'reconciliation_date';
    const direction = state.reportSort.direction === 'asc' ? 'asc' : 'desc';
    const columnLabel = getSortColumnLabel(key);
    const directionLabel = direction === 'asc' ? 'تصاعدي' : 'تنازلي';

    return {
      key,
      direction,
      columnLabel,
      directionLabel,
      displayText: `${columnLabel} (${directionLabel})`
    };
  }

  return {
    displayReportResults,
    changeReportPage,
    toggleSummaryView,
    toggleChartView,
    getSortedReportData,
    getCurrentReportSortMeta
  };
}

module.exports = {
  createReportsDisplayHandlers
};
