// @ts-nocheck
// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

// Main Application JavaScript for Cashier Reconciliation System
const ipcRenderer = typeof window !== 'undefined' && window.RendererIPC
  ? window.RendererIPC
  : require('./renderer-ipc');

const keyboardShortcuts = require('./keyboard-shortcuts');
const formNavigation = require('./form-navigation');
const { composeAppModules } = require('./app/app-composition');
const { createAppState } = require('./app/app-state');
const { createAppFeatureDeps } = require('./app/app-feature-deps');
const {
  normalizeUser,
  hasPermission,
  hasSectionAccess,
  getFirstAllowedSection,
  applyPermissionsToDocument
} = require('./app/user-permissions');
const {
  createReconciliationStateDeps,
  createPrintRuntimeStateDeps,
  createReconciliationTableUpdateDeps
} = require('./app/app-state-deps');
const { createAppHandlerBootstrap } = require('./app/app-handler-bootstrap');

const appState = createAppState();
const reconciliationStateDeps = createReconciliationStateDeps(appState);
const printRuntimeStateDeps = createPrintRuntimeStateDeps(appState);
const { formatting, report, printStyleDeps } = createAppFeatureDeps();

const handlerBootstrap = createAppHandlerBootstrap({
  document,
  windowObj: window,
  ipcRenderer,
  formNavigation,
  formatting,
  state: appState,
  getDialogUtils: () => DialogUtils,
  logger: console
});

const appModules = composeAppModules({
  core: {
    document,
    windowObj: window,
    localStorageObj: window.localStorage,
    sessionStorage: window.sessionStorage,
    ipcRenderer,
    Swal,
    bootstrap,
    dialogUtils: DialogUtils,
    setTimeoutFn: setTimeout,
    FormDataCtor: FormData,
    FileReaderCtor: FileReader,
    EventCtor: Event,
    fetchFn: fetch,
    logger: console
  },
  shared: {
    reconciliationStateDeps,
    reconciliationTableUpdateDeps: createReconciliationTableUpdateDeps(handlerBootstrap.dataEntryHandlers),
    printRuntimeStateDeps
  },
  shell: {
    keyboardShortcuts,
    setCurrentUser: appState.setCurrentUser,
    normalizeUser,
    hasPermission,
    hasSectionAccess,
    getFirstAllowedSection,
    applyPermissionsToDocument,
    loadCustomersForDropdowns: handlerBootstrap.shellDeps.loadCustomersForDropdowns,
    loadSuppliersForDropdowns: handlerBootstrap.shellDeps.loadSuppliersForDropdowns,
    handleBranchChange: handlerBootstrap.shellDeps.handleBranchChange,
    handleOperationTypeChange: handlerBootstrap.shellDeps.handleOperationTypeChange,
    handleEditOperationTypeChange: handlerBootstrap.shellDeps.handleEditOperationTypeChange,
    showError: handlerBootstrap.shellDeps.showError
  },
  edit: handlerBootstrap.editDeps,
  dataEntryHandlers: handlerBootstrap.dataEntryHandlers,
  editTableHandlers: handlerBootstrap.editTableHandlers,
  formatting,
  report,
  printStyleDeps,
  defaultCompanyName: 'نظام تصفية الكاشير',
  getAutocompleteSystem: () => (typeof autocompleteSystem === 'undefined' ? null : autocompleteSystem),
  matchMediaFn: window.matchMedia ? window.matchMedia.bind(window) : null
});

handlerBootstrap.setAppModules(appModules);

function exposeLegacyGlobalHandlers(windowObj, modules) {
  const logger = console;
  const resolveHandler = (handlerName) => (
    modules?.editRuntimeHandlers?.sessionHandlers?.[handlerName]
    || modules?.editRuntimeHandlers?.[handlerName]
    || modules?.reconciliationUiHandlers?.[handlerName]
    || modules?.preUiHandlers?.[handlerName]
    || modules?.appUiHandlers?.[handlerName]
    || modules?.finalizationHandlers?.[handlerName]
    || modules?.shellHandlers?.[handlerName]
  );

  const bindLegacyHandler = (handlerName, options = {}) => {
    const showError = options.showError !== false;
    windowObj[handlerName] = (...args) => {
      const handler = resolveHandler(handlerName);
      if (typeof handler === 'function') {
        return handler(...args);
      }

      logger.error(`${handlerName} is not available yet`);
      if (showError) {
        showUnavailableEditError();
      }
      return null;
    };
  };

  const showUnavailableEditError = () => {
    if (typeof DialogUtils?.showErrorToast === 'function') {
      DialogUtils.showErrorToast('وحدة التعديل غير جاهزة حالياً. حاول مرة أخرى.');
      return;
    }

    if (typeof DialogUtils?.showError === 'function') {
      DialogUtils.showError('وحدة التعديل غير جاهزة حالياً. حاول مرة أخرى.', 'خطأ');
    }
  };

  // Keep inline onclick handlers stable even if module init order changes.
  bindLegacyHandler('editReconciliationNew');

  // Edit modal inline handlers declared in index.html
  [
    'addEditBankReceipt',
    'addEditCashReceipt',
    'addEditPostpaidSale',
    'addEditCustomerReceipt',
    'addEditReturnInvoice',
    'addEditSupplier',
    'saveEditedReconciliation',
    'saveBankReceiptEdit',
    'saveCashReceiptEdit',
    'savePostpaidSaleEdit',
    'saveCustomerReceiptEdit',
    'saveReturnInvoiceEdit',
    'saveSupplierEdit'
  ].forEach((handlerName) => bindLegacyHandler(handlerName));

  // Non-edit inline handlers
  bindLegacyHandler('clearBranchForm', { showError: false });

  // Expose summary update for legacy integrations and external scripts.
  windowObj.updateSummary = (...args) => {
    const summaryHandler = modules?.reconciliationUiHandlers?.updateSummary;
    if (typeof summaryHandler === 'function') {
      return summaryHandler(...args);
    }
    return null;
  };
}

exposeLegacyGlobalHandlers(window, appModules);
