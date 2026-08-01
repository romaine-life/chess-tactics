---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0289](0289-run-preparation-is-control-first-and-ataraxia-uses-one-selector.md)'s inline current/new Run presentation and Continue Run launch label"
refines:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)"
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)"
partially_superseded_by:
  - "[ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md)"
  - "[ADR-0293](0293-continue-is-one-agnostic-resume-entry.md)"
---

# ADR-0290: Run preparation follows Play master-detail navigation

## Context

ADR-0289 correctly removed the Run pitch, temporary War copy, baseline filler,
and side-by-side Ataraxia cards, but its first implementation still placed the
current Run summary, Continue action, Ataraxia selector, and replacement action
directly in Play's action column. That does not follow the established Campaign
Levels interaction, where the action column selects a record and a right-hand
detail column owns information and the final Play action.

The inline current-Run box consequently stretched across the full action column
with padding unrelated to its content, while continuation and replacement read
as two launch controls rather than two items whose details could be inspected.

## Decision

- The Run action column contains selectable **Continue Run** and **Start New
  Run** rows. It does not contain the current Run summary, Ataraxia selector, or
  a launch action.
- Selecting **Continue Run** mounts the standard fixed-width right detail column.
  That column owns the current Battle position, army size, gold, Ataraxia, and
  the nested **Play** action that enters the active Run.
- Selecting **Start New Run** mounts the same right detail column with the shared
  scrollable Ataraxia selector and the final **Start Run** action. Replacing an
  active Run retains the explicit abandonment confirmation.
- The action column's selected-row highlight, the detail column's geometry, its
  bottom action placement, and the responsive action-column reduction reuse the
  existing Campaign Levels master-detail language. Run does not introduce a
  parallel wide summary card or a Run-specific column offset.
- Entering the Run destination alone selects neither row. The player chooses
  which detail to reveal, as selecting a Campaign alone does not choose one of
  its Levels.
- ADR-0289's concise copy, hidden authored-War name/description, shared
  Ataraxia dropdown, visible disabled tiers, and direct nonbaseline mechanic
  statement remain in force.

## Consequences

- Continue and replacement are inspectable choices before either commits or
  launches.
- The final **Play** verb returns to the detail column described by ADR-0232,
  while **Continue Run** becomes the selection that reveals those details.
- Run now behaves like the rest of the Play selector instead of placing a
  bespoke form directly in its action column.
