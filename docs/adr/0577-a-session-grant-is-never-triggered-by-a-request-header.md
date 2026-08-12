---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0038](0038-campaigns-are-tiered-game-content.md)"
  - "[ADR-0138](0138-codex-environments-use-browser-approved-dev-auth.md)"
  - "[ADR-0576](0576-authentication-is-a-server-held-session.md)"
---

# ADR-0577: A session grant is never triggered by a request header, and the CSRF defence is named

## Context and Problem Statement

Two things in the authentication surface were safe by circumstance rather than by construction.

**The dev bypass had a second trigger nobody had gated.** `isDevAuthHost` returned true for any
request whose `Host` header *contained* `.tank.dev.romaine.life`, with no reference to `DEV_AUTH`.
A request matching that, carrying `Cookie: better-auth.session=mock-dev-session`, was granted a
session as `DEV_AUTH_EMAIL` with no credential of any kind.

Production never received such a request. The Gateway API HTTPRoute pins
`hostnames: ["chess-tactics.com"]`, and Express `trust proxy` is off so `req.get('host')` is the
real header rather than a forwarded one. Both were true, and had been all along.

That is precisely the problem. An unauthenticated session grant was compiled into the production
binary, and the only thing between it and the internet was a routing rule in a different layer of
a different file — one Helm edit, one ingress migration, or one `trust proxy` convenience away from
not being true. It also matched by **substring**, so `evil-chess-tactics.dev.romaine.life.attacker.example`
would have satisfied it had it ever been routed.

The same chart already knew the principle. `PUBLIC_ORIGIN` is pinned from `.Values.hostname` at
`k8s/templates/deployment.yaml:51` with a comment saying so: the redirect URI must never reflect
"the client-controllable Host / X-Forwarded-Host headers (which would make callback selection
host-spoofable)." The lesson had been learned in one place in the file and not applied in another.

**The CSRF defence worked and was an accident.** There is no CSRF token anywhere in the backend and
no CORS header at all, so combined with `SameSite=Lax` a cross-site write could not carry the
session and a cross-site read could not be exfiltrated. That was **adequate** — this should be
reported as adequate rather than as a hole. But nothing stated it and nothing tested it, so adding
a CORS header, a state-changing GET, or a laxer cookie would have removed the protection with no
failure anywhere. draft-ietf-oauth-browser-based-apps-26 §6.1.3.3 requires a BFF to implement a
*proper* CSRF defence, which means one it knows it has.

## Decision Outcome

- **The host trigger is deleted.** Not flagged off, not left behind an environment check — deleted,
  because retiring a system means removing it end to end (`docs/migration-policy.md`). `DEV_AUTH=1`
  is now the sole gate, and the function refuses before it reads a client-controlled header at all.
  Deployed dev slots sign in through the real identity provider like every other lane, which is
  also what makes them a real rehearsal of production.
- **`SameSite=Strict` is the named CSRF mechanism** (§6.1.3.3.1), stated in code and enforced by
  `backend/authCookiePolicy.test.js`. That guard fails if the session cookie stops being `Strict`,
  if any cookie other than the ten-minute login-state cookie is `Lax`, if a CORS header appears, if
  the retired token cookies reappear anywhere, or if the host trigger comes back. The one exception
  is deliberate and asserted rather than tolerated: the login-state cookie **must** stay `Lax`,
  because the provider's callback is a cross-site top-level navigation and a `Strict` cookie there
  would fail every sign-in on its own state check.
- **Admin writes require an authentication under eight hours old** (decision 3 of the audit). The
  session is unaffected and may be 90 days old; publishing game content asks a different question.
  The clock is read from our own session row, not the provider's `auth_time` claim, which reports
  milliseconds where OIDC Core §2 requires seconds — a freshness check against that value would
  pass unconditionally, which is worse than not checking at all.
- **A step-up challenge is not a sign-out.** It is answered as RFC 9470's
  `insufficient_user_authentication`, and `isUnauthorized` explicitly excludes it. Reporting it to
  the session owner would knock the entire shell to anonymous over a session that never ended —
  the same class of lie ADR-0575 removed from the other direction.
- **The owner can act before losing work.** `/api/auth/me` carries `admin_fresh`, and the account
  menu offers "Sign in again to publish" while it is false. An admin should discover a closed
  window from the menu, not from a rejected save. Re-authenticating re-arms the session in place,
  so nothing else about it changes.

### Consequences

- Deployed `*.tank.dev.romaine.life` slots can no longer be entered by setting a cookie. They need
  the identity provider, which is what every other lane already needs.
- `requireAdmin` can now fail for a signed-in admin. Every admin surface must distinguish "you may
  not" (403) from "not recently enough" (401 + `insufficient_user_authentication`); treating the
  latter as a sign-out is a regression the classifier's tests catch.
- The dev-auth lanes carry no session row, so `adminFresh` is `undefined` there and the gate does
  not fire. A local developer is not sent through a re-authentication that has no provider behind
  it — the exemption is explicit rather than incidental.

## More Information

- [`docs/auth-security-audit.md`](../auth-security-audit.md) — F7, F10, F11 and decision 3.
- [RFC 9470](https://www.rfc-editor.org/info/rfc9470/) — OAuth 2.0 Step Up Authentication Challenge
  Protocol, the source of the `insufficient_user_authentication` error code.
