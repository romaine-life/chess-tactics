---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)'s bottom action placement"
refines:
  - "[ADR-0289](0289-run-preparation-is-control-first-and-ataraxia-uses-one-selector.md)"
  - "[ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md)"
---

# ADR-0475: Run preparation actions follow their decision content

## Context

Run preparation correctly places Current Run and Start New Run details in Play's fixed right
column, but ADR-0290 also inherited Campaign Levels' bottom action placement. In this tall scenic
column, that leaves Play and Start Run a viewport away from the facts or Ataraxia choice they
complete, weakening their relationship and requiring unnecessary pointer travel.

## Decision

- Run preparation keeps Campaign Levels' master-detail columns, selected rows, and responsive
  geometry.
- Each final action follows the content it completes instead of growing an empty spacer that pins
  it to the column bottom.
- Current Run presents facts followed by Play.
- Start New Run presents the Ataraxia selector, any replacement disclosure, and then Start Run or
  the armed replacement decision.
- Start Run remains below Ataraxia because the action commits that selection; placing it above
  would reverse the task sequence and separate the effect statement from its action.
- Campaign and level-preview action placement is unchanged.

## Consequences

- The final action stays visible near the relevant decision content at ordinary desktop heights.
- Both continuation and replacement retain the deliberate select-then-act cadence without a long
  pointer journey through decorative empty space.
- A replacement warning remains between the selected Ataraxia tier and the destructive action it
  qualifies.
