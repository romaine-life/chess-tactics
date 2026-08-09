---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0503](0503-pawns-arrive-before-their-promotion-choice.md)'s destination-only premove clause and its unresolved type boundary"
refines:
  - "[ADR-0358](0358-a-premove-is-judged-against-permanent-board-law.md)"
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)"
---

# ADR-0541: A promotion premove is asked what it becomes as it is queued

## Context and Problem Statement

[ADR-0503](0503-pawns-arrive-before-their-promotion-choice.md) made a Pawn finish its move before
being asked what it became, and applied that rule to premoves too: a promotion premove stored only
its destination, and the choice opened when the step reached the front of the queue on the player's
own turn.

That is right for a move being played and wrong for a move being predicted. A premove exists to
spend the OPPONENT's thinking time on the player's decisions, so that when control returns the
plan simply executes. Deferring the type inverts that. The question arrives at the one moment the
premove was built to protect — control has just come back, the chain is firing as a flurry, the
clock is about to start — and it asks about a plan the player drew a turn earlier and has stopped
thinking about.

It also dead-ended the chain. A step whose piece type nobody has chosen has no moves to plan from,
so `premoveTargets` returned nothing and the queue could not continue past the promotion — the one
square where continuing is most obviously worth it.

## Decision Drivers

- A premove's whole value is that its decisions are already made when control returns.
- The question needs a visible subject. The queued step's ghost already stands on the promotion
  cell, so one exists without anything being committed.
- A queued plan should be extendable; the promotion square is not a natural place to stop.
- The move must still commit ONCE, atomically, at fire time — including the multiplayer seat's
  single complete ordered intent.
- lichess and chess.com both settle the promotion piece before the premove fires; a player
  arriving from either expects the type to be part of what they queued.

## Considered Options

- Keep arrive-then-ask for premoves, as ADR-0503 specified.
- Fire the premove as a Queen and let the player correct it afterwards.
- Ask as the step is queued, and carry the answer on the step.

## Decision Outcome

Chosen: **ask as the step is queued, and carry the answer on the step.** Queuing a premove onto an
authored promotion cell opens the promotion picker immediately, beside that step's ghost. The
choice is written onto the `PremoveStep`, and the drain later fires one complete move.

`PendingPromotion.mode` gains `premove-queue` for this question. It differs from the two committing
modes in exactly the ways a prediction differs from a move:

- it opens straight at `choosing`, with no `landing` phase — there is no arrival glide to wait out,
  because the ghost is drawn in the same frame the step is queued, and no landing sound, because
  nothing landed;
- neither the board nor the HUD applies `promotionArrivalPieces`. The ordinary premove projection
  is already drawing this Pawn twice — dimmed at its origin, ghosted on the promotion cell — and a
  third copy is not a presentation of anything;
- the picker anchors to the promotion cell and says **Premove queued** / **Choose what this Pawn
  will become**, because no Pawn has arrived and the copy must not claim one has;
- answering mutates only the queue. The canonical board, the turn, the clock and the relay are
  untouched, and in netplay nothing is submitted until the step fires.

A resolved type restores the rest of the chain: the fold applies the chosen piece, its ghost is
that piece, and further steps are planned from it under [ADR-0358](0358-a-premove-is-judged-against-permanent-board-law.md)'s
speculative rules. An unanswered question belongs to the step it was asked for, so Escape drops it
with the chain, and the post-reply landing beat is held open (with the clock) until it is answered
rather than firing a step that does not yet know what it becomes.

ADR-0503's arrive-then-ask presentation is unchanged for a move actually being played, and remains
the fallback for a premove step carrying no choice — a programmatic or legacy step, which the
player interface no longer creates. Fire-time exact legality (`legalMoves`, whole-chain drop on a
failed prediction) is untouched: the choice rides along with the prediction and is discarded with
it. Promotion cells are authored board law and never move, so a step that promotes speculatively
promotes in reality.

### Consequences

- Good: the interruption moves onto the opponent's clock, where the player was already deciding.
- Good: a premove chain can continue through a promotion, as the piece it chose.
- Good: multiplayer submits one complete `{ destination, promotion }` intent with no local arrival
  projection, so this path no longer has a rollback surface at all.
- Cost: the picker blocks further premove input until it is answered. Escape still clears the whole
  chain, which is the only way to dismiss it unanswered.
- Cost: the player spends a decision on a position that may never happen. A dropped chain discards
  the choice with the step, exactly as it discards the destination.

## Verification

- `store.test.ts` pins the queue-time open, the answer landing on the step rather than the board,
  the chosen step firing as one complete move, the held landing beat, Escape dropping the question
  with its chain, the surviving arrive-then-ask fallback for a choice-less step, and the enemy-seat
  netplay path relaying one complete intent.
- `premoves.test.ts` pins the chosen ghost and the chain continuing past it, beside the existing
  unchosen-step projection.
- `PawnPromotionPicker.test.tsx` pins both subjects' copy.
- Live capture from `/play` with a Pawn one step from an authored promotion cell on the opponent's
  turn: the picker opens on the queued ghost, and the chosen piece is what fires.

## More Information

The consolidated behavior lives in [`docs/game-concept.md`](../game-concept.md) and
[`docs/multiplayer-contract.md`](../multiplayer-contract.md).
