// GUARD: the CSRF defence is named, not emergent (ADR-0577).
//
// Before this, cross-site writes were in fact blocked — by `SameSite=Lax` plus the absence of any
// CORS header. That was adequate and entirely accidental: nothing stated it, nothing tested it,
// and adding a CORS header or relaxing a cookie would have removed the protection with no failure
// anywhere. draft-ietf-oauth-browser-based-apps-26 §6.1.3.3 requires a BFF to implement a proper
// CSRF defence, and §6.1.3.3.1 names `SameSite=Strict` cookies as one. This asserts we have the
// one we say we have.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { SESSION_COOKIE, STATE_COOKIE } = require('./oidcAuth');

const oidcSource = fs.readFileSync(path.join(__dirname, 'oidcAuth.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

test('the session cookie is host-only, HttpOnly, Secure and Strict', () => {
  assert.equal(SESSION_COOKIE, '__Host-chess-tactics-session');
  assert.match(
    oidcSource,
    /`SameSite=\$\{sameSite\}`/,
    'cookie attributes must be built in one place so this file can check them',
  );
  assert.match(
    oidcSource,
    /function cookieValue\(name, value, maxAge, sameSite = 'Strict'\)/,
    'Strict is the default; only a cookie that explicitly asks may be laxer',
  );
});

test('only the login-state cookie is allowed to be Lax', () => {
  const laxCallSites = oidcSource.match(/cookieValue\([^)]*'Lax'\)/g) || [];
  for (const site of laxCallSites) {
    assert.match(
      site,
      /STATE_COOKIE/,
      `only ${STATE_COOKIE} may be Lax — the provider's callback is a cross-site top-level `
      + `navigation and a Strict cookie there fails every sign-in. Found: ${site}`,
    );
  }
  assert.equal(laxCallSites.length, 2, 'the state cookie is set once and cleared once');
});

test('no CORS header opens the API to another origin', () => {
  // SameSite=Strict stops a cross-site request from CARRYING the session. A permissive CORS
  // header would let another origin read the answer to one that somehow did, and would also make
  // the same-origin assumption behind this whole policy false.
  assert.ok(
    !/Access-Control-Allow-Origin/i.test(serverSource),
    'the API is same-origin; adding CORS requires revisiting the CSRF defence in ADR-0577',
  );
});

test('the token cookies are gone, not merely unused', () => {
  // Retiring means deleting (docs/migration-policy.md). A dormant code path that still knows how
  // to accept a bearer token out of a cookie is the thing ADR-0576 removed.
  for (const retired of ['__Host-chess-tactics-access', '__Host-chess-tactics-refresh']) {
    assert.ok(!oidcSource.includes(retired), `${retired} must not exist anywhere in the auth module`);
    assert.ok(!serverSource.includes(retired), `${retired} must not exist anywhere in the server`);
  }
});

test('the dev-auth bypass is gated on the environment alone', () => {
  // F7: the bypass used to trigger on any Host containing `.tank.dev.romaine.life`, ungated by
  // DEV_AUTH, granting a session for a fixed cookie value with no credential. Its only defence
  // was a Gateway hostname match in another layer.
  assert.ok(
    !serverSource.includes("host.includes('.tank.dev.romaine.life')"),
    'a host-triggered session grant must never return to the production binary',
  );
  assert.match(
    serverSource,
    /function isDevAuthHost\(req\) \{\s*\n\s*if \(process\.env\.DEV_AUTH !== '1'\) return false;/,
    'the dev bypass must refuse before it ever reads a client-controlled header',
  );
});
