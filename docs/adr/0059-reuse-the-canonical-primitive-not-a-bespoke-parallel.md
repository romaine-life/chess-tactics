---
status: accepted
date: 2026-07-03
deciders: owner (Nelson) + Claude
---

# ADR-0059: Reuse the canonical shared primitive — a bespoke parallel is a defect

## Context and Problem Statement

The single most repeated failure in this codebase is an agent building a **bespoke
reimplementation of something that already has one blessed shared implementation**, instead
of finding and reusing it. Each time it produces a surface that *looks* like the real thing
but behaves subtly differently — and the owner, who expects consistency, has to notice the
drift, get frustrated, and send it back. It has happened over and over:

- The prop-seat lab rendered the board in a hand-rolled `min-height: 60vh; overflow: hidden`
  box that only received a zoom value — so it clipped at the bottom and could not pan, while
  every real board (`ViewPane`) pans, zooms, and fits. A parallel board viewport was invented
  when the canonical one already existed.
- The Studio labs shipped as standalone routes with hand-rolled toolbars instead of the one
  Catalog/Viewer shell (fixed by ADR-0058).
- Chrome gets hand-rolled in CSS instead of the 9-slice kit (ADR-0032, ADR-0016).

The common root is not any one domain — it is **not looking for the existing primitive first**.
The specific ADRs (0058 navigation, 0032 chrome, 0057 reset, 0042 title bar) each fix one
domain; this ADR names the general rule and, crucially, gives a **findable index** so the
next agent can locate the canonical thing before writing a line.

## Decision Drivers

- Consistency is a feature the owner relies on: if two boards behave differently, or two
  editors navigate differently, the product feels unreliable and the owner can't predict it.
- "I didn't know it existed" is the usual excuse and it is preventable — the primitives are
  named below, and searching the repo for the behavior (grep `pan`, `ViewPane`, `PropSprite`,
  `catalogCategories`) surfaces them in seconds.

## Considered Options

- Codify a general reuse-the-canonical-primitive rule + a discoverable index (this).
- Keep relying on per-domain ADRs and hope the next agent generalizes (status quo — it doesn't).

## Decision Outcome

Chosen: **before building any surface, control, or render, find the canonical shared primitive
and reuse it. Reimplementing — in parallel — behavior the repo already has one blessed way to
do is a defect, reviewable as an ADR-0059 violation.**

Rules:

1. **Search before you build.** For anything that renders a board, seats a sprite, frames a
   control, draws chrome, or is a Studio surface, look it up in the index below (or grep the
   behavior) *first*. If a canonical primitive exists, use it — do not fork it, do not inline
   a lookalike.
2. **If it truly doesn't exist and you need it, make it shared, not local.** Add it as a
   reusable primitive (its own module under `render/`, `ui/shared/`, or `ui/dressing/`), and
   add a line to the index below — so the *next* feature reuses it instead of writing a third
   copy. A one-off inlined helper that the next person can't find is how parallels breed.
3. **A wrapper is allowed; a fork is not.** Composing/º configuring a canonical primitive for
   your surface is correct (that is what it is for). Copy-pasting its internals into a bespoke
   version is the violation.

### The canonical primitives — find these before building

(Verified 2026-07-03; grep the name to confirm the current signature.)

- **Board viewport (pan / zoom / fit):** `ViewPane` — `frontend/src/ui/shared/ViewPane.tsx`.
  Wrap ANY board/asset stage in it (`SkirmishBoard`, the level editor, and the Studio board
  labs all do). Never a bespoke fixed-height `overflow:hidden` div — that was the prop-lab bug.
- **Tile-board render:** `BoardLabBoard` → `TileGrid` — `frontend/src/render/`. THE single place
  that turns `(x,y)` into a positioned tile; takes `boardZoom`/`boardPan`. Board generation is
  `solveSocketBoard` (`frontend/src/core/tileBoardGenerator.ts`).
- **Multi-cell props / doodads on a board:** `PropSprite` / `DoodadSprite` / `StructureSprite`
  + `seatTransformPercent` / `propZBracket` — `frontend/src/render/BoardStructure.tsx`.
- **A unit seated on a tile:** `.board-unit-seat` — `frontend/src/style.css` (the one seat
  geometry shared by game board + Studio).
- **Studio surfaces:** the `catalogCategories` registry + `ViewerKind` render chain in
  `frontend/src/ui/TilePreview.tsx`; the shell is `.al-lab-main` + one `.tileset-view-controls`
  + a `header` slot. Editors are Viewer kinds; browsing is a catalog category (ADR-0058).
- **Tuning / dressing controls:** `SliderRow` (built-in ↺ via `dflt`) + `ctlReset` —
  `frontend/src/ui/dressing/SliderRow.tsx`; Reset-to-committed per ADR-0057.
- **Chrome (frames/buttons/panels):** the single 9-slice registry (`config/nine-slice-registry.json`)
  rendered via `border-image` (ADR-0002, ADR-0012, ADR-0016, ADR-0034). Never hand-rolled
  `background`/`border` CSS for a framed surface (ADR-0032).
- **Title bar:** `AppTitleBar` — `frontend/src/ui/shell/AppTitleBar.tsx` (the one invariant bar,
  ADR-0042).
- **Player navigation controls:** `NavButton` — `frontend/src/ui/shared/NavButton.tsx`
  (buttons, not anchors; ADR-0052).

### Consequences

- Good: one review question — "is there already a shared way to do this, and did you use it?"
  — catches the whole class. The prop/surface board labs were moved onto `ViewPane`; the
  standalone labs onto the Studio shell (ADR-0058).
- Good: the index is the antidote to "I didn't know it existed."
- Cost: when a genuinely new primitive is needed, you must build it *shared and registered*,
  which is slightly more work than inlining — that cost is the point.

## More Information

- Per-domain instances of this same rule: [ADR-0058](0058-studio-editors-are-viewer-kinds-not-routes.md)
  (Studio navigation), [ADR-0032](0032-no-bland-html-css-every-surface-is-kit.md) (chrome is kit),
  [ADR-0057](0057-studio-tuning-surfaces-ship-reset-to-baseline.md) (Reset via shared control
  primitives), [ADR-0042](0042-title-bar-is-an-invariant-screens-add-slots.md) (one title bar),
  [ADR-0016](0016-single-source-nine-slice-registry.md) (single nine-slice registry). This ADR
  is the general principle they are each an instance of, plus the findable index.
