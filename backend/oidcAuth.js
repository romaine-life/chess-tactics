const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createTokenCipher } = require('./tokenCipher');

// Chess Tactics is a Backend-For-Frontend, and a BFF hands the browser a session cookie while the
// OAuth tokens stay on the server (draft-ietf-oauth-browser-based-apps-26 §6.1.1). One cookie, and
// it carries an identifier — not a credential the identity provider would accept.
const SESSION_COOKIE = '__Host-chess-tactics-session';
const STATE_COOKIE = '__Host-chess-tactics-oidc-state';

// Decision 1 of docs/auth-security-audit.md. A player who stops playing for a month signs in
// again; anyone still playing re-authenticates quarterly. The absolute deadline is fixed at
// sign-in and no amount of activity moves it.
const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
// Decision 3. Admin capability is not the session: publishing game content requires credentials
// presented within this window, and the session outliving it is normal.
const ADMIN_FRESHNESS_MS = 8 * 60 * 60 * 1000;
// The idle deadline slides, but not on every request — a read-mostly session would otherwise cost
// a write per call for a deadline measured in weeks.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
// Refresh before the access token actually lapses, so an ordinary request is never the one that
// discovers it expired mid-flight.
const REFRESH_SKEW_MS = 60 * 1000;

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

/**
 * `Strict` is the session cookie's policy and its CSRF defence at once
 * (draft-26 §6.1.3.2 and §6.1.3.3.1) — it is not sent on any cross-site request, so a
 * cross-site write cannot carry it. Nothing user-specific is server-rendered here, so the
 * only cost is that a visit arriving from an external link reads identity a round trip later,
 * through the same-site fetch that follows the document.
 *
 * The 10-minute login-state cookie is the deliberate exception and MUST stay `Lax`: the callback
 * from the identity provider is a cross-site top-level navigation, and a `Strict` cookie there
 * would fail every sign-in with `oidc_login_state_invalid`. It authorises nothing on its own — it
 * names an attempt row and is spent on arrival.
 */
function cookieValue(name, value, maxAge, sameSite = 'Strict') {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    `SameSite=${sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].join('; ');
}

function appendCookie(res, value) {
  res.append('Set-Cookie', value);
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Only the hash of a session token is stored, so a database read yields nothing that can be
 * replayed as a session. The same holds for the login state, whose row would otherwise let a
 * reader complete somebody else's sign-in.
 */
function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createOIDCSessionManager({
  issuer,
  clientId,
  clientSecret = '',
  publicOrigin,
  store,
  tokenEncryptionKey = '',
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  const normalizedIssuer = String(issuer || '').replace(/\/+$/, '');
  const normalizedOrigin = String(publicOrigin || '').replace(/\/+$/, '');
  const normalizedClientId = String(clientId || '').trim();
  const normalizedClientSecret = String(clientSecret || '').trim();
  if (!normalizedIssuer || !normalizedOrigin || !normalizedClientId) {
    throw new Error('issuer, clientId, and publicOrigin are required');
  }
  if (!store) throw new Error('a session store is required');

  // Tokens are encrypted on the way into the store and decrypted on the way out, so no caller has
  // to remember to do it and no store implementation can forget. The session row is the only thing
  // that ever holds them; the browser never does (ADR-0576).
  const tokenCipher = createTokenCipher(tokenEncryptionKey, {
    onMissingKey: () => console.warn(
      'auth sessions: AUTH_TOKEN_ENCRYPTION_KEY is unset; OAuth tokens are stored in PLAINTEXT. '
      + 'A read of the database is then a working refresh token.',
    ),
  });
  const decryptRecord = (record) => (record ? {
    ...record,
    accessToken: tokenCipher.decrypt(record.accessToken),
    refreshToken: tokenCipher.decrypt(record.refreshToken),
  } : record);

  const issuerOrigin = new URL(normalizedIssuer).origin;
  const callbackURL = `${normalizedOrigin}/api/auth/callback`;
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
      // Optional in the discovery document; sign-out degrades rather than failing without them.
      revocation_endpoint: body.revocation_endpoint
        ? sameIssuerOrigin(body.revocation_endpoint, 'revocation_endpoint')
        : '',
      end_session_endpoint: body.end_session_endpoint
        ? sameIssuerOrigin(body.end_session_endpoint, 'end_session_endpoint')
        : '',
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

  /**
   * A confidential client authenticates on every token request (draft-26 §6.1.3.1). The secret is
   * sent in the body rather than as Basic auth because that is what this provider accepts;
   * `client_secret_post` is one of its advertised methods.
   */
  function clientCredentials() {
    return normalizedClientSecret
      ? { client_id: normalizedClientId, client_secret: normalizedClientSecret }
      : { client_id: normalizedClientId };
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
      id: user.sub,
      email: user.email,
      name: user.name || user.email,
      image: user.picture || null,
      role: user.role || 'pending',
      apps: user.apps || {},
    };
  }

  function accessExpiryFrom(tokens) {
    const seconds = Number(tokens.expires_in);
    const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds : 3600;
    return new Date(now() + lifetime * 1000);
  }

  function setSessionCookie(res, token, expiresAt) {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now()) / 1000));
    appendCookie(res, cookieValue(SESSION_COOKIE, token, maxAge));
  }

  function clearSessionCookie(res) {
    appendCookie(res, cookieValue(SESSION_COOKIE, '', 0));
  }

  /**
   * Renew the access token from the stored refresh token.
   *
   * This is also how a revocation at the identity provider reaches us: a session whose refresh is
   * refused with a 4xx is one the provider no longer stands behind, and it ends here too. Anything
   * else — a timeout, a 5xx — is the provider being unreachable, which is not a sign-out, so the
   * session is left exactly as it was.
   */
  // One refresh in flight per session, ever.
  //
  // Rotation with reuse detection makes concurrent refresh actively dangerous: two requests that
  // both notice the access token is old both present the SAME refresh token, and the second
  // presentation is indistinguishable from a stolen token being replayed. A correct provider
  // answers that by revoking the whole family — so a burst of parallel requests would sign the
  // player out, and the better the provider, the worse it gets.
  //
  // The provider gained exactly that behaviour in the same change this ships with, so this is not
  // a hypothetical: without it, every page that fires several account-gated calls at once would
  // eventually log someone out at the hour mark. Callers share one renewal and one rotated token.
  //
  // In-process is sufficient because the deployment is single-replica by hard invariant
  // (k8s/templates/deployment.yaml `replicas: 1`), the same assumption the lobby store already
  // rests on. A second replica would need this moved into the row.
  const refreshesInFlight = new Map();

  function refreshSessionOnce(record) {
    const existing = refreshesInFlight.get(record.id);
    if (existing) return existing;
    const attempt = refreshSession(record).finally(() => {
      if (refreshesInFlight.get(record.id) === attempt) refreshesInFlight.delete(record.id);
    });
    refreshesInFlight.set(record.id, attempt);
    return attempt;
  }

  async function refreshSession(record) {
    // Nothing to renew with, and the access token is spent — so we can no longer show that the
    // provider still stands behind this session. Returning the record unchanged would leave it
    // alive on cached claims until its idle deadline weeks away, never revalidating: a session
    // that outlives the grant behind it. It ends here instead.
    //
    // Reachable two ways. A provider that issued no refresh token (no `offline_access`), and a
    // row whose encrypted tokens cannot be decrypted because the key changed — in which case the
    // honest answer is the same one.
    if (!record.refreshToken) {
      await store.deleteSession(record.id);
      return null;
    }
    const result = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: record.refreshToken,
      ...clientCredentials(),
    });
    if (!result.ok) {
      if (result.status >= 400 && result.status < 500) {
        await store.deleteSession(record.id);
        return null;
      }
      throw new OIDCAuthError(`oidc_refresh_http_${result.status}`);
    }
    const accessToken = String(result.body.access_token || '');
    if (!accessToken) throw new OIDCAuthError('oidc_token_missing_access_token', 401);
    if (result.body.id_token) await verifyIDToken(result.body.id_token);
    // Claims are re-read here and only here. A role or display name changed upstream lands on the
    // next renewal rather than on the next request, which is the trade that took the identity
    // provider off the hot path of every authenticated call.
    const claims = (await userInfo(accessToken)) || record.claims;
    const next = {
      ...record,
      accessToken,
      accessExpiresAt: accessExpiryFrom(result.body),
      refreshToken: String(result.body.refresh_token || record.refreshToken),
      claims,
    };
    await store.updateSessionTokens(record.id, {
      accessToken: tokenCipher.encrypt(next.accessToken),
      accessExpiresAt: next.accessExpiresAt,
      refreshToken: tokenCipher.encrypt(next.refreshToken),
      claims: next.claims,
    });
    return next;
  }

  /**
   * Resolve the session behind a cookie header.
   *
   * The ordinary path is one local read: claims are cached on the row, so an authenticated request
   * no longer costs a round trip to the identity provider. Renewal happens only when the access
   * token is near its end, and expiry is judged against deadlines we own rather than against a
   * cookie's `Max-Age`.
   */
  async function readSession(cookieHeader, res) {
    const token = parseCookieHeader(cookieHeader).get(SESSION_COOKIE) || '';
    if (!token) return null;
    let record = decryptRecord(await store.readSessionByTokenHash(hashToken(token)));
    if (!record) {
      // The cookie names a session that no longer exists — signed out elsewhere, expired, or
      // revoked. Take it off the browser so it stops being presented.
      if (res) clearSessionCookie(res);
      return null;
    }

    const at = now();
    const deadline = Math.min(record.idleExpiresAt.getTime(), record.absoluteExpiresAt.getTime());
    if (deadline <= at) {
      await store.deleteSession(record.id);
      if (res) clearSessionCookie(res);
      return null;
    }

    if (record.accessExpiresAt && record.accessExpiresAt.getTime() - REFRESH_SKEW_MS <= at) {
      record = await refreshSessionOnce(record);
      if (!record) {
        if (res) clearSessionCookie(res);
        return null;
      }
    }

    // Slide the idle deadline, lazily. A session used constantly writes once every few minutes
    // rather than once per request, and the deadline it is measured against is weeks away.
    if (at - record.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      const idleExpiresAt = new Date(at + SESSION_IDLE_MS);
      await store.touchSession(record.id, { lastSeenAt: new Date(at), idleExpiresAt });
      record = { ...record, lastSeenAt: new Date(at), idleExpiresAt };
    }

    return {
      user: record.claims,
      sessionId: record.id,
      authenticatedAt: record.authenticatedAt,
      // Decision 3: the session may be months old and still perfectly valid; publishing game
      // content asks a different question, and asks it of our own record rather than of the
      // provider's `auth_time` claim, which it reports in the wrong unit (F11).
      adminFresh: at - record.authenticatedAt.getTime() < ADMIN_FRESHNESS_MS,
    };
  }

  async function startLogin(returnTo, res, { forceLogin = false } = {}) {
    const config = await discovery();
    await store.deleteExpiredLoginAttempts(new Date(now()));
    const state = randomToken(24);
    const verifier = randomToken(32);
    const nonce = randomToken(24);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    await store.createLoginAttempt({
      stateHash: hashToken(state),
      codeVerifier: verifier,
      nonce,
      returnTo,
      expiresAt: new Date(now() + PENDING_LOGIN_TTL_MS),
    });
    appendCookie(res, cookieValue(STATE_COOKIE, state, PENDING_LOGIN_TTL_MS / 1000, 'Lax'));
    const url = new URL(config.authorization_endpoint);
    url.searchParams.set('client_id', normalizedClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', callbackURL);
    // `offline_access` is what makes the provider return a refresh token at all. Without it the
    // session could never be renewed, which is the whole of F1.
    url.searchParams.set('scope', 'openid profile email offline_access');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Re-arming the admin window (decision 3) asks for credentials again without disturbing the
    // session that is already in hand.
    if (forceLogin) url.searchParams.set('prompt', 'login');
    return url.toString();
  }

  async function completeLogin({ code, state, cookieHeader }, res) {
    const callbackState = String(state || '');
    const browserState = parseCookieHeader(cookieHeader).get(STATE_COOKIE) || '';
    const attempt = callbackState ? await store.consumeLoginAttempt(hashToken(callbackState)) : null;
    appendCookie(res, cookieValue(STATE_COOKIE, '', 0, 'Lax'));
    if (
      !callbackState
      || browserState !== callbackState
      || !attempt
      || attempt.expiresAt.getTime() <= now()
      || !code
    ) {
      throw new OIDCAuthError('oidc_login_state_invalid', 400);
    }
    const result = await tokenRequest({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: callbackURL,
      code_verifier: attempt.codeVerifier,
      ...clientCredentials(),
    });
    if (!result.ok) throw new OIDCAuthError(`oidc_code_exchange_http_${result.status}`, 401);
    if (!result.body.id_token) throw new OIDCAuthError('oidc_token_missing_id_token', 401);
    await verifyIDToken(result.body.id_token, attempt.nonce);
    const accessToken = String(result.body.access_token || '');
    if (!accessToken) throw new OIDCAuthError('oidc_token_missing_access_token', 401);
    const claims = await userInfo(accessToken);
    if (!claims) throw new OIDCAuthError('oidc_userinfo_rejected_fresh_token', 401);

    const at = now();

    // Re-authenticating on a session already in hand re-arms it rather than replacing it. Two
    // reasons, and the second is the important one: the tab keeps the session it had, and the
    // 90-day absolute deadline is preserved. Minting a new row would restart that clock, so an
    // admin re-authenticating every eight hours would never reach an absolute expiry at all —
    // the cap would exist and never fire.
    const existingToken = parseCookieHeader(cookieHeader).get(SESSION_COOKIE) || '';
    if (existingToken) {
      const existing = decryptRecord(await store.readSessionByTokenHash(hashToken(existingToken)));
      const live = existing
        && Math.min(existing.idleExpiresAt.getTime(), existing.absoluteExpiresAt.getTime()) > at;
      if (live && existing.claims.email === claims.email) {
        await store.markAuthenticated(existing.id, new Date(at));
        await store.updateSessionTokens(existing.id, {
          accessToken: tokenCipher.encrypt(accessToken),
          accessExpiresAt: accessExpiryFrom(result.body),
          refreshToken: tokenCipher.encrypt(String(result.body.refresh_token || existing.refreshToken || '')),
          claims,
        });
        return attempt.returnTo;
      }
    }

    const token = randomToken(32);
    const absoluteExpiresAt = new Date(at + SESSION_ABSOLUTE_MS);
    await store.createSession({
      id: randomToken(16),
      tokenHash: hashToken(token),
      userEmail: claims.email,
      claims,
      accessToken: tokenCipher.encrypt(accessToken),
      accessExpiresAt: accessExpiryFrom(result.body),
      refreshToken: tokenCipher.encrypt(String(result.body.refresh_token || '')),
      authenticatedAt: new Date(at),
      createdAt: new Date(at),
      lastSeenAt: new Date(at),
      idleExpiresAt: new Date(at + SESSION_IDLE_MS),
      absoluteExpiresAt,
    });
    // The cookie outlives neither deadline: the browser stops presenting it exactly when the
    // server would stop honouring it.
    setSessionCookie(res, token, absoluteExpiresAt);
    return attempt.returnTo;
  }

  /**
   * Re-arm the admin window on the session already in hand.
   *
   * The row is found by its own id rather than by cookie, so this cannot be aimed at another
   * session, and `authenticated_at` is the only thing that moves — the player session keeps its
   * identifier, its deadlines, and its tokens.
   */
  async function recordReauthentication(sessionId) {
    await store.markAuthenticated(sessionId, new Date(now()));
  }

  /**
   * End the session here and at the identity provider.
   *
   * Deleting the row is what makes the session dead everywhere at once; revocation is what stops
   * the tokens it held from being usable on their own. A provider that cannot be reached does not
   * keep the session alive — the local delete has already happened, and revocation failing is
   * logged rather than retried into a sign-out that does not complete.
   */
  async function signOut(cookieHeader, res) {
    const token = parseCookieHeader(cookieHeader).get(SESSION_COOKIE) || '';
    clearSessionCookie(res);
    if (!token) return { revoked: false, reason: 'no_session' };
    const record = decryptRecord(await store.readSessionByTokenHash(hashToken(token)));
    if (!record) return { revoked: false, reason: 'no_session' };
    await store.deleteSession(record.id);

    let config;
    try {
      config = await discovery();
    } catch {
      return { revoked: false, reason: 'discovery_unavailable' };
    }
    if (!config.revocation_endpoint) return { revoked: false, reason: 'unsupported' };
    const revoke = async (value, hint) => {
      if (!value) return;
      try {
        await fetchImpl(config.revocation_endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: value,
            token_type_hint: hint,
            ...clientCredentials(),
          }).toString(),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // The row is already gone; a failed revocation narrows nothing further here.
      }
    };
    // Refresh first: it is the credential with the longer reach.
    await revoke(record.refreshToken, 'refresh_token');
    await revoke(record.accessToken, 'access_token');
    return { revoked: true };
  }

  return {
    callbackURL,
    completeLogin,
    readSession,
    recordReauthentication,
    signOut,
    startLogin,
  };
}

module.exports = {
  ADMIN_FRESHNESS_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
  STATE_COOKIE,
  OIDCAuthError,
  createOIDCSessionManager,
  hashToken,
  parseCookieHeader,
};
