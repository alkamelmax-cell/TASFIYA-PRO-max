const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDependencySignature,
  buildElectronAppEnv,
  ensureModuleProbeScript,
  getElectronModuleProbeArgs,
  isTruthy
} = require('../scripts/run-electron');

test('run-electron helpers stay deterministic enough for startup checks', () => {
  assert.equal(isTruthy('1'), true);
  assert.equal(isTruthy('true'), true);
  assert.equal(isTruthy('off'), false);

  const signature = buildDependencySignature();
  assert.equal(typeof signature, 'string');
  assert.match(signature, /^[a-f0-9]{40}$/);
});

test('run-electron probe stays in Electron app mode and uses a cache script', () => {
  const appEnv = buildElectronAppEnv({ PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' });
  assert.equal(appEnv.PATH, 'C:\\Windows');
  assert.equal('ELECTRON_RUN_AS_NODE' in appEnv, false);

  const probeScriptPath = ensureModuleProbeScript();
  const probeArgs = getElectronModuleProbeArgs();
  assert.equal(probeArgs[0], probeScriptPath);
  assert.match(probeScriptPath, /electron-native-deps-probe\.cjs$/);
});
