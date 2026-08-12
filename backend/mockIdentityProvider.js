// A standing-in authorization server for the smoke tests.
//
// It exists because the backend is now a proper Backend-For-Frontend: a session is established by
// completing an authorization-code flow, not by presenting a token in a cookie. The tests used to
// hand the backend `__Host-chess-tactics-access=abc` and let it ask a userinfo endpoint who that
// was, which meant the sign-in path itself — state binding, PKCE, nonce, the code exchange — was
// never exercised by anything but unit tests.
//
// So this implements the flow for real: authorize issues a code bound to its PKCE challenge and
// nonce, token redeems it exactly once and returns an RS256 id_token this server's own JWKS can
// verify, and revoke retires what it handed out. `identities` maps a chosen subject name to the
// claims that subject gets, so a test still says "act as rival" and means it.

const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');

const DEFAULT_IDENTITIES = {
  abc: { sub: 'player', email: 'player@example.com', name: 'Tactics Player', role: 'pending' },
  rival: { sub: 'rival', email: 'rival@example.com', name: 'Lobby Rival', role: 'pending' },
  observer: { sub: 'observer', email: 'observer@example.com', name: 'Lobby Observer', role: 'pending' },
  'second-admin': {
    sub: 'second-admin',
    email: 'second-admin@example.com',
    name: 'Second Tactics Admin',
    role: 'pending',
  },
};

function createMockIdentityProvider({ port, clientId = 'chess-tactics', identities = DEFAULT_IDENTITIES }) {
  const issuer = `http://127.0.0.1:${port}`;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'mock-idp-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const codes = new Map();
  const accessTokens = new Map();
  const refreshTokens = new Map();
  // Which identity the next authorize call adopts. Tests set it immediately before signing in,
  // which keeps the flow honest: the identity is chosen at the provider, as it would be by a
  // person picking an account, rather than asserted by the client.
  let nextSubject = 'abc';

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(new URLSearchParams(raw)));
  });

  const mint = (subject) => {
    const access = `access-${crypto.randomUUID()}`;
    const refresh = `refresh-${crypto.randomUUID()}`;
    accessTokens.set(access, subject);
    refreshTokens.set(refresh, subject);
    return { access, refresh };
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer);

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
        token_endpoint: `${issuer}/api/auth/oauth2/token`,
        userinfo_endpoint: `${issuer}/api/auth/oauth2/userinfo`,
        jwks_uri: `${issuer}/api/auth/jwks`,
        revocation_endpoint: `${issuer}/api/auth/oauth2/revoke`,
        end_session_endpoint: `${issuer}/api/auth/oauth2/endsession`,
      });
    }

    if (url.pathname === '/api/auth/jwks') return json(res, 200, { keys: [jwk] });

    if (url.pathname === '/api/auth/oauth2/authorize') {
      const code = `code-${crypto.randomUUID()}`;
      codes.set(code, {
        subject: nextSubject,
        challenge: url.searchParams.get('code_challenge') || '',
        nonce: url.searchParams.get('nonce') || '',
        // Recorded so a test can assert the client asked for what it needs to renew a session.
        scope: url.searchParams.get('scope') || '',
        prompt: url.searchParams.get('prompt') || '',
      });
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', code);
      redirect.searchParams.set('state', url.searchParams.get('state') || '');
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }

    if (url.pathname === '/api/auth/oauth2/token') {
      const form = await readBody(req);
      if (form.get('client_id') !== clientId) {
        return json(res, 401, { error: 'invalid_client' });
      }
      if (form.get('grant_type') === 'refresh_token') {
        const subject = refreshTokens.get(form.get('refresh_token'));
        if (!subject) return json(res, 401, { error: 'invalid_grant' });
        // Rotation with invalidation, as RFC 9700 §4.14.2 requires — the behaviour the real
        // provider gains in the same change this test suite is proving.
        refreshTokens.delete(form.get('refresh_token'));
        const tokens = mint(subject);
        return json(res, 200, {
          access_token: tokens.access,
          refresh_token: tokens.refresh,
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      const record = codes.get(form.get('code'));
      // An authorization code is redeemable exactly once.
      codes.delete(form.get('code'));
      if (!record) return json(res, 401, { error: 'invalid_grant' });
      const verifier = form.get('code_verifier') || '';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (!verifier || challenge !== record.challenge) {
        return json(res, 401, { error: 'invalid_grant', error_description: 'pkce_mismatch' });
      }
      const claims = identities[record.subject] || identities.abc;
      const tokens = mint(record.subject);
      const idToken = jwt.sign(
        { ...claims, nonce: record.nonce, auth_time: Math.floor(Date.now() / 1000) },
        privateKey,
        { algorithm: 'RS256', keyid: jwk.kid, issuer, audience: clientId, expiresIn: '1h' },
      );
      return json(res, 200, {
        access_token: tokens.access,
        refresh_token: record.scope.includes('offline_access') ? tokens.refresh : undefined,
        id_token: idToken,
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    if (url.pathname === '/api/auth/oauth2/userinfo') {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const subject = accessTokens.get(token);
      if (!subject) return json(res, 401, { error: 'invalid_token' });
      return json(res, 200, identities[subject] || identities.abc);
    }

    if (url.pathname === '/api/auth/oauth2/revoke') {
      const form = await readBody(req);
      const token = form.get('token') || '';
      accessTokens.delete(token);
      refreshTokens.delete(token);
      return json(res, 200, {});
    }

    res.writeHead(404);
    return res.end('not found');
  });

  return {
    server,
    issuer,
    /** Choose who the next authorize call signs in as. */
    actAs(subject) { nextSubject = subject; },
    /** Retire a subject's credentials the way an administrator disabling an account would. */
    revokeSubject(subject) {
      for (const [token, owner] of accessTokens) if (owner === subject) accessTokens.delete(token);
      for (const [token, owner] of refreshTokens) if (owner === subject) refreshTokens.delete(token);
    },
    listen() {
      return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    },
  };
}

module.exports = { createMockIdentityProvider, DEFAULT_IDENTITIES };
