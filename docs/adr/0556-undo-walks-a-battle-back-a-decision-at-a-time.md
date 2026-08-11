---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md) — its one-level limit only"
---

# ADR-0556: Undo walks a Battle back a decision at a time

## Context and Problem Statement

ADR-0394 gave a Run Battle a paid **Undo**: its price takes back the last player move together with
the enemy reply and every Run effect that move caused. It also wrote *"Undo has one level and no
Redo"*, and the implementation held exactly one checkpoint — the next committed move replaced it,
and performing an Undo cleared it.

The owner's reading: **there is no reason for that restriction.** The price already governs how far
a player may go. Nothing about the mechanism needs a second, harder wall behind it, and a player who
notices two moves later that the mistake was two moves back is told the correction is unavailable
for a reason the game cannot explain.

The reason it was one level was never a design position — it was the smallest thing that worked.
ADR-0394's own Consequences say *"Repeated correction consumes repeated gold"*, which is the rule of
a Battle you can walk backwards, not of a single step.

## Decision

- **Undo takes back one committed player move per press, for as far back as the Battle goes.** The
  board store keeps one checkpoint per committed player move — the same checkpoint ADR-0394 defined,
  captured at the same instant — as a stack, oldest first. Undo pops the last. Everything ADR-0394
  said one Undo restores is unchanged; there are simply more of them behind it.
- **Every press costs ADR-0394's unchanged Undo price** — ten gold on screen since ADR-0547 made the
  stored tenth the gold — and the walk back ends where the purse does. A checkpoint the
  player cannot afford to reach ends the history exactly as an empty history does: the button
  disables, and the moves behind it stay played.
- **A checkpoint older than one just restored is charged for the Undo that reached it**
  (`chargeRunBattleUndoCheckpoint`). A checkpoint photographs the purse its move was played from, so
  restoring one verbatim would refund every gold already spent getting to it, and a walk back
  through a whole Battle would cost only what its last step cost. The floor is an empty purse,
  not a debt.
- **Pricing stays in the Run.** The board store owns the history and names no price: it reaches the
  economy through `RunBattleUndoAdapter`, which gains `chargeEarlier` beside `capture`, `canRestore`
  and `restore`. `frontend/src/game/store.ts` continues to take only *types* from `run/model`.
- **A move committed with no checkpoint drops the whole history**, rather than leaving a shallower
  one. The moves below it can only be reached by rewinding through a move nothing recorded.
- **Still no Redo.** A move taken back is gone, not re-offered.
- **Everything that cleared the single checkpoint now empties the stack**, unchanged in every other
  respect: Restart, entering another Battle, multiplayer, administrator board mutation, resignation,
  board departure, and any other Battle replacement.
- **The whole history persists with the match snapshot** (`PersistedMatch.undoStack`, storage
  version 4), so a reload does not silently shorten the offer. A version-3 snapshot resumes as a
  one-deep history — exactly the Undo it was already offering. Still browser-owned, still not part
  of `RunDocument`, so **no RunSaveVersion change**.
- **A quota-refused write sheds the oldest half of the history and retries** until the board itself
  fits. The snapshot is now the largest thing this module stores and the only part of it that grows
  without bound; the previous behaviour was to abandon the write entirely and leave a stale board on
  disk. The position must land — the depth of the rewind is what may be traded for it.

## Consequences

- A player can correct a mistake they noticed late, at the Undo price per move walked back, instead of
  choosing between an unaffordable Restart of the whole Battle and living with it.
- Gold becomes the real limit on rewinding, which is the limit the feature always advertised. A rich Run can retrace a long
  way; a poor one gets one look, or none.
- The Battle's memory now grows with its length. That cost is paid in browser storage, and it
  degrades by forgetting the oldest moves rather than by losing the board.
- ADR-0394 stands in full except for its one-level clause. Its checkpoint contents, its capture
  instant, its price, its no-Redo rule, and its refusal to let a move finance its own Undo are all
  unchanged.
