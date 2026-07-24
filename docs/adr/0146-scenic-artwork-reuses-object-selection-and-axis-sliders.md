---
status: "accepted; seated-target and board-bounded-axis clauses superseded by ADR-0147"
date: 2026-07-23
deciders: Nelson, Codex
supersedes: ADR-0145 Level Editor nudge-control clause
partially_superseded_by: "[ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md)"
---

# ADR-0146: Scenic artwork reuses object selection and axis sliders

## Context and Problem Statement

ADR-0145 established continuous direct source-art placement but specified
numeric X/Y fields plus nudge controls. Its first editor implementation also
drew a separate undersized diamond at each artwork contact point. That diamond
duplicated the board's existing isometric placement language, did not match the
canonical grid geometry, and visually read as a malformed new tile.

The Level Editor already owns a transparent standing-object hit target for
selecting doodads and props. Continuous X/Y adjustment also benefits from the
same slider-plus-number pattern already used for scenic artwork scale.

## Decision Outcome

The scenic Artwork layer introduces no visible placement tile, contact marker,
or alternate grid geometry.

- Initial placement continues to use the existing canonical playable/scenic
  board hit surface and converts the pointer to an exact continuous board point.
- A placed artwork instance reuses the existing invisible standing-object hit
  target, seated over the artwork's lower body, for selection and dragging.
- Drag feedback consists only of the artwork ghost. It draws no contact
  diamond.
- Details exposes X, Y, and Scale as three full-width slider-plus-number rows.
  X and Y use the exact authored playable-plus-scenic bounds and retain the
  continuous persisted coordinates established by ADR-0145.
- The separate X-/X+/Y-/Y+ nudge-button cluster is removed.

This partially supersedes only ADR-0145's Level Editor nudge-control clause.
Scenic-art storage, rendering, generation, direction, scale, and gameplay-inert
semantics remain unchanged.

## Consequences

- Artwork interaction no longer suggests that a new kind of terrain or
  placement tile exists.
- Object selection follows an editor primitive authors already encounter on
  props and doodads.
- X, Y, and Scale have one consistent continuous adjustment pattern while exact
  values remain directly editable.

## More Information

- Partially supersedes
  [ADR-0145](0145-scenic-artwork-is-free-transform-generation-input.md).
- Reuse follows
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
