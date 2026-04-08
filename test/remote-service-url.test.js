const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_REMOTE_SERVICE_BASE_URL,
    buildRemoteServiceUrl,
    getRemoteServiceBaseUrl
} = require('../src/remote-service-url');

test('remote service url defaults to the legacy production deployment', () => {
    assert.equal(getRemoteServiceBaseUrl({}), DEFAULT_REMOTE_SERVICE_BASE_URL);
    assert.equal(
        buildRemoteServiceUrl('/api/sync/users', {}),
        `${DEFAULT_REMOTE_SERVICE_BASE_URL}/api/sync/users`
    );
});

test('remote service url honors an environment override', () => {
    assert.equal(
        getRemoteServiceBaseUrl({ REMOTE_SERVICE_BASE_URL: 'https://custom.example.com/' }),
        'https://custom.example.com'
    );
    assert.equal(
        buildRemoteServiceUrl('api/reconciliation-requests/15', {
            REMOTE_SERVICE_BASE_URL: 'https://custom.example.com/'
        }),
        'https://custom.example.com/api/reconciliation-requests/15'
    );
});
