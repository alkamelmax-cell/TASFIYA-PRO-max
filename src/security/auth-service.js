const crypto = require('crypto');

const HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

function normalizeSecret(secret) {
  if (secret == null) {
    return '';
  }

  return String(secret);
}

function isHashedSecret(secret) {
  const normalized = normalizeSecret(secret);
  const parts = normalized.split('$');
  return parts.length === 3 && parts[0] === HASH_PREFIX;
}

function hashSecret(secret) {
  const normalized = normalizeSecret(secret);

  if (!normalized) {
    throw new Error('SECRET_REQUIRED');
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(normalized, salt, KEY_LENGTH).toString('hex');
  return `${HASH_PREFIX}$${salt}$${derivedKey}`;
}

function hashSecretIfNeeded(secret, options = {}) {
  const normalized = normalizeSecret(secret);

  if (!normalized) {
    if (options.allowEmpty) {
      return normalized;
    }
    throw new Error('SECRET_REQUIRED');
  }

  if (isHashedSecret(normalized)) {
    return normalized;
  }

  return hashSecret(normalized);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(normalizeSecret(left), 'utf8');
  const rightBuffer = Buffer.from(normalizeSecret(right), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySecret(storedSecret, providedSecret) {
  const stored = normalizeSecret(storedSecret);
  const provided = normalizeSecret(providedSecret);

  if (!stored || !provided) {
    return { ok: false, needsRehash: false };
  }

  if (!isHashedSecret(stored)) {
    return {
      ok: safeEqual(stored, provided),
      needsRehash: true
    };
  }

  const [, salt, storedKey] = stored.split('$');
  if (!salt || !storedKey) {
    return { ok: false, needsRehash: false };
  }

  const derivedKey = crypto.scryptSync(provided, salt, KEY_LENGTH).toString('hex');
  return {
    ok: safeEqual(storedKey, derivedKey),
    needsRehash: false
  };
}

module.exports = {
  hashSecret,
  hashSecretIfNeeded,
  isHashedSecret,
  verifySecret
};
