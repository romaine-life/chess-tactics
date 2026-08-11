# Authentication security audit and remediation plan

**Status:** findings recorded, plan proposed, nothing implemented yet.
**Date:** 2026-08-11.
**Scope:** the whole authentication surface of Chess Tactics — the browser, the backend
(`backend/oidcAuth.js`, `backend/server.js`), the deployment chart, and the parts of the
`auth.romaine.life` identity provider that Chess Tactics depends on.

This document exists because the presenting complaint ("I get signed out after an hour, and it
seems to happen when the server reboots") turned out to be one visible symptom of a set of
structural problems. Fixing only the symptom would leave the rest in place, and the rest is the
part that matters once there are real users.

---

## 1. The standard being applied

Two documents govern this architecture. Neither is optional reading for this work.

- **[RFC 9700](https://www.rfc-editor.org/info/rfc9700/) — Best Current Practice for OAuth 2.0
  Security** (January 2025). Supersedes the informational threat model in RFC 6819 and adds
  normative requirements to RFC 6749/6750.
- **[OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)**,
  draft-26, in the RFC Editor queue with intended status Best Current Practice. This is the
  document that defines the **Backend-For-Frontend (BFF)** pattern.

**Chess Tactics is a BFF.** That is not an interpretation — it is the exact shape the draft
describes: a browser app whose own backend performs the authorization code flow, holds the OAuth
tokens, and exposes a `/api/auth/me`-style check-session endpoint to the browser. The deployment
chart already calls it one (`k8s/templates/deployment.yaml:44`). So §6.1 of the draft is the
specification this implementation is measured against, and the gaps below are measured against it
rather than against taste.

The three normative requirements that matter most here:

| Rule | Source |
| --- | --- |
| The BFF **MUST act as a confidential client** by establishing credentials with the authorization server. | draft-26 §6.1.3.1 |
| Tokens are managed in a cookie-based session and are **not exposed to the browser**; the browser receives a session cookie. | draft-26 §6.1, §6.1.1 |
| The authorization server **MUST** rotate refresh tokens on each use or sender-constrain them, and rotation means **the previous refresh token is invalidated**. | RFC 9700 §4.14.2, draft-26 §6.3.2.3 |

---

## 2. Findings

Ranked by what they cost real users, not by how interesting they are.

### F1 — There is no token refresh. Sessions are a hard 60 minutes. *(confirmed in production)*

`backend/oidcAuth.js:300` requests `scope=openid profile email`. Better Auth's OIDC provider
returns a refresh token **only** when `offline_access` is among the requested scopes:

```js
refresh_token: requestedScopes.includes("offline_access") ? refreshToken : void 0,
```
— `better-auth/dist/plugins/oidc-provider/index.mjs:657`

So `applyTokenCookies` receives `refresh_token: undefined`, the `__Host-chess-tactics-refresh`
cookie is never written, and `readSession` has nothing to refresh with. The access cookie carries
`Max-Age = expires_in = 3600`; at 3600 seconds the browser drops it and the next request is
anonymous.

The entire `refreshSession` code path in `oidcAuth.js:247-265` has never executed in production.

**Evidence.** Every OAuth token the identity provider has ever issued to this client:

| client | scopes | tokens | first | last |
| --- | --- | --- | --- | --- |
| chess-tactics | `openid profile email` | 73 | 2026-07-29 | 2026-08-11 |

Not one carries `offline_access`. Those 73 rows are 73 separate sign-ins. Within a working
session the gaps between them are `60, 63, 65, 70, 72, 74, 76, 79, 80` minutes — the access-token
lifetime plus however long it took to notice. Never below 60.

**The server reboot is not the cause.** The backend holds no session state at all — the cookies
are the entire session, so a restart has nothing to lose. See F2 for why the reboot appeared
causal.

### F2 — The application reports a dead session as live

`frontend/src/net/authSession.ts:49`:

```ts
if (snapshot.status?.reachable) return Promise.resolve(snapshot.status);
```

`start()` settles once and never re-probes. Identity only changes afterwards if some call
reports an authoritative 401 into `reportAuthSessionFailure`, or if the Level Editor's paused
state calls `refresh()` (ADR-0519). Nothing else ever asks again.

So a tab open past the 60-minute cliff keeps rendering as signed in. Playing needs no session
(ADR-0060), so nothing contradicts the claim. A server reboot forces a reload, the reload
re-probes, and the session appears to die *at the reboot* — hence the reported correlation.

This is the finding that hid F1 for two weeks, and it is independent of F1: any future session
expiry will be equally invisible until this is fixed.

### F3 — OAuth tokens are stored in the browser

`applyTokenCookies` (`oidcAuth.js:199-210`) writes the raw access token and refresh token into
browser cookies. They are `__Host-` prefixed, `HttpOnly`, `Secure` — good hygiene, and not
readable by page JavaScript — but they are still bearer tokens sitting outside the backend.

draft-26 §6.1.1 is explicit that in a BFF the browser receives a session cookie and the tokens
stay server-side: *"tokens are only available to the BFF, there are no tokens available to
extract from the browser"* (§6.1.4.1-4). The draft permits a client-side session containing
tokens only with the caveat that the BFF **SHOULD encrypt its cookie contents** (§6.1.3.2-6);
these cookies are not encrypted.

This one finding is the root of four others. Because there is no server-side session record:

- there is nothing to revoke (F6),
- refresh-token replay cannot be detected even in principle,
- identity cannot be cached, so every request re-asks the provider (F8),
- session lifetime is whatever the cookie says, not a policy we enforce.

### F4 — Registered as a public client

`type: "public"` in the identity provider's client registration, and
`k8s/templates/deployment.yaml:44-45` records the decision: *"Chess Tactics is a public BFF
client: authorization-code + PKCE, no client secret."*

draft-26 §6.1.3.1: a BFF **MUST** act as a confidential client. PKCE is required regardless
(RFC 9700 §2.1.1) but does not substitute for client authentication — PKCE binds a code to the
request that started it; client credentials prove which application is redeeming it.

### F5 — Refresh rotation without invalidation, and unbounded lifetime extension *(identity provider)*

In `better-auth/dist/plugins/oidc-provider/index.mjs:465-487`, the refresh grant creates a **new**
`oauth_access_token` row and returns a new refresh token — but never invalidates or deletes the
old one. The previous refresh token stays valid until its own expiry. It also stamps
`refreshTokenExpiresAt = now + 7 days` on every refresh.

Two normative violations:

- RFC 9700 §4.14.2 — *"The previous refresh token is invalidated."* Without that, there is no
  conflict when a stolen token is replayed, and therefore no reuse detection. Rotation without
  invalidation provides none of rotation's security value.
- draft-26 §6.3.2.3-4 — *"upon issuing a rotated refresh token, MUST NOT extend the lifetime of
  the new refresh token beyond the lifetime of the initial refresh token."* Here every refresh
  extends it, so an active token chain never expires.

This is upstream, in a plugin its own authors have marked deprecated (`src/auth.ts:205-208`), and
it affects every relying party on `auth.romaine.life`, not just Chess Tactics.

### F6 — Sign-out is local only

`clearSession` (`oidcAuth.js:212-215`) expires the two cookies. It never calls the provider's
`end_session_endpoint` (present in the discovery document, unused) and never revokes the tokens.
After signing out, the access token remains valid at the provider for up to an hour and the
refresh token for up to seven days. Anyone holding a copy still has a working session.

### F7 — A mock-session bypass ships in the production binary

`backend/server.js:7848-7856`:

```js
if (host.includes('.tank.dev.romaine.life')) return true;
```

That branch is **not** gated on `DEV_AUTH`. Any request reaching the process with a matching Host
header, carrying `Cookie: better-auth.session=mock-dev-session`, is granted a session as
`DEV_AUTH_EMAIL` (defaulting to `player@example.com`) with no credential whatsoever.

**In production this is currently unreachable**, because the Gateway API HTTPRoute pins
`hostnames: ["chess-tactics.com"]` (`k8s/templates/httproute.yaml:14-15`) and `trust proxy` is
not enabled, so `req.get('host')` is the real Host header. The exposure is real on every deployed
`*.tank.dev.romaine.life` slot.

Three things make this worth removing rather than documenting:

1. An unauthenticated session grant in the production binary, defended only by a routing rule in
   a different layer, is one Helm change away from being live.
2. It is a **substring** match, not a suffix match.
3. The same chart file already states the lesson — `PUBLIC_ORIGIN` is pinned from
   `.Values.hostname` precisely so the redirect URI *"never reflects the client-controllable Host
   / X-Forwarded-Host headers"* (`deployment.yaml:51-53`). The principle was applied there and
   not here.

### F8 — A round trip to the identity provider on every authenticated request

`readSession` calls `userInfo()` (`oidcAuth.js:267-278`), which is an HTTP call to
`auth.romaine.life`, on **every** authenticated request. Consequences: Chess Tactics' availability
is bounded by the identity provider's; every gated call pays that latency; and the provider takes
load proportional to Chess Tactics' traffic. This is the one place where somebody *else's* reboot
genuinely does break the app.

### F9 — Pending logins live in process memory

`const pending = new Map()` (`oidcAuth.js:72`) holds the PKCE verifier, nonce, and return path
between `/api/auth/sign-in` and `/api/auth/callback`. A restart inside that window fails the
sign-in with `oidc_login_state_invalid`. It also silently assumes one replica.

### F10 — CSRF defence is incidental rather than deliberate

There is no CSRF token anywhere in the backend or in `frontend/src/net/`, and no CORS headers are
set at all. Combined with `SameSite=Lax`, cross-site writes are in fact blocked and cross-site
reads cannot be exfiltrated — **today this is adequate**, and it should be reported as adequate
rather than as a hole.

The problem is that it is an emergent property nothing states or tests. draft-26 §6.1.3.3
requires a BFF to *"implement a proper CSRF defense"* and names `SameSite=Strict` cookies as one
acceptable mechanism. Adding a CORS header, a state-changing GET, or a `SameSite` relaxation would
remove the protection silently, and no check would fail.

---

## 3. Target architecture

**A proper BFF: the browser holds a session identifier, the backend holds the tokens.**

```
browser ──__Host-chess-tactics-session (opaque id, HttpOnly/Secure)──▶ Chess Tactics backend
                                                                            │
                                                          auth_sessions row (Postgres)
                                                          ├─ access token + expiry
                                                          ├─ refresh token (rotated)
                                                          ├─ cached identity claims
                                                          └─ idle + absolute deadlines
                                                                            │
                                                       ◀── refresh / userinfo / revoke ──▶ auth.romaine.life
```

What this changes, finding by finding:

- The session is a **database row**, so a backend restart is irrelevant by construction (F1, F2's
  reboot correlation).
- Refresh happens **server-side**, silently, before the access token expires. The browser never
  participates and never sees a token (F1, F3).
- Identity claims are cached on the row, so `userinfo` is called on refresh rather than per
  request (F8).
- Sign-out **deletes the row and revokes upstream** — the session is dead immediately, everywhere
  (F6).
- Because the backend holds and rotates the refresh token, **reuse is detectable** and can revoke
  the chain (F5's mitigation on our side).
- Pending-login state moves to the same store (F9).
- The client becomes **confidential**, with the secret following the existing Key Vault path used
  by `OIDC_GRAFANA_CLIENT_SECRET` (F4).

This is also the architecture that makes the ADR-0060 boundary cleaner rather than muddier: reads
stay public, and the session only ever gates writes.

---

## 4. Staged plan

Each stage leaves the system coherent and shippable on its own. Stages are ordered so the user-
visible bleeding stops early without any of the work being throwaway.

**Stage 0 — Reproduce and gate.**
A failing test that pins the 60-minute expiry and the missing refresh cookie, plus a verification
script that drives a real sign-in and asserts the session survives past the access-token lifetime.
Nothing in later stages is called done until this passes against the running app.

**Stage 1 — The application stops lying about identity (F2).**
Re-probe `/api/auth/me` on focus, on visibility change, and on a bounded interval — extending the
owner in `authSession.ts` rather than adding a second probe, since ADR-0306 makes parallel probes
a failing repository check. After this stage an expiring session is *visible*, which is the
precondition for trusting anything that follows.

**Stage 2 — Server-side session store (F3, F8, F9).**
New `auth_sessions` table plus a migration through the normal PR path. The browser cookie becomes
an opaque identifier. Tokens, cached claims, and pending-login state move server-side. Idle and
absolute lifetimes become enforced policy rather than a cookie `Max-Age`.

**Stage 3 — Confidential client and working refresh (F1, F4).**
Register a client secret, add `offline_access` to the authorization request, and implement
server-side refresh with rotation handling. The `offline_access` line is required by the final
design, not a stopgap — it is simply the first line of it.

**Stage 4 — Real sign-out (F6).**
Delete the session row, revoke upstream, and call the end-session endpoint.

**Stage 5 — Delete the bypass and make CSRF deliberate (F7, F10).**
Remove the `.tank.dev.romaine.life` branch outright — per `docs/migration-policy.md`, retiring
means deleting, not leaving it runnable behind a flag. Give dev slots the same real authentication
every other lane uses. State the CSRF mechanism explicitly and add a check that fails if it is
removed.

**Stage 6 — Upstream refresh-token invalidation (F5).**
In the `auth` repository: invalidate the previous refresh token on rotation, cap the chain at the
initial token's lifetime, and revoke the chain on replay. Affects every relying party on
`auth.romaine.life`, so it carries its own ADR and its own rollout.

Each stage lands with an ADR recording the decision, tests, and verification against the running
application.

---

## 5. Decisions still open

These are product calls, not engineering ones.

1. **Session lifetime policy.** The stated intent is that a session persists across restarts and
   is not lost by an active user. That still needs two numbers: an idle timeout (how long
   untouched before it dies) and an absolute maximum (how long before re-authentication is
   required regardless of activity).
2. **`SameSite=Strict` versus `Lax`.** Strict is the draft's recommendation (§6.1.3.2). The cost
   is that a visitor arriving from an external link — a Discord share, a search result — appears
   signed out on that first page load. There are standard ways to have both; the question is
   whether that first-paint state is acceptable.
3. **Step-up authentication for admin actions.** Publishing official campaigns and writing live
   media are production content changes made from an ordinary session. Whether those should
   require a recent re-authentication is a policy decision.
4. **Scope of the upstream fix (Stage 6).** Whether this effort takes on correcting the identity
   provider's refresh-token handling for all of `auth.romaine.life`, or stops at the Chess Tactics
   boundary and files it separately.
