const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationDataEntryPostpaidHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const DialogUtils = context.DialogUtils;
  const formNavigation = context.formNavigation;
  const formatCurrency = context.formatCurrency;
  const updateSummary = context.updateSummary;
  const logger = context.logger || console;
  const ensureCurrentReconciliation = context.ensureCurrentReconciliation;
  const getArraySafe = context.getArraySafe;
  const setArray = context.setArray;
  const isExistingCustomer = context.isExistingCustomer;
  const isExistingCustomerInBranch = context.isExistingCustomerInBranch || isExistingCustomer;
  const resolveReconciliationBranchId = context.resolveReconciliationBranchId || (async () => null);
  const getPostpaidSales = context.getPostpaidSales;
  const setPostpaidSales = context.setPostpaidSales;
  let editingPostpaidSaleIndex = -1;

  function setEditModeState(isEditing) {
    const submitBtn = document.getElementById('postpaidSaleSubmitBtn');
    const cancelBtn = document.getElementById('cancelPostpaidSaleEditBtn');

    if (submitBtn) {
      submitBtn.textContent = isEditing ? 'حفظ التعديل' : 'إضافة';
    }

    if (cancelBtn) {
      cancelBtn.classList.toggle('d-none', !isEditing);
    }
  }

  function resetPostpaidEditMode(options = {}) {
    editingPostpaidSaleIndex = -1;
    setEditModeState(false);

    const form = document.getElementById('postpaidSaleForm');
    if (form) {
      form.reset();
    }

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#postpaidSaleForm');
    }
  }

  async function handlePostpaidSale(event) {
    event.preventDefault();

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) return;

    const customerName = document.getElementById('customerName').value.trim();
    const amount = parseFloat(document.getElementById('postpaidAmount').value);

    if (!customerName || !amount || amount <= 0) {
      DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }

    const branchId = await resolveReconciliationBranchId(currentReconciliation);
    const existingCustomer = await isExistingCustomerInBranch(customerName, branchId);
    if (!existingCustomer) {
      const confirmationMessage = branchId
        ? `العميل "${customerName}" غير موجود مسبقاً في هذا الفرع. هل أنت متأكد من إضافته؟`
        : `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`;
      const confirmed = await DialogUtils.showConfirm(
        confirmationMessage,
        'عميل جديد'
      );
      if (!confirmed) return;
    }

    try {
      const postpaidSales = getArraySafe(getPostpaidSales);
      if (editingPostpaidSaleIndex >= 0) {
        const existingSale = postpaidSales[editingPostpaidSaleIndex];
        if (!existingSale) {
          resetPostpaidEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        await ipcRenderer.invoke(
          'db-run',
          'UPDATE postpaid_sales SET customer_name = ?, amount = ? WHERE id = ?',
          [customerName, amount, existingSale.id]
        );

        const nextItems = [...postpaidSales];
        nextItems[editingPostpaidSaleIndex] = {
          ...existingSale,
          customer_name: customerName,
          amount
        };

        setArray(setPostpaidSales, getPostpaidSales, nextItems);
        updatePostpaidSalesTable();
        resetPostpaidEditMode();
        logger.log('Postpaid sale updated:', existingSale.id);
        return;
      }

      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount) VALUES (?, ?, ?)',
        [currentReconciliation.id, customerName, amount]
      );

      setArray(setPostpaidSales, getPostpaidSales, [
        ...postpaidSales,
        {
          id: result.lastInsertRowid,
          customer_name: customerName,
          amount
        }
      ]);

      updatePostpaidSalesTable();
      document.getElementById('postpaidSaleForm').reset();
      formNavigation.focusFirstField('#postpaidSaleForm');

      logger.log('Postpaid sale added');
    } catch (error) {
      logger.error('Error adding postpaid sale:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'postpaid_sale',
          fallback: 'حدث خطأ أثناء إضافة المبيعة الآجلة.'
        })
      );
    }
  }

  function updatePostpaidSalesTable() {
    const tbody = document.getElementById('postpaidSalesTable');
    const totalElement = document.getElementById('postpaidSalesTotal');

    tbody.innerHTML = '';

    let total = 0;

    getArraySafe(getPostpaidSales).forEach((sale, index) => {
      const row = document.createElement('tr');
      if (index === editingPostpaidSaleIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${sale.customer_name}</td>
            <td class="text-currency">${formatCurrency(sale.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editPostpaidSale(${index})">
                    تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removePostpaidSale(${index})">
                    حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += sale.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();

    if (editingPostpaidSaleIndex >= getArraySafe(getPostpaidSales).length) {
      resetPostpaidEditMode({ skipFocus: true });
    }
  }

  function editPostpaidSale(index) {
    const postpaidSales = getArraySafe(getPostpaidSales);
    const sale = postpaidSales[index];
    if (!sale) {
      DialogUtils.showErrorToast('تعذر تحميل بيانات المبيعة للتعديل');
      return;
    }

    editingPostpaidSaleIndex = index;

    const customerNameEl = document.getElementById('customerName');
    const amountEl = document.getElementById('postpaidAmount');

    if (customerNameEl) {
      customerNameEl.value = sale.customer_name || '';
    }

    if (amountEl) {
      amountEl.value = sale.amount;
    }

    setEditModeState(true);
    formNavigation.focusFirstField('#postpaidSaleForm');
  }

  async function removePostpaidSale(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المبيعة');
    if (!confirmed) return;

    try {
      const postpaidSales = getArraySafe(getPostpaidSales);
      const sale = postpaidSales[index];
      if (!sale) return;

      await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE id = ?', [sale.id]);

      const nextItems = [...postpaidSales];
      nextItems.splice(index, 1);
      setArray(setPostpaidSales, getPostpaidSales, nextItems);

      if (editingPostpaidSaleIndex === index) {
        resetPostpaidEditMode({ skipFocus: true });
      } else if (editingPostpaidSaleIndex > index) {
        editingPostpaidSaleIndex -= 1;
      }

      updatePostpaidSalesTable();

      logger.log('Postpaid sale removed');
    } catch (error) {
      logger.error('Error removing postpaid sale:', error);
      DialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'postpaid_sale',
          fallback: 'حدث خطأ أثناء حذف المبيعة الآجلة.'
        })
      );
    }
  }

  return {
    handlePostpaidSale,
    updatePostpaidSalesTable,
    editPostpaidSale,
    removePostpaidSale,
    cancelPostpaidSaleEdit: resetPostpaidEditMode
  };
}

module.exports = {
  createReconciliationDataEntryPostpaidHandlers
};
