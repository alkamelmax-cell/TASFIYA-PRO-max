const {
  parseStoredFormulaSettings,
  setActiveFormulaSettingsInDocument,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS
} = require('./reconciliation-formula');

function createReconciliationRecallHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getBootstrap = deps.getBootstrap || (() => deps.bootstrap);
  const getCurrentReconciliation = deps.getCurrentReconciliation || (() => null);
  const setCurrentReconciliation = deps.setCurrentReconciliation || (() => {});
  const clearAllReconciliationData = deps.clearAllReconciliationData || (async () => {});
  const setBankReceipts = deps.setBankReceipts || (() => {});
  const setCashReceipts = deps.setCashReceipts || (() => {});
  const setPostpaidSales = deps.setPostpaidSales || (() => {});
  const setCustomerReceipts = deps.setCustomerReceipts || (() => {});
  const setReturnInvoices = deps.setReturnInvoices || (() => {});
  const setSuppliers = deps.setSuppliers || (() => {});
  const updateBankReceiptsTable = deps.updateBankReceiptsTable || (() => {});
  const updateCashReceiptsTable = deps.updateCashReceiptsTable || (() => {});
  const updatePostpaidSalesTable = deps.updatePostpaidSalesTable || (() => {});
  const updateCustomerReceiptsTable = deps.updateCustomerReceiptsTable || (() => {});
  const updateReturnInvoicesTable = deps.updateReturnInvoicesTable || (() => {});
  const updateSuppliersTable = deps.updateSuppliersTable || (() => {});
  const updateSummary = deps.updateSummary || (() => {});
  const logger = deps.logger || console;

  async function confirmReplaceCurrentReconciliation() {
    if (!getCurrentReconciliation()) {
      return true;
    }

    const confirmed = await getDialogUtils().showConfirm(
      'هناك تصفية مفتوحة حالياً. هل تريد إلغاءها واستدعاء التصفية الجديدة؟',
      'تأكيد استدعاء تصفية'
    );

    if (!confirmed) {
      return false;
    }

    await clearAllReconciliationData();
    return true;
  }

  async function loadReconciliationById(reconciliationId) {
    return ipcRenderer.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?`,
    [reconciliationId]);
  }

  async function loadReconciliationByNumber(reconciliationNumber) {
    return ipcRenderer.invoke('db-get',
      `SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
             FROM reconciliations r
             LEFT JOIN cashiers c ON r.cashier_id = c.id
             LEFT JOIN accountants a ON r.accountant_id = a.id
             WHERE r.reconciliation_number = ?`,
      [reconciliationNumber]
    );
  }

  async function loadReconciliationSections(reconciliationId) {
    const [bank, cash, postpaid, customer, returns, supplierList] = await Promise.all([
      ipcRenderer.invoke(
        'db-query',
        `SELECT br.*, a.name as atm_name, a.bank_name
             FROM bank_receipts br
             LEFT JOIN atms a ON br.atm_id = a.id
             WHERE br.reconciliation_id = ?`,
        [reconciliationId]
      ),
      ipcRenderer.invoke('db-query', 'SELECT * FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]),
      ipcRenderer.invoke('db-query', 'SELECT * FROM suppliers WHERE reconciliation_id = ?', [reconciliationId])
    ]);

    return {
      bankReceipts: bank,
      cashReceipts: cash,
      postpaidSales: postpaid,
      customerReceipts: customer,
      returnInvoices: returns,
      suppliers: supplierList
    };
  }

  function applyReconciliationFormValues(reconciliation) {
    const cashierSelect = document.getElementById('cashierSelect');
    const accountantSelect = document.getElementById('accountantSelect');
    const reconciliationDate = document.getElementById('reconciliationDate');
    const systemSales = document.getElementById('systemSales');
    const timeRangeStart = document.getElementById('timeRangeStart');
    const timeRangeEnd = document.getElementById('timeRangeEnd');
    const filterNotes = document.getElementById('filterNotes');

    if (cashierSelect) cashierSelect.value = reconciliation.cashier_id;
    if (accountantSelect) accountantSelect.value = reconciliation.accountant_id;
    if (reconciliationDate) reconciliationDate.value = reconciliation.reconciliation_date;
    if (systemSales) systemSales.value = reconciliation.system_sales || '';
    if (timeRangeStart) timeRangeStart.value = reconciliation.time_range_start || '';
    if (timeRangeEnd) timeRangeEnd.value = reconciliation.time_range_end || '';
    if (filterNotes) filterNotes.value = reconciliation.filter_notes || '';
  }

  function renderCurrentReconciliationInfo(reconciliation) {
    const infoDiv = document.getElementById('currentReconciliationInfo');
    const detailsSpan = document.getElementById('currentReconciliationDetails');

    if (!infoDiv || !detailsSpan) {
      return;
    }

    let infoText = `الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number}) - المحاسب: ${reconciliation.accountant_name} - التاريخ: ${reconciliation.reconciliation_date}`;

    if (reconciliation.time_range_start && reconciliation.time_range_end) {
      infoText += ` - النطاق الزمني: ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}`;
    }

    if (reconciliation.filter_notes) {
      infoText += ` - الملاحظات: ${reconciliation.filter_notes}`;
    }

    detailsSpan.textContent = `${infoText} (رقم التصفية: ${reconciliation.reconciliation_number})`;
    infoDiv.style.display = 'block';
  }

  function refreshReconciliationTables() {
    updateBankReceiptsTable();
    updateCashReceiptsTable();
    updatePostpaidSalesTable();
    updateCustomerReceiptsTable();
    updateReturnInvoicesTable();
    updateSuppliersTable();
    updateSummary();
  }

  function applyReconciliationState(reconciliation, sections) {
    const parsedFormulaProfileId = Number.parseInt(reconciliation.formula_profile_id, 10);
    const formulaProfileId = Number.isFinite(parsedFormulaProfileId) && parsedFormulaProfileId > 0
      ? parsedFormulaProfileId
      : null;
    const formulaSettings = parseStoredFormulaSettings(reconciliation.formula_settings)
      || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
    setActiveFormulaSettingsInDocument(document, formulaSettings);
    const profileIdInput = document.getElementById('activeReconciliationFormulaProfileId');
    if (profileIdInput) {
      profileIdInput.value = formulaProfileId ? String(formulaProfileId) : '';
    }

    const snapshot = {
      reconciliation: JSON.parse(JSON.stringify({
        ...reconciliation,
        formula_profile_id: formulaProfileId,
        formula_settings: formulaSettings
      })),
      sections: JSON.parse(JSON.stringify(sections))
    };

    const reconciledCopy = {
      ...reconciliation,
      formula_profile_id: formulaProfileId,
      formula_settings: formulaSettings,
      __mode: 'recalled',
      __snapshot: snapshot
    };
    setCurrentReconciliation(reconciledCopy);
    setBankReceipts(sections.bankReceipts);
    setCashReceipts(sections.cashReceipts);
    setPostpaidSales(sections.postpaidSales);
    setCustomerReceipts(sections.customerReceipts);
    setReturnInvoices(sections.returnInvoices);
    setSuppliers(sections.suppliers);

    // Keep original snapshot to restore on cancel.
    if (windowObj) {
      windowObj.recalledReconciliationSnapshot = snapshot;
    }
  }

  function updateSaveButtonForRecalledMode() {
    const saveButton = document.getElementById('saveReconciliationBtn');
    if (!saveButton) {
      return;
    }

    saveButton.disabled = false;
    saveButton.title = 'حفظ التعديلات على نفس التصفية';
    saveButton.innerHTML = '<i class="icon">💾</i> حفظ التعديلات';
  }

  function hideReconciliationListModal() {
    const bootstrapRef = getBootstrap();
    if (!bootstrapRef || !bootstrapRef.Modal) {
      return;
    }

    const modalElement = document.getElementById('reconciliationListModal');
    if (!modalElement) {
      return;
    }

    const modal = bootstrapRef.Modal.getInstance(modalElement);
    if (modal) {
      modal.hide();
    }
  }

  async function handleRecallFromList(reconciliationId) {
    logger.log('🔄 [RECALL] استدعاء التصفية من القائمة - معرف:', reconciliationId);

    try {
      const canReplace = await confirmReplaceCurrentReconciliation();
      if (!canReplace) {
        return false;
      }

      const reconciliation = await loadReconciliationById(reconciliationId);

      if (!reconciliation) {
        getDialogUtils().showError('لم يتم العثور على التصفية', 'خطأ');
        return false;
      }

      const sections = await loadReconciliationSections(reconciliationId);
      applyReconciliationState(reconciliation, sections);
      applyReconciliationFormValues(reconciliation);
      renderCurrentReconciliationInfo(reconciliation);
      refreshReconciliationTables();
      hideReconciliationListModal();
      updateSaveButtonForRecalledMode();

      logger.log('✅ [RECALL] تم استدعاء التصفية بنجاح:', reconciliation.reconciliation_number);
      getDialogUtils().showSuccessToast(`تم استدعاء التصفية رقم ${reconciliation.reconciliation_number || reconciliation.id} بنجاح`);
      return true;
    } catch (error) {
      logger.error('❌ [RECALL] خطأ في استدعاء التصفية:', error);
      getDialogUtils().showError('حدث خطأ أثناء استدعاء التصفية', 'خطأ');
      return false;
    }
  }

  async function handleRecallReconciliation() {
    logger.log('🔄 [RECALL] بدء استدعاء التصفية...');

    const input = document.getElementById('recallReconciliationNumber');
    const reconciliationNumber = input ? input.value.trim() : '';

    if (!reconciliationNumber) {
      getDialogUtils().showValidationError('يرجى إدخال رقم التصفية');
      return;
    }

    try {
      const canReplace = await confirmReplaceCurrentReconciliation();
      if (!canReplace) {
        return;
      }

      const reconciliation = await loadReconciliationByNumber(reconciliationNumber);

      if (!reconciliation) {
        getDialogUtils().showError('لم يتم العثور على تصفية بهذا الرقم', 'خطأ في البحث');
        return;
      }

      const sections = await loadReconciliationSections(reconciliation.id);
      applyReconciliationState(reconciliation, sections);
      applyReconciliationFormValues(reconciliation);
      renderCurrentReconciliationInfo(reconciliation);
      refreshReconciliationTables();
      updateSaveButtonForRecalledMode();

      if (input) {
        input.value = '';
      }

      logger.log('✅ [RECALL] تم استدعاء التصفية بنجاح:', reconciliation.reconciliation_number);
      getDialogUtils().showSuccessToast(`تم استدعاء التصفية رقم ${reconciliation.reconciliation_number} بنجاح`);
    } catch (error) {
      logger.error('❌ [RECALL] خطأ في استدعاء التصفية:', error);
      getDialogUtils().showError(
        'حدث خطأ أثناء استدعاء التصفية. يرجى المحاولة مرة أخرى.',
        'خطأ في استدعاء التصفية'
      );
    }
  }

  return {
    handleRecallFromList,
    handleRecallReconciliation,
    loadReconciliationSections,
    applyReconciliationFormValues,
    renderCurrentReconciliationInfo
  };
}

module.exports = {
  createReconciliationRecallHandlers
};
