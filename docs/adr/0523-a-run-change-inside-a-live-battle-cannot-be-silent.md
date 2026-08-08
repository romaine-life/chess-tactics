---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0517](0517-a-player-en-passant-pays-a-five-gold-bounty.md)"
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0047](0047-landing-sfx-are-authored-recordings.md)"
  - "[ADR-0089](0089-sfx-runtime-profile-is-db-authoritative.md)"
---

# ADR-0523: A Run change inside a live Battle cannot be silent

## Context

ADR-0517 shipped the en passant bounty, and five gold arrived on the balance with no event in
the Battle log, nothing on the board, and no sound. The capture itself logged — "A pawn is
taken in passing." — but the payment did not, so the only evidence a bounty existed was a
number two panels away changing by an amount nobody announced.

That was not an oversight in one function. It was the shape of the seam. `RunBattleTransformSink`
returned a `GameState` and nothing else, so the Run's one reach into a live Battle had no channel
through which to say anything. The bounty was silent because silence was the only thing that
type could express — and the Reservist arrival, which puts a whole extra unit on the board mid-fight,
was silent for exactly the same reason and had been since it shipped.

A rule that says "remember to log it" is worth very little against a seam whose signature makes
forgetting the default.

## Decision

- **The transform's only return channel carries its narration.** `RunBattleTransformSink` returns
  `{ game, notices }`. Every store path that commits `game` folds `notices` into the Battle log in
  the same `set`. A Run change that reaches the board with nothing to say is not a discouraged
  state, it is an unconstructible one.
- **The model functions hand back the change and the notice welded together.** `payRunEnPassantBounty`
  returns `{ run, notice }` or `null`; `markReservistDeployed` does the same. There is no call that
  yields the paid document without the words that account for it.
- **A notice is one thing the Run did**: the log line, the cell it happened over, and a gold delta
  when the economy moved. That triple is what lets one report drive all three surfaces.
- **The board says it where it happened.** A notice carrying gold seats a marker over its cell —
  the coin and `+5` — which rises out of the unit and fades. It is board-space, so it follows pan
  and zoom, and inverse-scaled so the number stays one legible size. A notice with no gold delta
  gets its log line and no marker: the arriving Reservist is already the thing you can see.
- **The rise plays under OS reduced-motion.** Windows "animation effects off" reports
  `prefers-reduced-motion` falsely, and the rise IS the feedback, so gating it on that query would
  delete the cue for the players it is for. The explicit in-game `:root.reduce-motion` keeps the
  number and drops the travel — the same precedent the deploy drop and the move hop already set in
  `style.css`, which take `!important` to clear the global OS-reduce `* { animation: none }` reset.
- **The coin rides the existing `gold` interface cue**, one voice per committed transition however
  many notices it carried, delayed past the footstep so the order heard is land-then-pay. Which
  recording that cue plays stays the owner's, editable in the SFX Studio without a commit (ADR-0089).
- Board law, adjudication, `RunSaveVersion`, and the save shape are untouched. Notices are
  presentation and narration; the balance remains the Run document's.

## Consequences

- The Reservist arrival now announces itself for the first time. That is a behaviour change nobody
  asked for and the right one: a unit appearing mid-Battle out of an unnarrated turn is precisely
  what a log is for.
- The board markers are transient store state, appended on commit and retired by the board when the
  rise finishes. They are never persisted; an Undo clears them, because the gold went back too.
- Any future Run-side reach into a Battle — a lipsanon that pays on a condition, a card that adds a
  unit — inherits the guarantee by construction rather than by review. The cost is that such a
  feature must decide what it tells the player, which is the point.
- The `gold` cue is currently assigned the `gold-sell` set, authored for spending. A gain playing a
  spend's voice is the owner's to re-point in the Studio; no code change is needed to do it.
