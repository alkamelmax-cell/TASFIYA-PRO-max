const { createAppShellBootstrapHandlers } = require('./app-shell-bootstrap');
const { createAppShellNavigationHandlers } = require('./app-shell-navigation');
const { createAppShellAuthHandlers } = require('./app-shell-auth');

function createAppShellHandlers(deps) {
  const document = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const localStorageObj = deps.localStorageObj || globalThis.localStorage;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const keyboardShortcuts = deps.keyboardShortcuts;
  const Swal = deps.Swal;
  const bootstrap = deps.bootstrap;
  const ipcRenderer = deps.ipcRenderer;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const logger = deps.logger || console;

  const getCurrentUser = deps.getCurrentUser;
  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const setCurrentReconciliation = deps.setCurrentReconciliation;
  const setCurrentUser = deps.setCurrentUser;
  const hasSectionAccess = deps.hasSectionAccess;
  const getFirstAllowedSection = deps.getFirstAllowedSection;
  const hasPermission = deps.hasPermission;
  const normalizeUser = deps.normalizeUser;
  const applyPermissionsToDocument = deps.applyPermissionsToDocument;
  const setBankReceipts = deps.setBankReceipts;
  const setCashReceipts = deps.setCashReceipts;
  const setPostpaidSales = deps.setPostpaidSales;
  const setCustomerReceipts = deps.setCustomerReceipts;
  const setReturnInvoices = deps.setReturnInvoices;
  const setSuppliers = deps.setSuppliers;

  const applyTheme = deps.applyTheme;
  const setupEventListeners = deps.setupEventListeners;
  const updateButtonStates = deps.updateButtonStates;
  const initializeSidebarToggle = deps.initializeSidebarToggle;
  const loadSystemSettings = deps.loadSystemSettings;
  const handleBranchSelectionChange = deps.handleBranchSelectionChange;
  const initializePrintSystem = deps.initializePrintSystem;
  const initializeThermalPrinterSettings = deps.initializeThermalPrinterSettings;
  const initializeEditModeEventListeners = deps.initializeEditModeEventListeners;
  const initializeAutocomplete = deps.initializeAutocomplete;
  const initializeSyncControls = deps.initializeSyncControls;
  const initializeReconciliationsListModal = deps.initializeReconciliationsListModal;

  const handleSaveReconciliation = deps.handleSaveReconciliation;
  const handlePrintReport = deps.handlePrintReport;
  const handleGenerateReport = deps.handleGenerateReport;
  const toggleSidebar = deps.toggleSidebar;
  const handleBranchChange = deps.handleBranchChange;
  const showError = deps.showError;

  const loadBranches = deps.loadBranches;
  const loadCashiersList = deps.loadCashiersList;
  const loadCashboxes = deps.loadCashboxes;
  const loadCashboxFilters = deps.loadCashboxFilters;
  const loadAdminsList = deps.loadAdminsList;
  const loadAccountantsList = deps.loadAccountantsList;
  const loadAtmsList = deps.loadAtmsList;
  const loadATMsList = deps.loadATMsList;
  const loadBanksList = deps.loadBanksList;
  const loadSuppliersList = deps.loadSuppliersList;
  const loadCustomersList = deps.loadCustomersList;
  const loadCustomerLedger = deps.loadCustomerLedger;
  const loadCustomerLedgerFilters = deps.loadCustomerLedgerFilters;
  const loadSupplierLedger = deps.loadSupplierLedger;
  const loadSupplierLedgerFilters = deps.loadSupplierLedgerFilters;
  const loadReportsList = deps.loadReportsList;
  const loadReconciliationsList = deps.loadReconciliationsList;
  const loadSavedReconciliations = deps.loadSavedReconciliations;
  const loadSearchFilters = deps.loadSearchFilters;
  const loadReportFilters = deps.loadReportFilters;
  const loadAdvancedReportFilters = deps.loadAdvancedReportFilters;
  const loadCashierPerformanceFilters = deps.loadCashierPerformanceFilters;
  const loadAllSettings = deps.loadAllSettings;

  const loadCustomersForDropdowns = deps.loadCustomersForDropdowns;
  const loadSuppliersForDropdowns = deps.loadSuppliersForDropdowns;
  const loadEnhancedReportFilters = deps.loadEnhancedReportFilters;
  const loadPostpaidSalesReportFilters = deps.loadPostpaidSalesReportFilters;
  const loadBranchesForAtms = deps.loadBranchesForAtms;

  const resetUIOnly = deps.resetUIOnly;
  const clearAllReconciliationData = deps.clearAllReconciliationData;
  const resetSystemToNewReconciliationState = deps.resetSystemToNewReconciliationState;

  const navigationHandlers = createAppShellNavigationHandlers({
    document,
    localStorageObj,
    hasSectionAccess: (sectionName) => {
      const activeUser = getCurrentUser ? getCurrentUser() : null;
      if (!activeUser) {
        return true;
      }

      if (typeof hasSectionAccess !== 'function') {
        return true;
      }

      return hasSectionAccess(activeUser, sectionName);
    },
    getFallbackSection: () => {
      const activeUser = getCurrentUser ? getCurrentUser() : null;
      if (!activeUser) {
        return 'reconciliation';
      }

      if (typeof getFirstAllowedSection !== 'function') {
        return 'reconciliation';
      }

      return getFirstAllowedSection(activeUser, 'reconciliation');
    },
    onAccessDenied: () => {
      const activeUser = getCurrentUser ? getCurrentUser() : null;
      if (!activeUser) {
        return;
      }

      if (typeof getDialogUtils === 'function') {
        getDialogUtils().showErrorToast('لا تملك صلاحية الوصول إلى هذه الشاشة');
      }
    },
    loadBranches,
    loadCashiersList,
    loadCashboxes,
    loadCashboxFilters,
    loadAdminsList,
    loadAccountantsList,
    loadAtmsList,
    loadATMsList,
    loadBanksList,
    loadSuppliersList,
    loadCustomersList,
    loadCustomerLedger,
    loadCustomerLedgerFilters,
    loadSupplierLedger,
    loadSupplierLedgerFilters,
    loadReportsList,
    loadReconciliationsList,
    loadSavedReconciliations,
    loadSearchFilters,
    loadReportFilters,
    loadAdvancedReportFilters,
    loadCashierPerformanceFilters,
    loadAllSettings,
    loadBranchesForAtms
  });

  const bootstrapHandlers = createAppShellBootstrapHandlers({
    document,
    localStorageObj,
    setTimeoutFn,
    keyboardShortcuts,
    Swal,
    bootstrap,
    ipcRenderer,
    logger,
    getCurrentReconciliation,
    applyTheme,
    setupEventListeners,
    updateButtonStates,
    initializeSidebarToggle,
    loadSystemSettings,
    handleBranchSelectionChange,
    initializePrintSystem,
    initializeThermalPrinterSettings,
    initializeEditModeEventListeners,
    initializeAutocomplete,
    initializeSyncControls,
    initializeReconciliationsListModal,
    handleSaveReconciliation,
    handlePrintReport,
    handleGenerateReport,
    toggleSidebar,
    handleBranchChange,
    loadCustomersForDropdowns,
    loadSuppliersForDropdowns,
    loadEnhancedReportFilters,
    loadPostpaidSalesReportFilters,
    loadBranchesForAtms,
    canPerformOperation: (operationPermission) => {
      const activeUser = getCurrentUser ? getCurrentUser() : null;
      if (!activeUser) {
        return true;
      }

      if (typeof hasPermission !== 'function') {
        return true;
      }

      return hasPermission(activeUser, operationPermission);
    },
    showPermissionDenied: (message) => {
      if (typeof getDialogUtils === 'function') {
        getDialogUtils().showErrorToast(message || 'لا تملك صلاحية تنفيذ هذه العملية');
      }
    },
    showSection: navigationHandlers.showSection,
    highlightMenuItem: navigationHandlers.highlightMenuItem
  });

  const authHandlers = createAppShellAuthHandlers({
    document,
    windowObj,
    ipcRenderer,
    setTimeoutFn,
    getDialogUtils,
    logger,
    getCurrentUser,
    getCurrentReconciliation,
    setCurrentReconciliation,
    setCurrentUser,
    setBankReceipts,
    setCashReceipts,
    setPostpaidSales,
    setCustomerReceipts,
    setReturnInvoices,
    setSuppliers,
    loadSystemSettings,
    normalizeUser,
    applyPermissionsToDocument: (user) => {
      if (typeof applyPermissionsToDocument === 'function') {
        applyPermissionsToDocument(document, user);
      }
    },
    getDefaultSectionForUser: (user) => {
      if (typeof getFirstAllowedSection === 'function') {
        return getFirstAllowedSection(user, 'reconciliation');
      }
      return 'reconciliation';
    },
    showSection: navigationHandlers.showSection,
    highlightMenuItem: navigationHandlers.highlightMenuItem,
    resetUIOnly,
    clearAllReconciliationData,
    resetSystemToNewReconciliationState,
    showError
  });

  return {
    initializeApp: bootstrapHandlers.initializeApp,
    startNewReconciliation: bootstrapHandlers.startNewReconciliation,
    initializeKeyboardShortcuts: bootstrapHandlers.initializeKeyboardShortcuts,
    showSection: navigationHandlers.showSection,
    highlightMenuItem: navigationHandlers.highlightMenuItem,
    setupShellBranchChangeListener: bootstrapHandlers.setupShellBranchChangeListener,
    handleLogin: authHandlers.handleLogin,
    handleCancelNewReconciliation: authHandlers.handleCancelNewReconciliation,
    handleLogout: authHandlers.handleLogout,
    applyRuntimeSecuritySettings: authHandlers.applyRuntimeSecuritySettings,
    handleNavigation: navigationHandlers.handleNavigation,
    loadDropdownData: bootstrapHandlers.loadDropdownData,
    populateSelect: bootstrapHandlers.populateSelect
  };
}

module.exports = {
  createAppShellHandlers
};
