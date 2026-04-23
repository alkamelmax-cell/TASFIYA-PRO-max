function createReconciliationDataEntryBankCashHandlers(context) {
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
  const getBankReceipts = context.getBankReceipts;
  const setBankReceipts = context.setBankReceipts;
  const getCashReceipts = context.getCashReceipts;
  const setCashReceipts = context.setCashReceipts;
  const EventCtor = context.EventCtor || (typeof Event === 'function' ? Event : null);

  let editingBankReceiptIndex = -1;
  let editingCashReceiptIndex = -1;

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

  function applyOperationTypeUiState() {
    const operationTypeEl = document.getElementById('operationType');
    if (!operationTypeEl || !EventCtor) {
      return;
    }
    operationTypeEl.dispatchEvent(new EventCtor('change'));
  }

  function resetBankEditMode(options = {}) {
    editingBankReceiptIndex = -1;
    setEditModeState('bankReceiptSubmitBtn', 'cancelBankReceiptEditBtn', false);

    const form = document.getElementById('bankReceiptForm');
    if (form) {
      form.reset();
    }

    const bankNameEl = document.getElementById('bankName');
    if (bankNameEl) {
      bankNameEl.value = '';
    }

    applyOperationTypeUiState();

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#bankReceiptForm');
    }
  }

  function resetCashEditMode(options = {}) {
    editingCashReceiptIndex = -1;
    setEditModeState('cashReceiptSubmitBtn', 'cancelCashReceiptEditBtn', false);

    const form = document.getElementById('cashReceiptForm');
    if (form) {
      form.reset();
    }

    const cashTotalEl = document.getElementById('cashTotal');
    if (cashTotalEl) {
      cashTotalEl.value = '';
    }

    if (!options.skipFocus) {
      formNavigation.focusFirstField('#cashReceiptForm');
    }
  }

  async function resolveBankReceiptDisplayData(atmIdRaw) {
    const atmId = atmIdRaw ? Number.parseInt(atmIdRaw, 10) : null;

    if (!atmId) {
      return {
        atm_id: null,
        atm_name: 'تحويل',
        bank_name: 'تحويل'
      };
    }

    const atm = await ipcRenderer.invoke('db-get', 'SELECT name, bank_name FROM atms WHERE id = ?', [atmId]);

    return {
      atm_id: atmId,
      atm_name: atm ? atm.name : '',
      bank_name: atm ? atm.bank_name : ''
    };
  }

  async function handleBankReceipt(event) {
    event.preventDefault();

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) return;

    const operationType = document.getElementById('operationType').value;
    const atmId = document.getElementById('atmSelect').value;
    const amount = parseFloat(document.getElementById('bankAmount').value);

    if (!operationType || !amount || amount <= 0) {
      DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }

    if (operationType !== 'تحويل' && !atmId) {
      DialogUtils.showValidationError('يرجى اختيار الجهاز');
      return;
    }

    try {
      const bankReceipts = getArraySafe(getBankReceipts);
      const resolvedDisplayData = await resolveBankReceiptDisplayData(atmId);

      if (editingBankReceiptIndex >= 0) {
        const existingReceipt = bankReceipts[editingBankReceiptIndex];
        if (!existingReceipt) {
          resetBankEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        await ipcRenderer.invoke(
          'db-run',
          'UPDATE bank_receipts SET operation_type = ?, atm_id = ?, amount = ? WHERE id = ?',
          [operationType, resolvedDisplayData.atm_id, amount, existingReceipt.id]
        );

        const nextItems = [...bankReceipts];
        nextItems[editingBankReceiptIndex] = {
          ...existingReceipt,
          operation_type: operationType,
          atm_id: resolvedDisplayData.atm_id,
          atm_name: resolvedDisplayData.atm_name,
          bank_name: resolvedDisplayData.bank_name,
          amount
        };

        setArray(setBankReceipts, getBankReceipts, nextItems);
        updateBankReceiptsTable();
        resetBankEditMode();
        logger.log('Bank receipt updated:', existingReceipt.id);
        return;
      }

      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO bank_receipts (reconciliation_id, operation_type, atm_id, amount) VALUES (?, ?, ?, ?)',
        [currentReconciliation.id, operationType, resolvedDisplayData.atm_id, amount]
      );

      const nextItem = {
        id: result.lastInsertRowid,
        operation_type: operationType,
        atm_id: resolvedDisplayData.atm_id,
        atm_name: resolvedDisplayData.atm_name,
        bank_name: resolvedDisplayData.bank_name,
        amount
      };

      setArray(setBankReceipts, getBankReceipts, [...bankReceipts, nextItem]);

      updateBankReceiptsTable();
      document.getElementById('bankReceiptForm').reset();
      const bankNameEl = document.getElementById('bankName');
      if (bankNameEl) {
        bankNameEl.value = '';
      }
      applyOperationTypeUiState();
      formNavigation.focusFirstField('#bankReceiptForm');

      logger.log('Bank receipt added:', nextItem);
    } catch (error) {
      logger.error('Error adding bank receipt:', error);
      DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المقبوض البنكي');
    }
  }

  function updateBankReceiptsTable() {
    const tbody = document.getElementById('bankReceiptsTable');
    const totalElement = document.getElementById('bankReceiptsTotal');

    tbody.innerHTML = '';

    let total = 0;

    getArraySafe(getBankReceipts).forEach((receipt, index) => {
      const row = document.createElement('tr');
      if (index === editingBankReceiptIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${receipt.operation_type}</td>
            <td>${receipt.atm_name}</td>
            <td>${receipt.bank_name}</td>
            <td class="text-currency">${formatCurrency(receipt.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editBankReceipt(${index})">
                    تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removeBankReceipt(${index})">
                    حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += receipt.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();

    if (editingBankReceiptIndex >= getArraySafe(getBankReceipts).length) {
      resetBankEditMode({ skipFocus: true });
    }
  }

  async function editBankReceipt(index) {
    const bankReceipts = getArraySafe(getBankReceipts);
    const receipt = bankReceipts[index];
    if (!receipt) {
      DialogUtils.showErrorToast('تعذر تحميل بيانات المقبوض للتعديل');
      return;
    }

    editingBankReceiptIndex = index;

    const operationTypeEl = document.getElementById('operationType');
    const atmSelectEl = document.getElementById('atmSelect');
    const bankAmountEl = document.getElementById('bankAmount');
    const bankNameEl = document.getElementById('bankName');

    if (operationTypeEl) {
      operationTypeEl.value = receipt.operation_type || '';
      applyOperationTypeUiState();
    }

    if (atmSelectEl && receipt.operation_type !== 'تحويل') {
      if (receipt.atm_id !== undefined && receipt.atm_id !== null) {
        atmSelectEl.value = String(receipt.atm_id);
      } else if (receipt.atm_name) {
        try {
          const resolvedAtm = await ipcRenderer.invoke(
            'db-get',
            'SELECT id FROM atms WHERE name = ? OR name LIKE ? LIMIT 1',
            [receipt.atm_name, `%${receipt.atm_name}%`]
          );
          if (resolvedAtm && resolvedAtm.id) {
            atmSelectEl.value = String(resolvedAtm.id);
          }
        } catch (error) {
          logger.warn('Could not resolve ATM by name while editing bank receipt:', error);
        }
      }

      if (EventCtor) {
        atmSelectEl.dispatchEvent(new EventCtor('change'));
      }
    }

    if (bankNameEl && (!atmSelectEl || !atmSelectEl.value)) {
      bankNameEl.value = receipt.bank_name || '';
    }

    if (bankAmountEl) {
      bankAmountEl.value = receipt.amount;
    }

    setEditModeState('bankReceiptSubmitBtn', 'cancelBankReceiptEditBtn', true);
    formNavigation.focusFirstField('#bankReceiptForm');
  }

  async function removeBankReceipt(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المقبوض');
    if (!confirmed) return;

    try {
      const bankReceipts = getArraySafe(getBankReceipts);
      const receipt = bankReceipts[index];
      if (!receipt) return;

      await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE id = ?', [receipt.id]);

      const nextItems = [...bankReceipts];
      nextItems.splice(index, 1);
      setArray(setBankReceipts, getBankReceipts, nextItems);

      if (editingBankReceiptIndex === index) {
        resetBankEditMode({ skipFocus: true });
      } else if (editingBankReceiptIndex > index) {
        editingBankReceiptIndex -= 1;
      }

      updateBankReceiptsTable();

      logger.log('Bank receipt removed');
    } catch (error) {
      logger.error('Error removing bank receipt:', error);
      DialogUtils.showErrorToast('حدث خطأ أثناء حذف المقبوض');
    }
  }

  function calculateCashTotal() {
    const denomination = parseFloat(document.getElementById('denomination').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value, 10) || 0;
    const total = denomination * quantity;

    document.getElementById('cashTotal').value = formatCurrency(total);
  }

  async function handleCashReceipt(event) {
    event.preventDefault();

    const currentReconciliation = ensureCurrentReconciliation();
    if (!currentReconciliation) return;

    const denomination = parseFloat(document.getElementById('denomination').value);
    const quantity = parseInt(document.getElementById('quantity').value, 10);
    const total = denomination * quantity;

    if (!denomination || !quantity || quantity <= 0) {
      DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
      return;
    }

    try {
      const cashReceipts = getArraySafe(getCashReceipts);

      if (editingCashReceiptIndex >= 0) {
        const existingReceipt = cashReceipts[editingCashReceiptIndex];
        if (!existingReceipt) {
          resetCashEditMode({ skipFocus: true });
          DialogUtils.showErrorToast('تعذر إكمال التعديل، حاول مرة أخرى');
          return;
        }

        await ipcRenderer.invoke(
          'db-run',
          'UPDATE cash_receipts SET denomination = ?, quantity = ?, total_amount = ? WHERE id = ?',
          [denomination, quantity, total, existingReceipt.id]
        );

        const nextItems = [...cashReceipts];
        nextItems[editingCashReceiptIndex] = {
          ...existingReceipt,
          denomination,
          quantity,
          total_amount: total
        };

        setArray(setCashReceipts, getCashReceipts, nextItems);
        updateCashReceiptsTable();
        resetCashEditMode();
        logger.log('Cash receipt updated:', existingReceipt.id);
        return;
      }

      const result = await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount) VALUES (?, ?, ?, ?)',
        [currentReconciliation.id, denomination, quantity, total]
      );

      setArray(setCashReceipts, getCashReceipts, [
        ...cashReceipts,
        {
          id: result.lastInsertRowid,
          denomination,
          quantity,
          total_amount: total
        }
      ]);

      updateCashReceiptsTable();
      document.getElementById('cashReceiptForm').reset();
      const cashTotalEl = document.getElementById('cashTotal');
      if (cashTotalEl) {
        cashTotalEl.value = '';
      }
      formNavigation.focusFirstField('#cashReceiptForm');

      logger.log('Cash receipt added');
    } catch (error) {
      logger.error('Error adding cash receipt:', error);
      DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المقبوض النقدي');
    }
  }

  function updateCashReceiptsTable() {
    const tbody = document.getElementById('cashReceiptsTable');
    const totalElement = document.getElementById('cashReceiptsTotal');

    tbody.innerHTML = '';

    let total = 0;

    getArraySafe(getCashReceipts).forEach((receipt, index) => {
      const row = document.createElement('tr');
      if (index === editingCashReceiptIndex) {
        row.classList.add('table-warning');
      }
      row.innerHTML = `
            <td>${receipt.denomination} ريال</td>
            <td>${receipt.quantity}</td>
            <td class="text-currency">${formatCurrency(receipt.total_amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editCashReceipt(${index})">
                    تعديل
                </button>
                <button class="btn btn-sm btn-danger" onclick="removeCashReceipt(${index})">
                    حذف
                </button>
            </td>
        `;
      tbody.appendChild(row);
      total += receipt.total_amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();

    if (editingCashReceiptIndex >= getArraySafe(getCashReceipts).length) {
      resetCashEditMode({ skipFocus: true });
    }
  }

  function editCashReceipt(index) {
    const cashReceipts = getArraySafe(getCashReceipts);
    const receipt = cashReceipts[index];
    if (!receipt) {
      DialogUtils.showErrorToast('تعذر تحميل بيانات المقبوض للتعديل');
      return;
    }

    editingCashReceiptIndex = index;

    const denominationEl = document.getElementById('denomination');
    const quantityEl = document.getElementById('quantity');
    const cashTotalEl = document.getElementById('cashTotal');

    if (denominationEl) {
      denominationEl.value = receipt.denomination;
    }

    if (quantityEl) {
      quantityEl.value = receipt.quantity;
    }

    if (cashTotalEl) {
      cashTotalEl.value = formatCurrency(receipt.total_amount);
    }

    setEditModeState('cashReceiptSubmitBtn', 'cancelCashReceiptEditBtn', true);
    formNavigation.focusFirstField('#cashReceiptForm');
  }

  async function removeCashReceipt(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المقبوض');
    if (!confirmed) return;

    try {
      const cashReceipts = getArraySafe(getCashReceipts);
      const receipt = cashReceipts[index];
      if (!receipt) return;

      await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE id = ?', [receipt.id]);

      const nextItems = [...cashReceipts];
      nextItems.splice(index, 1);
      setArray(setCashReceipts, getCashReceipts, nextItems);

      if (editingCashReceiptIndex === index) {
        resetCashEditMode({ skipFocus: true });
      } else if (editingCashReceiptIndex > index) {
        editingCashReceiptIndex -= 1;
      }

      updateCashReceiptsTable();

      logger.log('Cash receipt removed');
    } catch (error) {
      logger.error('Error removing cash receipt:', error);
      DialogUtils.showErrorToast('حدث خطأ أثناء حذف المقبوض');
    }
  }

  return {
    handleBankReceipt,
    updateBankReceiptsTable,
    editBankReceipt,
    removeBankReceipt,
    cancelBankReceiptEdit: resetBankEditMode,
    calculateCashTotal,
    handleCashReceipt,
    updateCashReceiptsTable,
    editCashReceipt,
    removeCashReceipt,
    cancelCashReceiptEdit: resetCashEditMode
  };
}

module.exports = {
  createReconciliationDataEntryBankCashHandlers
};
