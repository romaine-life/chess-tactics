const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function createDevGrantSessionReader({ authBaseUrl, credentialPath, enabled, fetchImpl = fetch }) {
  let jwks = { expiresAt: 0, keys: [] };
  return async function verifiedDevGrantSession() {
    if (!credentialPath || !enabled) return null;
    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    } catch {
      return null;
    }
    if (typeof stored.token !== 'string' || !stored.token) return null;
    const decoded = jwt.decode(stored.token, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) throw Object.assign(new Error('dev_auth_token_missing_kid'), { statusCode: 401 });
    if (jwks.expiresAt <= Date.now()) {
      const response = await fetchImpl(`${authBaseUrl}/api/auth/jwks`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Object.assign(new Error('dev_auth_jwks_unavailable'), { statusCode: 502 });
      const body = await response.json();
      jwks = { expiresAt: Date.now() + 5 * 60 * 1000, keys: Array.isArray(body.keys) ? body.keys : [] };
    }
    const jwk = jwks.keys.find((candidate) => candidate.kid === kid);
    if (!jwk) throw Object.assign(new Error('dev_auth_token_unknown_kid'), { statusCode: 401 });
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    let claims;
    try {
      claims = jwt.verify(stored.token, publicKey, { algorithms: ['RS256'], issuer: authBaseUrl });
    } catch {
      throw Object.assign(new Error('dev_auth_token_invalid'), { statusCode: 401 });
    }
    if (claims.purpose !== 'bot' || typeof claims.email !== 'string') {
      throw Object.assign(new Error('dev_auth_token_wrong_purpose'), { statusCode: 401 });
    }
    return { user: { email: claims.email, name: claims.name || claims.email, role: claims.role || 'admin' } };
  };
}

module.exports = { createDevGrantSessionReader };
