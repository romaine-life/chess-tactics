---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0060](0060-playing-never-requires-sign-in.md)"
  - "[ADR-0575](0575-a-settled-identity-is-re-read-for-as-long-as-the-app-is-open.md)"
---

# ADR-0576: Authentication is a server-held session; the browser holds only an identifier

## Context and Problem Statement

Chess Tactics is a **Backend-For-Frontend**. The deployment chart said so already
(`k8s/templates/deployment.yaml:44`): a browser application whose own backend runs the
authorization-code flow, holds the OAuth tokens, and exposes a check-session endpoint. That is the
exact architecture specified in §6.1 of *OAuth 2.0 for Browser-Based Applications*
(draft-ietf-oauth-browser-based-apps-26, in the RFC Editor queue as a Best Current Practice).

It was doing the inverse of what that section requires. The access token and the refresh token
**were** the browser's cookies. `__Host-` prefixed, `HttpOnly`, `Secure` — good hygiene, and not
readable by page JavaScript — but bearer tokens living outside the backend all the same, where
§6.1.1 requires that "tokens are only available to the BFF, there are no tokens available to
extract from the browser."

One structural choice produced a family of defects, recorded in full as F1–F11 in
[`docs/auth-security-audit.md`](../auth-security-audit.md):

- **There was nothing to revoke.** Signing out expired two cookies. The tokens stayed valid at the
  identity provider — the access token for up to an hour, the refresh token for up to seven days.
- **Identity could not be cached**, so every authenticated request made an HTTP call to
  `auth.romaine.life`. The game's availability was bounded by the identity provider's, and every
  gated call paid that latency.
- **Session lifetime was a cookie's `Max-Age`**, not a policy. It was 3600 seconds, and when the
  browser dropped the cookie the player was signed out. Every hour, forever.
- **A pending sign-in lived in a process `Map`**, so a restart inside the ten-minute window failed
  the sign-in outright, and a second replica would never have worked at all.
- And the client was registered as **public**, where §6.1.3.1 says a BFF **MUST** act as a
  confidential client.

## Decision Outcome

**The session is a row in Postgres. The browser gets one cookie, and it carries an identifier.**

```
browser ── __Host-chess-tactics-session (opaque, HttpOnly/Secure/Strict) ──▶ backend
                                                              │
                                              auth_sessions row (migration 77)
                                              ├─ access + refresh token
                                              ├─ cached identity claims
                                              ├─ authenticated_at
                                              └─ idle + absolute deadlines
                                                              │
                                        ◀── refresh · userinfo · revoke ──▶ auth.romaine.life
```

- **Only the SHA-256 of the session token is stored.** The cookie carries the token itself, so a
  database read yields nothing replayable. The same holds for the login state, whose row would
  otherwise let a reader finish somebody else's sign-in.
- **Claims are cached on the row and refreshed only on renewal.** An ordinary authenticated request
  is one local read. This is the trade that takes the identity provider off the hot path: a role or
  display name changed upstream lands on the next renewal rather than the next request.
- **Three deadlines, because they answer different questions.** `idle_expires_at` slides while the
  session is used — 30 days, and it is what a returning player is measured against.
  `absolute_expires_at` is fixed at sign-in — 90 days, and no amount of activity moves it.
  `authenticated_at` is when credentials were last actually presented, which is what the admin
  window reads. A session can be legitimately alive for months and still not be fresh enough to
  publish game content.
- **The idle deadline slides lazily**, at most once every five minutes. A read-mostly session
  otherwise costs a write per request for a deadline measured in weeks.
- **Renewal is how revocation reaches us.** A refresh refused with a 4xx is a grant the provider no
  longer stands behind, and the session ends here too. A timeout or a 5xx is the provider being
  unreachable, which is not a sign-out, so the session is left exactly as it was. That distinction
  is the difference between a provider outage logging everyone out and a provider outage being an
  outage.
- **`SameSite=Strict` on the session cookie is the CSRF defence** (§6.1.3.2 and §6.1.3.3.1), named
  rather than emergent. It costs almost nothing here because nothing user-specific is
  server-rendered: `renderShellWithOg` injects OG tags from public level content, so identity always
  arrives through the same-site fetch that follows the document.
- **The ten-minute login-state cookie stays `Lax`, deliberately.** The callback from the identity
  provider is a cross-site top-level navigation; `Strict` there would fail every sign-in on its own
  state check. It authorises nothing by itself — it names an attempt row, and is spent on arrival.
- **The client is confidential**, authenticating with a secret on every token request, and asks for
  `offline_access` — the scope without which the provider returns no refresh token at all, which
  was the whole of F1.
- **Signing out deletes the row and revokes upstream.** Deleting is what makes the session dead
  everywhere at once; revocation is what stops the tokens it held from being used on their own. An
  unreachable provider does not keep the session alive — the row is already gone.

### Testing

The smoke tests previously authenticated by handing the backend a cookie containing a token and
letting it ask a userinfo endpoint who that was. The sign-in path — state binding, PKCE, nonce, the
one-shot code exchange — was therefore never exercised outside unit tests, and a mock that always
answered could not have failed on any of this.

`backend/mockIdentityProvider.js` now runs the real flow, and both smoke tests sign in through it
for real. A session cookie in a test is a genuine session whose tokens never left the server.

The multiplayer protocol test deliberately boots with **no database**, which is what keeps lobby and
netplay testable without Postgres. Sessions are rows, so that lane needs somewhere to put them: an
in-memory store gated on `NODE_ENV=test` **and** `AUTH_SESSION_TEST_STORE=memory` together, the same
two-key shape as the existing DB-free lobby content seam. Neither alone reaches it. An in-memory
session store that could activate in production would be a worse defect than any this ADR fixes.

### Consequences

- **Every existing session is invalidated on deploy.** The token cookies are gone and nothing reads
  them; everyone signs in once more. The stale cookies self-clear within the hour on their own
  `Max-Age`, so no compatibility path exists or is wanted — retiring means deleting
  (`docs/migration-policy.md`).
- Migration 77 must run before sign-in works. The backend answers `503 schema_migration_required`
  until it does, which is the intended state of a branch whose migration has not rolled out.
- `OIDC_CLIENT_SECRET` becomes required in deployed lanes. Absent, the client falls back to sending
  only its id, which this provider accepts for a public client — so a missing secret degrades to the
  old posture rather than failing loudly. That is a deliberate deployment-ordering allowance and
  should be removed once the secret is installed everywhere.
- An authenticated request no longer costs a round trip to `auth.romaine.life` (F8). The provider is
  reached on sign-in, on renewal, and on sign-out.
- Sessions accumulate rows. Expired ones are deleted when next presented; a periodic sweep is not
  yet implemented and is named as unfinished scope in the audit.

## More Information

- [`docs/auth-security-audit.md`](../auth-security-audit.md) — the full findings and the four
  settled decisions this implements.
- [RFC 9700](https://www.rfc-editor.org/info/rfc9700/) — Best Current Practice for OAuth 2.0
  Security.
- [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)
  §6.1 — the BFF pattern this now conforms to.
