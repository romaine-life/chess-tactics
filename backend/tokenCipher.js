const crypto = require('crypto');

// Encryption at rest for the OAuth tokens held in `auth_sessions`.
//
// The session cookie's token is HASHED, so a database read yields nothing replayable. The OAuth
// access and refresh tokens cannot be: the backend has to present them to the identity provider,
// so it must be able to recover them. Stored plainly, a read of the database is a working refresh
// token — redeemable from anywhere.
//
// That matters more here than it would elsewhere, and for a reason specific to this project:
// there is no dev database. Every developer's localhost connects to the production Postgres
// (docs, CLAUDE.md). The set of machines that can read these rows is therefore much larger than
// the set that can read a pod's environment, which is where the key lives. Encryption at rest is
// what separates the two.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather than yielding
// garbage that gets presented to the provider as a token.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
// Values carry their format, so an encrypted store can still read rows written before it existed
// and upgrade them on the next write. Without this, turning encryption on would sign everybody out.
const PREFIX = 'v1.';

function readKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let key;
  try {
    key = Buffer.from(value, 'base64');
  } catch {
    throw new Error('AUTH_TOKEN_ENCRYPTION_KEY is not valid base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`AUTH_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

/**
 * A cipher for stored tokens.
 *
 * With no key it passes values through unchanged and says so once. That is deliberate: the
 * alternative is refusing to start, which would take the whole app down over a missing environment
 * variable and leave nobody able to sign in — strictly worse than the status quo it is trying to
 * improve on. The warning is loud, and the next write after a key appears encrypts the row.
 */
function createTokenCipher(rawKey, { onMissingKey } = {}) {
  const key = readKey(rawKey);
  if (!key && onMissingKey) onMissingKey();

  return {
    enabled: Boolean(key),

    encrypt(value) {
      const plain = String(value || '');
      if (!plain || !key) return plain;
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
    },

    decrypt(value) {
      const stored = String(value || '');
      // Written before encryption was switched on. Readable, and re-written encrypted on the next
      // token rotation, so the plaintext ages out of the table without a migration or a sign-out.
      if (!stored.startsWith(PREFIX)) return stored;
      if (!key) {
        // The row is encrypted and the key is gone. Returning the ciphertext would send it to the
        // provider as a token and produce a confusing `invalid_grant`; an empty value is read as
        // "no token", which ends the session cleanly and honestly.
        return '';
      }
      const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split('.');
      if (!iv || !tag || !ciphertext) return '';
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Wrong key or tampered value. Same reasoning as above: no token, not a bad one.
        return '';
      }
    },
  };
}

module.exports = { createTokenCipher, TOKEN_CIPHER_PREFIX: PREFIX };
