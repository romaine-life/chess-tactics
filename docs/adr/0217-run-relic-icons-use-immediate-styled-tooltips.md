---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0217: Run lipsanon icons use immediate styled tooltips

## Context

ADR-0216 kept each acquired lipsanon's accessible description and exposed the same
text through a native browser hover title. The resulting help cursor suggested
that more information existed, but native titles appear after a
platform-dependent delay, cannot carry a legible name/effect hierarchy, and may
not appear reliably.

The owner confirmed that pointing at a lipsanon should produce a proper tooltip.

## Decision

- A Run lipsanon icon reveals one styled tooltip immediately on pointer hover or
  keyboard focus.
- The tooltip separates the lipsanon name from its complete effect description.
  The trigger's accessible label continues to contain both.
- The tooltip uses the shared fixed-position tooltip primitive so the lipsanon
  strip's horizontal scrolling cannot clip it. Escape and loss of focus dismiss
  keyboard-triggered tips.
- Lipsanon icons retain the help cursor but no longer rely on native `title`
  behavior.
- This supersedes only ADR-0216's native hover-title clause. Lipsanon placement,
  dimensions, artwork, and Run behavior are unchanged.

## Consequences

- The question-mark cursor now leads to immediate, consistently styled
  information.
- Mouse and keyboard users receive the same lipsanon name and effect without
  waiting for browser-specific title timing.
- Other surfaces can reuse the same tooltip trigger instead of implementing a
  second fixed-position popover.
