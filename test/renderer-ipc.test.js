const test = require('node:test');
const assert = require('node:assert/strict');

const rendererIpc = require('../src/renderer-ipc');

test('createRendererIpcBridge prefers the preload bridge when available', async () => {
    const calls = [];
    const bridge = rendererIpc.createRendererIpcBridge({
        electronAPI: {
            ipc: {
                invoke: async (channel, ...args) => ({ channel, args }),
                send: (channel, ...args) => {
                    calls.push({ channel, args });
                }
            }
        }
    }, {
        requireFn: () => {
            throw new Error('electron fallback should not be used');
        }
    });

    assert.equal(bridge.transport, 'preload');
    assert.equal(bridge.isSecureBridge, true);
    assert.deepEqual(await bridge.invoke('db-query', 'SELECT 1'), {
        channel: 'db-query',
        args: ['SELECT 1']
    });

    bridge.send('toggle-sync', true);
    assert.deepEqual(calls, [{
        channel: 'toggle-sync',
        args: [true]
    }]);
});

test('createRendererIpcBridge falls back to electron ipcRenderer when preload bridge is unavailable', async () => {
    const calls = [];
    const bridge = rendererIpc.createRendererIpcBridge({}, {
        requireFn: (moduleName) => {
            assert.equal(moduleName, 'electron');
            return {
                ipcRenderer: {
                    invoke: async (channel, ...args) => ({ channel, args }),
                    send: (channel, ...args) => {
                        calls.push({ channel, args });
                    }
                }
            };
        }
    });

    assert.equal(bridge.transport, 'electron');
    assert.equal(bridge.isFallbackBridge, true);
    assert.deepEqual(await bridge.invoke('get-sync-status'), {
        channel: 'get-sync-status',
        args: []
    });

    bridge.send('ping', 'ok');
    assert.deepEqual(calls, [{
        channel: 'ping',
        args: ['ok']
    }]);
});

test('createRendererIpcBridge reports unavailable transport cleanly', async () => {
    const bridge = rendererIpc.createRendererIpcBridge({}, {
        requireFn: () => {
            throw new Error('electron not available');
        }
    });

    assert.equal(bridge.transport, 'unavailable');
    assert.equal(bridge.isAvailable, false);
    await assert.rejects(
        bridge.invoke('db-query'),
        /IPC bridge unavailable for invoke/
    );
    assert.throws(
        () => bridge.send('db-query'),
        /IPC bridge unavailable for send/
    );
});
