const DEFAULT_REMOTE_SERVICE_BASE_URL = 'https://tasfiya-pro-max.onrender.com';

function normalizeRemoteServiceBaseUrl(url) {
    return String(url || DEFAULT_REMOTE_SERVICE_BASE_URL)
        .trim()
        .replace(/\/+$/, '');
}

function getRemoteServiceBaseUrl(env = process.env) {
    const configuredBaseUrl = env.REMOTE_SERVICE_BASE_URL || env.TASFIYA_REMOTE_BASE_URL;
    return normalizeRemoteServiceBaseUrl(configuredBaseUrl);
}

function buildRemoteServiceUrl(pathname = '', env = process.env) {
    const baseUrl = getRemoteServiceBaseUrl(env);
    const normalizedPath = pathname
        ? `/${String(pathname).replace(/^\/+/, '')}`
        : '';

    return `${baseUrl}${normalizedPath}`;
}

module.exports = {
    DEFAULT_REMOTE_SERVICE_BASE_URL,
    getRemoteServiceBaseUrl,
    buildRemoteServiceUrl
};
