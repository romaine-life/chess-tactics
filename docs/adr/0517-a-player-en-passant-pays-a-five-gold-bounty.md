---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0220](0220-run-victory-gold-scales-with-enemy-force-value.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
---

# ADR-0517: A player en passant pays a five-gold bounty

## Context

Until now a Run's gold has only ever been *paid* at a phase boundary — the Battle's victory
reward banked on the way out (ADR-0220), a lipsanon paying on acquisition — while the board
itself paid nothing. Gold moved mid-Battle only in the other direction: Restart, Undo, and
the post-placement Deployment reroll all debit a live balance.

The owner wants one thing you do *on the board* to pay: en passant. It is the rarest capture
in chess, it cannot be stumbled into, and the window for it is one move wide. A player who
sets one up has done something specific, and the Run should notice.

Nothing about this is a change to chess. ADR-0193 keeps Run Battles as unchanged chess, and
the surrounding Run may pay for what the pieces did without changing what they may do.

## Decision

- A **player** en passant capture in a Run Battle pays **5 gold**.
- It is paid at the moment the capture commits, not banked with the Battle's reward, so the
  title bar's gold measure moves while the fight is still on. The aftermath report continues
  to state only the Battle's own reward, which is the number it actually banks on exit.
- The enemy's en passant pays nothing. The capturer is read off the committed board, so a
  Reservist or a promoted pawn earns the bounty like any other player unit.
- It is per capture, not per Battle. Two en passants in one Battle pay ten gold.
- The bounty is not a new kind of state. `applyMove` marks the capture event `enPassant`
  because the victim's square is gone from the committed board by the time anything reads
  it; the Run pays from that flag through one model transition over the existing
  `goldTenths` field. No RunSaveVersion, save shape, or database migration changes.
- Board law is untouched: no legal-move generator, adjudication path, or position key
  consults the bounty, and a Skirmish or campaign level outside the Run economy pays nothing
  while still logging the capture.

## Consequences

- Undo reverses the bounty exactly, with no special case: its checkpoint is captured before
  the move commits, so restoring it restores the pre-move balance. Taking the move back takes
  the five gold back and charges the ordinary one-gold Undo on top.
- Restart does not. A Restart costs three gold (ADR-0424) and re-opens the same deployed
  position, so a player who can reproduce an en passant setup nets two gold per cycle. This
  is a real farm, and it is left open: it is slow, it only exists on positions that offer an
  en passant at all, and pricing it out belongs to whichever of the two numbers the owner
  wants to move.
- Five gold is large against this economy — it is the whole Sealed Valuation lipsanon, and
  more than half a typical eight-gold Sectio card. That is the intent; the bounty should be
  worth going out of your way for.
