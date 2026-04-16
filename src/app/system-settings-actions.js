const { createSystemSettingsSaveActions } = require('./system-settings-save-actions');
const { createSystemSettingsResetActions } = require('./system-settings-reset-actions');

function createSystemSettingsActionHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || globalThis;
  const FormDataCtor = context.FormDataCtor || globalThis.FormData;
  const FileReaderCtor = context.FileReaderCtor || globalThis.FileReader;
  const getDialogUtils = context.getDialogUtils;
  const applyTheme = context.applyTheme;
  const displayCompanyLogo = context.displayCompanyLogo;
  const logger = context.logger || console;

  const saveActions = createSystemSettingsSaveActions({
    document,
    ipcRenderer,
    windowObj,
    FormDataCtor,
    getDialogUtils,
    applyTheme,
    logger
  });

  const resetActions = createSystemSettingsResetActions({
    document,
    ipcRenderer,
    windowObj,
    FileReaderCtor,
    getDialogUtils,
    displayCompanyLogo,
    applyGeneralSettingsRealTime: saveActions.applyGeneralSettingsRealTime
  });

  return {
    handleSaveGeneralSettings: saveActions.handleSaveGeneralSettings,
    handleSelectReportsPath: saveActions.handleSelectReportsPath,
    applyGeneralSettingsRealTime: saveActions.applyGeneralSettingsRealTime,
    handleSavePrintSettings: saveActions.handleSavePrintSettings,
    applyPrintSettingsRealTime: saveActions.applyPrintSettingsRealTime,
    handleSaveReportsSettings: saveActions.handleSaveReportsSettings,
    handleLoadReconciliationFormulaProfiles: saveActions.handleLoadReconciliationFormulaProfiles,
    handleFormulaProfileSelectionChange: saveActions.handleFormulaProfileSelectionChange,
    handleOpenCreateFormulaProfileModal: saveActions.handleOpenCreateFormulaProfileModal,
    handleOpenEditFormulaProfileModal: saveActions.handleOpenEditFormulaProfileModal,
    handleSaveFormulaProfileModal: saveActions.handleSaveFormulaProfileModal,
    handleFormulaProfileModalPreview: saveActions.handleFormulaProfileModalPreview,
    handleFormulaProfilesTableClick: saveActions.handleFormulaProfilesTableClick,
    handleCreateFormulaProfile: saveActions.handleCreateFormulaProfile,
    handleActivateFormulaProfile: saveActions.handleActivateFormulaProfile,
    handleDeleteFormulaProfile: saveActions.handleDeleteFormulaProfile,
    handleSaveReconciliationFormulaSettings: saveActions.handleSaveReconciliationFormulaSettings,
    handleApplyAndSaveReconciliationFormulaPreset: saveActions.handleApplyAndSaveReconciliationFormulaPreset,
    handleApplyReconciliationFormulaPreset: saveActions.handleApplyReconciliationFormulaPreset,
    handleReconciliationFormulaSettingsPreview: saveActions.handleReconciliationFormulaSettingsPreview,
    handleLogoUpload: resetActions.handleLogoUpload,
    handleResetGeneralSettings: resetActions.handleResetGeneralSettings,
    handleResetPrintSettings: resetActions.handleResetPrintSettings,
    handleResetReportsSettings: resetActions.handleResetReportsSettings,
    handleResetReconciliationFormulaSettings: resetActions.handleResetReconciliationFormulaSettings
  };
}

module.exports = {
  createSystemSettingsActionHandlers
};
