---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)'s direct-route rule for Continue Run"
refines:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)"
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
---

# ADR-0232: Continue Run selects Run before Play

## Context

ADR-0231 made the first Play entry identify the unresolved activity and route
directly back into it. For an active Run, that turns a menu-selection click into
an immediate launch even though every ordinary Play choice first summons an
action panel. It also bypasses the existing Run panel that explains and names
the active Run before entry.

## Decision

- Play still prepends **Continue Run** when the active Run is the activity most
  recently in progress.
- **Continue Run** selects the existing Run submenu at `/play/select/run`; it
  does not enter `/run`.
- The selected Run submenu shows the active Run summary and one nested **Play**
  action. Only that Play action enters `/run`.
- The ordinary **Run** rail entry opens the same submenu. There is one Run
  preparation surface rather than a second Continue-only panel.
- Continue entries for an unresolved standalone or Campaign Battle retain
  ADR-0231's direct return behavior. This decision changes Run continuation
  only.
- Every other Enchiridion, Strategikon, relic-history, and Continue-ordering
  decision in ADR-0231 remains in force.

## Consequences

- Selecting Continue Run is reversible menu navigation and cannot accidentally
  drop the player into the active Run.
- Run entry now follows the same selector-then-action cadence as the rest of
  Play.
- Continue Run and Run converge on one summary and one launch control, so their
  copy and behavior cannot drift.
