const { createBranchManagementCoreHandlers } = require('./branch-management-core');
const { createBranchManagementInsightHandlers } = require('./branch-management-insights');

function createBranchManagementHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const populateSelect = deps.populateSelect || (() => {});
  const refreshDropdownData = deps.refreshDropdownData || (() => {});
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;

  const coreHandlers = createBranchManagementCoreHandlers({
    document: doc,
    ipcRenderer: ipc,
    formatDate,
    refreshDropdownData,
    getDialogUtils,
    logger
  });

  const insightHandlers = createBranchManagementInsightHandlers({
    document: doc,
    ipcRenderer: ipc,
    populateSelect,
    getDialogUtils,
    logger,
    loadBranches: coreHandlers.loadBranches
  });

  windowObj.loadBranches = coreHandlers.loadBranches;
  windowObj.editBranch = coreHandlers.editBranch;
  windowObj.cancelBranchEdit = coreHandlers.cancelBranchEdit;
  windowObj.deleteBranch = coreHandlers.deleteBranch;
  windowObj.toggleBranchStatus = coreHandlers.toggleBranchStatus;
  windowObj.testBranchesManagement = insightHandlers.testBranchesManagement;

  return {
    loadBranches: coreHandlers.loadBranches,
    updateBranchesTable: coreHandlers.updateBranchesTable,
    updateBranchDropdowns: coreHandlers.updateBranchDropdowns,
    handleBranchForm: coreHandlers.handleBranchForm,
    clearBranchForm: coreHandlers.clearBranchForm,
    editBranch: coreHandlers.editBranch,
    cancelBranchEdit: coreHandlers.cancelBranchEdit,
    deleteBranch: coreHandlers.deleteBranch,
    toggleBranchStatus: coreHandlers.toggleBranchStatus,
    filterCashiersByBranch: insightHandlers.filterCashiersByBranch,
    handleBranchSelectionChange: insightHandlers.handleBranchSelectionChange,
    testBranchesManagement: insightHandlers.testBranchesManagement,
    getBranchStatistics: insightHandlers.getBranchStatistics
  };
}

module.exports = {
  createBranchManagementHandlers
};
