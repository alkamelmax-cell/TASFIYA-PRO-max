function createSavedReconciliationsRenderHandlers(context) {
  const doc = context.document;
  const formatDate = context.formatDate;
  const formatCurrency = context.formatCurrency;
  const state = context.state;

  function renderSavedRecPagination(totalRecords) {
    let paginationContainer = doc.getElementById('savedRecPaginationContainer');

    if (!doc.getElementById('saved-rec-pagination-styles')) {
      const style = doc.createElement('style');
      style.id = 'saved-rec-pagination-styles';
      style.textContent = `
            .saved-rec-pagination-wrapper {
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                margin-top: 20px;
            }
            .saved-rec-page-btn {
                padding: 10px 18px;
                margin: 0 4px;
                border: none;
                background: white;
                color: #495057;
                font-weight: 600;
                font-size: 14px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                min-width: 45px;
            }
            .saved-rec-page-btn:hover:not(:disabled) {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                transform: translateY(-3px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            .saved-rec-page-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
                transform: scale(1.05);
            }
            .saved-rec-page-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                background: #e9ecef;
            }
            .saved-rec-page-info {
                color: #495057;
                font-weight: 600;
                font-size: 15px;
                background: white;
                padding: 10px 20px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            }
        `;
      doc.head.appendChild(style);
    }

    if (!paginationContainer) {
      const section = doc.querySelector('#saved-reconciliations-section .card-body');
      if (!section) {
        return;
      }
      paginationContainer = doc.createElement('div');
      paginationContainer.id = 'savedRecPaginationContainer';
      section.appendChild(paginationContainer);
    }

    if (state.totalPages <= 1) {
      paginationContainer.innerHTML = `<div class="saved-rec-pagination-wrapper d-flex justify-content-center"><div class="saved-rec-page-info">المجموع: ${totalRecords} تصفية</div></div>`;
      return;
    }

    const start = (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, totalRecords);

    let html = `<div class="saved-rec-pagination-wrapper d-flex justify-content-between align-items-center">
        <div class="saved-rec-page-info">عرض ${start}-${end} من ${totalRecords} تصفية</div>
        <div class="d-flex align-items-center gap-2">
            <button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(1)" ${state.currentPage === 1 ? 'disabled' : ''} title="الصفحة الأولى">⏮</button>
            <button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''} title="السابق">❮</button>
    `;

    const maxVisible = 5;
    let startPage = Math.max(1, state.currentPage - 2);
    let endPage = Math.min(state.totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += '<button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(1)">1</button>';
      if (startPage > 2) {
        html += '<span style="color: #6c757d; font-weight: bold; padding: 0 8px;">...</span>';
      }
    }

    for (let i = startPage; i <= endPage; i += 1) {
      html += `<button class="saved-rec-page-btn ${i === state.currentPage ? 'active' : ''}" onclick="window.loadSavedReconciliations(${i})">${i}</button>`;
    }

    if (endPage < state.totalPages) {
      if (endPage < state.totalPages - 1) {
        html += '<span style="color: #6c757d; font-weight: bold; padding: 0 8px;">...</span>';
      }
      html += `<button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(${state.totalPages})">${state.totalPages}</button>`;
    }

    html += `
            <button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(${state.currentPage + 1})" ${state.currentPage === state.totalPages ? 'disabled' : ''} title="التالي">❯</button>
            <button class="saved-rec-page-btn" onclick="window.loadSavedReconciliations(${state.totalPages})" ${state.currentPage === state.totalPages ? 'disabled' : ''} title="الصفحة الأخيرة">⏭</button>
        </div>
    </div>`;

    paginationContainer.innerHTML = html;
  }

  function displaySavedReconciliations(reconciliations) {
    const tbody = doc.getElementById('savedReconciliationsTable');
    if (!tbody) {
      return;
    }
    tbody.innerHTML = '';

    reconciliations.forEach((reconciliation) => {
      const row = doc.createElement('tr');
      const statusClass = reconciliation.status === 'completed' ? 'bg-success' : 'bg-warning';
      const statusText = reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة';

      const surplusDeficitClass = reconciliation.surplus_deficit > 0 ? 'text-success'
        : reconciliation.surplus_deficit < 0 ? 'text-danger' : 'text-muted';

      const lastModified = reconciliation.last_modified_date
        ? formatDate(reconciliation.last_modified_date)
        : '<span class="text-muted">لم يتم التعديل</span>';

      row.innerHTML = `
            <td>${reconciliation.status === 'completed' && reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : '<span class="text-muted">مسودة</span>'}</td>
            <td>${reconciliation.branch_name || ''}</td>
            <td>${reconciliation.cashier_name} (${reconciliation.cashier_number})</td>
            <td>${reconciliation.accountant_name}</td>
            <td>${formatDate(reconciliation.reconciliation_date)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.total_receipts)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.system_sales)}</td>
            <td class="text-currency ${surplusDeficitClass}">${formatCurrency(reconciliation.surplus_deficit)}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${lastModified}</td>
            <td>
                <div class="btn-group saved-action-group" role="group">
                    <button class="btn btn-sm btn-primary" onclick="window.viewReconciliation(${reconciliation.id})" title="عرض التفاصيل">👁️ عرض</button>
                    <button class="btn btn-sm btn-warning" onclick="window.editReconciliationNew(${reconciliation.id})" title="تعديل التصفية">✏️ تعديل</button>
                </div>
                <div class="btn-group saved-action-group" role="group">
                    <button class="btn btn-sm btn-info" onclick="window.printSavedReconciliation(${reconciliation.id})" title="طباعة مع خيارات">🖨️ طباعة</button>
                    <button class="btn btn-sm btn-outline-info" onclick="window.quickPrintSavedReconciliation(${reconciliation.id})" title="طباعة سريعة">⚡ سريعة</button>
                    <button class="btn btn-sm btn-outline-info" onclick="window.generatePDFSavedReconciliation(${reconciliation.id})" title="تصدير PDF">📄 PDF</button>
                </div>
                <div class="btn-group saved-action-group" role="group">
                    <button class="btn btn-sm btn-success" onclick="window.thermalPreviewSavedReconciliation(${reconciliation.id})" title="معاينة الطباعة الحرارية">🔥 معاينة</button>
                    <button class="btn btn-sm btn-success" onclick="window.thermalPrintSavedReconciliation(${reconciliation.id})" title="طباعة حرارية">🔥 حرارية</button>
                </div>
                <button class="btn btn-sm btn-danger" onclick="window.deleteReconciliation(${reconciliation.id})" title="حذف التصفية">🗑️ حذف</button>
            </td>
        `;
      tbody.appendChild(row);
    });
  }

  return {
    renderSavedRecPagination,
    displaySavedReconciliations
  };
}

module.exports = {
  createSavedReconciliationsRenderHandlers
};
