const { getSelectedFiscalYear, getFiscalYearDateRange } = require('./fiscal-year');

function createReconciliationListHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const formatCurrency = deps.formatCurrency;
  const dialogUtils = deps.dialogUtils;
  const onRecall = deps.onRecall;
  const logger = deps.logger || console;

  const state = {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    selectedReconciliationId: null
  };
  let searchDebounceTimer = null;

  function getRowReconciliationId(row) {
    if (!row) {
      return 0;
    }

    const datasetValue = row.dataset ? row.dataset.reconciliationId : undefined;
    if (datasetValue != null && datasetValue !== '') {
      return Number(datasetValue) || 0;
    }

    if (typeof row.getAttribute === 'function') {
      return Number(row.getAttribute('data-reconciliation-id')) || 0;
    }

    return 0;
  }

  function setRowReconciliationId(row, reconciliationId) {
    if (!row) {
      return;
    }

    const value = String(reconciliationId);
    if (row.dataset && typeof row.dataset === 'object') {
      row.dataset.reconciliationId = value;
    } else {
      row.dataset = { reconciliationId: value };
    }

    if (typeof row.setAttribute === 'function') {
      row.setAttribute('data-reconciliation-id', value);
    }
  }

  function getRows() {
    return Array.from(doc.querySelectorAll('#reconciliationsListTable tbody tr') || []);
  }

  function getVisibleRows() {
    return getRows().filter((row) => row.style.display !== 'none');
  }

  function updateSelectedRowVisualState() {
    const selectedId = Number(state.selectedReconciliationId || 0);
    getRows().forEach((row) => {
      const rowId = getRowReconciliationId(row);
      const isSelected = selectedId > 0 && rowId === selectedId;
      if (row.classList && typeof row.classList.toggle === 'function') {
        row.classList.toggle('rec-list-row-selected', isSelected);
      }
      if (typeof row.setAttribute === 'function') {
        row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      } else {
        row.ariaSelected = isSelected ? 'true' : 'false';
      }
    });
  }

  function setSelectedRow(reconciliationId) {
    const parsed = Number.parseInt(reconciliationId, 10);
    state.selectedReconciliationId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    updateSelectedRowVisualState();
  }

  function syncSelectionWithVisibleRows() {
    const visibleRows = getVisibleRows();
    if (visibleRows.length === 0) {
      state.selectedReconciliationId = null;
      updateSelectedRowVisualState();
      return;
    }

    const hasSelectedVisible = visibleRows.some((row) =>
      getRowReconciliationId(row) === Number(state.selectedReconciliationId || 0)
    );
    if (!hasSelectedVisible) {
      setSelectedRow(getRowReconciliationId(visibleRows[0]));
      return;
    }

    updateSelectedRowVisualState();
  }

  function recallSelectedReconciliation() {
    const visibleRows = getVisibleRows();
    if (visibleRows.length === 0) {
      if (typeof dialogUtils.showInfo === 'function') {
        dialogUtils.showInfo('لا توجد نتائج متاحة للاستدعاء', 'قائمة التصفيات');
      } else if (typeof dialogUtils.showValidationError === 'function') {
        dialogUtils.showValidationError('لا توجد نتائج متاحة للاستدعاء');
      }
      return;
    }

    const selectedId = Number(state.selectedReconciliationId || 0);
    const selectedRow = visibleRows.find((row) => getRowReconciliationId(row) === selectedId);
    if (selectedRow) {
      onRecall(selectedId);
      return;
    }

    const fallbackId = getRowReconciliationId(visibleRows[0]);
    if (fallbackId > 0) {
      setSelectedRow(fallbackId);
      onRecall(fallbackId);
    }
  }

  async function loadReconciliationsList(page = 1) {
    const validPage = parseInt(page, 10) || 1;
    const searchInput = doc.getElementById('reconciliationSearchInput');
    const searchTerm = (searchInput?.value || '').trim();
    const isSearchMode = searchTerm.length > 0;
    const fiscalYearRange = getFiscalYearDateRange(getSelectedFiscalYear());

    logger.log(
      `📋 [LIST] تحميل قائمة التصفيات - الصفحة ${validPage}${isSearchMode ? ` (بحث: ${searchTerm})` : ''}...`
    );
    const table = doc.getElementById('reconciliationsListTable');
    const tbody = table?.querySelector('tbody');
    if (!tbody) {
      return;
    }

    try {
      const fromJoinSql = `
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            LEFT JOIN branches b ON c.branch_id = b.id
      `;

      const orderBySql = `
            ORDER BY
              CASE
                WHEN r.reconciliation_number IS NOT NULL
                     AND TRIM(r.reconciliation_number) != ''
                     AND r.reconciliation_number GLOB '[0-9]*'
                THEN CAST(r.reconciliation_number AS INTEGER)
                ELSE r.id
              END DESC,
              r.id DESC
      `;

      let totalRecords = 0;
      let reconciliations = [];
      const searchLike = `%${searchTerm}%`;
      const numericSearch = /^\d+$/.test(searchTerm) ? parseInt(searchTerm, 10) : null;
      let searchWhereSql = '';
      const searchParams = [];
      let yearWhereSql = '';
      const yearParams = [];

      if (isSearchMode) {
        searchWhereSql = `
              WHERE (
                c.name LIKE ?
                OR c.cashier_number LIKE ?
                OR a.name LIKE ?
                OR b.branch_name LIKE ?
                OR r.reconciliation_date LIKE ?
                OR CAST(COALESCE(r.reconciliation_number, '') AS TEXT) LIKE ?
                ${numericSearch !== null ? 'OR r.reconciliation_number = ?' : ''}
              )
        `;
        searchParams.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
        if (numericSearch !== null) {
          searchParams.push(numericSearch);
        }
      }

      if (fiscalYearRange) {
        yearWhereSql = 'DATE(r.reconciliation_date) BETWEEN ? AND ?';
        yearParams.push(fiscalYearRange.from, fiscalYearRange.to);
      }

      if (yearWhereSql) {
        if (searchWhereSql) {
          searchWhereSql += ` AND ${yearWhereSql}`;
        } else {
          searchWhereSql = ` WHERE ${yearWhereSql}`;
        }
        searchParams.push(...yearParams);
      }

      const countResult = await ipc.invoke('db-query', `
            SELECT COUNT(*) as total
            ${fromJoinSql}
            ${searchWhereSql}
        `, searchParams);
      totalRecords = Number(countResult?.[0]?.total || 0);
      state.totalPages = Math.max(1, Math.ceil(totalRecords / state.pageSize));
      state.currentPage = Math.min(Math.max(1, validPage), state.totalPages);

      const offset = (state.currentPage - 1) * state.pageSize;
      const limitValue = parseInt(state.pageSize, 10) || 50;
      const offsetValue = parseInt(offset, 10) || 0;

      if (totalRecords > 0) {
        reconciliations = await ipc.invoke('db-query', `
              SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
              ${fromJoinSql}
              ${searchWhereSql}
              ${orderBySql}
              LIMIT ${limitValue} OFFSET ${offsetValue}
          `, searchParams);
      }

      tbody.innerHTML = '';
      reconciliations.forEach((rec) => {
        const row = doc.createElement('tr');
        const statusClass = rec.status === 'completed' ? 'bg-success' : 'bg-warning';
        const statusText = rec.status === 'completed' ? 'مكتملة' : 'مسودة';
        setRowReconciliationId(row, rec.id);
        if (typeof row.setAttribute === 'function') {
          row.setAttribute('tabindex', '0');
        }

        row.innerHTML = `
                <td>${rec.reconciliation_number || 'مسودة'}</td>
                <td>${formatDate(rec.reconciliation_date)}</td>
                <td>${rec.branch_name || 'غير محدد'}</td>
                <td>${rec.cashier_name} (${rec.cashier_number})</td>
                <td>${rec.accountant_name || 'غير محدد'}</td>
                <td>${formatCurrency(rec.total_receipts || 0)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                  <button type="button" class="btn btn-sm btn-primary rec-list-recall-btn">
                    استدعاء
                  </button>
                </td>
            `;

        row.style.cursor = 'pointer';
        row.title = 'انقر مرة للتحديد، نقراً مزدوجاً للاستدعاء، أو استخدم زر استدعاء';
        row.addEventListener('click', () => setSelectedRow(rec.id));
        row.addEventListener('dblclick', () => {
          setSelectedRow(rec.id);
          onRecall(rec.id);
        });
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            onRecall(rec.id);
          }
        });

        const recallButton = row.querySelector('.rec-list-recall-btn');
        if (recallButton) {
          recallButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedRow(rec.id);
            onRecall(rec.id);
          });
        }
        tbody.appendChild(row);
      });

      syncSelectionWithVisibleRows();
      renderRecListPagination(totalRecords, { isSearchMode, searchTerm });
      logger.log(`✅ [LIST] تم تحميل ${reconciliations.length} تصفية (${totalRecords} إجمالي)`);
    } catch (error) {
      logger.error('❌ [LIST] خطأ في تحميل قائمة التصفيات:', error);
      dialogUtils.showError('حدث خطأ أثناء تحميل قائمة التصفيات', 'خطأ');
    }
  }

  function renderRecListPagination(totalRecords, options = {}) {
    const isSearchMode = options.isSearchMode === true;
    const searchTerm = options.searchTerm || '';
    let paginationContainer = doc.getElementById('recListPaginationContainer');
    if (!paginationContainer) {
      const modal = doc.getElementById('reconciliationListModal');
      const modalBody = modal?.querySelector('.modal-body');
      if (!modalBody) {
        return;
      }
      paginationContainer = doc.createElement('div');
      paginationContainer.id = 'recListPaginationContainer';
      paginationContainer.className = 'rec-list-pagination-container';
      modalBody.appendChild(paginationContainer);
    }

    if (state.totalPages <= 1) {
      paginationContainer.innerHTML = `
        <div class="rec-list-pagination-summary">
          ${isSearchMode ? `نتائج البحث: ${totalRecords}${searchTerm ? ` لـ "${searchTerm}"` : ''}` : `المجموع: ${totalRecords} تصفية`}
        </div>
      `;
      return;
    }

    const start = (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, totalRecords);
    let html = `
        <div class="rec-list-pagination-bar">
          <div class="rec-list-pagination-meta">عرض ${start}-${end} من ${totalRecords}${isSearchMode ? ' (بحث)' : ''}</div>
          <div class="rec-list-pagination-buttons">
            <button class="rec-list-page-btn" onclick="loadReconciliationsList(1)" ${state.currentPage === 1 ? 'disabled' : ''} title="الأولى">«</button>
            <button class="rec-list-page-btn" onclick="loadReconciliationsList(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''} title="السابق">‹</button>
    `;

    const maxVisible = 5;
    const startPage = Math.max(1, state.currentPage - 2);
    const endPage = Math.min(state.totalPages, startPage + maxVisible - 1);
    for (let i = startPage; i <= endPage; i += 1) {
      html += `<button class="rec-list-page-btn ${i === state.currentPage ? 'active' : ''}" onclick="loadReconciliationsList(${i})">${i}</button>`;
    }

    html += `
            <button class="rec-list-page-btn" onclick="loadReconciliationsList(${state.currentPage + 1})" ${state.currentPage === state.totalPages ? 'disabled' : ''} title="التالي">›</button>
            <button class="rec-list-page-btn" onclick="loadReconciliationsList(${state.totalPages})" ${state.currentPage === state.totalPages ? 'disabled' : ''} title="الأخيرة">»</button>
          </div>
        </div>
    `;

    paginationContainer.innerHTML = html;
  }

  function filterReconciliationsList() {
    const searchInput = doc.getElementById('reconciliationSearchInput');
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const rows = getRows();

    // Apply immediate client-side filtering for responsive UX while typing.
    rows.forEach((row) => {
      const rowText = (row.textContent || '').toLowerCase();
      row.style.display = rowText.includes(searchTerm) ? '' : 'none';
    });
    syncSelectionWithVisibleRows();

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      loadReconciliationsList(1);
    }, 250);
  }

  function initializeReconciliationsListModal() {
    const modal = doc.getElementById('reconciliationListModal');
    if (modal) {
      modal.addEventListener('show.bs.modal', () => {
        loadReconciliationsList(1);
      });
      modal.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          recallSelectedReconciliation();
        }
      });
    }

    const searchInput = doc.getElementById('reconciliationSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', filterReconciliationsList);
    }

    const clearSearchButton = doc.getElementById('clearReconciliationSearchBtn');
    if (clearSearchButton && searchInput) {
      clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        loadReconciliationsList(1);
        searchInput.focus();
      });
    }
  }

  return {
    loadReconciliationsList,
    renderRecListPagination,
    filterReconciliationsList,
    initializeReconciliationsListModal
  };
}

module.exports = {
  createReconciliationListHandlers
};
