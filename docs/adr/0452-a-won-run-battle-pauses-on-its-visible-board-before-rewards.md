---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0377](0377-a-won-battle-is-reported-on-its-own-screen.md)'s presentation decision"
partially_supersedes:
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)'s terminal-victory Undo affordance"
refines:
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
---

# ADR-0452: A won Run Battle pauses on its visible board before rewards

## Context

A won Run Battle already had two distinct transitions: the terminal board result captured the
live Battle report, then `closeBattle` entered the persisted `aftermath` report. Both stages were
presented as a centred, darkened Victory screen. The first also offered Undo beside Continue.
Continue therefore appeared to lead from one victory screen to another, and the viewport shade
made the settled board difficult to inspect at the moment the player was most likely to want to
review it.

The aftermath phase still owns useful information and the accounting boundary: reward, turns,
elapsed time, survivors, and fallen units persist there until Continue banks the reward. The
problem is not that two stages exist; it is that the board pause and rewards report claimed the
same presentation and action vocabulary.

Outside Sectio, the Controls panel also rendered a **Run views** group containing only the active
phase. Pressing its sole selected control could not change the view.

## Decision

- A terminal player victory keeps the canonical Run battlefield mounted and unobscured. **Victory**
  fades into a bottom-justified, unframed overlay with one prominent **Rewards >** action to its
  right. There is no dark shade, result card, level recap, or other duplicate report at this stage.
- The victory overlay is non-modal. Its full-viewport placement layer ignores pointer input and
  only the Rewards action accepts it, so the player may pan, zoom, and inspect the settled board
  and use persistent Controls before advancing.
- Terminal victory does not offer Undo. ADR-0394's one-gold Undo remains available during an
  undecided Battle; draw behavior is unchanged. ADR-0428 continues to govern terminal defeat.
- Rewards invokes the existing `closeBattle(run, report)` transition. Report capture, `aftermath`
  persistence, final-War handling, and the rule that gold is banked only when leaving aftermath do
  not change.
- The aftermath workspace remains the separate rewards report introduced by ADR-0377. Its
  duplicated `Conflict N · Battle N of N` eyebrow is removed because the persistent Run title bar
  already shows those measures. The report box, rather than the combined title/report/action
  stack, is the vertical centre anchor; **Victory** sits above that anchor and Continue below it.
- Controls render the phase-navigation group only when Sectio has real sibling destinations.
  Non-Sectio phases omit the no-op **Run views** group while retaining their actual Run controls.

## Consequences

- The player sees one immediate victory acknowledgement and can study the final position before
  deliberately opening the detailed rewards report.
- The two stages have distinct jobs and verbs: **Victory / Rewards >** on the board, then the
  persisted report / **Continue** in the Run workspace.
- No RunSaveVersion, migration, reward formula, or Battle lifecycle change is required.
- Campaign, standalone skirmish, multiplayer, draw, and defeat result presentation remain
  unchanged.
