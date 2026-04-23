const test = require('node:test');
const assert = require('node:assert/strict');

const { hasPermission, serializePermissions } = require('../src/app/user-permissions');

test('hasPermission grants reconciliation formula tab for backward-compatible explicit settings perms', () => {
  const user = {
    role: 'admin',
    permissions: JSON.stringify([
      'section:settings',
      'settings-tab:general',
      'settings-tab:reports'
    ])
  };

  assert.equal(hasPermission(user, 'settings-tab:reconciliation-formula'), true);
});

test('hasPermission keeps denial when no fallback settings permissions exist', () => {
  const user = {
    role: 'admin',
    permissions: JSON.stringify([
      'section:settings',
      'settings-tab:database'
    ])
  };

  assert.equal(hasPermission(user, 'settings-tab:reconciliation-formula'), false);
});

test('serializePermissions keeps the cashboxes section permission', () => {
  const serialized = serializePermissions(['section:cashboxes']);
  assert.equal(serialized, JSON.stringify(['section:cashboxes']));
  assert.equal(hasPermission({ role: 'admin', permissions: serialized }, 'section:cashboxes'), true);
});

test('hasPermission grants cashboxes section for backward-compatible supplier ledger perms', () => {
  const user = {
    role: 'admin',
    permissions: JSON.stringify([
      'section:supplier-ledger'
    ])
  };

  assert.equal(hasPermission(user, 'section:cashboxes'), true);
});
