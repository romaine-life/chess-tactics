---
status: accepted
date: 2026-07-27
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0077](0077-multiplayer-is-one-game-projected-through-seat-local-clients.md)"
---

# ADR-0188: Committed movers release client selection

## Context

The runtime kept a commanded unit selected after its move committed. Solo play carried
that selection through the enemy reply, and multiplayer retained it when the
authoritative relay arrived. The legal-move overlay therefore returned automatically
with the next local turn even though the player had not asked to inspect that unit
again.

ADR-0077 correctly made selection and focus client-local, but its relay rule retained
every still-living owned selection. That includes the mover and conflicts with the
clean post-move board state now required by the owner.

## Decision

### A committed mover releases selection and focus

When a move commits, the client clears `selectedId` when it references the moved unit.
It also clears `focusedId` when it references that mover. Legal-move highlights for the
unit do not return on the next local turn until the player explicitly selects it again.

The rule applies to:

- manual and promotion moves committed immediately in solo play;
- auto-fired premoves; and
- local moves committed by an authoritative multiplayer echo or backfill.

A multiplayer intent is not yet a move. The mover remains selected while that intent
is pending so a hard rejection can restore input without manufacturing context. The
authoritative commit is the boundary that clears it.

### Explicitly chosen, unrelated context survives asynchronous work

The commit does not blanket-clear client-local interaction state. If the player
explicitly selected or focused a different unit while an AI reply, landing beat, or
network intent was pending, that different context survives when it is still valid.
An opponent move likewise preserves an unrelated living local selection.

If the selected unit is captured, selection becomes empty. Neither an AI reply nor a
network relay may select the first remaining owned unit as a fallback.

This partially supersedes only ADR-0077's requirement that a relay retain the mover's
still-valid selection. Its seat-local projection, server authority, premove,
settlement, lifecycle, and no-arbitrary-selection decisions remain in force.

## Consequences

- The board rests without a selected-unit or legal-move overlay after a move.
- Seeing a moved unit's next legal moves requires a new explicit selection gesture.
- Pending network intents remain recoverable because selection clears only after the
  server-authoritative commit.
- A different unit deliberately chosen during asynchronous play remains stable.
- Solo, premove, and both multiplayer seats share the same post-commit interaction
  rule.

## Verification

Store coverage proves that solo moves, auto-fired premoves, and authoritative local
relays clear the mover and its focus; rejected network intents retain selection;
opponent relays preserve a different explicit local selection; and a captured
selection clears without a fallback.
