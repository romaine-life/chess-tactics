---
status: accepted
date: 2026-08-02
deciders: Nelson, Codex
refines:
  - "[ADR-0061](0061-prop-seats-are-db-tuned-live-content.md)"
  - "[ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md)"
  - "[ADR-0173](0173-structure-source-art-turntables-are-complete-source-only-live-groups.md)"
---

# ADR-0361: An installed structure draws its authored halves, never a source turntable

## Context and Problem Statement

A structure drawable can carry two unrelated kinds of media on the same row:

- the **authored halves** (`back` / `front`) an installed prop or doodad is drawn
  from, and
- an **eight-way source turntable** (`<direction>-back` / `<direction>-front`),
  visual composition input for Floating Artwork placement (ADR-0150/0173).

They are not two views of one picture. The authored halves are the accepted
game-board art, split for depth sorting, in their own native frame. A turntable
facing is a separate render of the same subject in a fixed 512×512 canvas with
its own framing and margins.

The prop-seat document (ADR-0061) does not store an offset in board pixels. It
stores a contact anchor **as a pixel inside the authored frame** and a render
scale **relative to that frame's native size**. The renderer turns the anchor
into a percentage of the drawn element, so both numbers are meaningless against
any frame but the one they were eye-tuned on.

Floating Artwork's media lookup was written as a directional lookup with the
authored halves as the `south` fallback, and every installed drawing path went
through it. That was invisible while no installed prop had a turntable. When the
eight-way workflow later installed `south-*` rows for the base props, the runtime
silently swapped the drawn media: every placed prop began drawing a 512×512
turntable render seated by a 192×300-frame anchor, so `anchorX/frameWidth` fell
from 50% to 19% and the drawn size grew ~2.7×. Props left their squares, grew
past their footprints, and hung off the board — with the seat document, the
placement code and the projection all still correct.

## Decision Outcome

**Installed media and source-artwork media are two lanes, resolved separately.**

- The installed lane (`structureArtHalfSrc`, `structureRasterDimensions`, and
  therefore `structureArtAsset().sprite`, `PROP_DEFS`, the DOM renderer, the
  canvas render plan, thumbnails, and every catalog thumbnail) reads the
  authored `back`/`front` halves. A directional row never displaces them.
- The source-artwork lane (`structureArtDirections`,
  `structureArtDirectionSprite`, `structureArtDirectionRasterDimensions`,
  `structureArtDirectionHalfSrc`) reads `<direction>-*` and keeps the existing
  `south` → authored fallback, so a structure that never received a turntable is
  still placeable as south Floating Artwork.
- A **source-only** row (a landmark; ADR-0173) has no authored halves at all, so
  its south facing *is* its nominal frame. The installed lane falls back to it
  for exactly that case, and only that case.

The consequence is that installing a turntable for an existing prop is a purely
additive act: it adds source artwork and cannot move, resize, or restyle
anything already placed on a board.

`frontend/src/core/structureArtInstalledMedia.test.ts` pins both lanes against a
structure that carries authored halves and a differently-sized turntable at once
— the exact shape that no fixture had, which is why the runtime swap was silent.

## Consequences

- Adding an eight-way turntable to an installed prop no longer requires
  re-tuning that prop's seat. The saved anchors and scales stay valid because
  the frame they were measured in stays the drawn frame.
- Re-seating a prop against a turntable frame, if ever wanted, is an explicit
  authoring act in /prop-lab against a deliberately chosen source — not
  something a media install performs on its own.
