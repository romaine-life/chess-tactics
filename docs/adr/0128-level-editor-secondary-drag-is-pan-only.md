---
status: accepted
date: 2026-07-18
deciders: Nelson, Codex
---

# ADR-0128: Level Editor secondary drag is pan-only

## Context and Problem Statement

The Level Editor board is often completely covered by terrain and object hit
targets. Those targets consume primary-button gestures for the active editing
tool, leaving little or no empty viewport from which to pan.

The secondary mouse button previously had two competing meanings. Its pointer
gesture reached the shared board viewport and could pan, but the context-menu
event at the end of the same gesture erased the tile, feature, unit, doodad,
prop, fence, post, wall, or wall art under the pointer. Distinguishing an erase
click from a pan by a small movement threshold would make a destructive action
depend on pixel-precise input and would still risk erasing work after an intended
pan. The editor already has an explicit Erase tool in its persistent Actions
toolbar.

## Decision Drivers

- Panning must remain available when the authored canvas is completely filled.
- A navigation gesture must never mutate authored content.
- Destructive input must be explicit and predictable rather than dependent on a
  movement threshold.
- Board navigation must continue to use the canonical shared `ViewPane` from
  ADR-0059.
- All playable and scenic board hit targets must follow one input policy.

## Considered Options

- Keep secondary-click erase and distinguish it from pan with a movement
  threshold.
- Keep secondary-click erase and require an empty part of the viewport or a
  separate pan mode for navigation.
- Make the secondary button pan-only and require the explicit Erase tool for
  erasure.

## Decision Outcome

Chosen: **the primary button performs the active Level Editor tool action; the
secondary button is pan-only throughout the board viewport; erasure requires the
Erase tool to be active.**

The complete input contract is:

1. A primary-button gesture on an editable board target delegates to the active
   tool. Brush, selection, move, region, and Erase behavior remain tool-owned.
2. A secondary-button gesture delegates to the canonical shared `ViewPane`, even
   when it begins over a filled terrain cell or an object/barrier hit target. It
   never paints, selects, moves, or erases authored content.
3. An editable board target may erase content only while the Erase tool is
   active. There is no target-local context-menu or right-click erase pathway.
4. This policy applies uniformly to the playable grid and scenic terrain, and to
   terrain, paths, units, doodads, props, cover, fences, posts, walls, and wall
   art.
5. `ViewPane` remains the single owner of pan behavior and may centrally suppress
   the browser context menu so a secondary drag is uninterrupted. Child editing
   targets do not reproduce viewport navigation.
6. No movement-distance threshold distinguishes pan from erase because the
   secondary button has no destructive meaning.

Keyboard-accessible tool actions remain governed by the active tool; this
decision changes pointer-button semantics, not keyboard access.

## Consequences

- A full board can be panned from any visible board content without accidental
  deletion.
- Erasure is slower by one explicit tool selection when the Erase tool is not
  already active, which is the intended safety cost.
- Help text and regression coverage must not advertise or restore right-click
  erase on any board target.
- New editable board overlays must let secondary pointer gestures reach
  `ViewPane` and must not add their own destructive context-menu handlers.

## More Information

- [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  identifies `ViewPane` as the canonical board pan/zoom/fit primitive.
- [ADR-0095](0095-level-editor-chrome-rules-are-mechanically-enforced.md)
  governs the registered Erase toolbar control.
