const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const {
  ADMIN_FRESHNESS_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
  STATE_COOKIE,
  createOIDCSessionManager,
} = require('./oidcAuth');

const ISSUER = 'https://idp.example';
const CLIENT_ID = 'chess-tactics';
const CLIENT_SECRET = 'client-secret';
const PUBLIC_ORIGIN = 'https://chess-tactics.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
publicJwk.kid = 'test-key';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function responseRecorder() {
  return {
    cookies: [],
    append(name, value) {
      if (name.toLowerCase() === 'set-cookie') this.cookies.push(value);
    },
  };
}

function cookieHeader(setCookies) {
  return setCookies.map((value) => value.split(';', 1)[0]).join('; ');
}

function discovery() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth2/authorize`,
    token_endpoint: `${ISSUER}/oauth2/token`,
    userinfo_endpoint: `${ISSUER}/oauth2/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
    revocation_endpoint: `${ISSUER}/oauth2/revoke`,
    end_session_endpoint: `${ISSUER}/oauth2/endsession`,
  };
}

function idToken(audience = CLIENT_ID, nonce = '') {
  return jwt.sign(
    { sub: 'user-1', email: 'nelson@example.com', name: 'Nelson', role: 'admin', nonce },
    privateKey,
    { algorithm: 'RS256', keyid: publicJwk.kid, issuer: ISSUER, audience, expiresIn: '1h' },
  );
}

/** The Postgres store's behaviour, in memory. Every statement in server.js has a twin here. */
function memoryStore() {
  const sessions = new Map();
  const attempts = new Map();
  return {
    sessions,
    attempts,
    async createLoginAttempt(attempt) { attempts.set(attempt.stateHash, attempt); },
    async consumeLoginAttempt(stateHash) {
      const attempt = attempts.get(stateHash) || null;
      attempts.delete(stateHash);
      return attempt;
    },
    async deleteExpiredLoginAttempts(before) {
      for (const [key, value] of attempts) if (value.expiresAt <= before) attempts.delete(key);
    },
    async createSession(record) { sessions.set(record.tokenHash, { ...record }); },
    async readSessionByTokenHash(tokenHash) {
      const record = sessions.get(tokenHash);
      return record ? { ...record } : null;
    },
    async touchSession(id, patch) {
      for (const record of sessions.values()) if (record.id === id) Object.assign(record, patch);
    },
    async updateSessionTokens(id, patch) {
      for (const record of sessions.values()) if (record.id === id) Object.assign(record, patch);
    },
    async markAuthenticated(id, authenticatedAt) {
      for (const record of sessions.values()) if (record.id === id) record.authenticatedAt = authenticatedAt;
    },
    async deleteSession(id) {
      for (const [key, record] of sessions) if (record.id === id) sessions.delete(key);
    },
  };
}

/**
 * The real authorization server, not a cooperative one.
 *
 * It returns a refresh token only when the authorization request asked for `offline_access`,
 * mirroring the provider's own `refresh_token: requestedScopes.includes("offline_access") ? ...`.
 * A mock that always returns one cannot fail on the defect this whole change exists to fix.
 */
function faithfulProvider() {
  const state = {
    grantedScopes: [],
    nonce: '',
    liveAccessTokens: new Set(['access-1']),
    liveRefreshTokens: new Set(['refresh-1']),
    revoked: [],
    tokenRequests: [],
    issued: 1,
  };
  const fetchImpl = async (url, options = {}) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery());
    if (url === `${ISSUER}/jwks`) return json({ keys: [publicJwk] });
    if (url === `${ISSUER}/oauth2/revoke`) {
      const form = new URLSearchParams(options.body);
      state.revoked.push(form.get('token'));
      state.liveAccessTokens.delete(form.get('token'));
      state.liveRefreshTokens.delete(form.get('token'));
      return json({});
    }
    if (url === `${ISSUER}/oauth2/token`) {
      const form = new URLSearchParams(options.body);
      state.tokenRequests.push(Object.fromEntries(form));
      if (form.get('grant_type') === 'refresh_token') {
        if (!state.liveRefreshTokens.has(form.get('refresh_token'))) {
          return json({ error: 'invalid_grant' }, 401);
        }
        state.liveRefreshTokens.delete(form.get('refresh_token'));
        state.issued += 1;
        const access = `access-${state.issued}`;
        const refresh = `refresh-${state.issued}`;
        state.liveAccessTokens.add(access);
        state.liveRefreshTokens.add(refresh);
        return json({ access_token: access, refresh_token: refresh, expires_in: 3600 });
      }
      const offline = state.grantedScopes.includes('offline_access');
      return json({
        access_token: 'access-1',
        refresh_token: offline ? 'refresh-1' : undefined,
        id_token: idToken(CLIENT_ID, state.nonce),
        expires_in: 3600,
      });
    }
    if (url === `${ISSUER}/oauth2/userinfo`) {
      const bearer = String(options.headers.authorization || '').replace('Bearer ', '');
      if (!state.liveAccessTokens.has(bearer)) return json({ error: 'invalid_token' }, 401);
      return json({ sub: 'user-1', email: 'nelson@example.com', name: 'Nelson', role: 'admin' });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { state, fetchImpl };
}

const TOKEN_KEY = crypto.randomBytes(32).toString('base64');

function harness({ clock = { at: Date.UTC(2026, 7, 11, 12, 0, 0) }, tokenEncryptionKey = TOKEN_KEY } = {}) {
  const provider = faithfulProvider();
  const store = memoryStore();
  const manager = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store,
    tokenEncryptionKey,
    fetchImpl: provider.fetchImpl,
    now: () => clock.at,
  });
  return { provider, store, manager, clock };
}

async function signIn(h, returnTo = '/') {
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin(returnTo, startResponse));
  h.provider.state.grantedScopes = (authorize.searchParams.get('scope') || '').split(' ').filter(Boolean);
  h.provider.state.nonce = authorize.searchParams.get('nonce');
  const callbackResponse = responseRecorder();
  const landed = await h.manager.completeLogin({
    code: 'authorization-code',
    state: authorize.searchParams.get('state'),
    cookieHeader: cookieHeader(startResponse.cookies),
  }, callbackResponse);
  return { authorize, landed, cookies: callbackResponse.cookies };
}

/** The session cookie alone — what the browser sends back on an ordinary request. */
function sessionCookie(cookies) {
  const set = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return set ? set.split(';', 1)[0] : '';
}

test('the authorization request asks for offline_access', async () => {
  const h = harness();
  const authorize = new URL(await h.manager.startLogin('/', responseRecorder()));
  const scopes = (authorize.searchParams.get('scope') || '').split(' ');
  assert.ok(
    scopes.includes('offline_access'),
    'without offline_access the provider never returns a refresh token, so the session cannot be renewed',
  );
});

test('the browser is handed a session identifier, never a token', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const setSession = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(setSession, 'sign-in must establish a session cookie');
  assert.match(setSession, /HttpOnly; Secure; SameSite=Strict/);

  // A BFF keeps its tokens (draft-26 §6.1.1). Nothing the provider issued may appear in any
  // cookie: not the access token, not the refresh token, not in any encoding of them.
  const everyCookie = cookies.join(' ');
  assert.ok(!everyCookie.includes('access-1'), 'the access token must not reach the browser');
  assert.ok(!everyCookie.includes('refresh-1'), 'the refresh token must not reach the browser');

  // And the value in the cookie is not what the database holds, so a leaked row is not a session.
  const [, value] = setSession.split(';', 1)[0].split('=');
  assert.ok(!h.store.sessions.has(decodeURIComponent(value)), 'the store must key on the hash, not the token');
});

test('the session outlives the access token', async () => {
  const h = harness();
  const { cookies } = await signIn(h);

  h.clock.at += 61 * 60 * 1000; // an hour and change

  const res = responseRecorder();
  const session = await h.manager.readSession(sessionCookie(cookies), res);
  assert.ok(session, 'an hour of elapsed time must not sign the player out');
  assert.equal(session.user.email, 'nelson@example.com');
  const refreshes = h.provider.state.tokenRequests.filter((r) => r.grant_type === 'refresh_token');
  assert.equal(refreshes.length, 1, 'the expired access token is renewed once, server-side');
});

test('an ordinary request does not call the identity provider', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const before = h.provider.state.tokenRequests.length;

  h.clock.at += 60 * 1000;
  await h.manager.readSession(sessionCookie(cookies), responseRecorder());
  await h.manager.readSession(sessionCookie(cookies), responseRecorder());
  await h.manager.readSession(sessionCookie(cookies), responseRecorder());

  assert.equal(
    h.provider.state.tokenRequests.length,
    before,
    'claims are cached on the session row; the provider is not on the hot path (F8)',
  );
});

test('the session survives a month of use and dies after ninety days', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const cookie = sessionCookie(cookies);

  // Used every few weeks, the idle deadline keeps sliding.
  for (let week = 0; week < 12; week += 1) {
    h.clock.at += 7 * 24 * 60 * 60 * 1000;
    assert.ok(await h.manager.readSession(cookie, responseRecorder()), `still signed in at week ${week + 1}`);
  }

  // The absolute deadline is fixed at sign-in and activity does not move it.
  h.clock.at += SESSION_ABSOLUTE_MS;
  const res = responseRecorder();
  assert.equal(await h.manager.readSession(cookie, res), null, 'the absolute deadline is not extensible');
  assert.ok(res.cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=;`)), 'the dead cookie is cleared');
});

test('an abandoned session expires on the idle deadline', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  h.clock.at += SESSION_IDLE_MS + 1;
  assert.equal(await h.manager.readSession(sessionCookie(cookies), responseRecorder()), null);
});

test('a revocation at the identity provider ends the session here', async () => {
  const h = harness();
  const { cookies } = await signIn(h);

  // The provider stops standing behind this grant — an administrator revoked it, or the account
  // was disabled. The refresh is the only place we would ever hear about it.
  h.provider.state.liveAccessTokens.clear();
  h.provider.state.liveRefreshTokens.clear();
  h.clock.at += 61 * 60 * 1000;

  const res = responseRecorder();
  assert.equal(await h.manager.readSession(sessionCookie(cookies), res), null);
  assert.equal(h.store.sessions.size, 0, 'the row is deleted, not left to expire on its own clock');
});

test('an unreachable identity provider is not a sign-out', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  h.clock.at += 61 * 60 * 1000;

  const failing = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store: h.store,
    tokenEncryptionKey: TOKEN_KEY,
    now: () => h.clock.at,
    fetchImpl: async (url, options) => {
      if (url === `${ISSUER}/oauth2/token`) return json({ error: 'server_error' }, 503);
      return h.provider.fetchImpl(url, options);
    },
  });

  await assert.rejects(
    failing.readSession(sessionCookie(cookies), responseRecorder()),
    /oidc_refresh_http_503/,
  );
  assert.equal(h.store.sessions.size, 1, 'a provider outage must never delete a live session');
});

test('signing out deletes the session and revokes what it held', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const cookie = sessionCookie(cookies);

  const res = responseRecorder();
  await h.manager.signOut(cookie, res);

  assert.equal(h.store.sessions.size, 0);
  assert.ok(res.cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=;`)));
  assert.deepEqual(h.provider.state.revoked, ['refresh-1', 'access-1'], 'the longer-reaching credential first');
  assert.equal(await h.manager.readSession(cookie, responseRecorder()), null, 'the cookie is now worthless');
});

test('admin capability expires eight hours after authenticating, and the session does not', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const cookie = sessionCookie(cookies);

  assert.equal((await h.manager.readSession(cookie, responseRecorder())).adminFresh, true);

  h.clock.at += ADMIN_FRESHNESS_MS + 1;
  const stale = await h.manager.readSession(cookie, responseRecorder());
  assert.ok(stale, 'the player session is untouched by the admin window closing');
  assert.equal(stale.adminFresh, false);

  // Re-arming presents credentials again and moves only that timestamp.
  await h.manager.recordReauthentication(stale.sessionId);
  const rearmed = await h.manager.readSession(cookie, responseRecorder());
  assert.equal(rearmed.adminFresh, true);
  assert.equal(rearmed.sessionId, stale.sessionId, 'the same session, not a new one');
});

test('re-arming asks the provider for credentials rather than accepting its cookie', async () => {
  const h = harness();
  const authorize = new URL(await h.manager.startLogin('/', responseRecorder(), { forceLogin: true }));
  assert.equal(authorize.searchParams.get('prompt'), 'login');
});

test('a login attempt survives a restart', async () => {
  const h = harness();
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin('/editor?layer=rules', startResponse));
  h.provider.state.grantedScopes = (authorize.searchParams.get('scope') || '').split(' ');
  h.provider.state.nonce = authorize.searchParams.get('nonce');

  // The process that started this sign-in is gone. The attempt lived in a Map before, so the
  // callback below used to fail outright (F9).
  const restarted = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store: h.store,
    tokenEncryptionKey: TOKEN_KEY,
    fetchImpl: h.provider.fetchImpl,
    now: () => h.clock.at,
  });
  const landed = await restarted.completeLogin({
    code: 'authorization-code',
    state: authorize.searchParams.get('state'),
    cookieHeader: cookieHeader(startResponse.cookies),
  }, responseRecorder());
  assert.equal(landed, '/editor?layer=rules');
});

test('a login state may be spent only once', async () => {
  const h = harness();
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin('/', startResponse));
  h.provider.state.grantedScopes = (authorize.searchParams.get('scope') || '').split(' ');
  h.provider.state.nonce = authorize.searchParams.get('nonce');
  const replay = {
    code: 'authorization-code',
    state: authorize.searchParams.get('state'),
    cookieHeader: cookieHeader(startResponse.cookies),
  };
  await h.manager.completeLogin(replay, responseRecorder());
  await assert.rejects(h.manager.completeLogin(replay, responseRecorder()), /oidc_login_state_invalid/);
});

test('the client authenticates itself on every token request', async () => {
  const h = harness();
  await signIn(h);
  h.clock.at += 61 * 60 * 1000;
  await h.manager.readSession(sessionCookie((await signIn(h)).cookies), responseRecorder());
  assert.ok(h.provider.state.tokenRequests.length > 0);
  for (const request of h.provider.state.tokenRequests) {
    assert.equal(request.client_id, CLIENT_ID);
    assert.equal(request.client_secret, CLIENT_SECRET, 'a BFF is a confidential client (§6.1.3.1)');
  }
});

test('the callback rejects an id_token minted for another client', async () => {
  const h = harness();
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin('/', startResponse));
  h.provider.state.nonce = authorize.searchParams.get('nonce');
  const wrongAudience = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store: h.store,
    tokenEncryptionKey: TOKEN_KEY,
    now: () => h.clock.at,
    fetchImpl: async (url, options) => {
      if (url === `${ISSUER}/oauth2/token`) {
        return json({ access_token: 'access-1', id_token: idToken('other-client', h.provider.state.nonce) });
      }
      return h.provider.fetchImpl(url, options);
    },
  });
  await assert.rejects(
    wrongAudience.completeLogin({
      code: 'authorization-code',
      state: authorize.searchParams.get('state'),
      cookieHeader: cookieHeader(startResponse.cookies),
    }, responseRecorder()),
    /oidc_id_token_invalid/,
  );
});

test('the callback state must be bound to the browser that initiated login', async () => {
  const h = harness();
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin('/', startResponse));
  await assert.rejects(
    h.manager.completeLogin({
      code: 'authorization-code',
      state: authorize.searchParams.get('state'),
      cookieHeader: `${STATE_COOKIE}=different-browser-state`,
    }, responseRecorder()),
    /oidc_login_state_invalid/,
  );
});

test('re-authenticating re-arms the session in hand instead of minting a new one', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const cookie = sessionCookie(cookies);
  const before = await h.manager.readSession(cookie, responseRecorder());

  h.clock.at += ADMIN_FRESHNESS_MS + 1;
  const stale = await h.manager.readSession(cookie, responseRecorder());
  assert.equal(stale.adminFresh, false);

  // The owner is sent through prompt=login and comes back. Their session must survive it — and
  // so must its absolute deadline, or an admin re-authenticating every eight hours would reset
  // the 90-day clock forever and the cap would never fire.
  const startResponse = responseRecorder();
  const authorize = new URL(await h.manager.startLogin('/editor', startResponse, { forceLogin: true }));
  h.provider.state.grantedScopes = (authorize.searchParams.get('scope') || '').split(' ');
  h.provider.state.nonce = authorize.searchParams.get('nonce');
  const callbackResponse = responseRecorder();
  await h.manager.completeLogin({
    code: 'authorization-code',
    state: authorize.searchParams.get('state'),
    cookieHeader: `${cookie}; ${cookieHeader(startResponse.cookies)}`,
  }, callbackResponse);

  assert.ok(
    !callbackResponse.cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=`)),
    're-arming must not replace the session cookie',
  );
  const after = await h.manager.readSession(cookie, responseRecorder());
  assert.equal(after.adminFresh, true);
  assert.equal(after.sessionId, before.sessionId, 'the same session row');
  assert.equal(h.store.sessions.size, 1, 'no second session was created');
});

test('the login state cookie stays Lax so the cross-site callback carries it', async () => {
  const h = harness();
  const startResponse = responseRecorder();
  await h.manager.startLogin('/', startResponse);
  const stateCookie = startResponse.cookies.find((value) => value.startsWith(`${STATE_COOKIE}=`));
  // Strict here would withhold the cookie on the provider's top-level redirect back, and every
  // sign-in would fail its own state check.
  assert.match(stateCookie, /SameSite=Lax/);
});

test('concurrent requests share one refresh instead of racing the rotation', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const cookie = sessionCookie(cookies);

  // An hour passes and the page fires several account-gated calls at once — a Run screen loading
  // its army, its cards and its progression together, say.
  h.clock.at += 61 * 60 * 1000;
  const sessions = await Promise.all([
    h.manager.readSession(cookie, responseRecorder()),
    h.manager.readSession(cookie, responseRecorder()),
    h.manager.readSession(cookie, responseRecorder()),
    h.manager.readSession(cookie, responseRecorder()),
  ]);

  for (const session of sessions) {
    assert.ok(session, 'a burst of parallel requests must not sign the player out');
    assert.equal(session.user.email, 'nelson@example.com');
  }

  // Exactly one. Under a provider that rotates with reuse detection — which this one now does —
  // a second presentation of the same refresh token is indistinguishable from a replayed stolen
  // token, and the correct answer to that is to revoke the whole family. So racing here would not
  // merely be wasteful; it would log the player out, and the better the provider the worse it gets.
  const refreshes = h.provider.state.tokenRequests.filter((r) => r.grant_type === 'refresh_token');
  assert.equal(refreshes.length, 1, `expected one refresh, saw ${refreshes.length}`);
  assert.equal(h.provider.state.liveRefreshTokens.size, 1, 'exactly one refresh token survives');
});

test('the stored session row never holds a usable token', async () => {
  const h = harness();
  await signIn(h);
  const [record] = [...h.store.sessions.values()];

  // The session cookie's token is hashed, so a row cannot be replayed as a session. These two
  // cannot be hashed — the backend has to present them to renew — so they are encrypted instead.
  // Without this, reading the database IS a working refresh token, and every developer's
  // localhost is connected to the production database.
  assert.ok(record.refreshToken, 'the row still holds a refresh token');
  assert.ok(!record.refreshToken.includes('refresh-1'), 'the refresh token must not be readable in the row');
  assert.ok(!record.accessToken.includes('access-1'), 'the access token must not be readable in the row');

  // And it still works: the session renews from what was stored.
  h.clock.at += 61 * 60 * 1000;
  const session = await h.manager.readSession(sessionCookie((await signIn(h)).cookies), responseRecorder());
  assert.ok(session);
});

test('rotation re-encrypts, so a captured row goes stale', async () => {
  const h = harness();
  const { cookies } = await signIn(h);
  const before = [...h.store.sessions.values()][0].refreshToken;

  h.clock.at += 61 * 60 * 1000;
  await h.manager.readSession(sessionCookie(cookies), responseRecorder());

  const after = [...h.store.sessions.values()][0].refreshToken;
  assert.notEqual(after, before, 'the rotated token is stored freshly encrypted');
  assert.ok(!after.includes('refresh-2'), 'and still unreadable');
});

test('turning encryption on does not sign anybody out', async () => {
  // A session established before the key existed holds plaintext. The next read must work, and
  // the next rotation must upgrade it — otherwise switching this on is a mass sign-out.
  const plain = harness({ tokenEncryptionKey: '' });
  const { cookies } = await signIn(plain);
  const stored = [...plain.store.sessions.values()][0];
  assert.equal(stored.refreshToken, 'refresh-1', 'written plainly, before the key existed');

  const encrypted = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store: plain.store,
    tokenEncryptionKey: TOKEN_KEY,
    fetchImpl: plain.provider.fetchImpl,
    now: () => plain.clock.at,
  });

  const session = await encrypted.readSession(sessionCookie(cookies), responseRecorder());
  assert.ok(session, 'a pre-existing session survives the key being introduced');

  plain.clock.at += 61 * 60 * 1000;
  assert.ok(await encrypted.readSession(sessionCookie(cookies), responseRecorder()));
  const upgraded = [...plain.store.sessions.values()][0].refreshToken;
  assert.ok(!upgraded.includes('refresh-'), 'and its tokens are encrypted from the next rotation on');
});

test('a session whose tokens cannot be decrypted ends rather than lingering', async () => {
  const h = harness();
  const { cookies } = await signIn(h);

  // The encryption key was rotated or lost. The row's tokens are unreadable, so this session can
  // never be shown to the provider again — it must end, not survive for weeks on cached claims.
  const rekeyed = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    store: h.store,
    tokenEncryptionKey: crypto.randomBytes(32).toString('base64'),
    fetchImpl: h.provider.fetchImpl,
    now: () => h.clock.at,
  });

  h.clock.at += 61 * 60 * 1000;
  const res = responseRecorder();
  assert.equal(await rekeyed.readSession(sessionCookie(cookies), res), null);
  assert.equal(h.store.sessions.size, 0, 'the unusable session is deleted, not left to idle out');
});
