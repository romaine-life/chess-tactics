---
status: accepted
date: 2026-08-06
deciders: Nelson
partially_superseded_by:
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)'s board-anchored choice presentation"
  - "[ADR-0541](0541-a-promotion-premove-is-asked-what-it-becomes-as-it-is-queued.md)'s queue-time premove choice, which replaces the destination-only premove clause and its unresolved type boundary"
---

# ADR-0503: Pawns arrive before their promotion choice

## Context and Problem Statement

The promotion picker previously appeared while the Pawn still occupied its origin square. That
made the player authorize an implementation detail before the board had shown the chess event that
caused it. Promotion premoves went further and required the replacement while the opponent still
owned the turn, even though the predicted Pawn had not reached its destination.

## Decision Drivers

- Promotion should read as a consequence of arriving on the authored promotion cell.
- The complete Pawn movement, capture, service record, turn handoff, victory adjudication, Run
  effects, and multiplayer relay must remain one atomic chess move.
- Multiplayer clients must not mutate canonical board state before an ordered server relay.
- Click, drag, premove, solo, Run, and either lobby seat must share the same choice boundary.

## Considered Options

- Keep the Pawn at its origin until the player chooses.
- Commit an incomplete Pawn move, then mutate the committed state with the choice.
- Present the exact arrival locally, then commit or submit the complete atomic move after choice.

## Decision Outcome

Chosen: **present the exact arrival locally, then commit or submit after choice**. A player-authored
promotion move first projects the Pawn at its destination, including the move's capture and final
facing, while retaining the Pawn sprite. The replacement controls remain absent until the authored
player-move glide has settled. The arrived Pawn then asks what it became.

This arrival is presentation state, not a partial chess state. The canonical `GameState` remains at
the pre-move position until the choice supplies the existing atomic `applyMove` call. Solo and Run
then apply mechanics, Run transforms, history, adjudication, persistence, and the enemy handoff
once. A lobby client submits one complete `{ destination, promotion }` intent after choice and keeps
the local arrival projection visible until the ordered echo commits it; the other seat changes only
from that relay. Rejection removes the projection and restores the authoritative position.

Promotion premoves now queue only their destination. They render an arrived-Pawn ghost, cannot be
extended past the unresolved type boundary, and open the same post-arrival choice only when the
step reaches the front of the queue on the client's real turn. A legacy/programmatic premove that
already contains a promotion may still execute, but the player interface no longer creates one.

### Consequences

- Good: the board communicates cause before asking for consequence.
- Good: no second move animation, duplicate landing sound, speculative rules commit, or netplay
  rollback is introduced.
- Good: captures and Run's Paid Crossing choice share the same visibly arrived Pawn.
- Cost: the renderer and HUD consume a bounded client-local piece projection while promotion is
  pending, and the choice waits for the movement presentation interval.

## More Information

This partially supersedes [ADR-0077](0077-multiplayer-is-one-game-projected-through-seat-local-clients.md)'s
queue-time premove-promotion choice and refines [ADR-0072](0072-castling-and-chess-draw-rules-as-authored-events.md)'s
four-piece picker without changing its chess rules. The consolidated behavior lives in
[`docs/game-concept.md`](../game-concept.md) and [`docs/multiplayer-contract.md`](../multiplayer-contract.md).
