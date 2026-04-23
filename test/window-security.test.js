const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createSecureWebPreferences } = require('../src/window-security');

test('createSecureWebPreferences returns hardened defaults', () => {
    const result = createSecureWebPreferences('C:\\app\\src');

    assert.equal(result.preload, path.join('C:\\app\\src', 'preload.js'));
    assert.equal(result.nodeIntegration, false);
    assert.equal(result.contextIsolation, true);
    assert.equal(result.enableRemoteModule, false);
    assert.equal(result.webSecurity, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'devTools'), false);
});

test('createSecureWebPreferences allows explicit secure overrides only where intended', () => {
    const result = createSecureWebPreferences('C:\\app\\src', {
        devTools: true,
        webSecurity: false,
        sandbox: false
    });

    assert.equal(result.preload, path.join('C:\\app\\src', 'preload.js'));
    assert.equal(result.devTools, true);
    assert.equal(result.webSecurity, false);
    assert.equal(result.sandbox, false);
    assert.equal(result.nodeIntegration, false);
});
