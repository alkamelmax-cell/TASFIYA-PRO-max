const { createBackupRestoreBackupFlowHandlers } = require('./backup-restore-backup-flow');
const { createBackupRestoreRestoreFlowHandlers } = require('./backup-restore-restore-flow');
const { createBackupRestoreSettingsActions } = require('./backup-restore-settings-actions');

function createBackupRestoreManagementHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const Swal = deps.Swal;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const showThermalPrintSectionDialog = deps.showThermalPrintSectionDialog;
  const transformDataForPDFGenerator = deps.transformDataForPDFGenerator;
  const getCurrentUser = deps.getCurrentUser;
  const setCurrentUser = deps.setCurrentUser;
  const applyRuntimeSecuritySettings = deps.applyRuntimeSecuritySettings;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);

  const backupFlow = createBackupRestoreBackupFlowHandlers({
    ipcRenderer,
    getDialogUtils
  });

  const restoreFlow = createBackupRestoreRestoreFlowHandlers({
    ipcRenderer,
    windowObj,
    setTimeoutFn,
    getDialogUtils
  });

  const settingsActions = createBackupRestoreSettingsActions({
    document,
    ipcRenderer,
    windowObj,
    Swal,
    setTimeoutFn,
    showThermalPrintSectionDialog,
    transformDataForPDFGenerator,
    getCurrentUser,
    setCurrentUser,
    applyRuntimeSecuritySettings,
    getDialogUtils
  });

  return {
    handleTestPrintSettings: settingsActions.handleTestPrintSettings,
    handleCreateBackup: backupFlow.handleCreateBackup,
    collectDatabaseData: backupFlow.collectDatabaseData,
    validateBackupCompleteness: backupFlow.validateBackupCompleteness,
    ensureRequiredTablesExist: restoreFlow.ensureRequiredTablesExist,
    handleRestoreBackup: restoreFlow.handleRestoreBackup,
    validateBackupData: restoreFlow.validateBackupData,
    repairBackupAtmReferences: restoreFlow.repairBackupAtmReferences,
    repairBackupForeignKeyReferences: restoreFlow.repairBackupForeignKeyReferences,
    validateDataConsistency: restoreFlow.validateDataConsistency,
    restoreDatabaseData: restoreFlow.restoreDatabaseData,
    handleExportData: settingsActions.handleExportData,
    handleOptimizeDatabase: settingsActions.handleOptimizeDatabase,
    handleRepairDatabase: settingsActions.handleRepairDatabase,
    handleAnalyzeDatabase: settingsActions.handleAnalyzeDatabase,
    handleLoadArchiveYears: settingsActions.handleLoadArchiveYears,
    handleArchiveYearChange: settingsActions.handleArchiveYearChange,
    handleArchiveFiscalYear: settingsActions.handleArchiveFiscalYear,
    handleArchiveBrowseYearChange: settingsActions.handleArchiveBrowseYearChange,
    handleLoadArchivedReconciliations: settingsActions.handleLoadArchivedReconciliations,
    handleArchiveBrowseSort: settingsActions.handleArchiveBrowseSort,
    handleArchiveBrowseResetSort: settingsActions.handleArchiveBrowseResetSort,
    handleArchiveBrowseSearch: settingsActions.handleArchiveBrowseSearch,
    handleArchiveBrowseClear: settingsActions.handleArchiveBrowseClear,
    handleArchiveBrowsePrevPage: settingsActions.handleArchiveBrowsePrevPage,
    handleArchiveBrowseNextPage: settingsActions.handleArchiveBrowseNextPage,
    handleRestoreArchivedYear: settingsActions.handleRestoreArchivedYear,
    handleViewArchivedReconciliation: settingsActions.handleViewArchivedReconciliation,
    handleSaveDatabaseSettings: settingsActions.handleSaveDatabaseSettings,
    handleLoadUserPermissionsManager: settingsActions.handleLoadUserPermissionsManager,
    handlePermissionsUserChange: settingsActions.handlePermissionsUserChange,
    handleSelectAllPermissions: settingsActions.handleSelectAllPermissions,
    handleClearAllPermissions: settingsActions.handleClearAllPermissions,
    handleSaveUserSettings: settingsActions.handleSaveUserSettings,
    handleChangePassword: settingsActions.handleChangePassword,
    handleSelectBackupLocation: settingsActions.handleSelectBackupLocation,
    handleAutoBackupChange: settingsActions.handleAutoBackupChange,
    performDatabaseIntegrityCheck: restoreFlow.performDatabaseIntegrityCheck
  };
}

module.exports = {
  createBackupRestoreManagementHandlers
};
