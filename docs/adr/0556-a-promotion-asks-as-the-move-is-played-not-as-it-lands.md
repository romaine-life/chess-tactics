---
status: accepted
date: 2026-08-09
deciders: Nelson
supersedes:
  - "[ADR-0503](0503-pawns-arrive-before-their-promotion-choice.md)'s clause holding the replacement controls absent until the player-move glide has settled"
refines:
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)"
  - "[ADR-0541](0541-a-promotion-premove-is-asked-what-it-becomes-as-it-is-queued.md)"
---

# ADR-0556: A promotion asks as the move is played, not as it lands

## Context and Problem Statement

ADR-0503 gated the replacement choice on the authored player-move glide: the Pawn was projected
onto its destination immediately, but the picker stayed hidden for the full 360ms presentation
interval and only then opened. Read as causality that is tidy — cause, then consequence. Played, it
is a stall. The player chose that square *because* it promotes; they know a Queen is coming before
the piece leaves its square, and the interface makes them watch an animation they have already
committed to before it will accept the click they are waiting to make.

ADR-0541 had already reached the opposite conclusion one gesture over: a promotion premove is asked
as it is queued, because "a premove exists to spend the opponent's thinking time, so it does not
stop the game to ask a turn later." The two gestures asked the same question on two different
clocks.

## Decision Drivers

- The promotion is the player's own intent, not news being broken to them.
- Input should be accepted at the moment the player is ready to give it.
- The complete Pawn movement, capture, service record, turn handoff, victory adjudication, Run
  effects, and multiplayer relay must remain one atomic chess move.
- Multiplayer clients must not mutate canonical board state before an ordered server relay.
- The played and premoved gestures should share one answer to *when*.
- Copy must not assert something the screen has not shown yet.

## Considered Options

- Keep the glide gate and shorten the interval.
- Keep the gate but let a click during it queue the answer.
- Open the choice in the same frame the move is authored.

## Decision Outcome

Chosen: **open the choice in the same frame the move is authored**. `stagePromotionArrival` sets
its pending promotion straight to the answering phase; no timer stands between the gesture and the
picker. The arrival projection was already immediate, so the picker anchors to the destination
seat from the first frame and the Pawn glides in underneath it. The destination's highlight and the
terrain footstep are unchanged — the sound still seats with the piece, not with the question.

The intermediate `landing` phase is deleted rather than left unreachable: `PendingPromotion.phase`
is now `choosing | submitted`. `PROMOTION_CHOICE_REVEAL_MS` is deleted with it;
`PLAYER_MOVE_PRESENTATION_MS` remains, owning only the compositor's glide.

Because the question now opens ahead of the landing, the mid-commit subject is **`promoting`**, not
`arrived`, and its eyebrow reads **"Pawn promoting"**. A premove keeps ADR-0541's `queued` subject
and its will-become wording.

Everything else in ADR-0503 stands. The arrival remains presentation state, not a partial chess
state: canonical `GameState` sits at the pre-move position until the choice supplies the single
atomic `applyMove`, a lobby seat still submits one complete `{ destination, promotion }` intent
after choice, and rejection still removes the projection.

### Consequences

- Good: the promotion accepts the click at the moment the player is ready to give it.
- Good: played and premoved promotions now share one rule about when the question opens.
- Good: no new animation, sound, speculative rules commit, or netplay rollback; the change removes
  a timer rather than adding one.
- Cost: for roughly one glide the picker floats over a square its Pawn has not reached yet. The
  copy is worded for that, and the destination highlight identifies the subject meanwhile.
- Cost: a very fast answer commits the move while the projected Pawn is still mid-glide; the
  compositor continues from the projected seat, which is the same seat the commit produces.

## More Information

The consolidated behavior lives in [`docs/game-concept.md`](../game-concept.md),
[`docs/multiplayer-contract.md`](../multiplayer-contract.md), and
[`docs/ui-art-direction.md`](../ui-art-direction.md).
