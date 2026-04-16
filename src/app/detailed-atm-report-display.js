function createDetailedAtmReportDisplayHandlers(context) {
  const doc = context.document;
  const formatCurrency = context.formatCurrency;
  const state = context.state;
  const logger = context.logger || console;

  function displayDetailedAtmReportResults() {
    logger.log('📊 [DETAILED-ATM] عرض نتائج التقرير التحليلي المفصل...');

    doc.getElementById('detailedAtmReportResults').style.display = 'block';

    const totalOperations = state.filteredDetailedReportData.length;
    doc.getElementById('detailedReportTitle').textContent = `نتائج التقرير التحليلي (${totalOperations} عملية)`;

    displayDetailedReportSummary();
    displayDetailedReportTable();
    setupDetailedReportPagination();
  }

  function displayDetailedReportSummary() {
    const data = state.filteredDetailedReportData;

    if (data.length === 0) {
      doc.getElementById('detailedReportSummary').innerHTML = '';
      return;
    }

    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const avgAmount = totalAmount / data.length;
    const maxAmount = Math.max(...data.map((item) => parseFloat(item.amount)));
    const minAmount = Math.min(...data.map((item) => parseFloat(item.amount)));

    const operationCounts = {};
    data.forEach((item) => {
      operationCounts[item.operation_type] = (operationCounts[item.operation_type] || 0) + 1;
    });

    const uniqueAtms = new Set(data.map((item) => item.atm_id)).size;
    const uniqueCashiers = new Set(data.map((item) => item.cashier_id)).size;

    const summaryHtml = `
        <div class="col-md-2"><div class="card bg-primary text-white"><div class="card-body text-center"><h6 class="card-title">إجمالي العمليات</h6><h4>${data.length}</h4></div></div></div>
        <div class="col-md-2"><div class="card bg-success text-white"><div class="card-body text-center"><h6 class="card-title">إجمالي المبلغ</h6><h5>${formatCurrency(totalAmount)}</h5></div></div></div>
        <div class="col-md-2"><div class="card bg-info text-white"><div class="card-body text-center"><h6 class="card-title">متوسط المبلغ</h6><h5>${formatCurrency(avgAmount)}</h5></div></div></div>
        <div class="col-md-2"><div class="card bg-warning text-white"><div class="card-body text-center"><h6 class="card-title">أعلى مبلغ</h6><h5>${formatCurrency(maxAmount)}</h5></div></div></div>
        <div class="col-md-2"><div class="card bg-secondary text-white"><div class="card-body text-center"><h6 class="card-title">أقل مبلغ</h6><h5>${formatCurrency(minAmount)}</h5></div></div></div>
        <div class="col-md-2"><div class="card bg-dark text-white"><div class="card-body text-center"><h6 class="card-title">عدد الأجهزة</h6><h4>${uniqueAtms}</h4><small>الكاشيرين: ${uniqueCashiers}</small></div></div></div>
    `;

    const summaryContainer = doc.getElementById('detailedReportSummary');
    summaryContainer.innerHTML = summaryHtml;
    summaryContainer.dataset.operationCounts = JSON.stringify(operationCounts);
  }

  function displayDetailedReportTable() {
    const tbody = doc.getElementById('detailedAtmReportTableBody');
    tbody.innerHTML = '';

    const startIndex = (state.currentDetailedReportPage - 1) * state.detailedReportPageSize;
    const endIndex = state.detailedReportPageSize === 'all'
      ? state.filteredDetailedReportData.length
      : Math.min(startIndex + parseInt(state.detailedReportPageSize, 10), state.filteredDetailedReportData.length);

    const pageData = state.filteredDetailedReportData.slice(startIndex, endIndex);

    if (pageData.length === 0) {
      tbody.innerHTML = `
            <tr><td colspan="8" class="text-center text-muted py-4">لا توجد عمليات تطابق المعايير المحددة</td></tr>
        `;
      return;
    }

    pageData.forEach((item) => {
      const row = doc.createElement('tr');
      row.innerHTML = `
            <td>${item.formatted_datetime}</td>
            <td><span class="badge ${getOperationTypeBadgeClass(item.operation_type)}">${item.operation_type}</span></td>
            <td>${item.atm_name}</td>
            <td><span class="badge bg-info">${item.atm_branch_name || 'غير محدد'}</span></td>
            <td>${item.atm_location || 'غير محدد'}</td>
            <td>${item.bank_name}</td>
            <td class="text-end fw-bold">${item.formatted_amount}</td>
            <td>${item.cashier_name} (${item.cashier_number})</td>
            <td><a href="#" onclick="viewReconciliationDetails(${item.reconciliation_id})" class="text-decoration-none">#${item.reconciliation_number || item.reconciliation_id}</a></td>
        `;
      tbody.appendChild(row);
    });
  }

  function getOperationTypeBadgeClass(operationType) {
    switch (operationType) {
      case 'مدى':
        return 'bg-primary';
      case 'فيزا':
        return 'bg-success';
      case 'ماستر كارد':
        return 'bg-warning text-dark';
      case 'أمريكان إكسبريس':
        return 'bg-info';
      case 'تحويل':
        return 'bg-purple text-white';
      default:
        return 'bg-secondary';
    }
  }

  function setupDetailedReportPagination() {
    const totalItems = state.filteredDetailedReportData.length;
    const totalPages = state.detailedReportPageSize === 'all'
      ? 1
      : Math.ceil(totalItems / parseInt(state.detailedReportPageSize, 10));

    const paginationNav = doc.getElementById('detailedReportPaginationNav');
    const paginationInfo = doc.getElementById('detailedReportPaginationInfo');
    const pagination = doc.getElementById('detailedReportPagination');

    if (totalPages <= 1) {
      paginationNav.style.display = 'none';
      return;
    }

    paginationNav.style.display = 'block';

    const startItem = (state.currentDetailedReportPage - 1) * parseInt(state.detailedReportPageSize, 10) + 1;
    const endItem = Math.min(state.currentDetailedReportPage * parseInt(state.detailedReportPageSize, 10), totalItems);
    paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} عملية`;

    let paginationHtml = '';

    if (state.currentDetailedReportPage > 1) {
      paginationHtml += `
            <li class="page-item"><a class="page-link" href="#" onclick="changeDetailedReportPage(${state.currentDetailedReportPage - 1})">السابق</a></li>
        `;
    }

    const maxVisiblePages = 5;
    let startPage = Math.max(1, state.currentDetailedReportPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i += 1) {
      paginationHtml += `
            <li class="page-item ${i === state.currentDetailedReportPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changeDetailedReportPage(${i})">${i}</a></li>
        `;
    }

    if (state.currentDetailedReportPage < totalPages) {
      paginationHtml += `
            <li class="page-item"><a class="page-link" href="#" onclick="changeDetailedReportPage(${state.currentDetailedReportPage + 1})">التالي</a></li>
        `;
    }

    pagination.innerHTML = paginationHtml;
  }

  function changeDetailedReportPage(page) {
    state.currentDetailedReportPage = page;
    displayDetailedReportTable();
    setupDetailedReportPagination();
  }

  function handleDetailedReportSearch() {
    const searchTerm = doc.getElementById('detailedReportSearch').value.toLowerCase().trim();
    const searchAmount = parseFloat(searchTerm);

    if (!searchTerm) {
      state.filteredDetailedReportData = [...state.currentDetailedReportData];
    } else {
      state.filteredDetailedReportData = state.currentDetailedReportData.filter((item) => {
        if (!isNaN(searchAmount)) {
          return item.amount === searchAmount;
        }
        return (
          (item.atm_name || '').toLowerCase().includes(searchTerm) ||
          (item.atm_location || '').toLowerCase().includes(searchTerm) ||
          (item.atm_branch_name || '').toLowerCase().includes(searchTerm) ||
          (item.bank_name || '').toLowerCase().includes(searchTerm) ||
          (item.operation_type || '').toLowerCase().includes(searchTerm) ||
          (item.cashier_name || '').toLowerCase().includes(searchTerm) ||
          (item.cashier_number || '').toLowerCase().includes(searchTerm) ||
          item.amount.toString().includes(searchTerm) ||
          item.reconciliation_id.toString().includes(searchTerm)
        );
      });
    }

    state.currentDetailedReportPage = 1;
    displayDetailedAtmReportResults();
  }

  function handleDetailedReportSort() {
    const sortValue = doc.getElementById('detailedReportSort').value;

    state.filteredDetailedReportData.sort((a, b) => {
      switch (sortValue) {
        case 'date_desc':
          return new Date(b.operation_datetime) - new Date(a.operation_datetime);
        case 'date_asc':
          return new Date(a.operation_datetime) - new Date(b.operation_datetime);
        case 'amount_desc':
          return parseFloat(b.amount) - parseFloat(a.amount);
        case 'amount_asc':
          return parseFloat(a.amount) - parseFloat(b.amount);
        case 'atm_name':
          return a.atm_name.localeCompare(b.atm_name, 'ar');
        case 'operation_type':
          return a.operation_type.localeCompare(b.operation_type, 'ar');
        default:
          return 0;
      }
    });

    state.currentDetailedReportPage = 1;
    displayDetailedAtmReportResults();
  }

  function handleDetailedReportPageSize() {
    const newPageSize = doc.getElementById('detailedReportPageSize').value;
    state.detailedReportPageSize = newPageSize === 'all' ? 'all' : parseInt(newPageSize, 10);
    state.currentDetailedReportPage = 1;
    displayDetailedAtmReportResults();
  }

  function getFilteredDetailedReportData() {
    return state.filteredDetailedReportData;
  }

  return {
    displayDetailedAtmReportResults,
    changeDetailedReportPage,
    handleDetailedReportSearch,
    handleDetailedReportSort,
    handleDetailedReportPageSize,
    getFilteredDetailedReportData
  };
}

module.exports = {
  createDetailedAtmReportDisplayHandlers
};
