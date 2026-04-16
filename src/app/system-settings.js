const { createSystemSettingsLoader } = require('./system-settings-loader');
const { createSystemSettingsUiHelpers } = require('./system-settings-ui');
const { createSettingsUiLoader } = require('./settings-ui-loader');
const { createSystemSettingsActionHandlers } = require('./system-settings-actions');
const { createSystemSettingsInfoHandlers } = require('./system-settings-system-info');

function createSystemSettingsHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const localStorageObj = deps.localStorageObj || (windowObj && windowObj.localStorage);
  const FormDataCtor = deps.FormDataCtor || globalThis.FormData;
  const FileReaderCtor = deps.FileReaderCtor || globalThis.FileReader;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getCurrentDate = deps.getCurrentDate;
  const getCurrentDateTime = deps.getCurrentDateTime;
  const logger = deps.logger || console;

  const uiHelpers = createSystemSettingsUiHelpers({
    document,
    windowObj,
    localStorageObj
  });

  const infoHandlers = createSystemSettingsInfoHandlers({
    document,
    ipcRenderer,
    getCurrentDate,
    getCurrentDateTime
  });

  const loader = createSystemSettingsLoader({
    ipcRenderer,
    applyGeneralSettings: uiHelpers.applyGeneralSettings,
    applyPrintSettings: uiHelpers.applyPrintSettings,
    applyReportsSettings: uiHelpers.applyReportsSettings,
    applyDatabaseSettings: uiHelpers.applyDatabaseSettings,
    applyUserSettings: uiHelpers.applyUserSettings,
    applyReconciliationFormulaSettings: uiHelpers.applyReconciliationFormulaSettings,
    loadSystemInformation: infoHandlers.loadSystemInformation
  });

  const settingsUiLoader = createSettingsUiLoader({
    document,
    ipcRenderer,
    windowObj,
    getDialogUtils,
    applyTheme: uiHelpers.applyTheme,
    logger
  });

  const actions = createSystemSettingsActionHandlers({
    document,
    ipcRenderer,
    windowObj,
    FormDataCtor,
    FileReaderCtor,
    getDialogUtils,
    applyTheme: uiHelpers.applyTheme,
    displayCompanyLogo: uiHelpers.displayCompanyLogo,
    logger
  });

  async function loadSystemSettings() {
    await settingsUiLoader.loadAllSettings();
    await infoHandlers.loadSystemInformation();
  }

  return {
    loadSystemSettings,
    createDefaultSettings: loader.createDefaultSettings,
    applyGeneralSettings: settingsUiLoader.applyGeneralSettingsToUI,
    applyPrintSettings: settingsUiLoader.applyPrintSettingsToUI,
    applyReportsSettings: settingsUiLoader.applyReportsSettingsToUI,
    applyDatabaseSettings: settingsUiLoader.applyDatabaseSettingsToUI,
    applyUserSettings: settingsUiLoader.applyUserSettingsToUI,
    applyReconciliationFormulaSettings: settingsUiLoader.applyReconciliationFormulaSettingsToUI,
    handleSaveGeneralSettings: actions.handleSaveGeneralSettings,
    getCompanyName: loader.getCompanyName,
    handleSelectReportsPath: actions.handleSelectReportsPath,
    applyGeneralSettingsRealTime: actions.applyGeneralSettingsRealTime,
    applyTheme: uiHelpers.applyTheme,
    handleSavePrintSettings: actions.handleSavePrintSettings,
    applyPrintSettingsRealTime: actions.applyPrintSettingsRealTime,
    handleSaveReportsSettings: actions.handleSaveReportsSettings,
    handleLoadReconciliationFormulaProfiles: actions.handleLoadReconciliationFormulaProfiles,
    handleFormulaProfileSelectionChange: actions.handleFormulaProfileSelectionChange,
    handleOpenCreateFormulaProfileModal: actions.handleOpenCreateFormulaProfileModal,
    handleOpenEditFormulaProfileModal: actions.handleOpenEditFormulaProfileModal,
    handleSaveFormulaProfileModal: actions.handleSaveFormulaProfileModal,
    handleFormulaProfileModalPreview: actions.handleFormulaProfileModalPreview,
    handleFormulaProfilesTableClick: actions.handleFormulaProfilesTableClick,
    handleCreateFormulaProfile: actions.handleCreateFormulaProfile,
    handleActivateFormulaProfile: actions.handleActivateFormulaProfile,
    handleDeleteFormulaProfile: actions.handleDeleteFormulaProfile,
    handleSaveReconciliationFormulaSettings: actions.handleSaveReconciliationFormulaSettings,
    handleApplyAndSaveReconciliationFormulaPreset: actions.handleApplyAndSaveReconciliationFormulaPreset,
    handleApplyReconciliationFormulaPreset: actions.handleApplyReconciliationFormulaPreset,
    handleReconciliationFormulaSettingsPreview: actions.handleReconciliationFormulaSettingsPreview,
    handleLogoUpload: actions.handleLogoUpload,
    displayCompanyLogo: uiHelpers.displayCompanyLogo,
    handleResetGeneralSettings: actions.handleResetGeneralSettings,
    handleResetPrintSettings: actions.handleResetPrintSettings,
    handleResetReportsSettings: actions.handleResetReportsSettings,
    handleResetReconciliationFormulaSettings: actions.handleResetReconciliationFormulaSettings,
    loadSystemInformation: infoHandlers.loadSystemInformation,
    updateDatabaseInfo: infoHandlers.updateDatabaseInfo
  };
}

module.exports = {
  createSystemSettingsHandlers
};
