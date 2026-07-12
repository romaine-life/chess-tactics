---
status: accepted
date: 2026-07-11
deciders: owner (Nelson) + Codex
---

# ADR-0080: Lobby ambiguity fails closed and stays resolvable

## Context

ADR-0079 journals an unresolved intent, but two tabs can both observe an empty Web Storage
key, write different ids, and POST before either sees the other write. A session-only store
also disappears when a tab closes even though its network request can still complete.
Separately, two different terminal reports are not a state from which clients can simply
resume: both simulations have already stopped, so clearing reports creates a retry loop or
strands the closed tombstone.

## Decision

One browser tab holds an exclusive Web Lock for a `(lobby, seat)` while it owns interactive
move/resign controls. Secondary tabs remain synchronized but read-only. Move identity is
journaled in cross-tab `localStorage`; there is no session-only fallback. If either the
exclusive lease or durable journal is unavailable, new move submission fails closed.

Cross-seat terminal disagreement is an explicit `result_disputed` state, not resumed play.
The exact relay prefix remains frozen, both immutable reports are retained, and idempotent
retries do not rebroadcast. Both player interfaces explain the divergence and provide an
explicit confirmed concession/abandon path. Leave without a completion is the existing
server-authored resignation, which resolves and closes the record; no hidden dead-end waits
only for TTL.

## Consequences

- Same-origin tabs cannot create competing first identities for one seat.
- Tab close/replacement still sees the in-flight id that may reach the server.
- Terminal divergence is visible, frozen and owner-resolvable rather than a broadcast loop.
- Browsers without the required authority primitives may watch but cannot silently weaken
  move sequencing.

## Related decisions

Refines ADR-0078 result consensus and ADR-0079 durable retry. The visible concession path
applies ADR-0071's owner-operable-instrument requirement to recovery failures.
