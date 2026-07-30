---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0217](0217-run-relic-icons-use-immediate-styled-tooltips.md)"
  - "[ADR-0240](0240-run-self-inspection-owns-the-left-shell-workspace.md)"
---

# ADR-0216: Run relics live in a playfield overlay beneath the title bar

## Context

ADR-0198 made acquired Run relics persistent, but its first implementation
framed them as content inside the right-side Battle Controls panel and as a
full-width box between Battles. That presentation makes persistent Run state
look subordinate to whichever control tab is open. The owner identified Slay
the Spire's relic row as the intended hierarchy: compact icons at the upper-left
of the playfield, immediately below the global status bar.

## Decision

- Acquired relics render in one frameless, single-row overlay anchored at the
  upper-left directly beneath the invariant title bar.
- The strip is independent of the right-side Battle HUD and remains visible
  while any HUD tab or administrator surface is open.
- The same placement applies to Battle and between-Battle Run screens.
  Between-Battle layouts reserve the strip's vertical band so it does not cover
  deployment, shop, or victory content; the Battle strip floats over the
  playfield like persistent game-state UI.
- Icons render at their native 64×64 size. The row scrolls horizontally rather
  than wrapping into the board, and each icon retains its accessible name,
  description, keyboard focus, and hover title.
- The strip adds no local frame, label, or second chrome family. Installed relic
  art and explicit unavailable-art behavior remain governed by ADR-0198.

## Consequences

- Relics read as persistent Run state at a glance instead of Controls content.
- Opening or scrolling the Battle HUD cannot hide the relic collection.
- Large collections remain one compact horizontal band without changing chess
  board behavior or consuming additional right-rail space.
