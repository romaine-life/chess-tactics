const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  STATE_COOKIE,
  createOIDCSessionManager,
} = require('./oidcAuth');

const ISSUER = 'https://idp.example';
const CLIENT_ID = 'chess-tactics';
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
  };
}

function idToken(audience = CLIENT_ID, nonce = '') {
  return jwt.sign(
    {
      sub: 'user-1',
      email: 'nelson@example.com',
      name: 'Nelson',
      role: 'admin',
      nonce,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: publicJwk.kid,
      issuer: ISSUER,
      audience,
      expiresIn: '1h',
    },
  );
}

test('authorization-code + PKCE establishes host-only token cookies and reads userinfo', async () => {
  let expectedChallenge = '';
  let expectedNonce = '';
  const fetchImpl = async (url, options = {}) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery());
    if (url === `${ISSUER}/jwks`) return json({ keys: [publicJwk] });
    if (url === `${ISSUER}/oauth2/token`) {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('client_id'), CLIENT_ID);
      assert.equal(form.get('redirect_uri'), `${PUBLIC_ORIGIN}/api/auth/callback`);
      const challenge = crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url');
      assert.equal(challenge, expectedChallenge);
      return json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: idToken(CLIENT_ID, expectedNonce),
        expires_in: 3600,
      });
    }
    if (url === `${ISSUER}/oauth2/userinfo`) {
      assert.equal(options.headers.authorization, 'Bearer access-1');
      return json({
        sub: 'user-1',
        email: 'nelson@example.com',
        name: 'Nelson',
        role: 'admin',
      });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const manager = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    publicOrigin: PUBLIC_ORIGIN,
    fetchImpl,
  });
  const startResponse = responseRecorder();
  const authorize = new URL(await manager.startLogin('/editor?layer=rules', startResponse));
  assert.equal(authorize.origin + authorize.pathname, `${ISSUER}/oauth2/authorize`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  expectedChallenge = authorize.searchParams.get('code_challenge');
  expectedNonce = authorize.searchParams.get('nonce');
  assert.match(startResponse.cookies[0], new RegExp(`^${STATE_COOKIE}=`));

  const callbackResponse = responseRecorder();
  const returnTo = await manager.completeLogin({
    code: 'authorization-code',
    state: authorize.searchParams.get('state'),
    cookieHeader: cookieHeader(startResponse.cookies),
  }, callbackResponse);
  assert.equal(returnTo, '/editor?layer=rules');
  assert.equal(callbackResponse.cookies.length, 3);
  assert.match(callbackResponse.cookies[0], new RegExp(`^${STATE_COOKIE}=;`));
  assert.match(callbackResponse.cookies[1], new RegExp(`^${ACCESS_COOKIE}=`));
  assert.match(callbackResponse.cookies[1], /HttpOnly; Secure; SameSite=Lax/);
  assert.match(callbackResponse.cookies[2], new RegExp(`^${REFRESH_COOKIE}=`));

  const session = await manager.readSession(cookieHeader(callbackResponse.cookies.slice(1)), responseRecorder());
  assert.deepEqual(session, {
    user: {
      id: 'user-1',
      email: 'nelson@example.com',
      name: 'Nelson',
      image: null,
      role: 'admin',
      apps: {},
    },
  });
});

test('a refresh cookie renews an expired access token and rotates cookies', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery());
    if (url === `${ISSUER}/oauth2/token`) {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert.equal(form.get('refresh_token'), 'refresh-old');
      return json({
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_in: 1800,
      });
    }
    if (url === `${ISSUER}/oauth2/userinfo`) {
      assert.equal(options.headers.authorization, 'Bearer access-new');
      return json({
        sub: 'user-2',
        email: 'player@example.com',
        name: 'Player',
        role: 'user',
      });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const manager = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    publicOrigin: PUBLIC_ORIGIN,
    fetchImpl,
  });
  const res = responseRecorder();
  const session = await manager.readSession(`${REFRESH_COOKIE}=refresh-old`, res);
  assert.equal(session.user.email, 'player@example.com');
  assert.equal(res.cookies.length, 2);
  assert.match(res.cookies[0], /access-new/);
  assert.match(res.cookies[1], /refresh-new/);
});

test('the callback rejects an id_token minted for another client', async () => {
  let expectedNonce = '';
  const fetchImpl = async (url) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery());
    if (url === `${ISSUER}/oauth2/token`) {
      return json({ access_token: 'access', id_token: idToken('other-client', expectedNonce) });
    }
    if (url === `${ISSUER}/jwks`) return json({ keys: [publicJwk] });
    throw new Error(`unexpected URL ${url}`);
  };
  const manager = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    publicOrigin: PUBLIC_ORIGIN,
    fetchImpl,
  });
  const startResponse = responseRecorder();
  const authorize = new URL(await manager.startLogin('/', startResponse));
  expectedNonce = authorize.searchParams.get('nonce');
  await assert.rejects(
    manager.completeLogin({
      code: 'authorization-code',
      state: authorize.searchParams.get('state'),
      cookieHeader: cookieHeader(startResponse.cookies),
    }, responseRecorder()),
    /oidc_id_token_invalid/,
  );
});

test('the callback state must be bound to the browser that initiated login', async () => {
  const fetchImpl = async (url) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery());
    throw new Error(`unexpected URL ${url}`);
  };
  const manager = createOIDCSessionManager({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    publicOrigin: PUBLIC_ORIGIN,
    fetchImpl,
  });
  const startResponse = responseRecorder();
  const authorize = new URL(await manager.startLogin('/', startResponse));
  await assert.rejects(
    manager.completeLogin({
      code: 'authorization-code',
      state: authorize.searchParams.get('state'),
      cookieHeader: `${STATE_COOKIE}=different-browser-state`,
    }, responseRecorder()),
    /oidc_login_state_invalid/,
  );
});
