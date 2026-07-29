const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_COOKIE = '__Host-chess-tactics-access';
const REFRESH_COOKIE = '__Host-chess-tactics-refresh';
const STATE_COOKIE = '__Host-chess-tactics-oidc-state';
const DEFAULT_ACCESS_TTL_SECONDS = 60 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 5 * 60 * 1000;

class OIDCAuthError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'OIDCAuthError';
    this.statusCode = statusCode;
  }
}

function parseCookieHeader(header) {
  const cookies = new Map();
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(raw));
    } catch {
      // A malformed unrelated cookie must not take down authentication.
    }
  }
  return cookies;
}

function cookieValue(name, value, maxAge) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].join('; ');
}

function appendCookie(res, value) {
  res.append('Set-Cookie', value);
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function createOIDCSessionManager({
  issuer,
  clientId,
  publicOrigin,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  const normalizedIssuer = String(issuer || '').replace(/\/+$/, '');
  const normalizedOrigin = String(publicOrigin || '').replace(/\/+$/, '');
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedIssuer || !normalizedOrigin || !normalizedClientId) {
    throw new Error('issuer, clientId, and publicOrigin are required');
  }

  const issuerOrigin = new URL(normalizedIssuer).origin;
  const callbackURL = `${normalizedOrigin}/api/auth/callback`;
  const pending = new Map();
  let discoveryCache = null;
  let discoveryExpiresAt = 0;
  let jwksCache = new Map();
  let jwksExpiresAt = 0;

  async function responseJson(response, context) {
    let body;
    try {
      body = await response.json();
    } catch {
      throw new OIDCAuthError(`${context}_invalid_json`);
    }
    return body;
  }

  function sameIssuerOrigin(raw, field) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new OIDCAuthError(`oidc_discovery_${field}_invalid`);
    }
    if (parsed.origin !== issuerOrigin) {
      throw new OIDCAuthError(`oidc_discovery_${field}_origin_mismatch`);
    }
    return parsed.toString();
  }

  async function discovery() {
    if (discoveryCache && discoveryExpiresAt > now()) return discoveryCache;
    let response;
    try {
      response = await fetchImpl(`${normalizedIssuer}/.well-known/openid-configuration`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new OIDCAuthError(`oidc_discovery_unavailable: ${error.message}`);
    }
    if (!response.ok) throw new OIDCAuthError(`oidc_discovery_http_${response.status}`);
    const body = await responseJson(response, 'oidc_discovery');
    if (body.issuer !== normalizedIssuer) throw new OIDCAuthError('oidc_discovery_issuer_mismatch');
    discoveryCache = {
      issuer: body.issuer,
      authorization_endpoint: sameIssuerOrigin(body.authorization_endpoint, 'authorization_endpoint'),
      token_endpoint: sameIssuerOrigin(body.token_endpoint, 'token_endpoint'),
      userinfo_endpoint: sameIssuerOrigin(body.userinfo_endpoint, 'userinfo_endpoint'),
      jwks_uri: sameIssuerOrigin(body.jwks_uri, 'jwks_uri'),
    };
    discoveryExpiresAt = now() + DISCOVERY_TTL_MS;
    return discoveryCache;
  }

  async function loadJwks(force = false) {
    if (!force && jwksCache.size && jwksExpiresAt > now()) return jwksCache;
    const config = await discovery();
    let response;
    try {
      response = await fetchImpl(config.jwks_uri, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new OIDCAuthError(`oidc_jwks_unavailable: ${error.message}`);
    }
    if (!response.ok) throw new OIDCAuthError(`oidc_jwks_http_${response.status}`);
    const body = await responseJson(response, 'oidc_jwks');
    const next = new Map();
    for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
      if (jwk && jwk.kid && jwk.kty === 'RSA') next.set(jwk.kid, jwk);
    }
    if (!next.size) throw new OIDCAuthError('oidc_jwks_empty');
    jwksCache = next;
    jwksExpiresAt = now() + JWKS_TTL_MS;
    return jwksCache;
  }

  async function verifyIDToken(raw, expectedNonce = '') {
    const decoded = jwt.decode(raw, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid) {
      throw new OIDCAuthError('oidc_id_token_header_invalid', 401);
    }
    let keys = await loadJwks();
    let jwk = keys.get(decoded.header.kid);
    if (!jwk) {
      keys = await loadJwks(true);
      jwk = keys.get(decoded.header.kid);
    }
    if (!jwk) throw new OIDCAuthError('oidc_id_token_key_unknown', 401);
    let claims;
    try {
      const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      claims = jwt.verify(raw, key, {
        algorithms: ['RS256'],
        issuer: normalizedIssuer,
        audience: normalizedClientId,
      });
    } catch {
      throw new OIDCAuthError('oidc_id_token_invalid', 401);
    }
    if (expectedNonce && claims.nonce !== expectedNonce) {
      throw new OIDCAuthError('oidc_id_token_nonce_invalid', 401);
    }
    return claims;
  }

  async function tokenRequest(parameters) {
    const config = await discovery();
    let response;
    try {
      response = await fetchImpl(config.token_endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(parameters).toString(),
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new OIDCAuthError(`oidc_token_unavailable: ${error.message}`);
    }
    const body = await responseJson(response, 'oidc_token');
    return { ok: response.ok, status: response.status, body };
  }

  function applyTokenCookies(res, tokens, fallbackRefreshToken = '') {
    const accessToken = String(tokens.access_token || '');
    if (!accessToken) throw new OIDCAuthError('oidc_token_missing_access_token', 401);
    const accessTtl = Number(tokens.expires_in) > 0
      ? Number(tokens.expires_in)
      : DEFAULT_ACCESS_TTL_SECONDS;
    appendCookie(res, cookieValue(ACCESS_COOKIE, accessToken, accessTtl));
    const refreshToken = String(tokens.refresh_token || fallbackRefreshToken || '');
    if (refreshToken) {
      appendCookie(res, cookieValue(REFRESH_COOKIE, refreshToken, DEFAULT_REFRESH_TTL_SECONDS));
    }
  }

  function clearSession(res) {
    appendCookie(res, cookieValue(ACCESS_COOKIE, '', 0));
    appendCookie(res, cookieValue(REFRESH_COOKIE, '', 0));
  }

  async function userInfo(accessToken) {
    const config = await discovery();
    let response;
    try {
      response = await fetchImpl(config.userinfo_endpoint, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new OIDCAuthError(`oidc_userinfo_unavailable: ${error.message}`);
    }
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) throw new OIDCAuthError(`oidc_userinfo_http_${response.status}`);
    const user = await responseJson(response, 'oidc_userinfo');
    if (!user || typeof user.email !== 'string' || !user.email) return null;
    return {
      user: {
        id: user.sub,
        email: user.email,
        name: user.name || user.email,
        image: user.picture || null,
        role: user.role || 'pending',
        apps: user.apps || {},
      },
    };
  }

  async function refreshSession(refreshToken, res) {
    const result = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: normalizedClientId,
    });
    if (!result.ok) {
      if (result.status >= 400 && result.status < 500) {
        clearSession(res);
        return null;
      }
      throw new OIDCAuthError(`oidc_refresh_http_${result.status}`);
    }
    if (result.body.id_token) await verifyIDToken(result.body.id_token);
    applyTokenCookies(res, result.body, refreshToken);
    const session = await userInfo(result.body.access_token);
    if (!session) clearSession(res);
    return session;
  }

  async function readSession(cookieHeader, res) {
    const cookies = parseCookieHeader(cookieHeader);
    const accessToken = cookies.get(ACCESS_COOKIE) || '';
    const refreshToken = cookies.get(REFRESH_COOKIE) || '';
    if (accessToken) {
      const session = await userInfo(accessToken);
      if (session) return session;
    }
    if (refreshToken) return refreshSession(refreshToken, res);
    if (accessToken) clearSession(res);
    return null;
  }

  async function startLogin(returnTo, res) {
    const config = await discovery();
    for (const [state, login] of pending) {
      if (login.expiresAt <= now()) pending.delete(state);
    }
    const state = randomToken(24);
    const verifier = randomToken(32);
    const nonce = randomToken(24);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    pending.set(state, {
      verifier,
      nonce,
      returnTo,
      expiresAt: now() + PENDING_LOGIN_TTL_MS,
    });
    appendCookie(res, cookieValue(STATE_COOKIE, state, PENDING_LOGIN_TTL_MS / 1000));
    const url = new URL(config.authorization_endpoint);
    url.searchParams.set('client_id', normalizedClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', callbackURL);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async function completeLogin({ code, state, cookieHeader }, res) {
    const callbackState = String(state || '');
    const browserState = parseCookieHeader(cookieHeader).get(STATE_COOKIE) || '';
    const login = pending.get(callbackState);
    if (login) pending.delete(callbackState);
    appendCookie(res, cookieValue(STATE_COOKIE, '', 0));
    if (!callbackState || browserState !== callbackState || !login || login.expiresAt <= now() || !code) {
      throw new OIDCAuthError('oidc_login_state_invalid', 400);
    }
    const result = await tokenRequest({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: callbackURL,
      client_id: normalizedClientId,
      code_verifier: login.verifier,
    });
    if (!result.ok) throw new OIDCAuthError(`oidc_code_exchange_http_${result.status}`, 401);
    if (!result.body.id_token) throw new OIDCAuthError('oidc_token_missing_id_token', 401);
    await verifyIDToken(result.body.id_token, login.nonce);
    applyTokenCookies(res, result.body);
    return login.returnTo;
  }

  return {
    callbackURL,
    clearSession,
    completeLogin,
    readSession,
    startLogin,
  };
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  STATE_COOKIE,
  OIDCAuthError,
  createOIDCSessionManager,
  parseCookieHeader,
};
