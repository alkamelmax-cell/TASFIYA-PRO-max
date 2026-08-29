(function initializeRendererIpc(root, factory) {
    const globalRoot = root && typeof root === 'object'
        ? root
        : (typeof globalThis !== 'undefined' ? globalThis : {});

    const rendererIpc = factory(globalRoot);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = rendererIpc;
        module.exports.createRendererIpcBridge = factory;
    }

    if (globalRoot && typeof globalRoot === 'object') {
        globalRoot.RendererIPC = rendererIpc;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRendererIpcBridge(root, options = {}) {
    const requireFn = typeof options.requireFn === 'function'
        ? options.requireFn
        : (typeof require === 'function' ? require : null);

    function resolveTransport() {
        const preloadIpc = root?.electronAPI?.ipc;
        if (preloadIpc && typeof preloadIpc.invoke === 'function') {
            return {
                ipc: preloadIpc,
                transport: 'preload'
            };
        }

        if (typeof requireFn === 'function') {
            try {
                const electronModule = requireFn('electron');
                const electronIpc = electronModule?.ipcRenderer;
                if (electronIpc && typeof electronIpc.invoke === 'function') {
                    return {
                        ipc: electronIpc,
                        transport: 'electron'
                    };
                }
            } catch (error) {
                return {
                    ipc: null,
                    transport: 'unavailable'
                };
            }
        }

        return {
            ipc: null,
            transport: 'unavailable'
        };
    }

    const resolved = resolveTransport();

    function createUnavailableError(methodName) {
        return new Error(`IPC bridge unavailable for ${methodName}`);
    }

    return {
        transport: resolved.transport,
        isSecureBridge: resolved.transport === 'preload',
        isFallbackBridge: resolved.transport === 'electron',
        isAvailable: Boolean(resolved.ipc),
        invoke(channel, ...args) {
            if (!resolved.ipc || typeof resolved.ipc.invoke !== 'function') {
                return Promise.reject(createUnavailableError('invoke'));
            }

            return resolved.ipc.invoke(channel, ...args);
        },
        send(channel, ...args) {
            if (!resolved.ipc || typeof resolved.ipc.send !== 'function') {
                throw createUnavailableError('send');
            }

            return resolved.ipc.send(channel, ...args);
        }
    };
}));
