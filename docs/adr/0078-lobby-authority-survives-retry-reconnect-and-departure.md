---
status: accepted
date: 2026-07-11
deciders: owner (Nelson) + Codex
---

# ADR-0078: Lobby authority survives retry, reconnect and departure

## Context

ADR-0077 made the server-ordered relay authoritative, but a relay index alone does not
identify a client's gesture. After a lost response, an equal-count snapshot can race the
still-arriving original request; unlocking the seat at that point permits a different
gesture to win by request arrival order. The same audit found three other places where
transport timing could replace game authority: a host could call Start during a live
match, either seat could publish an unverified terminal claim, and host departure deleted
the log before a disconnected guest could backfill it. Lobby timing eligibility was also
being accepted from a client-authored boolean instead of the selected canonical level.

## Decision

Every move gesture owns a client-generated stable `intentId`. The server stores that id
with the relayed move and deduplicates it before checking the expected relay count. An
identical retry returns the original event; reuse with different content is rejected. A
client with an uncertain delivery remains locked to that same id and retries it. A
snapshot can trigger backfill, but absence at one instant never authorizes a new identity.

Start is a phase transition from a ready lobby only. It cannot reset a started or closed
match. Rematch, if added, must be a separate coordinated operation.

Move-derived terminal state requires independent matching reports from both original
seats at the same committed relay count. A report is idempotent per seat; a conflicting
report cannot publish or replace a result. Resignation remains a server-authored outcome
of an explicit live action and does not require consensus.

The server resolves multiplayer eligibility from the canonical selected level. The
client sends a level id, not an authoritative timing flag. A missing canonical level is
an error; a timed canonical level remains ineligible until shared server clocks exist.

Host departure closes a lobby into a tombstone rather than deleting it. Original seats
may still retrieve its snapshot and ordered move prefix, reconnect, and finish result
agreement. Active listings exclude tombstones. The server may delete one only after both
seats explicitly acknowledge/leave, or after a bounded expiry.

## Consequences

- Network reordering cannot turn one gesture into two moves or choose among new gestures.
- Neither participant can unilaterally forge a deterministic win or draw.
- A disconnected client can recover the same terminal prefix after the other seat leaves.
- Tests need stable-intent duplicate/conflict cases, live-start rejection, mismatched
  result reports, canonical timed-level rejection, and tombstone reconnect/cleanup.

## Related decisions

Refines ADR-0077's server-sequenced intent and lifecycle rules. It does not change
ADR-0064/ADR-0072 settlement order; it defines how two clients attest the result of that
shared deterministic settlement.
