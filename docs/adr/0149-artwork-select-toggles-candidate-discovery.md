---
status: "accepted"
date: 2026-07-24
deciders: Nelson, Codex
supersedes: ADR-0148 Select activation and current-outline visibility clauses
---

# ADR-0149: Artwork Select toggles candidate discovery

## Context and Problem Statement

ADR-0148 made floating-artwork selection explicit, but an inactive Select tool
looked identical to an active one and exposed no indication of which scene
artworks could be chosen. Authors had to hunt for invisible image-sized hit
targets one at a time. Select also had no symmetric way to leave selection mode
and clear its visual state.

## Decision Outcome

The Artwork-layer Select action is a toggleable discovery mode:

- the first Select click activates the toolbar action and draws a candidate
  outline around every selectable placed artwork;
- candidate outlines use each source image's calibrated bounds and never a tile,
  contact point, footprint, or invented placement geometry;
- clicking a candidate changes the explicit current artwork without moving it
  and leaves discovery mode active;
- the current artwork remains visually distinct from the other candidates with
  its dotted selected outline; and
- clicking Select again exits discovery mode, clears the current artwork, and
  removes both candidate and selected outlines.

Choosing Move, Brush, or a source-art swatch exits candidate discovery without
silently changing the current artwork. Move therefore retains the explicit
current artwork it needs, while candidate highlights remain specific to Select.
The `Selected` dropdown and its `None` option remain direct ways to choose or
clear the current artwork outside candidate discovery.

This decision changes only Level Editor interaction and selection chrome.
Floating-artwork persistence, projected-scene coordinates, rendering,
generation semantics, and gameplay-inert behavior remain unchanged.

## Consequences

- Authors can immediately see every artwork that Select can target.
- Select has a legible active and inactive state.
- Exiting Select removes all selection chrome in one repeat click.
- Candidate discovery remains image-bound and cannot regress into tile
  placement or tile highlighting.

## More Information

- Partially supersedes the Select activation and current-outline visibility
  clauses of
  [ADR-0148](0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md).
- Reuses the registered Select toolbar action and existing image-sized artwork
  hit targets per
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
