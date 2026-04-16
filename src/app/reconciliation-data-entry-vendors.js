const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationDataEntryVendorsHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const DialogUtils = context.DialogUtils;
  const formNavigation = context.formNavigation;
  const formatCurrency = context.formatCurrency;
  const logger = context.logger || console;
  const ensureCurrentReconciliation = context.ensureCurrentReconciliation;
  const getArraySafe = context.getArraySafe;
  const setArray = context.setArray;
  const isExistingSupplier = context.isExistingSupplier;
  const isExistingSupplierInBranch = context.isExistingSupplierInBranch || isExistingSupplier;
  const resolveReconciliationBranchId = context.resolveReconciliationBranchId || (async () => null);
  const getReturnInvoices = context.getReturnInvoices;
  const setReturnInvoices = context.setReturnInvoices;
  const getSuppliers = context.getSuppliers;
  const setSuppliers = context.setSuppliers;
  const updateSummary = context.updateSummary;
  let editingReturnInvoiceIndex = -1;
  let editingSupplierIndex = -1;

  function setEditModeState(submitBtnId, cancelBtnId, isEditing) {
    const submitBtn = document.getElementById(submitBtnId);
    const cancelBtn = document.getElementById(cancelBtnId);

    if (submitBtn) {
      submitBtn.textContent = isEditing ? 'حفظ التعديل' : 'إضافة';
    }

    if (cancelBtn) {
      cancelBtn.classList.toggle('d-none', !isEditing);
    }
  }

  function resetReturnInvoiceEditMode(options = {}) {
    editingReturnInvoiceIndex = -1;
    setEditModeState('returnInvoiceSubmitBtn', 'cancelReturnInvoiceEditBtn', false);

    const form = document.getElementById('returnInvoiceForm');
    if (form) {
      form.reset();
    }

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#returnInvoiceForm');
    }
  }

  function resetSupplierEditMode(options = {}) {
    editingSupplierIndex = -1;
    setEditModeState('supplierSubmitBtn', 'cancelSupplierEditBtn', false);

    const form = document.getElementById('supplierForm');
    if (form) {
      form.reset();
    }

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#supplierForm');
    }
  }

  async function handleReturnInvoice(event) {
    event.preventDefault();

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) return;

    const invoiceNumber = document.getElementById('invoiceNumber').value.trim();
    const amount = parseFloat(document.getElementById('returnAmount').value);

    if (!invoiceNumber || !amount || amount <= 0) {
      DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }

    try {
      const returnInvoices = getArraySafe(getReturnInvoices);

      if (editingReturnInvoiceIndex >= 0) {
        const existingInvoice = returnInvoices[editingReturnInvoiceIndex];
        if (!existingInvoice) {
          resetReturnInvoiceEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        await ipcRenderer.invoke(
          'db-run',
          'UPDATE return_invoices SET invoice_number = ?, amount = ? WHERE id = ?',
          [invoiceNumber, amount, existingInvoice.id]
        );

        const nextItems = [...returnInvoices];
        nextItems[editingReturnInvoiceIndex] = {
          ...existingInvoice,
          invoice_number: invoiceNumber,
          amount
        };

        setArray(setReturnInvoices, getReturnInvoices, nextItems);
        updateReturnInvoicesTable();
        resetReturnInvoiceEditMode();
        logger.log('Return invoice updated:', existingInvoice.id);
        return;
      }

      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount) VALUES (?, ?, ?)',
        [currentReconciliation.id, invoiceNumber, amount]
      );

      setArray(setReturnInvoices, getReturnInvoices, [
        ...returnInvoices,
        {
          id: result.lastInsertRowid,
          invoice_number: invoiceNumber,
          amount
        }
      ]);

      updateReturnInvoicesTable();
      document.getElementById('returnInvoiceForm').reset();
      formNavigation.focusFirstField('#returnInvoiceForm');

      logger.log('Return invoice added');
    } catch (error) {
      logger.error('Error adding return invoice:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'return_invoice',
          fallback: 'حدث خطأ أثناء إضافة فاتورة المرتجع.'
        })
      );
    }
  }

  function updateReturnInvoicesTable() {
    const tbody = document.getElementById('returnInvoicesTable');
    const totalElement = document.getElementById('returnInvoicesTotal');

    tbody.innerHTML = '';

    let total = 0;

    getArraySafe(getReturnInvoices).forEach((invoice, index) => {
      const row = document.createElement('tr');
      if (index === editingReturnInvoiceIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${invoice.invoice_number}</td>
            <td class="text-currency">${formatCurrency(invoice.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editReturnInvoice(${index})">
                    تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removeReturnInvoice(${index})">
                    حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += invoice.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();

    if (editingReturnInvoiceIndex >= getArraySafe(getReturnInvoices).length) {
      resetReturnInvoiceEditMode({ skipFocus: true });
    }
  }

  function editReturnInvoice(index) {
    const returnInvoices = getArraySafe(getReturnInvoices);
    const invoice = returnInvoices[index];
    if (!invoice) {
      DialogUtils.showErrorToast('تعذر تحميل بيانات الفاتورة للتعديل');
      return;
    }

    editingReturnInvoiceIndex = index;

    const invoiceNumberEl = document.getElementById('invoiceNumber');
    const amountEl = document.getElementById('returnAmount');

    if (invoiceNumberEl) {
      invoiceNumberEl.value = invoice.invoice_number || '';
    }

    if (amountEl) {
      amountEl.value = invoice.amount;
    }

    setEditModeState('returnInvoiceSubmitBtn', 'cancelReturnInvoiceEditBtn', true);
    formNavigation.focusFirstField('#returnInvoiceForm');
  }

  async function removeReturnInvoice(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'الفاتورة');
    if (!confirmed) return;

    try {
      const returnInvoices = getArraySafe(getReturnInvoices);
      const invoice = returnInvoices[index];
      if (!invoice) return;

      await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE id = ?', [invoice.id]);

      const nextItems = [...returnInvoices];
      nextItems.splice(index, 1);
      setArray(setReturnInvoices, getReturnInvoices, nextItems);

      if (editingReturnInvoiceIndex === index) {
        resetReturnInvoiceEditMode({ skipFocus: true });
      } else if (editingReturnInvoiceIndex > index) {
        editingReturnInvoiceIndex -= 1;
      }

      updateReturnInvoicesTable();

      logger.log('Return invoice removed');
    } catch (error) {
      logger.error('Error removing return invoice:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'return_invoice',
          fallback: 'حدث خطأ أثناء حذف الفاتورة.'
        })
      );
    }
  }

  async function handleSupplier(event) {
    event.preventDefault();

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) return;

    const supplierName = document.getElementById('supplierMainName').value.trim();
    const amountInput = document.getElementById('supplierMainAmount').value.trim();

    if (!supplierName) {
      DialogUtils.showValidationError('يرجى إدخال اسم المورد');
      return;
    }

    if (!amountInput) {
      DialogUtils.showValidationError('يرجى إدخال المبلغ');
      return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      DialogUtils.showValidationError('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    const branchId = await resolveReconciliationBranchId(currentReconciliation);
    const supplierExists = await isExistingSupplierInBranch(supplierName, branchId);
    if (!supplierExists) {
      const confirmationMessage = branchId
        ? `المورد "${supplierName}" غير موجود مسبقاً في هذا الفرع. هل أنت متأكد من إضافته؟`
        : `المورد "${supplierName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`;
      const confirmed = await DialogUtils.showConfirm(
        confirmationMessage,
        'مورد جديد'
      );
      if (!confirmed) return;
    }

    try {
      const suppliers = getArraySafe(getSuppliers);
      if (editingSupplierIndex >= 0) {
        const existingSupplier = suppliers[editingSupplierIndex];
        if (!existingSupplier) {
          resetSupplierEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        await ipcRenderer.invoke(
          'db-run',
          'UPDATE suppliers SET supplier_name = ?, amount = ? WHERE id = ?',
          [supplierName, amount, existingSupplier.id]
        );

        const nextItems = [...suppliers];
        nextItems[editingSupplierIndex] = {
          ...existingSupplier,
          supplier_name: supplierName,
          amount
        };

        setArray(setSuppliers, getSuppliers, nextItems);
        updateSuppliersTable();
        resetSupplierEditMode();

        logger.log('Supplier updated successfully:', existingSupplier.id);
        DialogUtils.showSuccessToast('تم تحديث المورد بنجاح');
        return;
      }

      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO suppliers (reconciliation_id, supplier_name, amount) VALUES (?, ?, ?)',
        [currentReconciliation.id, supplierName, amount]
      );

      setArray(setSuppliers, getSuppliers, [
        ...suppliers,
        {
          id: result.lastInsertRowid,
          supplier_name: supplierName,
          amount
        }
      ]);

      updateSuppliersTable();
      document.getElementById('supplierForm').reset();
      formNavigation.focusFirstField('#supplierForm');

      logger.log('Supplier added successfully');
      DialogUtils.showSuccessToast('تم إضافة المورد بنجاح');
    } catch (error) {
      logger.error('Error adding supplier:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'supplier',
          fallback: 'حدث خطأ أثناء إضافة المورد.'
        })
      );
    }
  }

  function updateSuppliersTable() {
    const tbody = document.getElementById('suppliersTable');
    const totalElement = document.getElementById('suppliersTotal');

    if (!tbody || !totalElement) {
      logger.error('Suppliers table elements not found');
      return;
    }

    tbody.innerHTML = '';

    let total = 0;

    getArraySafe(getSuppliers).forEach((supplier, index) => {
      const supplierAmount = parseFloat(supplier.amount) || 0;
      const row = document.createElement('tr');
      if (index === editingSupplierIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${supplier.supplier_name}</td>
            <td class="text-currency">${formatCurrency(supplierAmount)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editSupplier(${index})">
                    تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removeSupplier(${index})">
                    حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += supplierAmount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();

    if (editingSupplierIndex >= getArraySafe(getSuppliers).length) {
      resetSupplierEditMode({ skipFocus: true });
    }
  }

  function editSupplier(index) {
    const suppliers = getArraySafe(getSuppliers);
    const supplier = suppliers[index];
    if (!supplier) {
      DialogUtils.showErrorToast('تعذر تحميل بيانات المورد للتعديل');
      return;
    }

    editingSupplierIndex = index;

    const supplierNameEl = document.getElementById('supplierMainName');
    const supplierAmountEl = document.getElementById('supplierMainAmount');

    if (supplierNameEl) {
      supplierNameEl.value = supplier.supplier_name || '';
    }

    if (supplierAmountEl) {
      supplierAmountEl.value = supplier.amount;
    }

    setEditModeState('supplierSubmitBtn', 'cancelSupplierEditBtn', true);
    formNavigation.focusFirstField('#supplierForm');
  }

  async function removeSupplier(index) {
    const suppliers = getArraySafe(getSuppliers);
    if (index < 0 || index >= suppliers.length) {
      logger.error('Invalid supplier index:', index);
      DialogUtils.showErrorToast('خطأ في تحديد المورد المراد حذفه');
      return;
    }

    const supplier = suppliers[index];
    const confirmed = await DialogUtils.showDeleteConfirm(supplier.supplier_name, 'المورد');

    if (!confirmed) return;

    try {
      await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE id = ?', [supplier.id]);

      const nextItems = [...suppliers];
      nextItems.splice(index, 1);
      setArray(setSuppliers, getSuppliers, nextItems);

      if (editingSupplierIndex === index) {
        resetSupplierEditMode({ skipFocus: true });
      } else if (editingSupplierIndex > index) {
        editingSupplierIndex -= 1;
      }

      updateSuppliersTable();

      logger.log('Supplier removed successfully');
      DialogUtils.showSuccessToast('تم حذف المورد بنجاح');
    } catch (error) {
      logger.error('Error removing supplier:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'supplier',
          fallback: 'حدث خطأ أثناء حذف المورد.'
        })
      );
    }
  }

  return {
    handleReturnInvoice,
    updateReturnInvoicesTable,
    editReturnInvoice,
    removeReturnInvoice,
    cancelReturnInvoiceEdit: resetReturnInvoiceEditMode,
    handleSupplier,
    updateSuppliersTable,
    editSupplier,
    removeSupplier,
    cancelSupplierEdit: resetSupplierEditMode
  };
}

module.exports = {
  createReconciliationDataEntryVendorsHandlers
};
