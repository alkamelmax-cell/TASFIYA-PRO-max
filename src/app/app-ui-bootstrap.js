const { createCashierManagementHandlers } = require('./cashier-management');
const { createAdminManagementHandlers } = require('./admin-management');
const { createAccountantManagementHandlers } = require('./accountant-management');
const { createAtmManagementHandlers } = require('./atm-management');
const { createBranchManagementHandlers } = require('./branch-management');
const { createSidebarToggleHandlers } = require('./sidebar-toggle');
const { createEventListenersSetup } = require('./event-listeners');

function initializeAppUiBootstrap(deps) {
  const getDialogUtils = deps.getDialogUtils;
  const refreshDropdownData = () => deps.loadDropdownData();

  const sidebarHandlers = createSidebarToggleHandlers({
    document: deps.document,
    localStorageObj: deps.localStorageObj,
    windowObj: deps.windowObj,
    logger: deps.logger
  });

  const cashierHandlers = createCashierManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatDate: deps.formatDate,
    getDialogUtils,
    refreshDropdownData,
    logger: deps.logger
  });

  const adminHandlers = createAdminManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatDate: deps.formatDate,
    getDialogUtils,
    logger: deps.logger
  });

  const accountantHandlers = createAccountantManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatDate: deps.formatDate,
    getDialogUtils,
    refreshDropdownData,
    logger: deps.logger
  });

  const atmHandlers = createAtmManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatDate: deps.formatDate,
    getDialogUtils,
    refreshDropdownData,
    logger: deps.logger
  });

  const branchHandlers = createBranchManagementHandlers({
    document: deps.document,
    ipcRenderer: deps.ipcRenderer,
    windowObj: deps.windowObj,
    formatDate: deps.formatDate,
    populateSelect: deps.populateSelect,
    refreshDropdownData,
    getDialogUtils,
    logger: deps.logger
  });

  const { setupEventListeners } = createEventListenersSetup({
    document: deps.document,
    handlers: {
      ...deps.eventHandlers,
      toggleSidebar: sidebarHandlers.toggleSidebar,
      handleBranchForm: branchHandlers.handleBranchForm,
      handleAddCashier: cashierHandlers.handleAddCashier,
      handleAddAdmin: adminHandlers.handleAddAdmin,
      handleAddAccountant: accountantHandlers.handleAddAccountant,
      handleAddAtm: atmHandlers.handleAddAtm,
      resetCashierForm: cashierHandlers.resetCashierForm,
      resetAdminForm: adminHandlers.resetAdminForm,
      resetAccountantForm: accountantHandlers.resetAccountantForm,
      resetAtmForm: atmHandlers.resetAtmForm
    }
  });

  return {
    ...sidebarHandlers,
    ...cashierHandlers,
    ...adminHandlers,
    ...accountantHandlers,
    ...atmHandlers,
    ...branchHandlers,
    setupEventListeners
  };
}

module.exports = {
  initializeAppUiBootstrap
};
