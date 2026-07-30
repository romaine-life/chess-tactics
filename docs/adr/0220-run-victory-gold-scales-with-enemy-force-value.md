---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s fixed one-gold non-final victory reward"
---

# ADR-0220: Run victory gold scales with enemy force value

## Context

ADR-0193 gave every non-final Run victory one gold. That flat payout does not
reflect Battle strength: defeating a lone King and defeating a full high-value
army fund the same shop even though their combat demands and army losses can be
very different.

Run already stores currency in tenths and uses ordinary chess-piece point values
throughout its bundle and sale economy, so Battle strength can fund the next
shop without adding another valuation system.

## Decision

- Opening a non-final victory shop grants gold from the enemy force authored to
  begin that Battle.
- Each enemy King contributes exactly 1 gold. Every other enemy chess piece
  contributes 50% of its standard Run point value: Pawn 0.5, Knight 1.5,
  Bishop 1.5, Rook 2.5, and Queen 4.5.
- The calculation includes fixed enemy units and enemy rosters from setup spawn
  events. Player units, neutral units, rocks, and non-setup events contribute
  nothing.
- The complete reward is calculated once when the shop opens, stored on that
  shop, added to the Run balance, and displayed by the shop's live gold readout.
  Half-gold values remain exact because Run currency is stored in tenths.
- The final Battle still ends the War without opening a shop or granting a
  spendable post-War reward.
- An already-open format-v1 shop that predates this decision is upgraded once:
  its former fixed one-gold grant is replaced by the calculated Battle reward
  and the recorded reward prevents a second adjustment.

## Consequences

- Harder authored enemy forces fund proportionally more purchasing power.
- Level authors can reason about difficulty and the following shop through the
  same recognizable chess values already used by bundles and sales.
- Shop copy never maintains a parallel constant; it renders the exact reward
  recorded by the Run model.
