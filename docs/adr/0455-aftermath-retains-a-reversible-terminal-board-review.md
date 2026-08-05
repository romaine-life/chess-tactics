---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0030](0030-scrollbars-never-vanish.md)"
  - "[ADR-0452](0452-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
  - "[ADR-0454](0454-run-phases-retire-before-their-successors-reveal.md)"
---

# ADR-0455: Aftermath retains a reversible terminal-board review

## Context

The won board and aftermath report have distinct jobs, but the report had only Continue. Once the
player opened Rewards, there was no way to return to the board they had deliberately paused to
inspect. Reversing the persisted Run from `aftermath` to `battle` would be the wrong repair: it
would discard the already-captured report, reopen gameplay state, and let elapsed time or other
result measures change when Rewards was selected again.

The sparse aftermath Controls also inherited `overflow-y: auto` from content-heavy Run phases.
Its bottom-pinned Abandon action fits exactly, but Chromium includes 17 pixels of false flex
overflow and paints a native scrollbar for content which cannot actually move.

## Decision

- The aftermath report places **Back** beside Continue. Back opens the exact terminal player-win
  board as a review workspace while the authoritative Run document remains in `aftermath`.
- A terminal player-win match belonging to a Run Battle remains in browser match persistence
  through aftermath, even though terminal Victory offers no Undo. It is accepted for review only
  when its level and complete Run Battle activity identity match the aftermath.
- The review board is read-only with respect to Battle progression: Retry and board-mutating Run
  actions are unavailable. Its **Rewards >** action returns to the same persisted aftermath rather
  than closing the Battle again, so reward, elapsed time, turns, survivors, and casualties are not
  recomputed.
- Continue remains the accounting boundary and retires the review snapshot after advancing the
  Run. Abandoning the Run and reaching final War victory retire it as well. Other terminal matches
  keep their existing persistence behavior.
- Moving between aftermath and terminal-board review replaces the complete scene under
  ADR-0454; their different Controls states never overlap.
- Non-Sectio Run Controls with only sparse, fixed actions are static layouts, not scroll panes.
  They suppress overflow instead of painting a false scrollbar. ADR-0030 continues to govern
  surfaces which actually own scrolling.

## Consequences

- The player can move repeatedly between the rewards report and the exact won position without
  changing domain state or report values.
- Reload can retain that review when browser match storage is available; an unrelated or missing
  snapshot is never substituted for the Battle.
- The aftermath Controls panel no longer advertises nonexistent scrollable content.
- No RunSaveVersion, database migration, reward formula, or Battle rule changes are required.
