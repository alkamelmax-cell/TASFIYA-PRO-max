const { createBackupRestoreRestoreDbHandlers } = require('./backup-restore-restore-db');
const { createBackupRestoreRestoreValidationHandlers } = require('./backup-restore-restore-validation');
const { createBackupRestoreRestoreRunnerHandlers } = require('./backup-restore-restore-runner');

function createBackupRestoreRestoreFlowHandlers(context) {
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || globalThis;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const getDialogUtils = context.getDialogUtils;

  const dbHandlers = createBackupRestoreRestoreDbHandlers({
    ipcRenderer
  });

  const validationHandlers = createBackupRestoreRestoreValidationHandlers({
    ipcRenderer
  });

  const runnerHandlers = createBackupRestoreRestoreRunnerHandlers({
    ipcRenderer,
    windowObj,
    setTimeoutFn,
    getDialogUtils,
    ensureRequiredTablesExist: dbHandlers.ensureRequiredTablesExist,
    validateBackupData: validationHandlers.validateBackupData,
    repairBackupForeignKeyReferences: validationHandlers.repairBackupForeignKeyReferences,
    validateDataConsistency: validationHandlers.validateDataConsistency,
    restoreDatabaseData: dbHandlers.restoreDatabaseData,
    performDatabaseIntegrityCheck: validationHandlers.performDatabaseIntegrityCheck
  });

  return {
    ensureRequiredTablesExist: dbHandlers.ensureRequiredTablesExist,
    handleRestoreBackup: runnerHandlers.handleRestoreBackup,
    validateBackupData: validationHandlers.validateBackupData,
    repairBackupAtmReferences: validationHandlers.repairBackupAtmReferences,
    repairBackupForeignKeyReferences: validationHandlers.repairBackupForeignKeyReferences,
    validateDataConsistency: validationHandlers.validateDataConsistency,
    restoreDatabaseData: dbHandlers.restoreDatabaseData,
    performDatabaseIntegrityCheck: validationHandlers.performDatabaseIntegrityCheck
  };
}

module.exports = {
  createBackupRestoreRestoreFlowHandlers
};
