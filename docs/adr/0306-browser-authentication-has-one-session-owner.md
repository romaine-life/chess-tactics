---
status: accepted
date: 2026-08-01
deciders: Nelson, Codex
---

# ADR-0306: Browser authentication has one session owner

## Context and Problem Statement

Authentication identity was fetched and cached independently by the persistent title bar,
the Level Editor, and other account-gated screens. PR #580 added restart retry behavior to
only the title-bar consumer, so one page could simultaneously present an authenticated
account and a signed-out private document. A follow-up editor-specific retry would have
preserved the same fragmented ownership rather than correcting it.

## Decision Drivers

- A user's identity is application state, not screen state.
- Backend unavailability must never be translated into an anonymous session.
- Every visible consumer must observe the same auth transition without per-screen retry,
  timeout, cache, or fallback policy.
- ADR-0059 defines a bespoke parallel to a canonical primitive as a defect.

## Considered Options

- Keep the shared HTTP helper while allowing screens to own their own probes and state.
- Add bounded retry behavior to each account-gated screen.
- Give the browser application one auth-session owner and make every consumer observe it.

## Decision Outcome

Chosen: **one browser auth-session owner**, because sharing a request helper is not sharing
state ownership.

- `frontend/src/net/auth.ts` is the sole transport for `GET /api/auth/me`. Only a successful,
  contract-valid response is authoritative. Non-2xx, malformed, timed-out, and network-failed
  responses mean unavailable, never signed out.
- `frontend/src/net/authSession.ts` is the sole owner of the browser auth state machine. Its
  states are `checking`, `unavailable`, `authenticated`, and `anonymous`.
- Application bootstrap starts that owner once. It coalesces concurrent imperative joins into
  the same in-flight probe, publishes unavailable once, and continues retrying until it receives
  an authoritative response.
- React screens subscribe to the same snapshot. They do not call the identity endpoint, invoke
  the transport reader, tune retry behavior, or cache `AuthUser` independently.
- Domain startup that must wait for identity, such as active-Run account hydration, awaits the
  same owner. A domain may record whether its own remote document successfully linked, but may
  not call that domain state “signed in” or treat it as identity authority.
- Any account-gated operation that consumes an authoritative 401 as session state reports
  anonymous to the shared owner. It may not create a private screen-local signed-out state.
- The Level Editor may choose an offline/recovery presentation when the shared state is
  `unavailable`; it does not own authentication retry or its duration. When the owner later
  publishes `authenticated`, the editor re-resolves the private document automatically.
- A source guard fails checks if another runtime module accesses `/api/auth/me`, uses the
  low-level identity reader, revives caller-owned retry, or creates another `AuthUser` cache.

### Consequences

- Good: the title bar, private editors, admin affordances, lobbies, Studios, and Run hydration
  cannot disagree about the browser's identity.
- Good: restart behavior and unavailable-versus-anonymous semantics are tested once at the owner.
- Good: future parallel probes fail the normal repository check.
- Cost: account-gated screens must express only presentation and domain consequences of the
  shared state; they cannot add local auth convenience state.

## More Information

- [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
- [ADR-0138](0138-codex-environments-use-browser-approved-dev-auth.md)
- [Persistence contract](../persistence.md#client-authentication-state)
