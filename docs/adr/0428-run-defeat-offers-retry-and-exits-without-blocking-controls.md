---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)'s terminal-defeat Undo affordance"
refines:
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0300](0300-only-the-brand-mark-navigates-home.md)"
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
  - "[ADR-0424](0424-run-battle-retry-costs-three-gold.md)"
  - "[ADR-0425](0425-run-battle-restart-unlocks-after-the-first-turn.md)"
---

# ADR-0428: Run defeat offers Retry and exits without blocking Controls

## Context

A defeated Run Battle presented Undo and Retry together in a full-screen modal. Undo made a
terminal loss reversible even though Retry is the intended way to replace a failed attempt. The
full-screen shade also covered the persistent Controls panel, preventing the player from reviewing
their roster, log, view, and other Battle information before choosing what to do next.

The persistent title-bar shield technically returned to the main menu, but it did not read as a
result action. Starting another Run likewise required leaving the result without an obvious route
to the existing Start New Run preparation.

## Decision

- A terminal **Defeat** in a Run Battle does not expose Undo, either on the result card or in
  Battle Controls. Live, undecided Run Battles retain ADR-0394's one-gold Undo.
- Defeat retains the canonical three-gold **Retry** of the current Battle, including affordability
  and in-place battlefield lifecycle.
- The defeat result also exposes **New Run**, which opens the canonical Start New Run preparation
  at `/play/select/run/new`, and **Main Menu**, which opens `/`. New Run does not bypass the
  existing active-Run replacement confirmation or Ataraxia selection.
- The Run result shade and card are confined to the Run viewport. They do not cover or make the
  persistent title bar or right Controls panel inert, so inspection and view controls remain
  available after the Battle ends.
- The viewport result is non-modal because other application controls remain intentionally
  operable. If a Run workspace replaces the battlefield viewport, that workspace renders above
  the result rather than inheriting its shade.
- Campaign, standalone skirmish, and multiplayer result presentation remain unchanged.
- ADR-0300 continues to constrain the persistent title-bar lockup. It does not prohibit an
  explicit, labelled workflow exit inside a terminal result.

## Consequences

- Defeat has one recovery action for the failed attempt: Retry.
- Players may inspect the terminal board and Controls information before retrying or leaving.
- Starting another Run remains a deliberate preparation flow instead of silently abandoning and
  replacing the active Run.
- The mounted battlefield continues to survive Retry without a loading or scene replacement.
