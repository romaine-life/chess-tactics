const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createTokenCipher, TOKEN_CIPHER_PREFIX } = require('./tokenCipher');

const KEY = crypto.randomBytes(32).toString('base64');

test('a stored token is not readable from the row', () => {
  const cipher = createTokenCipher(KEY);
  const stored = cipher.encrypt('refresh-abc123');
  assert.ok(!stored.includes('refresh-abc123'), 'the token must not appear in what is stored');
  assert.equal(cipher.decrypt(stored), 'refresh-abc123');
});

test('the same token encrypts differently every time', () => {
  const cipher = createTokenCipher(KEY);
  // A fresh IV per write, so two sessions holding the same token are not visibly the same session,
  // and a rotation is not visibly a no-op.
  assert.notEqual(cipher.encrypt('same'), cipher.encrypt('same'));
});

test('a tampered value decrypts to nothing rather than to garbage', () => {
  const cipher = createTokenCipher(KEY);
  const stored = cipher.encrypt('refresh-abc123');
  const tampered = `${stored.slice(0, -4)}AAAA`;
  // GCM authenticates, so this is caught. Returning empty reads as "no token" and ends the session
  // cleanly; returning the bytes would send them to the provider and produce a confusing failure.
  assert.equal(cipher.decrypt(tampered), '');
});

test('the wrong key yields nothing, not a wrong token', () => {
  const stored = createTokenCipher(KEY).encrypt('refresh-abc123');
  const other = createTokenCipher(crypto.randomBytes(32).toString('base64'));
  assert.equal(other.decrypt(stored), '');
});

test('rows written before encryption was switched on still work', () => {
  const cipher = createTokenCipher(KEY);
  // Turning this on must not sign everybody out. A value without the format marker is plaintext
  // from before, readable as-is, and re-written encrypted on the next rotation.
  assert.equal(cipher.decrypt('legacy-plaintext-token'), 'legacy-plaintext-token');
  assert.ok(cipher.encrypt('x').startsWith(TOKEN_CIPHER_PREFIX));
});

test('without a key it passes through and says so, rather than refusing to start', () => {
  let warned = false;
  const cipher = createTokenCipher('', { onMissingKey: () => { warned = true; } });
  assert.equal(warned, true);
  assert.equal(cipher.enabled, false);
  // Refusing to start would take the app down over a missing variable and leave nobody able to
  // sign in — worse than the plaintext it is improving on.
  assert.equal(cipher.decrypt(cipher.encrypt('token')), 'token');
});

test('an encrypted row is unreadable if the key is later lost', () => {
  const stored = createTokenCipher(KEY).encrypt('refresh-abc123');
  assert.equal(createTokenCipher('').decrypt(stored), '');
});

test('a malformed key is refused outright', () => {
  // Silently ignoring a bad key would leave tokens in plaintext while the operator believed
  // otherwise. This is the one case worth failing loudly on: it is a deploy-time typo, not a
  // runtime condition.
  assert.throws(() => createTokenCipher(crypto.randomBytes(16).toString('base64')), /32 bytes/);
  assert.throws(() => createTokenCipher('not base64!!!'), /32 bytes|valid base64/);
});
