---
status: accepted
date: 2026-07-03
deciders: owner (Nelson) + Claude
---

# ADR-0058: A Studio editor is a Viewer kind reached from a catalog category — never a standalone route with its own toolbar

## Context and Problem Statement

`docs/studio-control-architecture.md` is the authoritative Studio spec, and ADR-0029
codifies the *catalog-category requirements*. Between them they already say how a new
Studio thing is navigated to: it is **one `catalogCategories` entry**, and a light
single-item **editor** for it is an **embedded Viewer kind** (like the unit-portrait crop
editor and the kit 9-slice frame editor) "reached from their catalog's edit affordance,
**never from a separate route**" (architecture doc, lines 68–70, 139).

But that navigation rule lived **only in the spec doc**, not in an enforceable ADR. So it
kept getting missed: the prop-seat editor first shipped as a standalone `/prop-lab` route
with a hand-rolled top toolbar (a prop-picker button row + family/zoom/toggle buttons) —
exactly the "stack of fat full-width buttons" and the forbidden sub-header the doc calls
out ("a sub-header is always a bug here", line 74). It was navigated to as its own page,
outside the Catalog/Lab/Viewer frame. The same drift produced the other standalone lab
routes (`/surface-lab`, `/scene-anim-lab`, `/doodad-editor`, `/artwork-compare`,
`/tile-compare`).

## Decision Drivers

- The Studio is **one instrument**: a persistent surface + one Controls panel that follows
  focus, under three fixed Catalog/Lab/Viewer tabs. A bespoke per-editor toolbar breaks
  that continuity and re-teaches a different navigation for every editor.
- The rule existed but was unenforceable because it wasn't an ADR — reviewers had nothing
  named to catch a violation against (the exact gap ADR-0029 closed for category
  *completeness*, now closed here for *navigation*).

## Considered Options

- Codify the navigation rule as an ADR (this).
- Leave it in the spec doc only (status quo — the thing that let `/prop-lab` ship wrong).

## Decision Outcome

Chosen: **codify it.** For anything you browse or edit in the Studio:

1. **Browsing is a catalog category.** A new kind of thing (props, tiles, units, …) is one
   `catalogCategories` entry in `TilePreview.tsx` — preferably a `CatalogType` descriptor
   rendered by `CatalogGrid`/`CatalogControls` (ADR-0029). No hand-rolled selection UI.
2. **Editing is a Viewer kind.** A light single-item editor (portrait crop, 9-slice frame,
   **prop seat**) is a `ViewerKind` that renders into the shared shell — the surface in
   `.al-lab-main`, **every** control in the one `.tileset-view-controls` panel, the
   workspace tabs + kind selector in the `header` slot. It is reached from its catalog's
   **Inspect / edit affordance** (`onView` / an `onEdit*` → `openViewer(kind)`), and its
   state rides the studio URL (`?vk=…&<selection>=…`).
3. **No standalone editor routes, no per-editor toolbars.** A convenience path may exist
   only as a **deep-link alias** that opens the studio at the right kind and canonicalises
   to `/tileset-studio` — the pattern `/nine-slice-editor` and now `/prop-lab` follow.
   There is no separate page, no `.pl-bar`-style toolbar, no sub-header.

Board **placement** of a placeable thing still routes to the Lab (the Level Editor) via the
card's brush affordance, exactly as tiles/units/doodads do — that is unchanged. This ADR
governs where the *editor* lives, not where placement goes.

### Consequences

- Good: one navigation for the whole Studio; a reviewer can ask "where's your catalog entry
  and your Viewer kind?" and a standalone-route editor is now a named ADR violation.
- Good: the prop-seat editor was rebuilt to this shape — a **Props** catalog category +
  a **`propseat`** Viewer kind (`PropSeatLab`), the `/prop-lab` route retired to an alias.
- Cost/debt: the pre-existing standalone labs (`/surface-lab`, `/scene-anim-lab`,
  `/doodad-editor`, `/artwork-compare`, `/tile-compare`) predate this and still violate it.
  This ADR names them as debt to migrate, not blessed exceptions. Inspector/compare tools
  that only *look* (no editing, no committed baseline) are the weakest case for migration;
  anything that *edits* a committed asset should become a Viewer kind.

## More Information

- Authoritative spec: `docs/studio-control-architecture.md` (layout, the three modes, the
  "frame never moves" rule, the registry mechanism). This ADR lifts that doc's
  navigation rule into an enforceable decision.
- Related: [ADR-0029](0029-catalog-category-requirements.md) (catalog-category
  *requirements* contract), [ADR-0057](0057-studio-tuning-surfaces-ship-reset-to-baseline.md)
  (Reset-to-baseline, which the prop-seat editor also honors). Registry + viewer wiring:
  `catalogCategories`, `ViewerKind`, the viewer render chain in `frontend/src/ui/TilePreview.tsx`;
  the editor components `PropSeatLab` / `NineSliceLab` / `PortraitLab`.
