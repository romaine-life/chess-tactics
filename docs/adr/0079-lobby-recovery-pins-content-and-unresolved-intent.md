---
status: accepted
date: 2026-07-11
deciders: owner (Nelson) + Codex
---

# ADR-0079: Lobby recovery pins content and unresolved intent

## Context

Stable request ids and tombstones are insufficient if their inputs disappear on a page
reload. The app has intentional reload paths, and an unresolved move existed only in the
Zustand instance; a request sent before teardown could arrive after the rebuilt client had
created a new id for the same relay slot. Likewise, a lobby stored only `levelId` and seed,
so an official edit—or even an admin's unsaved in-memory draft—could make a reconnect build
a different simulation for the same move log. Closed tombstones were also hidden from the
only lobby list, making their retained data unreachable without a remembered direct URL.

## Decision

Before sending a move, the client durably journals its full identity and payload, scoped to
lobby and seat. A reload restores and retries that exact id after authoritative backfill.
Ordinary component teardown may clear interface state but not the journal; echo/backfill,
a terminal server result, or acknowledged Leave clears it. If no reload-durable browser
store is writable, move submission fails closed.

At Start, the server re-reads canonical official content, rejects missing/timed content,
deep-clones the exact level into the match, and records its fingerprint. Participant detail
and tombstone reads return that snapshot. Every client builds and reconnects from it rather
than looking up the mutable campaign store by id.

The first deterministic result report freezes new relay intents at that exact prefix until
the other original seat agrees or conflicts. This prevents a move appended between reports
from making both stopped clients permanently stale.

Any participant departure from a started lifecycle closes the match into the ADR-0078
tombstone and retains both original identities; pregame guest departure may still free its
unused seat. Closed matches awaiting a seat's acknowledgement are returned separately from
public active lobbies and the lobby UI offers Resume/View/Acknowledge as appropriate.

## Consequences

- Reload and app-update recovery cannot create a second move identity.
- A lobby move log always replays against the exact level it started with.
- A finished prefix cannot advance while terminal agreement is in flight.
- Retained tombstones are owner-reachable instruments, not hidden server memory.
- Tests must cover journal restore/retry/fail-closed, pinned-content mutation, pending-result
  move rejection, recoverable-list visibility, and two-seat acknowledgement.

## Related decisions

Refines ADR-0077's session boundary and ADR-0078's stable-intent, result-consensus and
tombstone rules. It applies ADR-0070: canonical content is pinned from the one content
system rather than replaced by a client-side fallback.
