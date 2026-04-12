const DEFAULT_REMOTE_BASE = 'https://tasfiya-pro-max.onrender.com';
const DEFAULT_LOCAL_BASE = 'http://localhost:4000';

function normalizeBase(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function buildSyncUrl(path, options = {}) {
  const preferLocal = !!options.preferLocal;
  const baseUrl = normalizeBase(options.baseUrl || (preferLocal ? DEFAULT_LOCAL_BASE : DEFAULT_REMOTE_BASE));
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function getSyncUpdateStatusUrl(options = {}) {
  return buildSyncUrl('/api/sync/update-status', options);
}

function getReconciliationRequestsUrl(options = {}, suffix = '') {
  const normalizedSuffix = suffix
    ? (suffix.startsWith('/') ? suffix : `/${suffix}`)
    : '';
  return buildSyncUrl(`/api/reconciliation-requests${normalizedSuffix}`, options);
}

module.exports = {
  DEFAULT_REMOTE_BASE,
  DEFAULT_LOCAL_BASE,
  buildSyncUrl,
  getSyncUpdateStatusUrl,
  getReconciliationRequestsUrl
};
