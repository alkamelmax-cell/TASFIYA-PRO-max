function createEditTablePopulators(deps) {
  const document = deps.document;
  const formatCurrency = deps.formatCurrency;
  const addEditButtonListeners = deps.addEditButtonListeners;
  const updateEditTotals = deps.updateEditTotals;
  const logger = deps.logger || console;

  function isRecordModified(record) {
    return record?.is_modified === 1 || record?.is_modified === '1' || record?.is_modified === true;
  }

  function getRecordStatusMarkup(record) {
    if (isRecordModified(record)) {
      return '<span class="badge bg-info edit-modified-badge">تم تعديلها</span>';
    }

    return '<span class="text-muted small">-</span>';
  }

  function applyModifiedRowClass(row, record) {
    if (isRecordModified(record)) {
      row.classList.add('modified-row');
    }
  }

  function populateEditBankReceiptsTable(bankReceipts) {
    const tableBody = document.getElementById('editBankReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    const rowsWithMissingFields = bankReceipts.filter((receipt) =>
      !receipt.operation_type || !receipt.atm_id
    );

    const tableHeader = document.querySelector('#editBankReceiptsTableContainer .card-header h5');
    if (tableHeader) {
      const existingBadge = tableHeader.querySelector('.badge.bg-warning');
      if (existingBadge) {
        existingBadge.remove();
      }

      if (rowsWithMissingFields.length > 0) {
        tableHeader.innerHTML = `
                ${tableHeader.innerHTML}
                <span class="badge bg-warning ms-2">⚠️ ${rowsWithMissingFields.length} سجلات تحتاج تعديلاً</span>
            `;
      }
    }

    bankReceipts.forEach((receipt, index) => {
      if (!receipt.operation_type || !receipt.atm_id) {
        logger.warn('⚠️ [POPULATE] Bank receipt missing required fields:', receipt);

        const missingFields = [];
        if (!receipt.operation_type) missingFields.push('operation_type');
        if (!receipt.atm_id) missingFields.push('atm_id');

        logger.warn('⚠️ [POPULATE] Missing fields:', missingFields);

        if (!receipt.operation_type) {
          receipt.operation_type = 'مدى';
          logger.log(`✅ [POPULATE] Set default operation_type to ${receipt.operation_type}`);
        }
        if (!receipt.atm_id) {
          receipt.atm_id = 1;
          logger.log(`✅ [POPULATE] Set default atm_id to ${receipt.atm_id}`);
        }
      }

      const row = document.createElement('tr');

      if (!receipt.operation_type || !receipt.atm_id) {
        row.classList.add('warning-row');

        const missingFields = [];
        if (!receipt.operation_type) {
          missingFields.push('نوع العملية');
          receipt.operation_type = 'مدى';
          logger.log(`✅ [POPULATE] Set default operation_type to ${receipt.operation_type}`);
        }
        if (!receipt.atm_id) {
          missingFields.push('معرف الصراف الآلي');
          receipt.atm_id = 1;
          logger.log(`✅ [POPULATE] Set default atm_id to ${receipt.atm_id}`);
        }

        row.title = `تم تعيين قيم افتراضية للحقول المفقودة: ${missingFields.join(', ')}. يرجى تعديل السجل لضمان الدقة.`;
      }

      row.innerHTML = `
            <td>${receipt.operation_type || ''}</td>
            <td>${receipt.atm_name || ''}</td>
            <td>${receipt.bank_name || ''}</td>
            <td>${formatCurrency(receipt.amount)}</td>
            <td>${getRecordStatusMarkup(receipt)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="bankReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="bankReceipt" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, receipt);
      tableBody.appendChild(row);
      total += parseFloat(receipt.amount || 0);
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editBankReceiptsTotal').textContent = formatCurrency(total);
    updateEditTotals();
  }

  function populateEditCashReceiptsTable(cashReceipts) {
    const tableBody = document.getElementById('editCashReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    cashReceipts.forEach((receipt, index) => {
      const row = document.createElement('tr');
      const totalAmount = parseFloat(receipt.total_amount || 0);
      row.innerHTML = `
            <td>${receipt.denomination || ''} ريال</td>
            <td>${receipt.quantity || 0}</td>
            <td>${formatCurrency(totalAmount)}</td>
            <td>${getRecordStatusMarkup(receipt)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="cashReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="cashReceipt" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, receipt);
      tableBody.appendChild(row);
      total += totalAmount;
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editCashReceiptsTotal').textContent = formatCurrency(total);
    updateEditTotals();
  }

  function populateEditPostpaidSalesTable(postpaidSales) {
    const tableBody = document.getElementById('editPostpaidSalesTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    postpaidSales.forEach((sale, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
            <td>${sale.customer_name || ''}</td>
            <td>${formatCurrency(sale.amount)}</td>
            <td>${getRecordStatusMarkup(sale)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="postpaidSale" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="postpaidSale" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, sale);
      tableBody.appendChild(row);
      total += parseFloat(sale.amount || 0);
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editPostpaidSalesTotal').textContent = formatCurrency(total);
    updateEditTotals();
  }

  function populateEditCustomerReceiptsTable(customerReceipts) {
    const tableBody = document.getElementById('editCustomerReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    customerReceipts.forEach((receipt, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
            <td>${receipt.customer_name || ''}</td>
            <td>${formatCurrency(receipt.amount)}</td>
            <td>${receipt.payment_type || ''}</td>
            <td>${getRecordStatusMarkup(receipt)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="customerReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="customerReceipt" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, receipt);
      tableBody.appendChild(row);
      total += parseFloat(receipt.amount || 0);
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editCustomerReceiptsTotal').textContent = formatCurrency(total);
    updateEditTotals();
  }

  function populateEditReturnInvoicesTable(returnInvoices) {
    const tableBody = document.getElementById('editReturnInvoicesTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    returnInvoices.forEach((invoice, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
            <td>${invoice.invoice_number || ''}</td>
            <td>${formatCurrency(invoice.amount)}</td>
            <td>${getRecordStatusMarkup(invoice)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="returnInvoice" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="returnInvoice" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, invoice);
      tableBody.appendChild(row);
      total += parseFloat(invoice.amount || 0);
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editReturnInvoicesTotal').textContent = formatCurrency(total);
    updateEditTotals();
  }

  function populateEditSuppliersTable(suppliers) {
    const tableBody = document.getElementById('editSuppliersTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    suppliers.forEach((supplier, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
            <td>${supplier.supplier_name || ''}</td>
            <td>${formatCurrency(supplier.amount)}</td>
            <td>${getRecordStatusMarkup(supplier)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="supplier" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="supplier" data-index="${index}">حذف</button>
            </td>
        `;
      applyModifiedRowClass(row, supplier);
      tableBody.appendChild(row);
      total += parseFloat(supplier.amount || 0);
    });

    addEditButtonListeners(tableBody);
    document.getElementById('editSuppliersTotal').textContent = formatCurrency(total);
  }

  return {
    populateEditBankReceiptsTable,
    populateEditCashReceiptsTable,
    populateEditPostpaidSalesTable,
    populateEditCustomerReceiptsTable,
    populateEditReturnInvoicesTable,
    populateEditSuppliersTable
  };
}

module.exports = {
  createEditTablePopulators
};
