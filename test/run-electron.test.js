const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDependencySignature,
  buildElectronAppEnv,
  buildElectronNodeEnv,
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

test('run-electron probe uses Electron node mode instead of app mode', () => {
  const nodeEnv = buildElectronNodeEnv({ PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '0' });
  assert.equal(nodeEnv.PATH, 'C:\\Windows');
  assert.equal(nodeEnv.ELECTRON_RUN_AS_NODE, '1');

  const appEnv = buildElectronAppEnv({ PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' });
  assert.equal(appEnv.PATH, 'C:\\Windows');
  assert.equal('ELECTRON_RUN_AS_NODE' in appEnv, false);

  const probeArgs = getElectronModuleProbeArgs();
  assert.equal(probeArgs[0], '-e');
  assert.match(probeArgs[1], /better-sqlite3/);
});
