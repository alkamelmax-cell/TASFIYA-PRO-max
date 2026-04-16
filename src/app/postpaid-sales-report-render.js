function createPostpaidSalesReportRenderHelpers(context) {
  const doc = context.document;
  const formatDecimal = context.formatDecimal;
  const formatDate = context.formatDate;
  const state = context.state;
  const itemsPerPage = context.itemsPerPage || 20;
  const logger = context.logger || console;

  function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function calculateSummary(data) {
    const totalCustomers = data.length;
    const totalPostpaid = data.reduce((sum, item) => sum + normalizeNumber(item.total_postpaid), 0);
    const totalReceipts = data.reduce((sum, item) => sum + normalizeNumber(item.total_receipts), 0);
    const totalNetBalance = data.reduce((sum, item) => sum + normalizeNumber(item.net_balance), 0);
    const customersWithOutstandingBalance = data.filter((item) => normalizeNumber(item.net_balance) > 0).length;
    const highestBalance = totalCustomers > 0
      ? Math.max(...data.map((item) => normalizeNumber(item.net_balance)))
      : 0;

    return {
      totalCustomers,
      totalPostpaid,
      totalReceipts,
      totalNetBalance,
      customersWithOutstandingBalance,
      highestBalance
    };
  }

  function displayPostpaidSalesReportResults(data) {
    logger.log('📊 [POSTPAID-SALES] عرض نتائج صافي أرصدة العملاء الآجلة...');
    state.currentData = Array.isArray(data) ? data : [];
    const card = doc.getElementById('postpaidSalesReportResultsCard');
    card.style.display = 'block';
    displayPostpaidSalesReportSummary(state.currentData);
    displayPostpaidSalesReportTable(state.currentData);
    setupPostpaidSalesReportPagination(state.currentData);
    if (typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth' });
    }
    logger.log('✅ [POSTPAID-SALES] تم عرض النتائج بنجاح');
  }

  function displayPostpaidSalesReportSummary(data) {
    const summary = calculateSummary(data);

    const summaryHtml = `
        <div class="col-md-2">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${summary.totalCustomers}</h4>
                    <p class="mb-0">عدد العملاء</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-secondary text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(summary.totalPostpaid)}</h4>
                    <p class="mb-0">إجمالي الآجل</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(summary.totalReceipts)}</h4>
                    <p class="mb-0">إجمالي التحصيل</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-warning text-dark">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(summary.totalNetBalance)}</h4>
                    <p class="mb-0">صافي الأرصدة</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-danger text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${summary.customersWithOutstandingBalance}</h4>
                    <p class="mb-0">عملاء عليهم رصيد</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-dark text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(summary.highestBalance)}</h4>
                    <p class="mb-0">أعلى رصيد</p>
                </div>
            </div>
        </div>
    `;

    doc.getElementById('postpaidSalesReportSummary').innerHTML = summaryHtml;
  }

  function displayPostpaidSalesReportTable(data) {
    const tableHead = doc.getElementById('postpaidSalesReportTableHead');
    const tableBody = doc.getElementById('postpaidSalesReportTableBody');

    tableHead.innerHTML = `
        <th>رقم</th>
        <th>اسم العميل</th>
        <th>إجمالي الآجل</th>
        <th>إجمالي التحصيل</th>
        <th>صافي الرصيد</th>
        <th>الفرع/الفروع</th>
        <th>عدد الحركات</th>
        <th>آخر حركة</th>
    `;

    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = data.slice(startIndex, endIndex);

    let tableRows = '';
    paginatedData.forEach((item, index) => {
      const rowNumber = startIndex + index + 1;
      const lastTransactionDate = item.last_tx_date ? formatDate(item.last_tx_date) : 'غير محدد';
      const netBalance = normalizeNumber(item.net_balance);
      const balanceClass = netBalance > 0 ? 'text-danger' : netBalance < 0 ? 'text-success' : 'text-muted';

      tableRows += `
            <tr>
                <td>${rowNumber}</td>
                <td>${item.customer_name || 'غير محدد'}</td>
                <td class="text-end">${formatDecimal(item.total_postpaid)}</td>
                <td class="text-end">${formatDecimal(item.total_receipts)}</td>
                <td class="text-end ${balanceClass}"><strong>${formatDecimal(netBalance)}</strong></td>
                <td>${item.branch_label || 'غير محدد'}</td>
                <td class="text-center">${item.movements_count || 0}</td>
                <td>${lastTransactionDate}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = tableRows;

    const totalItems = data.length;
    const startItem = totalItems === 0 ? 0 : startIndex + 1;
    const endItem = Math.min(endIndex, totalItems);
    doc.getElementById('postpaidSalesReportPaginationInfo').textContent =
      `عرض ${startItem} إلى ${endItem} من ${totalItems} عميل`;
  }

  function setupPostpaidSalesReportPagination(data) {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const paginationContainer = doc.getElementById('postpaidSalesReportPagination');

    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let paginationHtml = '';
    if (state.currentPage > 1) {
      paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${state.currentPage - 1})">السابق</a>
            </li>
        `;
    }

    const startPage = Math.max(1, state.currentPage - 2);
    const endPage = Math.min(totalPages, state.currentPage + 2);
    for (let i = startPage; i <= endPage; i += 1) {
      const activeClass = i === state.currentPage ? 'active' : '';
      paginationHtml += `
            <li class="page-item ${activeClass}">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${i})">${i}</a>
            </li>
        `;
    }

    if (state.currentPage < totalPages) {
      paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${state.currentPage + 1})">التالي</a>
            </li>
        `;
    }

    paginationContainer.innerHTML = paginationHtml;
  }

  function changePostpaidSalesReportPage(page) {
    state.currentPage = page;
    displayPostpaidSalesReportTable(state.currentData);
    setupPostpaidSalesReportPagination(state.currentData);
  }

  return {
    displayPostpaidSalesReportResults,
    displayPostpaidSalesReportSummary,
    displayPostpaidSalesReportTable,
    setupPostpaidSalesReportPagination,
    changePostpaidSalesReportPage
  };
}

module.exports = {
  createPostpaidSalesReportRenderHelpers
};
