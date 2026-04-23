const test = require('node:test');
const assert = require('node:assert/strict');

const { WebSessionStore } = require('../src/security/web-session-store');

test('WebSessionStore creates isolated session snapshots', () => {
    const store = new WebSessionStore({ ttlMs: 60_000, now: () => 1_000 });
    const session = store.createSession({ id: 7, role: 'admin' });

    assert.equal(typeof session.token, 'string');
    assert.equal(session.user.id, 7);

    session.user.role = 'tampered';

    const storedSession = store.getSession(session.token);
    assert.equal(storedSession.user.role, 'admin');
    assert.equal(storedSession.expiresAt, 61_000);
});

test('WebSessionStore expires and destroys sessions safely', () => {
    let currentTime = 5_000;
    const store = new WebSessionStore({ ttlMs: 500, now: () => currentTime });
    const session = store.createSession({ id: 3, role: 'cashier' });

    assert.equal(store.getSession(session.token).user.id, 3);

    currentTime = 5_600;
    assert.equal(store.getSession(session.token), null);
    assert.equal(store.destroySession(session.token), false);
});
