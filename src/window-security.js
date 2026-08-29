const path = require('path');

function createSecureWebPreferences(baseDir, options = {}) {
    const {
        preloadFile = 'preload.js',
        devTools,
        webSecurity = true,
        ...overrides
    } = options;

    const webPreferences = {
        preload: path.join(baseDir, preloadFile),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity,
        ...overrides
    };

    if (typeof devTools === 'boolean') {
        webPreferences.devTools = devTools;
    }

    return webPreferences;
}

module.exports = {
    createSecureWebPreferences
};
