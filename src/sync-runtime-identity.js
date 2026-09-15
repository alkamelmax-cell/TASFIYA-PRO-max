const crypto = require('crypto');

const SYNC_RUNTIME_HEADER = 'x-tasfiya-sync-runtime-id';
const runtimeInstanceId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(24).toString('hex');

function getSyncRuntimeInstanceId() {
    return runtimeInstanceId;
}

function isSameSyncRuntimeInstance(value) {
    const incoming = String(value || '').trim();
    if (!incoming || incoming.length !== runtimeInstanceId.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(incoming, 'utf8'),
        Buffer.from(runtimeInstanceId, 'utf8')
    );
}

module.exports = {
    SYNC_RUNTIME_HEADER,
    getSyncRuntimeInstanceId,
    isSameSyncRuntimeInstance
};
