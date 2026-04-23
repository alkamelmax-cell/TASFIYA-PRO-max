// ===================================================
// 🏪 Supplier Ledger
// ===================================================

(() => {
  const ledgerIpc = typeof window !== 'undefined' && window.RendererIPC
    ? window.RendererIPC
    : require('./renderer-ipc');

  let printManager = null;
  let supplierLedgerLoadPromise = null;
  let supplierLedgerLoadSequence = 0;
  let lastSupplierLedgerFiltersSignature = '';
  let supplierLedgerBranchesLoaded = false;
  let supplierLedgerRowsCache = [];
  let selectedSupplierMergeKeys = new Set();
  let manualSupplierTableEnsured = false;
  let supplierLedgerMergeHistoryReady = false;
  let latestUndoableSupplierMerge = null;
  let manualSupplierEditingContext = null;
  let currentSupplierStatementContext = {
    supplierName: '',
    forcedBranchId: ''
  };

  function initializeSupplierLedger() {
    attachSupplierLedgerEventListeners();

    window.loadSupplierLedger = loadSupplierLedger;
    window.loadSupplierLedgerFilters = loadSupplierLedgerFilters;
    window.showSupplierStatement = showSupplierStatement;
    window.openSupplierReconciliationFromStatement = openSupplierReconciliationFromStatement;
    window.printSupplierStatement = printSupplierStatement;
    window.addManualSupplierTransaction = addManualSupplierTransaction;
    window.deleteManualSupplierTransaction = deleteManualSupplierTransaction;
    window.editManualSupplierTransactionEntry = editManualSupplierTransactionEntry;
    window.cancelManualSupplierEdit = cancelManualSupplierEdit;
    window.renameSupplierNameInLedger = renameSupplierNameInLedger;
    window.undoLastSupplierMergeInLedger = undoLastSupplierMergeInLedger;
  }

  async function initializePrintManager() {
    try {
      printManager = await ledgerIpc.invoke('get-print-manager');
      window.supplierLedgerPrintManager = printManager;
    } catch (error) {
      console.warn('[SUPPLIER-LEDGER] get-print-manager failed:', error && error.message ? error.message : error);
    }
  }

  function mapSupplierLedgerDbError(error, fallback = 'خطأ غير معروف') {
    const message = String(error && error.message ? error.message : error || '').trim();
    if (!message) {
      return fallback;
    }

    if (message.includes('manual_supplier_transactions_invalid_data')) {
      return 'بيانات حركة المورد غير صالحة. تأكد من الاسم ونوع الحركة والمبلغ.';
    }
    if (message.includes('suppliers_invalid_data')) {
      return 'بيانات المورد غير صالحة. تأكد من الاسم والمبلغ.';
    }
    if (message.includes('FOREIGN KEY constraint failed')) {
      return 'الفرع المحدد غير صالح أو تم حذفه.';
    }
    if (message.includes('SQLITE_CONSTRAINT')) {
      return 'فشلت العملية بسبب قيد سلامة البيانات.';
    }

    return message;
  }

  function attachSupplierLedgerEventListeners() {
    const searchBtn = document.getElementById('supplierLedgerSearchBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => loadSupplierLedger());
    }

    const clearBtn = document.getElementById('supplierLedgerClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', handleSupplierLedgerClear);
    }

    const onlyBalance = document.getElementById('supplierLedgerOnlyWithBalance');
    if (onlyBalance) {
      onlyBalance.addEventListener('change', () => loadSupplierLedger());
    }

    const branchFilter = document.getElementById('supplierLedgerBranchFilter');
    if (branchFilter) {
      branchFilter.addEventListener('change', () => loadSupplierLedger());
    }

    const mergeSelectedBtn = document.getElementById('supplierLedgerMergeSelectedBtn');
    if (mergeSelectedBtn) {
      mergeSelectedBtn.addEventListener('click', () => mergeSelectedSuppliersInLedger());
    }

    const undoMergeBtn = document.getElementById('supplierLedgerUndoMergeBtn');
    if (undoMergeBtn) {
      undoMergeBtn.addEventListener('click', () => undoLastSupplierMergeInLedger());
    }

    const clearSelectionBtn = document.getElementById('supplierLedgerClearSelectionBtn');
    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', () => {
        clearSupplierLedgerSelection();
      });
    }

    const selectAll = document.getElementById('supplierLedgerSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', (event) => {
        toggleSupplierLedgerSelectAll(!!event?.target?.checked);
      });
    }

    const tableBody = document.getElementById('supplierLedgerTable');
    if (tableBody) {
      tableBody.addEventListener('change', (event) => {
        const target = event?.target;
        if (!target || !target.classList?.contains('supplier-ledger-select-checkbox')) {
          return;
        }

        const selectionKey = String(target.dataset.selectionKey || '');
        if (!selectionKey) {
          return;
        }

        if (target.checked) {
          selectedSupplierMergeKeys.add(selectionKey);
        } else {
          selectedSupplierMergeKeys.delete(selectionKey);
        }

        updateSupplierLedgerSelectionUi();
      });
    }

    updateSupplierLedgerSelectionUi();
  }

  async function loadSupplierLedgerFilters(options = {}) {
    await ensureManualSupplierTable();
    const forceReload = !!options.forceReload;
    const branchFilter = document.getElementById('supplierLedgerBranchFilter');
    if (!branchFilter) {
      return;
    }

    try {
      const selectedValue = branchFilter.value || '';
      if (!forceReload && supplierLedgerBranchesLoaded && branchFilter.options.length > 1) {
        if (selectedValue) {
          branchFilter.value = selectedValue;
        }
        return;
      }

      const branches = await ledgerIpc.invoke(
        'db-query',
        'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
      );

      const placeholder = branchFilter.querySelector('option[value=""]');
      branchFilter.innerHTML = '';
      if (placeholder) {
        branchFilter.appendChild(placeholder);
      } else {
        const fallbackPlaceholder = document.createElement('option');
        fallbackPlaceholder.value = '';
        fallbackPlaceholder.textContent = 'جميع الفروع';
        branchFilter.appendChild(fallbackPlaceholder);
      }

      (branches || []).forEach((branch) => {
        const option = document.createElement('option');
        option.value = String(branch.id);
        option.textContent = branch.branch_name || `فرع ${branch.id}`;
        branchFilter.appendChild(option);
      });

      if (selectedValue && Array.from(branchFilter.options).some((opt) => opt.value === selectedValue)) {
        branchFilter.value = selectedValue;
      }

      supplierLedgerBranchesLoaded = true;
    } catch (error) {
      console.error('Error loading branches for supplier ledger:', error);
    }
  }

  function getSupplierLedgerFilters() {
    return {
      branchId: (document.getElementById('supplierLedgerBranchFilter')?.value || '').trim(),
      name: (document.getElementById('supplierLedgerSearchName')?.value || '').trim(),
      dateFrom: (document.getElementById('supplierLedgerDateFrom')?.value || '').trim(),
      dateTo: (document.getElementById('supplierLedgerDateTo')?.value || '').trim(),
      onlyWithBalance: !!document.getElementById('supplierLedgerOnlyWithBalance')?.checked
    };
  }

  function handleSupplierLedgerClear() {
    const nameInput = document.getElementById('supplierLedgerSearchName');
    const dateFrom = document.getElementById('supplierLedgerDateFrom');
    const dateTo = document.getElementById('supplierLedgerDateTo');
    const onlyBalance = document.getElementById('supplierLedgerOnlyWithBalance');

    if (nameInput) nameInput.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (onlyBalance) onlyBalance.checked = false;
    selectedSupplierMergeKeys.clear();
    updateSupplierLedgerSelectionUi();

    loadSupplierLedger();
  }

  function buildSupplierLedgerPeriodLabel(filters) {
    const from = filters?.dateFrom || '';
    const to = filters?.dateTo || '';
    if (from && to) return `الفترة: من ${from} إلى ${to}`;
    if (from) return `الفترة: من ${from}`;
    if (to) return `الفترة: حتى ${to}`;
    return 'الفترة: كل الفترات';
  }

  function updateSupplierLedgerSummaryCards(rows, filters) {
    const totalInvoicesEl = document.getElementById('supplierLedgerTotalInvoicesPeriod');
    const totalPaymentsEl = document.getElementById('supplierLedgerTotalPaymentsPeriod');
    const netBalanceEl = document.getElementById('supplierLedgerNetBalancePeriod');
    const periodEl = document.getElementById('supplierLedgerSummaryPeriod');

    if (!totalInvoicesEl || !totalPaymentsEl || !netBalanceEl) {
      return;
    }

    const fmt = getCurrencyFormatter();
    const safeRows = Array.isArray(rows) ? rows : [];

    const totals = safeRows.reduce((acc, row) => {
      acc.invoices += Number(row?.total_invoices || 0);
      acc.payments += Number(row?.total_payments || 0);
      acc.net += Number(row?.balance || 0);
      return acc;
    }, { invoices: 0, payments: 0, net: 0 });

    totalInvoicesEl.textContent = fmt(totals.invoices);
    totalPaymentsEl.textContent = fmt(totals.payments);
    netBalanceEl.textContent = fmt(totals.net);

    netBalanceEl.classList.remove('text-success', 'text-deficit');
    if (totals.net > 0) {
      netBalanceEl.classList.add('text-deficit');
    } else if (totals.net < 0) {
      netBalanceEl.classList.add('text-success');
    }

    if (periodEl) {
      periodEl.textContent = buildSupplierLedgerPeriodLabel(filters || getSupplierLedgerFilters());
    }
  }

  function buildSupplierLedgerQuery(filters) {
    let reconciledDateFilter = '';
    let manualDateFilter = '';
    const dateParamsReconciled = [];
    const dateParamsManual = [];

    if (filters.dateFrom) {
      reconciledDateFilter += ' AND DATE(COALESCE(r.reconciliation_date, s.created_at)) >= DATE(?)';
      manualDateFilter += ' AND DATE(mst.created_at) >= DATE(?)';
      dateParamsReconciled.push(filters.dateFrom);
      dateParamsManual.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      reconciledDateFilter += ' AND DATE(COALESCE(r.reconciliation_date, s.created_at)) <= DATE(?)';
      manualDateFilter += ' AND DATE(mst.created_at) <= DATE(?)';
      dateParamsReconciled.push(filters.dateTo);
      dateParamsManual.push(filters.dateTo);
    }

    let reconciledBranchFilter = '';
    let manualBranchFilter = '';
    const branchParamsReconciled = [];
    const branchParamsManual = [];
    if (filters.branchId) {
      reconciledBranchFilter = ' AND c.branch_id = ?';
      manualBranchFilter = ' AND mst.branch_id = ?';
      branchParamsReconciled.push(filters.branchId);
      branchParamsManual.push(filters.branchId);
    }

    let nameFilter = '';
    const nameParams = [];
    if (filters.name) {
      nameFilter = ' AND t_supplier LIKE ?';
      nameParams.push(`%${filters.name}%`);
    }

    const subReconciled = `
      SELECT
        s.supplier_name AS t_supplier,
        -ABS(s.amount) AS t_amount,
        COALESCE(r.reconciliation_date, DATE(s.created_at)) AS t_date,
        s.created_at AS t_created,
        COALESCE(c.branch_id, 0) AS t_branch_id,
        COALESCE(b.branch_name, 'غير محدد') AS t_branch_name
      FROM suppliers s
      LEFT JOIN reconciliations r ON r.id = s.reconciliation_id
      LEFT JOIN cashiers c ON c.id = r.cashier_id
      LEFT JOIN branches b ON b.id = c.branch_id
      WHERE 1=1 ${reconciledDateFilter} ${reconciledBranchFilter}
    `;

    const subManual = `
      SELECT
        mst.supplier_name AS t_supplier,
        CASE
          WHEN mst.transaction_type = 'payment' THEN -ABS(mst.amount)
          ELSE ABS(mst.amount)
        END AS t_amount,
        DATE(mst.created_at) AS t_date,
        mst.created_at AS t_created,
        COALESCE(mst.branch_id, 0) AS t_branch_id,
        COALESCE(b.branch_name, 'غير محدد') AS t_branch_name
      FROM manual_supplier_transactions mst
      LEFT JOIN branches b ON b.id = mst.branch_id
      WHERE 1=1 ${manualDateFilter} ${manualBranchFilter}
    `;

    const unioned = `
      SELECT * FROM (
        ${subReconciled}
        UNION ALL
        ${subManual}
      ) tx
      WHERE 1=1 ${nameFilter}
    `;

    const havingPart = filters.onlyWithBalance
      ? 'HAVING ABS(COALESCE(SUM(t_amount), 0)) > 0.0001'
      : '';

    const sql = `
      SELECT
        t_supplier AS supplier_name,
        t_branch_id AS branch_id,
        t_branch_name AS branch_name,
        COALESCE(SUM(CASE WHEN t_amount >= 0 THEN t_amount ELSE 0 END), 0) AS total_invoices,
        COALESCE(SUM(CASE WHEN t_amount < 0 THEN ABS(t_amount) ELSE 0 END), 0) AS total_payments,
        COALESCE(SUM(t_amount), 0) AS balance,
        COUNT(*) AS movements_count,
        MAX(t_date) AS last_tx_date
      FROM (
        ${unioned}
      ) t
      GROUP BY t_supplier, t_branch_id, t_branch_name
      ${havingPart}
      ORDER BY branch_name ASC, balance DESC, supplier_name ASC
    `;

    const params = [
      ...dateParamsReconciled,
      ...branchParamsReconciled,
      ...dateParamsManual,
      ...branchParamsManual,
      ...nameParams
    ];

    return { sql, params };
  }

  async function loadSupplierLedger() {
    await ensureManualSupplierTable();
    const tbody = document.getElementById('supplierLedgerTable');
    if (!tbody) return [];

    const filters = getSupplierLedgerFilters();
    const currentSignature = JSON.stringify(filters);

    if (supplierLedgerLoadPromise && currentSignature === lastSupplierLedgerFiltersSignature) {
      return supplierLedgerLoadPromise;
    }

    lastSupplierLedgerFiltersSignature = currentSignature;
    const requestId = ++supplierLedgerLoadSequence;
    supplierLedgerRowsCache = [];
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">جاري التحميل...</td></tr>';
    updateSupplierLedgerSelectionUi();

    supplierLedgerLoadPromise = (async () => {
      try {
        const { sql, params } = buildSupplierLedgerQuery(filters);
        const rows = await ledgerIpc.invoke('db-query', sql, params);

        if (requestId !== supplierLedgerLoadSequence) {
          return rows || [];
        }

        const safeRows = rows || [];
        supplierLedgerRowsCache = safeRows;
        syncSupplierLedgerSelectionWithRows();
        renderSupplierLedgerTable(safeRows);
        updateSupplierLedgerSummaryCards(safeRows, filters);
        updateSupplierLedgerSelectionUi();
        await refreshSupplierUndoMergeState();
        return safeRows;
      } catch (error) {
        if (requestId !== supplierLedgerLoadSequence) {
          return [];
        }

        console.error('Error loading supplier ledger:', error);
        supplierLedgerRowsCache = [];
        syncSupplierLedgerSelectionWithRows();
        tbody.innerHTML = '<tr><td colspan="9" class="text-danger text-center">حدث خطأ أثناء تحميل البيانات</td></tr>';
        updateSupplierLedgerSummaryCards([], filters);
        updateSupplierLedgerSelectionUi();
        await refreshSupplierUndoMergeState();
        return [];
      } finally {
        if (requestId === supplierLedgerLoadSequence) {
          supplierLedgerLoadPromise = null;
        }
      }
    })();

    return supplierLedgerLoadPromise;
  }

  function renderSupplierLedgerTable(rows) {
    const tbody = document.getElementById('supplierLedgerTable');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">لا توجد بيانات مطابقة</td></tr>';
      return;
    }

    const fmt = getCurrencyFormatter();
    tbody.innerHTML = rows.map((row) => {
      const lastDate = row.last_tx_date ? escapeHtml(row.last_tx_date) : '-';
      const supplierName = row.supplier_name || '';
      const branchId = row.branch_id != null ? String(row.branch_id) : '';
      const selectionKey = buildSupplierSelectionKey(supplierName, branchId);
      const checked = selectedSupplierMergeKeys.has(selectionKey) ? 'checked' : '';
      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="form-check-input supplier-ledger-select-checkbox"
              data-selection-key="${escapeAttr(selectionKey)}"
              ${checked}
              aria-label="تحديد المورد ${escapeAttr(supplierName)}">
          </td>
          <td>${escapeHtml(supplierName)}</td>
          <td>${escapeHtml(row.branch_name || '')}</td>
          <td class="text-currency">${fmt(row.total_invoices || 0)}</td>
          <td class="text-currency">${fmt(row.total_payments || 0)}</td>
          <td class="text-currency fw-bold ${Number(row.balance) > 0 ? 'text-deficit' : (Number(row.balance) < 0 ? 'text-success' : '')}">
            ${fmt(row.balance || 0)}
          </td>
          <td>${lastDate}</td>
          <td>${row.movements_count || 0}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="showSupplierStatement('${escapeAttr(supplierName)}', '${escapeAttr(branchId)}')">كشف حساب</button>
            <button class="btn btn-sm btn-outline-warning ms-1" onclick="renameSupplierNameInLedger('${escapeAttr(supplierName)}', '${escapeAttr(branchId)}')">
              <i class="bi bi-pencil-square"></i> تعديل الاسم
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function buildSupplierSelectionKey(supplierName, branchId) {
    const safeName = String(supplierName == null ? '' : supplierName);
    const safeBranchId = normalizeBranchId(branchId) || '0';
    return JSON.stringify({ name: safeName, branchId: safeBranchId });
  }

  function syncSupplierLedgerSelectionWithRows() {
    const availableKeys = new Set(
      (supplierLedgerRowsCache || []).map((row) => buildSupplierSelectionKey(row?.supplier_name, row?.branch_id))
    );

    selectedSupplierMergeKeys.forEach((key) => {
      if (!availableKeys.has(key)) {
        selectedSupplierMergeKeys.delete(key);
      }
    });
  }

  function getSelectedSupplierRows() {
    if (!Array.isArray(supplierLedgerRowsCache) || supplierLedgerRowsCache.length === 0) {
      return [];
    }

    return supplierLedgerRowsCache.filter((row) => {
      const key = buildSupplierSelectionKey(row?.supplier_name, row?.branch_id);
      return selectedSupplierMergeKeys.has(key);
    });
  }

  function clearSupplierLedgerSelection() {
    selectedSupplierMergeKeys.clear();

    const rowChecks = document.querySelectorAll('.supplier-ledger-select-checkbox');
    rowChecks.forEach((checkbox) => {
      checkbox.checked = false;
    });

    updateSupplierLedgerSelectionUi();
  }

  function toggleSupplierLedgerSelectAll(isChecked) {
    const visibleRows = Array.isArray(supplierLedgerRowsCache) ? supplierLedgerRowsCache : [];
    visibleRows.forEach((row) => {
      const key = buildSupplierSelectionKey(row?.supplier_name, row?.branch_id);
      if (isChecked) {
        selectedSupplierMergeKeys.add(key);
      } else {
        selectedSupplierMergeKeys.delete(key);
      }
    });

    const rowChecks = document.querySelectorAll('.supplier-ledger-select-checkbox');
    rowChecks.forEach((checkbox) => {
      checkbox.checked = isChecked;
    });

    updateSupplierLedgerSelectionUi();
  }

  function updateSupplierLedgerSelectionUi() {
    const summaryEl = document.getElementById('supplierLedgerSelectionSummary');
    const mergeBtn = document.getElementById('supplierLedgerMergeSelectedBtn');
    const undoBtn = document.getElementById('supplierLedgerUndoMergeBtn');
    const clearBtn = document.getElementById('supplierLedgerClearSelectionBtn');
    const selectAll = document.getElementById('supplierLedgerSelectAll');
    const selectedRows = getSelectedSupplierRows();
    const totalRows = Array.isArray(supplierLedgerRowsCache) ? supplierLedgerRowsCache.length : 0;
    const selectedCount = selectedRows.length;

    const selectedBranchSet = new Set(
      selectedRows.map((row) => normalizeBranchId(row?.branch_id) || '0')
    );
    const hasMixedBranches = selectedBranchSet.size > 1;
    const canMerge = selectedCount >= 2 && !hasMixedBranches;

    if (summaryEl) {
      if (selectedCount === 0) {
        summaryEl.textContent = 'لم يتم تحديد أي مورد';
      } else if (hasMixedBranches) {
        summaryEl.textContent = `تم تحديد ${selectedCount} مورد (من أكثر من فرع - الدمج غير مسموح)`;
      } else {
        const branchLabel = selectedRows[0]?.branch_name || 'غير محدد';
        summaryEl.textContent = `تم تحديد ${selectedCount} مورد للدمج - الفرع: ${branchLabel}`;
      }
    }

    if (mergeBtn) {
      mergeBtn.disabled = !canMerge;
    }

    if (undoBtn) {
      undoBtn.disabled = !latestUndoableSupplierMerge;
      const createdAtText = latestUndoableSupplierMerge?.created_at
        ? formatMergeDateTime(latestUndoableSupplierMerge.created_at)
        : '';
      undoBtn.title = latestUndoableSupplierMerge
        ? `فك آخر دمج (${createdAtText || 'بدون تاريخ'})`
        : 'لا يوجد دمج متاح للفك';
    }

    if (clearBtn) {
      clearBtn.disabled = selectedCount === 0;
    }

    if (selectAll) {
      if (totalRows === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.disabled = true;
      } else {
        const allSelected = selectedCount > 0 && selectedCount === totalRows;
        const someSelected = selectedCount > 0 && selectedCount < totalRows;
        selectAll.disabled = false;
        selectAll.checked = allSelected;
        selectAll.indeterminate = someSelected;
      }
    }
  }

  async function mergeSelectedSuppliersInLedger() {
    const selectedRows = getSelectedSupplierRows();
    if (selectedRows.length < 2) {
      showErrorToast('حدد موردين على الأقل لتنفيذ الدمج');
      return;
    }

    const branchIds = Array.from(new Set(
      selectedRows.map((row) => normalizeBranchId(row?.branch_id) || '0')
    ));

    if (branchIds.length !== 1) {
      showErrorToast('لا يمكن دمج موردين من أكثر من فرع. اختر موردين من نفس الفرع فقط');
      return;
    }

    const uniqueNames = Array.from(new Set(
      selectedRows
        .map((row) => String(row?.supplier_name == null ? '' : row.supplier_name))
        .filter((name) => name.trim().length > 0)
    ));

    if (uniqueNames.length < 2) {
      showErrorToast('حدد موردين مختلفين على الأقل لتنفيذ الدمج');
      return;
    }

    const targetName = await promptMergeTargetSupplierName(uniqueNames);
    if (!targetName) {
      return;
    }

    const sourceNames = uniqueNames.filter((name) => name !== targetName);
    if (sourceNames.length === 0) {
      showErrorToast('اختر مورداً هدفاً مختلفاً عن الموردين المراد دمجهم');
      return;
    }

    const normalizedBranchId = normalizeBranchId(branchIds[0]);
    const branchLabel = selectedRows[0]?.branch_name || 'غير محدد';
    const preview = await buildSupplierMergePreview(sourceNames, targetName, normalizedBranchId);
    const confirmed = await confirmSupplierMergeExecution({
      sourceNames,
      targetName,
      branchLabel,
      preview
    });
    if (!confirmed) {
      return;
    }

    try {
      const mergeResult = await executeSupplierMergeTransaction(sourceNames, targetName, normalizedBranchId);
      selectedSupplierMergeKeys.clear();
      await loadSupplierLedger();

      const currentName = String(currentSupplierStatementContext?.supplierName || '');
      const currentBranch = normalizeBranchId(currentSupplierStatementContext?.forcedBranchId || '');
      const shouldRefreshStatement = currentBranch === normalizedBranchId
        && (sourceNames.includes(currentName) || currentName === targetName);
      if (shouldRefreshStatement) {
        currentSupplierStatementContext = {
          supplierName: targetName,
          forcedBranchId: normalizedBranchId
        };
        const modalTitle = document.getElementById('supplierStatementTitle');
        if (modalTitle) {
          modalTitle.textContent = `كشف حساب المورد - ${targetName}`;
        }
        await refreshSupplierStatementData(targetName, normalizedBranchId);
      }

      const changed = Number(mergeResult?.totalChanges || 0);
      showSuccessToast(`تم دمج الموردين المحددين بنجاح (${changed} حركة محدثة)`);
    } catch (error) {
      console.error('Error merging selected suppliers:', error);
      showErrorToast(`تعذر دمج الموردين: ${mapSupplierLedgerDbError(error)}`);
    }
  }

  async function promptMergeTargetSupplierName(candidateNames) {
    const names = Array.isArray(candidateNames)
      ? candidateNames.filter((name) => String(name == null ? '' : name).trim().length > 0)
      : [];

    if (names.length < 2) {
      return null;
    }

    if (window.Swal) {
      const inputOptions = {};
      names.forEach((name, index) => {
        inputOptions[String(index)] = `${index + 1}) ${formatSupplierNameForSelection(name)}`;
      });

      const result = await window.Swal.fire({
        title: 'اختيار المورد الهدف',
        text: 'المورد الهدف هو الاسم الذي سيبقى بعد الدمج',
        input: 'select',
        inputOptions,
        inputPlaceholder: 'اختر المورد الهدف',
        showCancelButton: true,
        confirmButtonText: 'متابعة',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
          if (value == null || value === '') return 'اختر المورد الهدف';
          return null;
        }
      });

      if (!result.isConfirmed) {
        return null;
      }

      const selectedIndex = Number.parseInt(String(result.value), 10);
      if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= names.length) {
        return null;
      }
      return names[selectedIndex];
    }

    const optionsText = names
      .map((name, index) => `${index + 1}) ${formatSupplierNameForSelection(name)}`)
      .join('\n');
    const raw = window.prompt(`اختر رقم الاسم النهائي (المورد الهدف):\n${optionsText}`, '1');
    if (raw == null) return null;
    const selectedIndex = Number.parseInt(String(raw || '').trim(), 10) - 1;
    if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= names.length) {
      showErrorToast('الاختيار غير صالح');
      return null;
    }
    return names[selectedIndex];
  }

  async function buildSupplierMergePreview(sourceNames, targetName, branchId) {
    const [sourceTotals, targetTotals] = await Promise.all([
      fetchSupplierAggregateForNames(sourceNames, branchId),
      fetchSupplierAggregateForNames([targetName], branchId)
    ]);

    return {
      source: sourceTotals,
      target: targetTotals,
      after: {
        movementsCount: Number(sourceTotals.movementsCount || 0) + Number(targetTotals.movementsCount || 0),
        totalInvoices: Number(sourceTotals.totalInvoices || 0) + Number(targetTotals.totalInvoices || 0),
        totalPayments: Number(sourceTotals.totalPayments || 0) + Number(targetTotals.totalPayments || 0)
      }
    };
  }

  function formatSupplierNameForSelection(name) {
    const raw = String(name == null ? '' : name);
    const visible = raw.trim() || raw || '(فارغ)';
    const hasLeading = /^\s+/.test(raw);
    const hasTrailing = /\s+$/.test(raw);
    const hasInternalMultiSpaces = /\s{2,}/.test(raw.trim());
    const notes = [];

    if (hasLeading) notes.push('مسافة بالبداية');
    if (hasTrailing) notes.push('مسافة بالنهاية');
    if (hasInternalMultiSpaces) notes.push('مسافات داخلية متعددة');

    if (notes.length === 0) {
      return visible;
    }

    return `${visible} (${notes.join('، ')})`;
  }

  async function fetchSupplierAggregateForNames(names, branchId) {
    const safeNames = Array.from(new Set(
      (Array.isArray(names) ? names : [])
        .map((name) => String(name == null ? '' : name))
        .filter((name) => name.trim().length > 0)
    ));

    if (safeNames.length === 0) {
      return {
        movementsCount: 0,
        totalInvoices: 0,
        totalPayments: 0,
        balance: 0
      };
    }

    const normalizedBranchId = normalizeBranchId(branchId);
    const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
    const placeholders = safeNames.map(() => '?').join(', ');
    const sql = `
      SELECT
        COUNT(*) AS movements_count,
        COALESCE(SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END), 0) AS total_invoices,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_payments
      FROM (
        SELECT -ABS(s.amount) AS amount
        FROM suppliers s
        LEFT JOIN reconciliations r ON r.id = s.reconciliation_id
        LEFT JOIN cashiers c ON c.id = r.cashier_id
        WHERE s.supplier_name IN (${placeholders})
          AND COALESCE(c.branch_id, 0) = ?

        UNION ALL

        SELECT
          CASE
            WHEN mst.transaction_type = 'payment' THEN -ABS(mst.amount)
            ELSE ABS(mst.amount)
          END AS amount
        FROM manual_supplier_transactions mst
        WHERE mst.supplier_name IN (${placeholders})
          AND COALESCE(mst.branch_id, 0) = ?
      ) tx
    `;

    const params = [
      ...safeNames,
      numericBranchId,
      ...safeNames,
      numericBranchId
    ];
    const rows = await ledgerIpc.invoke('db-query', sql, params);
    const row = Array.isArray(rows) ? rows[0] : null;
    const totalInvoices = Number(row?.total_invoices || 0);
    const totalPayments = Number(row?.total_payments || 0);
    return {
      movementsCount: Number(row?.movements_count || 0),
      totalInvoices,
      totalPayments,
      balance: totalInvoices - totalPayments
    };
  }

  async function confirmSupplierMergeExecution({ sourceNames, targetName, branchLabel, preview }) {
    const fmt = getCurrencyFormatter();
    const mergedNamesLabel = Array.isArray(sourceNames) ? sourceNames.join(' + ') : '';
    const movedCount = Number(preview?.source?.movementsCount || 0);
    const finalCount = Number(preview?.after?.movementsCount || 0);
    const finalInvoices = Number(preview?.after?.totalInvoices || 0);
    const finalPayments = Number(preview?.after?.totalPayments || 0);
    const finalBalance = finalInvoices - finalPayments;

    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning',
        title: 'تأكيد دمج الموردين',
        html: `
          <div style="text-align:right;line-height:1.8">
            <div><strong>الفرع:</strong> ${escapeHtml(branchLabel || 'غير محدد')}</div>
            <div><strong>سيتم دمج:</strong> ${escapeHtml(mergedNamesLabel || '-')}</div>
            <div><strong>في المورد:</strong> ${escapeHtml(targetName || '-')}</div>
            <hr style="margin:8px 0;">
            <div><strong>الحركات المنقولة:</strong> ${escapeHtml(String(movedCount))}</div>
            <div><strong>عدد الحركات بعد الدمج:</strong> ${escapeHtml(String(finalCount))}</div>
            <div><strong>إجمالي المستحقات بعد الدمج:</strong> ${escapeHtml(fmt(finalInvoices))}</div>
            <div><strong>إجمالي السداد بعد الدمج:</strong> ${escapeHtml(fmt(finalPayments))}</div>
            <div><strong>الرصيد بعد الدمج:</strong> ${escapeHtml(fmt(finalBalance))}</div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تنفيذ الدمج',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33'
      });
      return !!result.isConfirmed;
    }

    return window.confirm(
      `سيتم دمج الموردين (${mergedNamesLabel}) في (${targetName}) ضمن فرع (${branchLabel}). هل تريد المتابعة؟`
    );
  }

  async function ensureSupplierLedgerMergeHistoryTable() {
    if (supplierLedgerMergeHistoryReady) {
      return;
    }

    await ledgerIpc.invoke(
      'db-run',
      `CREATE TABLE IF NOT EXISTS ledger_merge_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        branch_id INTEGER DEFAULT 0,
        target_name TEXT NOT NULL,
        source_names_json TEXT NOT NULL,
        affected_rows_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        undone_at DATETIME,
        undo_details_json TEXT
      )`
    );
    await ledgerIpc.invoke(
      'db-run',
      'CREATE INDEX IF NOT EXISTS idx_ledger_merge_history_entity_open ON ledger_merge_history(entity_type, undone_at, id DESC)'
    );

    supplierLedgerMergeHistoryReady = true;
  }

  function safeParseJson(value, fallback) {
    if (value == null || value === '') {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }

  function normalizeMergeRowEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((row) => {
        const id = Number(row?.id);
        const oldNameSource = row?.old_name == null ? row?.oldName : row.old_name;
        const oldName = String(oldNameSource == null ? '' : oldNameSource);
        if (!Number.isFinite(id) || id <= 0) {
          return null;
        }
        return {
          id,
          old_name: oldName
        };
      })
      .filter((row) => !!row);
  }

  function normalizeSupplierMergeAffectedRows(rawValue) {
    const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
    return {
      suppliers: normalizeMergeRowEntries(raw.suppliers),
      manual_supplier_transactions: normalizeMergeRowEntries(raw.manual_supplier_transactions)
    };
  }

  function countSupplierMergeAffectedRows(affectedRows) {
    const normalized = normalizeSupplierMergeAffectedRows(affectedRows);
    return normalized.suppliers.length + normalized.manual_supplier_transactions.length;
  }

  async function fetchLatestUndoableSupplierMerge() {
    await ensureSupplierLedgerMergeHistoryTable();
    const rows = await ledgerIpc.invoke(
      'db-query',
      `SELECT h.id, h.branch_id, h.target_name, h.source_names_json, h.affected_rows_json, h.created_at,
              COALESCE(b.branch_name, 'غير محدد') AS branch_name
       FROM ledger_merge_history h
       LEFT JOIN branches b ON b.id = h.branch_id
       WHERE h.entity_type = 'supplier' AND h.undone_at IS NULL
       ORDER BY h.id DESC
       LIMIT 1`
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return null;
    }

    const sourceNames = Array.from(new Set(
      (safeParseJson(row.source_names_json, []) || [])
        .map((name) => String(name == null ? '' : name))
        .filter((name) => name.trim().length > 0)
    ));
    const affectedRows = normalizeSupplierMergeAffectedRows(
      safeParseJson(row.affected_rows_json, {})
    );

    return {
      id: Number(row.id || 0),
      branch_id: normalizeBranchId(row.branch_id) || '0',
      branch_name: String(row.branch_name == null ? '' : row.branch_name),
      target_name: String(row.target_name == null ? '' : row.target_name),
      source_names: sourceNames,
      affected_rows: affectedRows,
      created_at: row.created_at || ''
    };
  }

  async function refreshSupplierUndoMergeState() {
    try {
      latestUndoableSupplierMerge = await fetchLatestUndoableSupplierMerge();
    } catch (error) {
      console.error('Error loading latest supplier merge history:', error);
      latestUndoableSupplierMerge = null;
    }
    updateSupplierLedgerSelectionUi();
  }

  async function fetchSupplierMergeAffectedRows({ safeSourceNames, numericBranchId, placeholders }) {
    const suppliersRows = await ledgerIpc.invoke(
      'db-query',
      `SELECT s.id AS id, s.supplier_name AS old_name
       FROM suppliers s
       WHERE s.supplier_name IN (${placeholders})
         AND s.reconciliation_id IN (
           SELECT r.id
           FROM reconciliations r
           LEFT JOIN cashiers c ON c.id = r.cashier_id
           WHERE COALESCE(c.branch_id, 0) = ?
         )`,
      [...safeSourceNames, numericBranchId]
    );

    const manualRows = await ledgerIpc.invoke(
      'db-query',
      `SELECT mst.id AS id, mst.supplier_name AS old_name
       FROM manual_supplier_transactions mst
       WHERE mst.supplier_name IN (${placeholders})
         AND COALESCE(mst.branch_id, 0) = ?`,
      [...safeSourceNames, numericBranchId]
    );

    return normalizeSupplierMergeAffectedRows({
      suppliers: suppliersRows || [],
      manual_supplier_transactions: manualRows || []
    });
  }

  async function recordSupplierMergeHistory({ numericBranchId, safeTargetName, safeSourceNames, affectedRows }) {
    await ensureSupplierLedgerMergeHistoryTable();
    const result = await ledgerIpc.invoke(
      'db-run',
      `INSERT INTO ledger_merge_history
        (entity_type, branch_id, target_name, source_names_json, affected_rows_json)
       VALUES ('supplier', ?, ?, ?, ?)`,
      [
        numericBranchId,
        safeTargetName,
        JSON.stringify(safeSourceNames),
        JSON.stringify(affectedRows)
      ]
    );
    return Number(result?.lastInsertRowid || 0);
  }

  async function executeSupplierMergeTransaction(sourceNames, targetName, branchId) {
    const safeTargetName = String(targetName == null ? '' : targetName);
    const safeSourceNames = Array.from(new Set(
      (Array.isArray(sourceNames) ? sourceNames : [])
        .map((name) => String(name == null ? '' : name))
        .filter((name) => name.trim().length > 0 && name !== safeTargetName)
    ));
    if (safeSourceNames.length === 0) {
      return { reconciledChanges: 0, manualChanges: 0, totalChanges: 0 };
    }

    const normalizedBranchId = normalizeBranchId(branchId);
    const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
    const placeholders = safeSourceNames.map(() => '?').join(', ');
    const suppliersParams = [safeTargetName, ...safeSourceNames, numericBranchId];
    const manualParams = [safeTargetName, ...safeSourceNames, numericBranchId];
    await ensureSupplierLedgerMergeHistoryTable();

    await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
    let committed = false;
    try {
      const affectedRows = await fetchSupplierMergeAffectedRows({
        safeSourceNames,
        numericBranchId,
        placeholders
      });
      const affectedRowsCount = countSupplierMergeAffectedRows(affectedRows);
      if (affectedRowsCount <= 0) {
        throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من اختلافات الاسم الخفية.');
      }

      const reconciledUpdateResult = await ledgerIpc.invoke(
        'db-run',
        `UPDATE suppliers
         SET supplier_name = ?
         WHERE supplier_name IN (${placeholders})
           AND reconciliation_id IN (
             SELECT r.id
             FROM reconciliations r
             LEFT JOIN cashiers c ON c.id = r.cashier_id
             WHERE COALESCE(c.branch_id, 0) = ?
           )`,
        suppliersParams
      );

      const manualUpdateResult = await ledgerIpc.invoke(
        'db-run',
        `UPDATE manual_supplier_transactions
         SET supplier_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE supplier_name IN (${placeholders})
           AND COALESCE(branch_id, 0) = ?`,
        manualParams
      );

      const reconciledChanges = Number(reconciledUpdateResult?.changes || 0);
      const manualChanges = Number(manualUpdateResult?.changes || 0);
      const totalChanges = reconciledChanges + manualChanges;
      if (totalChanges <= 0) {
        throw new Error('لم يتم العثور على قيود مطابقة للدمج. تحقق من اختلافات الاسم الخفية.');
      }

      const mergeHistoryId = await recordSupplierMergeHistory({
        numericBranchId,
        safeTargetName,
        safeSourceNames,
        affectedRows
      });

      await ledgerIpc.invoke('db-run', 'COMMIT');
      committed = true;
      await refreshSupplierUndoMergeState();
      return { reconciledChanges, manualChanges, totalChanges, mergeHistoryId };
    } catch (error) {
      if (!committed) {
        try {
          await ledgerIpc.invoke('db-run', 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Supplier merge rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }

  async function revertSupplierNamesByRowId(tableName, columnName, entries, targetName, options = {}) {
    const safeEntries = normalizeMergeRowEntries(entries);
    if (safeEntries.length === 0) {
      return 0;
    }

    const extraSetClause = options.extraSetClause ? `, ${options.extraSetClause}` : '';
    let changed = 0;
    for (const entry of safeEntries) {
      const result = await ledgerIpc.invoke(
        'db-run',
        `UPDATE ${tableName}
         SET ${columnName} = ?${extraSetClause}
         WHERE id = ?
           AND ${columnName} = ?`,
        [entry.old_name, entry.id, targetName]
      );
      changed += Number(result?.changes || 0);
    }
    return changed;
  }

  async function rollbackSupplierMergeRecord(mergeRecord) {
    const recordId = Number(mergeRecord?.id || 0);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      throw new Error('سجل الدمج غير صالح');
    }

    const safeTargetName = String(mergeRecord?.target_name == null ? '' : mergeRecord.target_name);
    const affectedRows = normalizeSupplierMergeAffectedRows(mergeRecord?.affected_rows);
    const expectedRows = countSupplierMergeAffectedRows(affectedRows);
    if (expectedRows <= 0) {
      throw new Error('لا توجد قيود محفوظة لفك هذا الدمج');
    }
    await ensureSupplierLedgerMergeHistoryTable();

    await ledgerIpc.invoke('db-run', 'BEGIN TRANSACTION');
    let committed = false;
    try {
      const suppliersRestored = await revertSupplierNamesByRowId(
        'suppliers',
        'supplier_name',
        affectedRows.suppliers,
        safeTargetName
      );
      const manualRestored = await revertSupplierNamesByRowId(
        'manual_supplier_transactions',
        'supplier_name',
        affectedRows.manual_supplier_transactions,
        safeTargetName,
        { extraSetClause: 'updated_at = CURRENT_TIMESTAMP' }
      );

      const restoredTotal = suppliersRestored + manualRestored;
      if (restoredTotal <= 0) {
        throw new Error('لا يمكن فك الدمج: لم يتم العثور على قيود مطابقة للحالة الحالية.');
      }

      const skippedRows = Math.max(0, expectedRows - restoredTotal);
      const undoDetails = {
        restored: {
          suppliers: suppliersRestored,
          manual_supplier_transactions: manualRestored
        },
        expected_rows: expectedRows,
        skipped_rows: skippedRows
      };

      const markResult = await ledgerIpc.invoke(
        'db-run',
        `UPDATE ledger_merge_history
         SET undone_at = CURRENT_TIMESTAMP,
             undo_details_json = ?
         WHERE id = ?
           AND undone_at IS NULL`,
        [JSON.stringify(undoDetails), recordId]
      );
      if (Number(markResult?.changes || 0) <= 0) {
        throw new Error('تعذر تحديث حالة سجل الدمج');
      }

      await ledgerIpc.invoke('db-run', 'COMMIT');
      committed = true;
      await refreshSupplierUndoMergeState();
      return {
        restoredTotal,
        expectedRows,
        skippedRows
      };
    } catch (error) {
      if (!committed) {
        try {
          await ledgerIpc.invoke('db-run', 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Supplier merge undo rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }

  async function confirmSupplierMergeUndoExecution(mergeRecord) {
    const sourceNames = Array.isArray(mergeRecord?.source_names) ? mergeRecord.source_names : [];
    const sourceLabel = sourceNames.length > 0 ? sourceNames.join(' + ') : '-';
    const affectedCount = countSupplierMergeAffectedRows(mergeRecord?.affected_rows);
    const branchLabel = mergeRecord?.branch_name || mergeRecord?.branch_id || 'غير محدد';
    const createdAt = formatMergeDateTime(mergeRecord?.created_at);

    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning',
        title: 'تأكيد فك آخر دمج (الموردين)',
        html: `
          <div style="text-align:right;line-height:1.8">
            <div><strong>تاريخ الدمج:</strong> ${escapeHtml(createdAt || '-')}</div>
            <div><strong>الفرع:</strong> ${escapeHtml(String(branchLabel))}</div>
            <div><strong>الاسم الهدف:</strong> ${escapeHtml(mergeRecord?.target_name || '-')}</div>
            <div><strong>الأسماء المدمجة:</strong> ${escapeHtml(sourceLabel)}</div>
            <div><strong>عدد القيود المتوقع استرجاعها:</strong> ${escapeHtml(String(affectedCount))}</div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'فك الدمج',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33'
      });
      return !!result.isConfirmed;
    }

    return window.confirm(
      `سيتم فك آخر دمج للموردين (${sourceLabel}) من (${mergeRecord?.target_name || '-'}) بعدد قيود متوقع ${affectedCount}. هل تريد المتابعة؟`
    );
  }

  async function undoLastSupplierMergeInLedger() {
    try {
      const mergeRecord = latestUndoableSupplierMerge || await fetchLatestUndoableSupplierMerge();
      if (!mergeRecord) {
        showErrorToast('لا يوجد دمج محفوظ يمكن فكه حاليًا');
        await refreshSupplierUndoMergeState();
        return;
      }

      const confirmed = await confirmSupplierMergeUndoExecution(mergeRecord);
      if (!confirmed) {
        return;
      }

      const undoResult = await rollbackSupplierMergeRecord(mergeRecord);
      selectedSupplierMergeKeys.clear();
      await loadSupplierLedger();

      const currentName = String(currentSupplierStatementContext?.supplierName || '');
      const currentBranch = normalizeBranchId(currentSupplierStatementContext?.forcedBranchId || '');
      const mergeBranch = normalizeBranchId(mergeRecord.branch_id);
      const impactedNames = new Set([mergeRecord.target_name, ...(mergeRecord.source_names || [])]);
      if (currentBranch === mergeBranch && impactedNames.has(currentName)) {
        await refreshSupplierStatementData(currentName, mergeBranch);
      }

      const skippedText = undoResult.skippedRows > 0
        ? `، مع ${undoResult.skippedRows} قيد لم يتغير لأنه عُدّل بعد الدمج`
        : '';
      showSuccessToast(`تم فك آخر دمج للموردين بنجاح (${undoResult.restoredTotal} قيد مسترجع${skippedText})`);
    } catch (error) {
      console.error('Error undoing supplier merge:', error);
      showErrorToast(`تعذر فك الدمج: ${mapSupplierLedgerDbError(error)}`);
    }
  }

  async function renameSupplierNameInLedger(supplierName, branchId = '') {
    const oldName = String(supplierName == null ? '' : supplierName);
    if (!oldName.trim()) return;

    try {
      await ensureManualSupplierTable();
      const normalizedBranchId = normalizeBranchId(branchId);
      const numericBranchId = normalizedBranchId ? Number(normalizedBranchId) : 0;
      const nextName = await promptForSupplierRename(oldName);
      if (nextName === null) {
        return;
      }
      if (nextName === oldName) {
        showSuccessToast('لم يتم تغيير الاسم');
        return;
      }

      const branchSupplierExists = await doesSupplierNameExistInBranch(nextName, numericBranchId);
      if (branchSupplierExists) {
        const confirmed = await confirmSupplierMerge(nextName);
        if (!confirmed) {
          return;
        }
      }

      await renameSupplierNameInBranch(oldName, nextName, numericBranchId);
      await loadSupplierLedger();

      const currentContextName = String(currentSupplierStatementContext?.supplierName || '');
      const currentContextBranch = normalizeBranchId(currentSupplierStatementContext?.forcedBranchId || '');
      const canRefreshStatement = currentContextName === oldName
        && currentContextBranch === normalizedBranchId;
      if (canRefreshStatement) {
        currentSupplierStatementContext = {
          supplierName: nextName,
          forcedBranchId: normalizedBranchId
        };
        const modalTitle = document.getElementById('supplierStatementTitle');
        if (modalTitle) {
          modalTitle.textContent = `كشف حساب المورد - ${nextName}`;
        }
        await refreshSupplierStatementData(nextName, normalizedBranchId);
      }

      showSuccessToast('تم تعديل اسم المورد بنجاح');
    } catch (error) {
      console.error('Error renaming supplier name in ledger:', error);
      showErrorToast(`تعذر تعديل اسم المورد: ${mapSupplierLedgerDbError(error)}`);
    }
  }

  async function renameSupplierNameInBranch(oldName, nextName, numericBranchId) {
    await ledgerIpc.invoke(
      'db-run',
      `UPDATE suppliers
       SET supplier_name = ?
       WHERE supplier_name = ?
         AND reconciliation_id IN (
           SELECT r.id
           FROM reconciliations r
           LEFT JOIN cashiers c ON c.id = r.cashier_id
           WHERE COALESCE(c.branch_id, 0) = ?
         )`,
      [nextName, oldName, numericBranchId]
    );

    await ledgerIpc.invoke(
      'db-run',
      `UPDATE manual_supplier_transactions
       SET supplier_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE supplier_name = ?
         AND COALESCE(branch_id, 0) = ?`,
      [nextName, oldName, numericBranchId]
    );
  }

  async function doesSupplierNameExistInBranch(name, numericBranchId) {
    const rows = await ledgerIpc.invoke(
      'db-query',
      `SELECT
         (CASE WHEN EXISTS (
           SELECT 1
           FROM suppliers s
           LEFT JOIN reconciliations r ON r.id = s.reconciliation_id
           LEFT JOIN cashiers c ON c.id = r.cashier_id
           WHERE s.supplier_name = ?
             AND COALESCE(c.branch_id, 0) = ?
         ) THEN 1 ELSE 0 END)
         +
         (CASE WHEN EXISTS (
           SELECT 1
           FROM manual_supplier_transactions mst
           WHERE mst.supplier_name = ?
             AND COALESCE(mst.branch_id, 0) = ?
         ) THEN 1 ELSE 0 END) AS total`,
      [name, numericBranchId, name, numericBranchId]
    );
    const total = Number(rows?.[0]?.total || 0);
    return total > 0;
  }

  async function promptForSupplierRename(currentName) {
    if (window.Swal) {
      const result = await window.Swal.fire({
        title: 'تعديل اسم المورد',
        input: 'text',
        inputLabel: 'الاسم الجديد',
        inputValue: currentName,
        inputPlaceholder: 'اكتب اسم المورد الجديد',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
          const next = String(value || '').trim();
          if (!next) return 'اسم المورد مطلوب';
          if (next.length > 120) return 'اسم المورد طويل جداً';
          return null;
        }
      });
      if (!result.isConfirmed) {
        return null;
      }
      return String(result.value || '').trim();
    }

    const value = window.prompt('أدخل الاسم الجديد للمورد:', currentName);
    if (value == null) return null;
    const next = String(value).trim();
    if (!next) {
      showErrorToast('اسم المورد مطلوب');
      return null;
    }
    if (next.length > 120) {
      showErrorToast('اسم المورد طويل جداً');
      return null;
    }
    return next;
  }

  async function confirmSupplierMerge(nextName) {
    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning',
        title: 'الاسم موجود مسبقاً',
        text: `الاسم "${nextName}" موجود بالفعل في نفس الفرع. المتابعة ستدمج الحركات تحت نفس الاسم.`,
        showCancelButton: true,
        confirmButtonText: 'متابعة الدمج',
        cancelButtonText: 'إلغاء'
      });
      return !!result.isConfirmed;
    }
    return window.confirm('الاسم موجود مسبقاً في نفس الفرع. المتابعة ستدمج الحركات. هل تريد الاستمرار؟');
  }

  function buildSupplierStatementFilterSql(filters) {
    let reconciledSql = '';
    let manualSql = '';
    const reconciledParams = [];
    const manualParams = [];

    if (filters.dateFrom) {
      reconciledSql += ' AND DATE(COALESCE(r.reconciliation_date, s.created_at)) >= DATE(?)';
      manualSql += ' AND DATE(mst.created_at) >= DATE(?)';
      reconciledParams.push(filters.dateFrom);
      manualParams.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      reconciledSql += ' AND DATE(COALESCE(r.reconciliation_date, s.created_at)) <= DATE(?)';
      manualSql += ' AND DATE(mst.created_at) <= DATE(?)';
      reconciledParams.push(filters.dateTo);
      manualParams.push(filters.dateTo);
    }

    if (filters.branchId) {
      reconciledSql += ' AND c.branch_id = ?';
      manualSql += ' AND mst.branch_id = ?';
      reconciledParams.push(filters.branchId);
      manualParams.push(filters.branchId);
    }

    return {
      reconciledSql,
      manualSql,
      reconciledParams,
      manualParams
    };
  }

  async function fetchSupplierStatementTransactions(supplierName, filters) {
    await ensureManualSupplierTable();
    const dateAndBranchFilter = buildSupplierStatementFilterSql(filters);
    const sql = `
      SELECT * FROM (
        SELECT
          s.id AS row_id,
          s.reconciliation_id AS reconciliation_id,
          'reconciled' AS source,
          -ABS(s.amount) AS amount,
          'payment' AS type,
          COALESCE(r.reconciliation_date, DATE(s.created_at)) AS tx_date,
          s.created_at AS created_at,
          r.reconciliation_number AS rec_no,
          s.invoice_number AS invoice_number,
          s.notes AS notes,
          c.name AS cashier_name,
          COALESCE(c.branch_id, 0) AS branch_id,
          COALESCE(b.branch_name, 'غير محدد') AS branch_name,
          NULL AS updated_at
        FROM suppliers s
        LEFT JOIN reconciliations r ON r.id = s.reconciliation_id
        LEFT JOIN cashiers c ON c.id = r.cashier_id
        LEFT JOIN branches b ON b.id = c.branch_id
        WHERE s.supplier_name = ?
        ${dateAndBranchFilter.reconciledSql}

        UNION ALL

        SELECT
          mst.id AS row_id,
          NULL AS reconciliation_id,
          'manual' AS source,
          CASE
            WHEN mst.transaction_type = 'payment' THEN -ABS(mst.amount)
            ELSE ABS(mst.amount)
          END AS amount,
          CASE
            WHEN mst.transaction_type = 'payment' THEN 'payment'
            ELSE 'invoice'
          END AS type,
          DATE(mst.created_at) AS tx_date,
          mst.created_at AS created_at,
          NULL AS rec_no,
          mst.reference_no AS invoice_number,
          mst.notes AS notes,
          'إدخال يدوي' AS cashier_name,
          COALESCE(mst.branch_id, 0) AS branch_id,
          COALESCE(b.branch_name, 'غير محدد') AS branch_name,
          mst.updated_at AS updated_at
        FROM manual_supplier_transactions mst
        LEFT JOIN branches b ON b.id = mst.branch_id
        WHERE mst.supplier_name = ?
        ${dateAndBranchFilter.manualSql}
      ) tx
      ORDER BY tx_date DESC, created_at DESC
    `;

    const params = [
      supplierName,
      ...dateAndBranchFilter.reconciledParams,
      supplierName,
      ...dateAndBranchFilter.manualParams
    ];

    return ledgerIpc.invoke('db-query', sql, params);
  }

  async function showSupplierStatement(supplierName, forcedBranchId = '') {
    try {
      const name = String(supplierName == null ? '' : supplierName);
      if (!name.trim()) return;
      const normalizedBranchId = normalizeBranchId(forcedBranchId);
      currentSupplierStatementContext = {
        supplierName: name,
        forcedBranchId: normalizedBranchId
      };

      const modalTitle = document.getElementById('supplierStatementTitle');
      if (modalTitle) {
        modalTitle.textContent = `كشف حساب المورد - ${name}`;
      }

      const statementTable = document.getElementById('supplierStatementTable');
      if (statementTable) {
        statementTable.innerHTML = '<tr><td colspan="7" class="text-center">جاري تحميل الحركات...</td></tr>';
      }

      setSupplierStatementTotals(0, 0, 0);
      setupSupplierStatementEvents(name, normalizedBranchId);
      openSupplierStatementModal();

      await refreshSupplierStatementData(name, normalizedBranchId);
    } catch (error) {
      console.error('Error showing supplier statement:', error);
      showErrorToast('حدث خطأ أثناء تحميل كشف حساب المورد');
    }
  }

  async function refreshSupplierStatementData(supplierName, forcedBranchId = '') {
    const name = String(supplierName == null ? '' : supplierName);
    if (!name.trim()) return;

    const filters = getSupplierLedgerFilters();
    if (forcedBranchId) {
      filters.branchId = forcedBranchId;
    }

    const transactions = await fetchSupplierStatementTransactions(name, filters);
    renderSupplierStatement(name, transactions || [], forcedBranchId);
  }

  function renderSupplierStatement(supplierName, transactions, forcedBranchId = '') {
    const tbody = document.getElementById('supplierStatementTable');
    if (!tbody) {
      return;
    }

    const fmt = getCurrencyFormatter();
    const allTx = Array.isArray(transactions) ? transactions : [];

    let totalInvoices = 0;
    let totalPayments = 0;
    allTx.forEach((tx) => {
      const amount = Number(tx.amount || 0);
      if (amount >= 0) {
        totalInvoices += amount;
      } else {
        totalPayments += Math.abs(amount);
      }
    });

    let running = totalInvoices - totalPayments;
    const rowsHtml = allTx.map((tx) => {
      const amount = Number(tx.amount || 0);
      const movementMeta = getSupplierMovementMeta(tx, amount);
      const kind = movementMeta.kindLabel;
      const kindBadges = buildSupplierMovementBadgeHtml(movementMeta);
      const absoluteAmount = Math.abs(amount);
      const invoiceInfo = tx.invoice_number || tx.notes || '-';
      const amountClass = movementMeta.amountClass;
      const amountText = fmt(absoluteAmount);
      const balanceText = fmt(running);
      let actions = '<span class="text-muted">-</span>';
      if (tx.source === 'manual') {
        const rowId = Number(tx.row_id) || 0;
        actions = `
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editManualSupplierTransactionEntry(${rowId}, '${escapeAttr(supplierName)}', '${escapeAttr(forcedBranchId)}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteManualSupplierTransaction(${rowId}, '${escapeAttr(supplierName)}', '${escapeAttr(forcedBranchId)}')">
            <i class="bi bi-trash"></i>
          </button>
        `;
      } else if (Number(tx.reconciliation_id || 0) > 0) {
        actions = `
          <button
            type="button"
            class="btn btn-sm btn-outline-info"
            onclick="window.openSupplierReconciliationFromStatement(${Number(tx.reconciliation_id)}, '${escapeAttr(forcedBranchId)}')"
            title="فتح التصفية المرتبطة">
            <i class="bi bi-box-arrow-up-right"></i> فتح التصفية
          </button>
        `;
      }

      if (movementMeta.isInvoice) {
        running -= absoluteAmount;
      } else {
        running += absoluteAmount;
      }

      return `
        <tr>
          <td>${escapeHtml(tx.tx_date || tx.created_at || '')}</td>
          <td>${escapeHtml(kind)} ${kindBadges}</td>
          <td>${escapeHtml(invoiceInfo)}</td>
          <td>${buildSupplierStatementReconciliationCell(tx, forcedBranchId)}</td>
          <td class="text-currency ${amountClass}">${amountText}</td>
          <td class="text-currency fw-bold">${balanceText}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    const balance = totalInvoices - totalPayments;
    setSupplierStatementTotals(totalInvoices, totalPayments, balance);
    tbody.innerHTML = rowsHtml || '<tr><td colspan="7" class="text-center">لا توجد حركات</td></tr>';

    // Persist last viewed supplier for print action.
    window.currentStatementSupplier = supplierName;
  }

  function closeSupplierStatementModal() {
    const modalEl = document.getElementById('supplierStatementModal');
    if (!modalEl) return;

    if (window.bootstrap?.Modal) {
      const modal = window.bootstrap.Modal.getInstance(modalEl);
      if (modal) {
        modal.hide();
        return;
      }
    }

    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
  }

  function activateReconciliationSectionFromLedger() {
    const reconciliationMenu = document.querySelector('a[data-section="reconciliation"]');
    if (reconciliationMenu && typeof reconciliationMenu.click === 'function') {
      reconciliationMenu.click();
      return;
    }

    const targetSection = document.getElementById('reconciliation-section');
    if (targetSection) {
      document.querySelectorAll('.content-section').forEach((section) => {
        section.classList.remove('active');
      });
      targetSection.classList.add('active');
    }
  }

  async function openSupplierReconciliationFromStatement(reconciliationId) {
    const numericId = Number.parseInt(reconciliationId, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showErrorToast('هذه الحركة غير مرتبطة بتصفية صالحة');
      return;
    }

    try {
      if (typeof window.recallReconciliationFromId === 'function') {
        const recalled = await window.recallReconciliationFromId(numericId);
        if (!recalled) {
          return;
        }
        closeSupplierStatementModal();
        activateReconciliationSectionFromLedger();
        return;
      }

      if (typeof window.editReconciliationNew === 'function') {
        closeSupplierStatementModal();
        await window.editReconciliationNew(numericId);
        return;
      }

      showErrorToast('تعذر فتح التصفية المرتبطة من هذه الشاشة');
    } catch (error) {
      console.error('Error opening reconciliation from supplier statement:', error);
      showErrorToast('حدث خطأ أثناء فتح التصفية المرتبطة');
    }
  }

  function buildSupplierStatementReconciliationCell(tx, forcedBranchId = '') {
    const reconciliationId = Number(tx?.reconciliation_id || 0);
    const recLabel = tx?.rec_no != null ? `#${tx.rec_no}` : (reconciliationId > 0 ? `#${reconciliationId}` : '-');
    const cashierLabel = tx?.cashier_name ? ` - ${escapeHtml(tx.cashier_name)}` : '';

    if (reconciliationId > 0 && tx?.source !== 'manual') {
      return `
        <button
          type="button"
          class="btn btn-link btn-sm p-0 align-baseline"
          onclick="window.openSupplierReconciliationFromStatement(${reconciliationId}, '${escapeAttr(forcedBranchId)}')"
          title="فتح التصفية المرتبطة">
          ${escapeHtml(recLabel)}
        </button>${cashierLabel}
      `;
    }

    return `${escapeHtml(recLabel)}${cashierLabel}`;
  }

  function setupSupplierStatementEvents(supplierName, forcedBranchId = '') {
    resetManualSupplierForm();
    manualSupplierEditingContext = null;

    const printBtn = document.getElementById('printSupplierStatementBtn');
    if (printBtn) {
      printBtn.replaceWith(printBtn.cloneNode(true));
      const boundPrintBtn = document.getElementById('printSupplierStatementBtn');
      if (boundPrintBtn) {
        boundPrintBtn.addEventListener('click', () => {
          printSupplierStatement(supplierName, forcedBranchId);
        });
      }
    }

    const addBtn = document.getElementById('addSupplierTransactionBtn');
    if (addBtn) {
      addBtn.replaceWith(addBtn.cloneNode(true));
      const boundAddBtn = document.getElementById('addSupplierTransactionBtn');
      if (boundAddBtn) {
        boundAddBtn.addEventListener('click', () => {
          addManualSupplierTransaction(supplierName, forcedBranchId);
        });
      }
    }

    const cancelEditBtn = document.getElementById('cancelSupplierTransactionEditBtn');
    if (cancelEditBtn) {
      cancelEditBtn.replaceWith(cancelEditBtn.cloneNode(true));
      const boundCancelBtn = document.getElementById('cancelSupplierTransactionEditBtn');
      if (boundCancelBtn) {
        boundCancelBtn.addEventListener('click', () => {
          cancelManualSupplierEdit();
        });
      }
    }
  }

  async function addManualSupplierTransaction(supplierName, forcedBranchId = '') {
    try {
      await ensureManualSupplierTable();
      const name = String(supplierName == null ? '' : supplierName);
      if (!name.trim()) return;

      const typeEl = document.getElementById('newSupplierTransactionType');
      const amountEl = document.getElementById('newSupplierTransactionAmount');
      const refEl = document.getElementById('newSupplierTransactionRef');
      const notesEl = document.getElementById('newSupplierTransactionNotes');

      const transactionType = (typeEl?.value || '').trim();
      const amount = Number.parseFloat(amountEl?.value || '0');
      const referenceNo = (refEl?.value || '').trim();
      const notes = (notesEl?.value || '').trim();

      if (!['invoice', 'payment'].includes(transactionType)) {
        showSupplierTransactionAlert('نوع الحركة غير صالح', 'danger');
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        showSupplierTransactionAlert('الرجاء إدخال مبلغ صحيح أكبر من صفر', 'danger');
        return;
      }

      const selectedBranchId = normalizeBranchId(
        forcedBranchId
          || manualSupplierEditingContext?.forcedBranchId
          || document.getElementById('supplierLedgerBranchFilter')?.value
          || ''
      );
      const createdAt = new Date().toISOString();
      const editingId = manualSupplierEditingContext?.id || null;
      const targetSupplierName = manualSupplierEditingContext?.supplierName || name;

      if (editingId) {
        await ledgerIpc.invoke(
          'db-run',
          `UPDATE manual_supplier_transactions
             SET supplier_name = ?, transaction_type = ?, amount = ?, reference_no = ?, notes = ?, branch_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            targetSupplierName,
            transactionType,
            Math.abs(amount),
            referenceNo || null,
            notes || null,
            selectedBranchId ? Number(selectedBranchId) : null,
            editingId
          ]
        );
        showSupplierTransactionAlert('تم تحديث الحركة اليدوية بنجاح', 'success');
      } else {
        await ledgerIpc.invoke(
          'db-run',
          `INSERT INTO manual_supplier_transactions
            (supplier_name, transaction_type, amount, reference_no, notes, branch_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            transactionType,
            Math.abs(amount),
            referenceNo || null,
            notes || null,
            selectedBranchId ? Number(selectedBranchId) : null,
            createdAt,
            createdAt
          ]
        );
        showSupplierTransactionAlert('تمت إضافة الحركة اليدوية بنجاح', 'success');
      }

      resetManualSupplierForm();
      manualSupplierEditingContext = null;
      setManualSupplierFormMode(false);

      await refreshSupplierStatementData(targetSupplierName, selectedBranchId);
      await loadSupplierLedger();
    } catch (error) {
      console.error('Error adding manual supplier transaction:', error);
      showSupplierTransactionAlert(`فشلت إضافة الحركة: ${mapSupplierLedgerDbError(error)}`, 'danger');
    }
  }

  async function deleteManualSupplierTransaction(id, supplierName, forcedBranchId = '') {
    const txId = Number.parseInt(id, 10);
    if (!Number.isFinite(txId) || txId <= 0) {
      return;
    }

    try {
      const confirmed = await askDeleteConfirmation();
      if (!confirmed) return;

      if (manualSupplierEditingContext && Number(manualSupplierEditingContext.id) === txId) {
        cancelManualSupplierEdit();
      }

      await ledgerIpc.invoke('db-run', 'DELETE FROM manual_supplier_transactions WHERE id = ?', [txId]);

      const normalizedBranchId = normalizeBranchId(forcedBranchId);
      await refreshSupplierStatementData(supplierName, normalizedBranchId);
      await loadSupplierLedger();
      showSupplierTransactionAlert('تم حذف الحركة اليدوية', 'success');
    } catch (error) {
      console.error('Error deleting manual supplier transaction:', error);
      showSupplierTransactionAlert(`تعذر حذف الحركة: ${mapSupplierLedgerDbError(error)}`, 'danger');
    }
  }

  async function askDeleteConfirmation() {
    if (window.Swal) {
      const result = await window.Swal.fire({
        title: 'تأكيد الحذف',
        text: 'هل تريد حذف هذه الحركة اليدوية؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، حذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33'
      });
      return !!result.isConfirmed;
    }
    return window.confirm('هل تريد حذف هذه الحركة اليدوية؟');
  }

  async function ensureManualSupplierTable() {
    if (manualSupplierTableEnsured) {
      return;
    }

    try {
      await ledgerIpc.invoke(
        'db-run',
        `CREATE TABLE IF NOT EXISTS manual_supplier_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          supplier_name TEXT NOT NULL,
          transaction_type TEXT NOT NULL DEFAULT 'payment',
          amount DECIMAL(10,2) NOT NULL,
          reference_no TEXT,
          notes TEXT,
          branch_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        )`
      );
      await ensureManualSupplierUpdatedAtColumn();
      await ledgerIpc.invoke(
        'db-run',
        'CREATE INDEX IF NOT EXISTS idx_manual_supplier_name_date ON manual_supplier_transactions(supplier_name, created_at)'
      );
      await ledgerIpc.invoke(
        'db-run',
        'CREATE INDEX IF NOT EXISTS idx_manual_supplier_branch_date ON manual_supplier_transactions(branch_id, created_at)'
      );

      manualSupplierTableEnsured = true;
    } catch (error) {
      console.error('Failed to ensure manual supplier table:', error);
    }
  }

  async function ensureManualSupplierUpdatedAtColumn() {
    try {
      const columns = await ledgerIpc.invoke('db-query', 'PRAGMA table_info(manual_supplier_transactions)');
      const hasUpdatedAt = Array.isArray(columns)
        && columns.some((column) => String(column?.name || '').toLowerCase() === 'updated_at');

      if (!hasUpdatedAt) {
        await ledgerIpc.invoke(
          'db-run',
          'ALTER TABLE manual_supplier_transactions ADD COLUMN updated_at DATETIME'
        );
      }

      await ledgerIpc.invoke(
        'db-run',
        `UPDATE manual_supplier_transactions
         SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
         WHERE updated_at IS NULL`
      );
    } catch (error) {
      console.error('Failed to ensure manual supplier updated_at column:', error);
      throw error;
    }
  }

  async function editManualSupplierTransactionEntry(id, supplierName, forcedBranchId = '') {
    const txId = Number.parseInt(id, 10);
    if (!Number.isFinite(txId) || txId <= 0) {
      return;
    }

    try {
      await ensureManualSupplierTable();
      const rows = await ledgerIpc.invoke(
        'db-query',
        `SELECT id, supplier_name, transaction_type, amount, reference_no, notes, branch_id
         FROM manual_supplier_transactions
         WHERE id = ?
         LIMIT 1`,
        [txId]
      );

      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) {
        showSupplierTransactionAlert('الحركة غير موجودة', 'danger');
        return;
      }

      const typeEl = document.getElementById('newSupplierTransactionType');
      const amountEl = document.getElementById('newSupplierTransactionAmount');
      const refEl = document.getElementById('newSupplierTransactionRef');
      const notesEl = document.getElementById('newSupplierTransactionNotes');

      if (typeEl) typeEl.value = row.transaction_type === 'payment' ? 'payment' : 'invoice';
      if (amountEl) amountEl.value = Math.abs(Number(row.amount || 0)).toString();
      if (refEl) refEl.value = row.reference_no || '';
      if (notesEl) notesEl.value = row.notes || '';

      const normalizedBranchId = normalizeBranchId(forcedBranchId || row.branch_id || '');
      manualSupplierEditingContext = {
        id: txId,
        supplierName: supplierName || row.supplier_name || '',
        forcedBranchId: normalizedBranchId
      };

      setManualSupplierFormMode(true);
      showSupplierTransactionAlert('وضع تعديل الحركة اليدوية مفعل', 'info');
    } catch (error) {
      console.error('Error editing manual supplier transaction:', error);
      showSupplierTransactionAlert(`تعذر تحميل الحركة للتعديل: ${mapSupplierLedgerDbError(error)}`, 'danger');
    }
  }

  function cancelManualSupplierEdit() {
    manualSupplierEditingContext = null;
    resetManualSupplierForm();
    setManualSupplierFormMode(false);
    showSupplierTransactionAlert('تم إلغاء وضع التعديل', 'info');
  }

  function resetManualSupplierForm() {
    const typeEl = document.getElementById('newSupplierTransactionType');
    const amountEl = document.getElementById('newSupplierTransactionAmount');
    const refEl = document.getElementById('newSupplierTransactionRef');
    const notesEl = document.getElementById('newSupplierTransactionNotes');
    const alertEl = document.getElementById('supplierTransactionAlert');

    if (typeEl) typeEl.value = 'payment';
    if (amountEl) amountEl.value = '';
    if (refEl) refEl.value = '';
    if (notesEl) notesEl.value = '';
    if (alertEl) alertEl.style.display = 'none';
  }

  function setManualSupplierFormMode(isEditing) {
    const addBtn = document.getElementById('addSupplierTransactionBtn');
    const cancelBtn = document.getElementById('cancelSupplierTransactionEditBtn');

    if (addBtn) {
      if (isEditing) {
        addBtn.classList.remove('btn-primary');
        addBtn.classList.add('btn-warning');
        addBtn.innerHTML = '<i class="bi bi-save"></i> حفظ التعديل';
      } else {
        addBtn.classList.remove('btn-warning');
        addBtn.classList.add('btn-primary');
        addBtn.innerHTML = '<i class="bi bi-plus-circle"></i> إضافة الحركة';
      }
    }

    if (cancelBtn) {
      if (isEditing) {
        cancelBtn.classList.remove('d-none');
      } else {
        cancelBtn.classList.add('d-none');
      }
    }
  }

  function showSupplierTransactionAlert(message, type = 'info') {
    const alertEl = document.getElementById('supplierTransactionAlert');
    if (!alertEl) {
      if (type === 'danger') {
        console.error(message);
      } else {
        console.log(message);
      }
      return;
    }

    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 4500);
  }

  async function printSupplierStatement(supplierName, forcedBranchId = '') {
    try {
      const name = String(supplierName == null ? '' : supplierName);
      if (!name.trim()) return;

      const filters = getSupplierLedgerFilters();
      if (forcedBranchId && forcedBranchId !== '0') {
        filters.branchId = String(forcedBranchId);
      }
      const transactions = await fetchSupplierStatementTransactions(name, filters);
      const allTx = Array.isArray(transactions) ? transactions : [];

      {
        const currencyFormatter = getCurrencyFormatter();
        const openingBalance = 0;

        let totalInvoices = 0;
        let totalPayments = 0;
        allTx.forEach((tx) => {
          const amount = Number(tx.amount || 0);
          if (amount >= 0) totalInvoices += amount;
          else totalPayments += Math.abs(amount);
        });

        const finalBalance = totalInvoices - totalPayments;
        const sortedTransactions = [...allTx].sort((left, right) => {
          const leftDate = String(left?.tx_date || left?.created_at || '');
          const rightDate = String(right?.tx_date || right?.created_at || '');
          const dateCompare = leftDate.localeCompare(rightDate);
          if (dateCompare !== 0) return dateCompare;
          return String(left?.created_at || '').localeCompare(String(right?.created_at || ''));
        });

        let runningBalance = openingBalance;
        const rowsHtmlNew = sortedTransactions.map((tx) => {
          const amount = Number(tx.amount || 0);
          const movementMeta = getSupplierMovementMeta(tx, amount);
          const isInvoice = movementMeta.isInvoice;
          const debit = isInvoice ? 0 : Math.abs(amount);
          const credit = isInvoice ? Math.abs(amount) : 0;
          runningBalance += (credit - debit);

          const recNo = tx.rec_no != null ? `#${tx.rec_no}` : '-';
          const sourceLabel = tx.source === 'manual' ? 'قيد يدوي' : `من التصفية ${recNo}`;
          const cashierName = String(tx.cashier_name || '').trim();
          const statementMain = isInvoice
            ? `إثبات استحقاق على ح/ ${name} (المورد)`
            : `إثبات سداد إلى ح/ ${name} (المورد)`;
          const statementDetails = [
            tx.invoice_number ? `المرجع: ${tx.invoice_number}` : '',
            tx.notes ? `ملاحظات: ${tx.notes}` : '',
            `المصدر: ${sourceLabel}`,
            cashierName ? `المستخدم: ${cashierName}` : ''
          ].filter(Boolean).join(' - ');

          return `
            <tr>
              <td>${escapeHtml(formatDateTime(tx.tx_date || tx.created_at || ''))}</td>
              <td>${escapeHtml(movementMeta.kindLabel)}</td>
              <td>${escapeHtml(recNo)}</td>
              <td class="statement-cell">
                <div class="statement-main">${escapeHtml(statementMain)}</div>
                ${statementDetails ? `<div class="statement-detail">${escapeHtml(statementDetails)}</div>` : ''}
              </td>
              <td class="text-currency">${debit > 0 ? currencyFormatter(debit) : ''}</td>
              <td class="text-currency">${credit > 0 ? currencyFormatter(credit) : ''}</td>
              <td class="text-currency fw-bold">${currencyFormatter(runningBalance)}</td>
            </tr>
          `;
        }).join('');

        const firstBranch = allTx.find((tx) => tx && tx.branch_name);
        const branchName = firstBranch ? firstBranch.branch_name : 'غير محدد';
        const companyName = await getCompanyName();
        const openingDebit = openingBalance < 0 ? Math.abs(openingBalance) : 0;
        const openingCredit = openingBalance >= 0 ? openingBalance : 0;
        const closingDebit = finalBalance < 0 ? Math.abs(finalBalance) : 0;
        const closingCredit = finalBalance >= 0 ? finalBalance : 0;
        const openingCreditText = (openingCredit > 0 || (openingCredit === 0 && openingDebit === 0))
          ? currencyFormatter(openingCredit)
          : '';

        const printHtmlNew = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>كشف حساب مورد - ${escapeHtml(name)}</title>
            <style>
                @page { size: A4; margin: 12mm 14mm; }
                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
                    font-size: 12px;
                    line-height: 1.5;
                    color: #0b1f35;
                    margin: 0 auto;
                    padding: 0;
                }
                .header {
                    margin-bottom: 6mm;
                    padding: 4mm 5mm;
                    border: 1px solid #738aa3;
                    border-radius: 2.5mm;
                    background: #fff;
                }
                .statement-title {
                    text-align: center;
                    margin: 0 0 3mm 0;
                }
                .statement-title h2 {
                    font-weight: 700;
                    font-size: 18px;
                    margin: 0;
                    color: #0b1f35;
                }
                .header-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 6mm;
                }
                .header-right,
                .header-left {
                    flex: 1;
                }
                .header-right {
                    padding-left: 4mm;
                    border-left: 1px solid #d1d9e0;
                    text-align: right;
                }
                .header-left {
                    padding-right: 4mm;
                    text-align: right;
                }
                .meta-line {
                    margin-top: 1.5mm;
                    font-size: 12px;
                }
                .meta-label {
                    font-weight: 700;
                    color: #334155;
                    margin-left: 2mm;
                }
                .summary {
                    display: flex;
                    gap: 3mm;
                    margin: 0 0 5mm 0;
                    padding: 3mm;
                    border-radius: 2mm;
                    border: 1px solid #d1d9e0;
                    background: #f8fafc;
                }
                .summary-item {
                    flex: 1;
                    border: 1px solid #d1d9e0;
                    border-radius: 2mm;
                    padding: 2mm 2.5mm;
                    text-align: center;
                    background: #fff;
                }
                .label {
                    font-size: 11px;
                    color: #334155;
                    margin-bottom: 1mm;
                    font-weight: 700;
                }
                .value {
                    font-size: 13px;
                    font-weight: 700;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    border: 1px solid #738aa3;
                }
                th, td {
                    border: 1px solid #738aa3;
                    padding: 2.2mm;
                    font-size: 11px;
                    text-align: center;
                    vertical-align: top;
                }
                th {
                    background: #b6cfe8;
                    font-weight: 700;
                }
                .statement-cell {
                    text-align: right;
                    line-height: 1.55;
                }
                .statement-main {
                    font-weight: 700;
                    color: #102a43;
                }
                .statement-detail {
                    margin-top: 1px;
                    color: #475569;
                    font-size: 10.5px;
                }
                .opening-row td {
                    color: #b42318;
                    font-weight: 700;
                }
                .totals-row td,
                .closing-row td {
                    background: #f1f5f9;
                    font-weight: 700;
                }
                .text-currency {
                    font-family: 'Consolas', 'Cascadia Mono', monospace;
                    color: #0f172a;
                }
                .footer {
                    margin-top: 6mm;
                    text-align: center;
                    color: #64748b;
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="statement-title">
                    <h2>كشف حساب مورد</h2>
                </div>
                <div class="header-content">
                    <div class="header-right">
                        <div class="meta-line">
                            <span class="meta-label">المنشأة:</span>${escapeHtml(companyName)}
                        </div>
                        <div class="meta-line">
                            <span class="meta-label">الفرع:</span>${escapeHtml(branchName)}
                        </div>
                    </div>
                    <div class="header-left">
                        <div class="meta-line">
                            <span class="meta-label">المورد:</span>${escapeHtml(name)}
                        </div>
                        <div class="meta-line">
                            <span class="meta-label">تاريخ الطباعة:</span>${escapeHtml(formatDateTime(new Date()))}
                        </div>
                    </div>
                </div>
            </div>

            <div class="summary">
                <div class="summary-item">
                    <div class="label">إجمالي الدائن</div>
                    <div class="value text-currency">${currencyFormatter(totalInvoices)}</div>
                </div>
                <div class="summary-item">
                    <div class="label">إجمالي المدين</div>
                    <div class="value text-currency">${currencyFormatter(totalPayments)}</div>
                </div>
                <div class="summary-item">
                    <div class="label">الرصيد النهائي</div>
                    <div class="value text-currency">${currencyFormatter(finalBalance)}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th rowspan="2">التاريخ</th>
                        <th rowspan="2">نوع الحركة</th>
                        <th rowspan="2">رقم المرجع</th>
                        <th rowspan="2">البيان</th>
                        <th colspan="2">المبلغ</th>
                        <th rowspan="2">الرصيد</th>
                    </tr>
                    <tr>
                        <th>مدين</th>
                        <th>دائن</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="opening-row">
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                        <td class="statement-cell">
                            <div class="statement-main">قيد افتتاحي: رصيد أول المدة لحساب المورد</div>
                            <div class="statement-detail">ح/ ${escapeHtml(name)} (المورد)</div>
                        </td>
                        <td class="text-currency">${openingDebit > 0 ? currencyFormatter(openingDebit) : ''}</td>
                        <td class="text-currency">${openingCreditText}</td>
                        <td class="text-currency fw-bold">${currencyFormatter(openingBalance)}</td>
                    </tr>
                    ${rowsHtmlNew || '<tr><td colspan="7" class="text-center">لا توجد حركات</td></tr>'}
                    <tr class="totals-row">
                        <td colspan="4">إجمالي الحركات</td>
                        <td class="text-currency">${currencyFormatter(totalPayments)}</td>
                        <td class="text-currency">${currencyFormatter(totalInvoices)}</td>
                        <td class="text-currency fw-bold">${currencyFormatter(finalBalance)}</td>
                    </tr>
                    <tr class="closing-row">
                        <td colspan="4">الرصيد الختامي</td>
                        <td class="text-currency">${closingDebit > 0 ? currencyFormatter(closingDebit) : ''}</td>
                        <td class="text-currency">${closingCredit > 0 || (closingCredit === 0 && closingDebit === 0) ? currencyFormatter(closingCredit) : ''}</td>
                        <td class="text-currency fw-bold">${currencyFormatter(finalBalance)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="footer">
                تم إنشاء هذا الكشف بواسطة نظام تصفية برو
            </div>
        </body>
        </html>
        `;

        if (!printManager) {
          try {
            printManager = await ledgerIpc.invoke('get-print-manager');
          } catch (error) {
            console.warn('[SUPPLIER-LEDGER] print manager lazy init failed:', error);
          }
        }

        if (printManager && typeof printManager.printWithPreview === 'function') {
          const result = await printManager.printWithPreview(printHtmlNew);
          if (result && result.success) {
            showSuccessToast('تمت طباعة كشف حساب المورد بنجاح');
          } else {
            showErrorToast(`فشلت الطباعة: ${result?.error || 'خطأ غير معروف'}`);
          }
          return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          showErrorToast('تعذر فتح نافذة الطباعة');
          return;
        }
        printWindow.document.write(printHtmlNew);
        printWindow.document.close();
        printWindow.print();
        return;
      }
    } catch (error) {
      console.error('Error printing supplier statement:', error);
      showErrorToast('حدث خطأ أثناء طباعة كشف حساب المورد');
    }
  }

  function openSupplierStatementModal() {
    const modalEl = document.getElementById('supplierStatementModal');
    if (!modalEl) return;

    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }

    if (window.bootstrap?.Modal) {
      const existingModal = window.bootstrap.Modal.getInstance(modalEl);
      if (existingModal) {
        existingModal.dispose();
      }

      const modal = new window.bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
        focus: true
      });
      modal.show();
      return;
    }

    modalEl.classList.add('show');
    modalEl.style.display = 'block';
    modalEl.removeAttribute('aria-hidden');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('role', 'dialog');
  }

  function setSupplierStatementTotals(totalInvoices, totalPayments, balance) {
    const fmt = getCurrencyFormatter();
    const invoicesEl = document.getElementById('supplierStatementTotalInvoices');
    const paymentsEl = document.getElementById('supplierStatementTotalPayments');
    const balanceEl = document.getElementById('supplierStatementBalance');

    if (invoicesEl) invoicesEl.textContent = fmt(totalInvoices);
    if (paymentsEl) paymentsEl.textContent = fmt(totalPayments);
    if (balanceEl) {
      balanceEl.textContent = fmt(balance);
      balanceEl.classList.remove('text-success', 'text-deficit');
      if (balance > 0) {
        balanceEl.classList.add('text-deficit');
      } else if (balance < 0) {
        balanceEl.classList.add('text-success');
      }
    }
  }

  async function getCompanyName() {
    try {
      const cachedCompanyName = String(window.currentCompanyName || '').trim();
      const result = await ledgerIpc.invoke('db-query', `
        SELECT category, setting_key, setting_value, id
        FROM system_settings
        WHERE category IN ('general', 'company')
          AND setting_key IN ('company_name', 'name')
        ORDER BY id DESC
      `);

      const rows = Array.isArray(result) ? result : [];
      const latestByKey = new Map();
      rows.forEach((row) => {
        const category = String(row?.category || '').trim().toLowerCase();
        const settingKey = String(row?.setting_key || '').trim().toLowerCase();
        const settingValue = String(row?.setting_value || '').trim();
        if (!category || !settingKey || !settingValue) return;

        const compositeKey = `${category}:${settingKey}`;
        if (!latestByKey.has(compositeKey)) {
          latestByKey.set(compositeKey, settingValue);
        }
      });

      const preferredKeys = [
        'general:company_name',
        'general:name',
        'company:name',
        'company:company_name'
      ];

      for (const key of preferredKeys) {
        const value = latestByKey.get(key);
        if (value) {
          return value;
        }
      }

      if (cachedCompanyName) {
        return cachedCompanyName;
      }

      return 'شركة المثال التجارية';
    } catch (error) {
      console.error('Error getting company name:', error);
      return 'شركة المثال التجارية';
    }
  }

  function formatMergeDateTime(dateTime) {
    const formatted = formatDateTime(dateTime);
    return formatted === 'غير محدد' ? '' : formatted;
  }

  function formatDateTime(dateTime) {
    if (!dateTime) return 'غير محدد';
    try {
      const date = new Date(dateTime);
      if (Number.isNaN(date.getTime())) return 'غير محدد';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (_error) {
      return 'غير محدد';
    }
  }

  function normalizeBranchId(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw || raw === '0') return '';
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '';
  }

  function getSupplierMovementMeta(tx, parsedAmount = Number(tx?.amount || 0)) {
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const source = tx?.source === 'manual' ? 'manual' : 'reconciled';
    const isInvoice = amount >= 0;
    const isEdited = source === 'manual' && isManualSupplierTransactionEdited(tx);

    return {
      source,
      isInvoice,
      isEdited,
      kindLabel: isInvoice ? 'استحقاق مورد' : 'سداد مورد',
      sourceLabel: source === 'manual' ? 'يدوي' : 'من التصفية',
      amountClass: isInvoice ? 'text-deficit' : 'text-success'
    };
  }

  function buildSupplierMovementBadgeHtml(movementMeta) {
    if (!movementMeta) return '';

    const sourceBadgeClass = movementMeta.source === 'manual' ? 'bg-primary' : 'bg-secondary';
    const editedBadge = movementMeta.isEdited
      ? '<span class="badge bg-warning text-dark">معدلة</span>'
      : '';

    return `<span class="badge ${sourceBadgeClass} me-1">${escapeHtml(movementMeta.sourceLabel)}</span>${editedBadge}`;
  }

  function buildSupplierMovementPrintLabel(movementMeta) {
    if (!movementMeta) return '';
    return movementMeta.isEdited
      ? `${movementMeta.sourceLabel} - معدلة`
      : movementMeta.sourceLabel;
  }

  function isManualSupplierTransactionEdited(tx) {
    if (!tx || tx.source !== 'manual') {
      return false;
    }

    const createdAt = parseDateTimeValue(tx.created_at);
    const updatedAt = parseDateTimeValue(tx.updated_at);
    if (!createdAt || !updatedAt) {
      return false;
    }

    return (updatedAt.getTime() - createdAt.getTime()) > 1000;
  }

  function parseDateTimeValue(value) {
    if (!value) return null;
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }
    return parsedDate;
  }

  function getCurrencyFormatter() {
    if (typeof window.formatCurrency === 'function') return window.formatCurrency;
    return (amount) => {
      const numeric = Number(amount);
      if (!Number.isFinite(numeric)) return '0.00';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numeric);
    };
  }

  function showSuccessToast(message) {
    if (window.DialogUtils?.showSuccessToast) {
      window.DialogUtils.showSuccessToast(message);
      return;
    }
    if (window.Swal) {
      window.Swal.fire({ icon: 'success', text: message, timer: 1800, showConfirmButton: false });
      return;
    }
    console.log(message);
  }

  function showErrorToast(message) {
    if (window.DialogUtils?.showErrorToast) {
      window.DialogUtils.showErrorToast(message);
      return;
    }
    if (window.Swal) {
      window.Swal.fire({ icon: 'error', text: message });
      return;
    }
    console.error(message);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\\/g, '\\\\');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeSupplierLedger();
      initializePrintManager();
    });
  } else {
    initializeSupplierLedger();
    initializePrintManager();
  }
})();
