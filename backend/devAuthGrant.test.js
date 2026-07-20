const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { createDevGrantSessionReader } = require('./devAuthGrant');

const issuer = 'https://auth.example.test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

function fixture(claims) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-dev-auth-'));
  const credentialPath = path.join(dir, 'auth.json');
  const token = jwt.sign(claims, privateKey, { algorithm: 'RS256', issuer, expiresIn: '5m', keyid: 'test-key' });
  fs.writeFileSync(credentialPath, JSON.stringify({ token }));
  const read = createDevGrantSessionReader({
    authBaseUrl: issuer,
    credentialPath,
    enabled: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) }),
  });
  return { dir, read };
}

test('valid approved bot grant supplies the localhost user identity', async (t) => {
  const { dir, read } = fixture({ email: 'owner@example.test', name: 'Owner', role: 'admin', purpose: 'bot' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(await read(), { user: { email: 'owner@example.test', name: 'Owner', role: 'admin' } });
});

test('a non-bot user token cannot activate the localhost bridge', async (t) => {
  const { dir, read } = fixture({ email: 'owner@example.test', role: 'admin' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(read, /wrong_purpose/);
});

test('an expired grant fails closed as unauthorized', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-dev-auth-expired-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const credentialPath = path.join(dir, 'auth.json');
  const token = jwt.sign(
    { email: 'owner@example.test', role: 'admin', purpose: 'bot' },
    privateKey,
    { algorithm: 'RS256', issuer, expiresIn: -1, keyid: 'test-key' },
  );
  fs.writeFileSync(credentialPath, JSON.stringify({ token }));
  const read = createDevGrantSessionReader({
    authBaseUrl: issuer,
    credentialPath,
    enabled: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) }),
  });
  await assert.rejects(read, (error) => error.message === 'dev_auth_token_invalid' && error.statusCode === 401);
});
