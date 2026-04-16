function createAppShellBootstrapHandlers(context) {
  const {
    ensureFiscalYearSelection,
    populateFiscalYearSelect,
    setSelectedFiscalYear,
    updateFiscalYearDisplay,
    applyFiscalYearToAllDateFilters,
    syncFiscalYearSelectValue
  } = require('./fiscal-year');

  const document = context.document;
  const localStorageObj = context.localStorageObj || globalThis.localStorage;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const keyboardShortcuts = context.keyboardShortcuts;
  const Swal = context.Swal;
  const bootstrap = context.bootstrap;
  const ipcRenderer = context.ipcRenderer;
  const logger = context.logger || console;
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const applyTheme = context.applyTheme;
  const setupEventListeners = context.setupEventListeners;
  const updateButtonStates = context.updateButtonStates;
  const initializeSidebarToggle = context.initializeSidebarToggle;
  const loadSystemSettings = context.loadSystemSettings;
  const handleBranchSelectionChange = context.handleBranchSelectionChange;
  const initializePrintSystem = context.initializePrintSystem;
  const initializeThermalPrinterSettings = context.initializeThermalPrinterSettings;
  const initializeEditModeEventListeners = context.initializeEditModeEventListeners;
  const initializeAutocomplete = context.initializeAutocomplete;
  const initializeSyncControls = context.initializeSyncControls;
  const initializeReconciliationsListModal = context.initializeReconciliationsListModal;
  const handleSaveReconciliation = context.handleSaveReconciliation;
  const handlePrintReport = context.handlePrintReport;
  const handleGenerateReport = context.handleGenerateReport;
  const toggleSidebar = context.toggleSidebar;
  const handleBranchChange = context.handleBranchChange;
  const loadCustomersForDropdowns = context.loadCustomersForDropdowns || (async () => {});
  const loadSuppliersForDropdowns = context.loadSuppliersForDropdowns || (async () => {});
  const loadEnhancedReportFilters = context.loadEnhancedReportFilters;
  const loadPostpaidSalesReportFilters = context.loadPostpaidSalesReportFilters;
  const loadBranchesForAtms = context.loadBranchesForAtms;
  const showSection = context.showSection;
  const highlightMenuItem = context.highlightMenuItem;
  const canPerformOperation = context.canPerformOperation || (() => true);
  const showPermissionDenied = context.showPermissionDenied || (() => {});

  function refreshYearScopedLists() {
    if (typeof globalThis.loadReconciliationsList === 'function') {
      globalThis.loadReconciliationsList(1);
    }
    if (typeof globalThis.loadSavedReconciliations === 'function') {
      globalThis.loadSavedReconciliations(1);
    }
  }

  function autoRefreshReportsIfVisible() {
    const reportsSection = document.getElementById('reports-section');
    if (!reportsSection || !reportsSection.classList.contains('active')) {
      return;
    }
    if (typeof handleGenerateReport === 'function') {
      handleGenerateReport();
    }
  }

  function initializeFiscalYearSelector() {
    const defaultYear = ensureFiscalYearSelection(localStorageObj);
    updateFiscalYearDisplay(document, defaultYear);
    applyFiscalYearToAllDateFilters(document, defaultYear, { force: true });

    const applySelection = (selectedYear) => {
      if (!selectedYear) return;
      updateFiscalYearDisplay(document, selectedYear);
      applyFiscalYearToAllDateFilters(document, selectedYear, { force: true });
      syncFiscalYearSelectValue(document, 'fiscalYear', selectedYear);
      syncFiscalYearSelectValue(document, 'fiscalYearSwitch', selectedYear);
      refreshYearScopedLists();
      autoRefreshReportsIfVisible();
    };

    populateFiscalYearSelect({ document, ipcRenderer, storage: localStorageObj, selectId: 'fiscalYear' })
      .then(applySelection)
      .catch(() => {});
    populateFiscalYearSelect({ document, ipcRenderer, storage: localStorageObj, selectId: 'fiscalYearSwitch' })
      .then(applySelection)
      .catch(() => {});

    const bindSelectChange = (selectId) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      select.addEventListener('change', () => {
        const selectedYear = setSelectedFiscalYear(select.value, localStorageObj);
        applySelection(selectedYear);
      });
    };

    bindSelectChange('fiscalYear');
    bindSelectChange('fiscalYearSwitch');
  }

  function resolveInitialSection() {
    const defaultSection = 'reconciliation';
    const lastSection = localStorageObj && typeof localStorageObj.getItem === 'function'
      ? localStorageObj.getItem('lastSection')
      : null;

    if (!lastSection) {
      return defaultSection;
    }

    let targetSection = document.getElementById(`${lastSection}-section`);
    if (!targetSection && lastSection === 'reconciliation-requests') {
      if (globalThis.reconciliationRequests && typeof globalThis.reconciliationRequests.ensureSection === 'function') {
        globalThis.reconciliationRequests.ensureSection();
        targetSection = document.getElementById(`${lastSection}-section`);
      }
    }

    return targetSection ? lastSection : defaultSection;
  }

  function initializeApp() {
    document.getElementById('reconciliationDate').value = new Date().toISOString().split('T')[0];

    initializeFiscalYearSelector();

    const savedTheme = localStorageObj.getItem('theme') || 'light';
    applyTheme(savedTheme);

    setupEventListeners();
    updateButtonStates('INITIAL');
    setupGlobalModalSafety();

    initializeSidebarToggle();

    loadDropdownData();
    loadSystemSettings();

    handleBranchSelectionChange();
    initializePrintSystem();
    initializeThermalPrinterSettings();
    initializeEditModeEventListeners();
    initializeAutocomplete();
    initializeKeyboardShortcuts();
    initializeSyncControls();
    initializeReconciliationsListModal();
    initializeCustomerDropdownAutoRefresh();
    initializeSupplierDropdownAutoRefresh();

    const initialSection = resolveInitialSection();
    showSection(initialSection);
    highlightMenuItem(initialSection);

    logger.log('🧭 [FORM-NAV] نظام التنقل بين الحقول جاهز');
  }

  function initializeSupplierDropdownAutoRefresh() {
    const refreshSupplierDropdown = () => {
      const currentBranchId = document.getElementById('branchSelect')?.value || '';
      loadSuppliersForDropdowns(currentBranchId);
    };

    const supplierMainInput = document.getElementById('supplierMainName');
    if (supplierMainInput) {
      supplierMainInput.addEventListener('focus', refreshSupplierDropdown);
    }

    const supplierEditInput = document.getElementById('supplierEditName');
    if (supplierEditInput) {
      supplierEditInput.addEventListener('focus', refreshSupplierDropdown);
    }
  }

  function initializeCustomerDropdownAutoRefresh() {
    const refreshCustomerDropdown = () => {
      const currentBranchId = document.getElementById('branchSelect')?.value || '';
      loadCustomersForDropdowns(currentBranchId);
    };

    const postpaidCustomerInput = document.getElementById('customerName');
    if (postpaidCustomerInput) {
      postpaidCustomerInput.addEventListener('focus', refreshCustomerDropdown);
    }

    const customerReceiptInput = document.getElementById('customerReceiptName');
    if (customerReceiptInput) {
      customerReceiptInput.addEventListener('focus', refreshCustomerDropdown);
    }
  }

  function cleanupStaleModalArtifacts() {
    if (document.querySelector('.modal.show')) {
      return;
    }

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');
  }

  function setupGlobalModalSafety() {
    document.addEventListener('show.bs.modal', (event) => {
      const modalElement = event?.target;
      if (modalElement && modalElement.classList && modalElement.classList.contains('modal') && modalElement.parentElement !== document.body) {
        document.body.appendChild(modalElement);
      }

      cleanupStaleModalArtifacts();
    });

    document.addEventListener('hidden.bs.modal', () => {
      setTimeoutFn(cleanupStaleModalArtifacts, 0);
    });
  }

function startNewReconciliation() {
  showSection('reconciliation');
  highlightMenuItem('reconciliation');

  const newReconciliationCard = document.querySelector('.card-header.bg-primary');
  if (newReconciliationCard) {
    newReconciliationCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const cashierSelect = document.getElementById('cashierSelect');
  if (cashierSelect && !cashierSelect.value) {
    setTimeoutFn(() => cashierSelect.focus(), 500);
  }

  logger.log('⌨️ [KEYBOARD] تم بدء تصفية جديدة');
}

function initializeKeyboardShortcuts() {
  logger.log('⌨️ [KEYBOARD] تهيئة اختصارات لوحة المفاتيح...');

  keyboardShortcuts.register('ctrl+n', (e) => {
    e.preventDefault();
    if (getCurrentReconciliation()) {
      Swal.fire({
        title: 'تأكيد',
        text: 'هناك تصفية حالية. هل تريد إنشاء تصفية جديدة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم',
        cancelButtonText: 'لا',
        confirmButtonColor: '#0d6efd',
        cancelButtonColor: '#6c757d'
      }).then((result) => {
        if (result.isConfirmed) {
          startNewReconciliation();
        }
      });
    } else {
      startNewReconciliation();
    }
  }, 'إنشاء تصفية جديدة');

  keyboardShortcuts.register('ctrl+s', (e) => {
    e.preventDefault();
    if (!canPerformOperation('operation:save-reconciliation')) {
      showPermissionDenied('لا تملك صلاحية حفظ التصفية');
      return;
    }

    const currentReconciliation = getCurrentReconciliation();
    if (currentReconciliation && currentReconciliation.id) {
      handleSaveReconciliation();
    } else {
      Swal.fire({
        title: 'تنبيه',
        text: 'لا توجد تصفية للحفظ',
        icon: 'warning',
        confirmButtonText: 'حسناً'
      });
    }
  }, 'حفظ التصفية الحالية');

  keyboardShortcuts.register('ctrl+p', (e) => {
    e.preventDefault();
    if (!canPerformOperation('operation:print-reconciliation')) {
      showPermissionDenied('لا تملك صلاحية طباعة التصفية');
      return;
    }

    if (getCurrentReconciliation()) {
      handlePrintReport();
    } else {
      Swal.fire({
        title: 'تنبيه',
        text: 'لا توجد تصفية للطباعة',
        icon: 'warning',
        confirmButtonText: 'حسناً'
      });
    }
  }, 'طباعة التقرير');

  keyboardShortcuts.register('ctrl+b', (e) => {
    e.preventDefault();
    toggleSidebar();
  }, 'إظهار/إخفاء القائمة الجانبية');

  keyboardShortcuts.register('ctrl+1', () => {
    showSection('reconciliation');
    highlightMenuItem('reconciliation');
  }, 'الانتقال للتصفية الجديدة');

  keyboardShortcuts.register('ctrl+2', () => {
    showSection('saved-reconciliations');
    highlightMenuItem('saved-reconciliations');
  }, 'الانتقال للتصفيات المحفوظة');

  keyboardShortcuts.register('ctrl+3', () => {
    showSection('reports');
    highlightMenuItem('reports');
  }, 'الانتقال للتقارير');

  keyboardShortcuts.register('ctrl+4', () => {
    showSection('customer-ledger');
    highlightMenuItem('customer-ledger');
  }, 'الانتقال لدفتر العملاء');

  keyboardShortcuts.register('ctrl+5', () => {
    showSection('settings');
    highlightMenuItem('settings');
  }, 'الانتقال للإعدادات');

  keyboardShortcuts.register('escape', () => {
    const openModal = document.querySelector('.modal.show');
    if (!openModal) return;

    const modalInstance = bootstrap.Modal.getInstance(openModal);
    if (modalInstance) {
      modalInstance.hide();
    }
  }, 'إغلاق النافذة المنبثقة');

  keyboardShortcuts.register('f1', (e) => {
    e.preventDefault();
    keyboardShortcuts.showHelp();
  }, 'عرض اختصارات لوحة المفاتيح (هذه القائمة)');

  logger.log('⌨️ [KEYBOARD] تم تسجيل', keyboardShortcuts.getAllShortcuts().length, 'اختصار');
}

function setupShellBranchChangeListener() {
  const branchSelect = document.getElementById('branchSelect');

  if (branchSelect) {
    branchSelect.addEventListener('change', handleBranchChange);
    logger.log('🔄 [BRANCH] تم تهيئة مراقب تغيير الفرع');
  } else {
    logger.error('❌ [BRANCH] لم يتم العثور على عنصر اختيار الفرع');
  }
}

  async function loadDropdownData() {
  try {
    await loadCustomersForDropdowns();
    await loadSuppliersForDropdowns();

    const branches = await ipcRenderer.invoke(
      'db-query',
      'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
    );
    populateSelect('branchSelect', branches, 'id', 'branch_name');
    populateSelect('cashierBranchSelect', branches, 'id', 'branch_name');

    const cashiers = await ipcRenderer.invoke(
      'db-query',
      'SELECT c.*, b.branch_name FROM cashiers c LEFT JOIN branches b ON c.branch_id = b.id WHERE c.active = 1 ORDER BY c.name'
    );
    populateSelect('cashierSelect', cashiers, 'id', 'name');

    const accountants = await ipcRenderer.invoke(
      'db-query',
      'SELECT * FROM accountants WHERE active = 1 ORDER BY name'
    );
    populateSelect('accountantSelect', accountants, 'id', 'name');

    const atms = await ipcRenderer.invoke(
      'db-query',
      `SELECT a.*, b.branch_name
           FROM atms a
           LEFT JOIN branches b ON a.branch_id = b.id
           WHERE a.active = 1
           ORDER BY b.branch_name, a.name`
    );

    const atmSelect = document.getElementById('atmSelect');
    atmSelect.innerHTML = '<option value="">اختر الجهاز</option>';
    atms.forEach((atm) => {
      const option = document.createElement('option');
      option.value = atm.id;
      option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
      atmSelect.appendChild(option);
    });

    await loadEnhancedReportFilters();
    await loadPostpaidSalesReportFilters();
    await loadBranchesForAtms();
  } catch (error) {
    logger.error('Error loading dropdown data:', error);
  }
}

function populateSelect(selectId, data, valueField, textField) {
  const select = document.getElementById(selectId);

  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }

  data.forEach((item) => {
    const option = document.createElement('option');
    option.value = item[valueField];
    option.textContent = item[textField];
    select.appendChild(option);
  });
}

  return {
    initializeApp,
    startNewReconciliation,
    initializeKeyboardShortcuts,
    setupShellBranchChangeListener,
    loadDropdownData,
    populateSelect
  };
}

module.exports = {
  createAppShellBootstrapHandlers
};
