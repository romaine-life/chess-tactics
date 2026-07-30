---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0218: New UI surface paint is build-blocked

## Context

ADR-0032 forbids visible boxes fabricated from arbitrary HTML and CSS, and
ADR-0059 requires registered shared chrome primitives. Those rules were
documented but not general build gates. A Run relic tooltip therefore reused
shared interaction behavior while still inheriting an unregistered CSS-painted
background, border, radius, and shadow.

Repository instructions did not prevent the invalid surface from compiling.
Existing CSS debt also makes a blanket ban impossible without an explicit
current-state baseline.

## Decision

- The frontend build and full check run `check-ui-surface-contract.mjs` before
  accepting application code.
- The gate inventories every CSS rule and React inline style that paints
  backgrounds, borders, or box shadows. The checked-in baseline is exact:
  additions, mutations, and stale retired entries all fail.
- Updating the baseline is an explicit owner-reviewable debt action. A nearby
  existing rule or a baseline entry is not approval for a new surface.
- `role="tooltip"` has one source owner:
  `src/ui/shared/InfoTip.tsx`. The owner must render the popup through the
  registered `InnerChromeBox`; feature code supplies only trigger and content.
- The gate has executable regression tests proving it rejects stylesheet paint,
  inline React paint, new baseline debt, and a second tooltip owner.
- The Run relic tooltip removes its CSS-fabricated surface declarations and
  uses the installed inner nine-slice role. Position, spacing, and typography
  remain ordinary layout concerns.

## Consequences

- A new hand-painted HTML/CSS box fails locally and in CI instead of depending
  on an agent remembering the art contract.
- Existing surface paint is frozen rather than silently blessed; removing it
  requires removing its baseline entry.
- Tooltip interaction remains reusable while its visible box follows the same
  live installed chrome family as the rest of the game.
