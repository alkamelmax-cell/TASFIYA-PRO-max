const { mapDbErrorMessage } = require('./db-error-messages');

function createReconciliationDataEntryCustomerHandlers(context) {
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
  const getCustomerReceipts = context.getCustomerReceipts;
  const setCustomerReceipts = context.setCustomerReceipts;
  let editingCustomerReceiptIndex = -1;

  function setEditModeState(isEditing) {
    const submitBtn = document.getElementById('customerReceiptSubmitBtn');
    const cancelBtn = document.getElementById('cancelCustomerReceiptEditBtn');

    if (submitBtn) {
      submitBtn.textContent = isEditing ? 'حفظ التعديل' : 'إضافة';
    }

    if (cancelBtn) {
      cancelBtn.classList.toggle('d-none', !isEditing);
    }
  }

  function resetCustomerReceiptEditMode(options = {}) {
    editingCustomerReceiptIndex = -1;
    setEditModeState(false);

    const form = document.getElementById('customerReceiptForm');
    if (form) {
      form.reset();
    }

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#customerReceiptForm');
    }
  }

  async function handleCustomerReceipt(event) {
    event.preventDefault();
    logger.log('💰 [CUSTOMER] بدء إضافة مقبوض عميل...');

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) {
      logger.error('❌ [CUSTOMER] لا توجد تصفية حالية');
      return;
    }

    const customerName = document.getElementById('customerReceiptName').value.trim();
    const amountInput = document.getElementById('customerReceiptAmount').value.trim();
    const paymentType = document.getElementById('customerReceiptPaymentType').value;

    logger.log('📝 [CUSTOMER] البيانات المدخلة:', {
      customerName,
      amountInput,
      paymentType,
      reconciliationId: currentReconciliation.id
    });

    if (!customerName) {
      logger.error('❌ [CUSTOMER] اسم العميل فارغ');
      DialogUtils.showValidationError('يرجى إدخال اسم العميل');
      return;
    }

    if (!amountInput) {
      logger.error('❌ [CUSTOMER] المبلغ فارغ');
      DialogUtils.showValidationError('يرجى إدخال المبلغ');
      return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      logger.error('❌ [CUSTOMER] مبلغ غير صحيح:', amountInput);
      DialogUtils.showValidationError('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    if (!paymentType) {
      logger.error('❌ [CUSTOMER] نوع الدفع فارغ');
      DialogUtils.showValidationError('يرجى اختيار نوع الدفع');
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
      const customerReceipts = getArraySafe(getCustomerReceipts);
      if (editingCustomerReceiptIndex >= 0) {
        const existingReceipt = customerReceipts[editingCustomerReceiptIndex];
        if (!existingReceipt) {
          resetCustomerReceiptEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        logger.log('💾 [CUSTOMER] تحديث في قاعدة البيانات...');
        await ipcRenderer.invoke(
          'db-run',
          'UPDATE customer_receipts SET customer_name = ?, amount = ?, payment_type = ? WHERE id = ?',
          [customerName, amount, paymentType, existingReceipt.id]
        );

        const nextItems = [...customerReceipts];
        nextItems[editingCustomerReceiptIndex] = {
          ...existingReceipt,
          customer_name: customerName,
          amount,
          payment_type: paymentType
        };

        setArray(setCustomerReceipts, getCustomerReceipts, nextItems);
        updateCustomerReceiptsTable();
        resetCustomerReceiptEditMode();

        logger.log('✅ [CUSTOMER] تم تحديث مقبوض العميل بنجاح');
        DialogUtils.showSuccessToast('تم تحديث مقبوض العميل بنجاح');
        return;
      }

      logger.log('💾 [CUSTOMER] إدراج في قاعدة البيانات...');
      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type) VALUES (?, ?, ?, ?)',
        [currentReconciliation.id, customerName, amount, paymentType]
      );

      logger.log('✅ [CUSTOMER] تم الإدراج بنجاح، ID:', result.lastInsertRowid);

      const newReceipt = {
        id: result.lastInsertRowid,
        customer_name: customerName,
        amount,
        payment_type: paymentType
      };

      setArray(setCustomerReceipts, getCustomerReceipts, [...customerReceipts, newReceipt]);
      logger.log('📊 [CUSTOMER] تم إضافة للمصفوفة المحلية، العدد الحالي:', getArraySafe(getCustomerReceipts).length);

      updateCustomerReceiptsTable();
      document.getElementById('customerReceiptForm').reset();
      formNavigation.focusFirstField('#customerReceiptForm');

      logger.log('✅ [CUSTOMER] تم إضافة مقبوض العميل بنجاح');
      DialogUtils.showSuccessToast('تم إضافة مقبوض العميل بنجاح');
    } catch (error) {
      logger.error('❌ [CUSTOMER] خطأ في إضافة مقبوض العميل:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'customer_receipt',
        requiredMessage: 'يرجى تعبئة اسم العميل ونوع الدفع والمبلغ بشكل صحيح.',
        fallback: 'تعذر إضافة مقبوض العميل.'
      });
      DialogUtils.showError(friendly, 'خطأ في قاعدة البيانات');
    }
  }

  function updateCustomerReceiptsTable() {
    logger.log('📊 [CUSTOMER] تحديث جدول مقبوضات العملاء...');

    const tbody = document.getElementById('customerReceiptsTable');
    const totalElement = document.getElementById('customerReceiptsTotal');

    if (!tbody) {
      logger.error('❌ [CUSTOMER] لم يتم العثور على جدول مقبوضات العملاء');
      return;
    }

    if (!totalElement) {
      logger.error('❌ [CUSTOMER] لم يتم العثور على عنصر المجموع');
      return;
    }

    tbody.innerHTML = '';

    let total = 0;

    const customerReceipts = getArraySafe(getCustomerReceipts);
    logger.log('📋 [CUSTOMER] عدد المقبوضات للعرض:', customerReceipts.length);

    customerReceipts.forEach((receipt, index) => {
      if (!receipt || typeof receipt.amount !== 'number') {
        logger.warn('⚠️ [CUSTOMER] مقبوض غير صحيح في الفهرس', index, receipt);
        return;
      }

      const row = document.createElement('tr');
      if (index === editingCustomerReceiptIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${receipt.customer_name || 'غير محدد'}</td>
            <td class="text-currency">${formatCurrency(receipt.amount)}</td>
            <td>${receipt.payment_type || 'غير محدد'}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editCustomerReceipt(${index})" title="تعديل المقبوض">
                    ✏️ تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removeCustomerReceipt(${index})" title="حذف المقبوض">
                    🗑️ حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += receipt.amount;
    });

    totalElement.textContent = formatCurrency(total);
    logger.log('💰 [CUSTOMER] إجمالي مقبوضات العملاء:', formatCurrency(total));

    updateSummary();

    if (editingCustomerReceiptIndex >= customerReceipts.length) {
      resetCustomerReceiptEditMode({ skipFocus: true });
    }
  }

  function editCustomerReceipt(index) {
    logger.log('✏️ [CUSTOMER] بدء تعديل مقبوض العميل، الفهرس:', index);

    const customerReceipts = getArraySafe(getCustomerReceipts);
    const receipt = customerReceipts[index];
    if (!receipt) {
      logger.error('❌ [CUSTOMER] لم يتم العثور على المقبوض المطلوب للتعديل');
      DialogUtils.showErrorToast('تعذر تحميل بيانات المقبوض للتعديل');
      return;
    }

    editingCustomerReceiptIndex = index;

    const customerNameEl = document.getElementById('customerReceiptName');
    const amountEl = document.getElementById('customerReceiptAmount');
    const paymentTypeEl = document.getElementById('customerReceiptPaymentType');

    if (customerNameEl) {
      customerNameEl.value = receipt.customer_name || '';
    }

    if (amountEl) {
      amountEl.value = receipt.amount;
    }

    if (paymentTypeEl) {
      paymentTypeEl.value = receipt.payment_type || '';
    }

    setEditModeState(true);
    formNavigation.focusFirstField('#customerReceiptForm');
  }

  async function removeCustomerReceipt(index) {
    logger.log('🗑️ [CUSTOMER] طلب حذف مقبوض العميل، الفهرس:', index);

    const customerReceipts = getArraySafe(getCustomerReceipts);
    if (index < 0 || index >= customerReceipts.length) {
      logger.error('❌ [CUSTOMER] فهرس غير صحيح:', index);
      DialogUtils.showError('فهرس المقبوض غير صحيح', 'خطأ');
      return;
    }

    const receipt = customerReceipts[index];
    logger.log('📋 [CUSTOMER] المقبوض المراد حذفه:', receipt);

    const confirmed = await DialogUtils.showDeleteConfirm(
      `هل أنت متأكد من حذف مقبوض العميل "${receipt.customer_name}" بمبلغ ${formatCurrency(receipt.amount)} ريال؟`,
      'حذف مقبوض العميل'
    );

    if (!confirmed) return;

    try {
      logger.log('💾 [CUSTOMER] حذف من قاعدة البيانات...');
      await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE id = ?', [receipt.id]);

      const nextItems = [...customerReceipts];
      nextItems.splice(index, 1);
      setArray(setCustomerReceipts, getCustomerReceipts, nextItems);
      logger.log('✅ [CUSTOMER] تم حذف المقبوض، العدد الحالي:', getArraySafe(getCustomerReceipts).length);

      if (editingCustomerReceiptIndex === index) {
        resetCustomerReceiptEditMode({ skipFocus: true });
      } else if (editingCustomerReceiptIndex > index) {
        editingCustomerReceiptIndex -= 1;
      }

      updateCustomerReceiptsTable();
      DialogUtils.showSuccessToast('تم حذف مقبوض العميل بنجاح');
    } catch (error) {
      logger.error('❌ [CUSTOMER] خطأ في حذف المقبوض:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'customer_receipt',
        fallback: 'تعذر حذف مقبوض العميل.'
      });
      DialogUtils.showError(friendly, 'خطأ في قاعدة البيانات');
    }
  }

  return {
    handleCustomerReceipt,
    updateCustomerReceiptsTable,
    editCustomerReceipt,
    removeCustomerReceipt,
    cancelCustomerReceiptEdit: resetCustomerReceiptEditMode
  };
}

module.exports = {
  createReconciliationDataEntryCustomerHandlers
};
