const { initializeAppShellRuntimeBootstrap } = require('./app-shell-runtime-bootstrap');
const { initializeAppEditRuntimeBootstrap } = require('./app-edit-runtime-bootstrap');
const { initializeAppPreUiRuntimeBootstrap } = require('./app-pre-ui-runtime-bootstrap');
const { initializeAppUiRuntimeBootstrap } = require('./app-ui-runtime-bootstrap');
const { initializeAppReconciliationRuntimeBootstrap } = require('./app-reconciliation-runtime-bootstrap');
const { initializeAppPrintRuntimeBootstrap } = require('./app-print-runtime-bootstrap');
const { finalizeAppInitialization } = require('./app-finalization');
const {
  createShellRuntimeDeps,
  createPreUiRuntimeDeps,
  createEditRuntimeDeps,
  createPrintRuntimeDeps,
  createReconciliationRuntimeDeps,
  createUiRuntimeDeps,
  createFinalizationDeps,
  bindLegacyPreUiHandlers,
  buildComposedHandlers
} = require('./app-composition-deps');

function composeAppModules(deps) {
  const core = deps.core;
  const shared = deps.shared;
  const shell = deps.shell;
  const edit = deps.edit;
  const dataEntryHandlers = deps.dataEntryHandlers;
  const editTableHandlers = deps.editTableHandlers;
  const formatting = deps.formatting;
  const report = deps.report;
  const printStyleDeps = deps.printStyleDeps;

  const runtime = {
    preUiHandlers: null,
    editRuntimeHandlers: null,
    printReportHandlers: null,
    reconciliationUiHandlers: null,
    appUiHandlers: null,
    finalizationHandlers: null
  };

  const shellHandlers = initializeAppShellRuntimeBootstrap(
    createShellRuntimeDeps({ core, shared, shell, editTableHandlers, runtime })
  );

  runtime.preUiHandlers = initializeAppPreUiRuntimeBootstrap(
    createPreUiRuntimeDeps({
      core,
      shared,
      shellHandlers,
      formatting,
      report,
      runtime,
      defaultCompanyName: deps.defaultCompanyName,
      getAutocompleteSystem: deps.getAutocompleteSystem,
      matchMediaFn: deps.matchMediaFn
    })
  );

  runtime.editRuntimeHandlers = initializeAppEditRuntimeBootstrap(
    createEditRuntimeDeps({
      core,
      shared,
      edit,
      dataEntryHandlers,
      editTableHandlers,
      formatting,
      runtime
    })
  );

  edit.setEditSessionHandlers(runtime.editRuntimeHandlers.sessionHandlers);
  bindLegacyPreUiHandlers(core.windowObj, runtime.preUiHandlers);

  runtime.printReportHandlers = initializeAppPrintRuntimeBootstrap(
    createPrintRuntimeDeps({
      core,
      shared,
      formatting,
      report,
      runtime,
      defaultCompanyName: deps.defaultCompanyName
    })
  );

  runtime.reconciliationUiHandlers = initializeAppReconciliationRuntimeBootstrap(
    createReconciliationRuntimeDeps({
      core,
      shared,
      dataEntryHandlers,
      formatting,
      printStyleDeps,
      runtime
    })
  );

  runtime.appUiHandlers = initializeAppUiRuntimeBootstrap(
    createUiRuntimeDeps({
      core,
      shell,
      formatting,
      shellHandlers,
      dataEntryHandlers,
      runtime
    })
  );

  runtime.finalizationHandlers = finalizeAppInitialization(
    createFinalizationDeps({
      core,
      shared,
      formatting,
      shellHandlers,
      runtime
    })
  );

  return buildComposedHandlers(shellHandlers, runtime);
}

module.exports = {
  composeAppModules
};
