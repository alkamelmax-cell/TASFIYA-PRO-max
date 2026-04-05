const crypto = require('crypto');

class WebSessionStore {
    constructor(options = {}) {
        this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 12 * 60 * 60 * 1000;
        this.now = typeof options.now === 'function' ? options.now : () => Date.now();
        this.sessions = new Map();
    }

    createSession(user) {
        this.cleanupExpired();

        const token = crypto.randomBytes(32).toString('hex');
        const issuedAt = this.now();
        const session = {
            token,
            user: user ? { ...user } : null,
            issuedAt,
            expiresAt: issuedAt + this.ttlMs
        };

        this.sessions.set(token, session);
        return this.cloneSession(session);
    }

    getSession(token) {
        if (!token) {
            return null;
        }

        const session = this.sessions.get(token);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= this.now()) {
            this.sessions.delete(token);
            return null;
        }

        return this.cloneSession(session);
    }

    touchSession(token) {
        const session = this.sessions.get(token);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= this.now()) {
            this.sessions.delete(token);
            return null;
        }

        session.expiresAt = this.now() + this.ttlMs;
        return this.cloneSession(session);
    }

    destroySession(token) {
        if (!token) {
            return false;
        }

        return this.sessions.delete(token);
    }

    cleanupExpired() {
        const now = this.now();
        for (const [token, session] of this.sessions.entries()) {
            if (!session || session.expiresAt <= now) {
                this.sessions.delete(token);
            }
        }
    }

    cloneSession(session) {
        if (!session) {
            return null;
        }

        return {
            token: session.token,
            user: session.user ? { ...session.user } : null,
            issuedAt: session.issuedAt,
            expiresAt: session.expiresAt
        };
    }
}

module.exports = {
    WebSessionStore
};
