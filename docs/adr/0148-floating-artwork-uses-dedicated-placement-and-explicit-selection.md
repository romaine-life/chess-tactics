---
status: "accepted"
date: 2026-07-23
deciders: Nelson, Codex
supersedes: ADR-0147 Level Editor placement and interaction clauses
partially_superseded_by: "[ADR-0149](0149-artwork-select-toggles-candidate-discovery.md)"
---

# ADR-0148: Floating artwork uses dedicated placement and explicit selection

## Context and Problem Statement

ADR-0147 correctly removed tile coordinates and depth from floating artwork,
but its first editor interaction still routed initial placement through
playable and scenic tile hit targets. It also let clicking an artwork select
and immediately drag it in the Select tool. That makes a screen-plane
composition object appear to participate in tile painting and combines two
editor actions that the toolbar presents separately.

Artwork transform controls also need one explicit current instance. Inferring
that instance only from the most recent board click leaves no legible inventory
of placed artwork and no deliberate way to clear the selection outline.

## Decision Outcome

The Level Editor Artwork layer owns a dedicated free-placement process:

- clicking an installed source-art swatch toggles that source's artwork brush;
- while armed, a transparent viewport-sized artwork placement surface converts
  the primary pointer directly into canonical projected-scene pixels;
- tile, prop, doodad, and barrier hit targets do not participate in artwork
  placement; and
- each successful placement becomes the selected artwork instance.

Placed artwork has one explicit current selection:

- a dynamically growing `Selected` dropdown lists every persisted instance by
  source label and per-source instance number;
- the dropdown always includes `None`, which clears the current artwork and its
  outline;
- transform, direction, duplicate, and delete controls remain bound to the
  selected stable instance id until the author explicitly changes or clears it;
  and
- clicking blank board space does not silently clear artwork selection.

Artwork tools have non-overlapping behavior:

- **Select** may change the current artwork by clicking an instance but never
  starts a drag;
- **Move** may drag only the already-selected artwork and does not select a
  different instance;
- the registered Erase toolbar slot becomes an immediate
  **Delete selected artwork** action in the Artwork layer and never enters an
  artwork erase mode; and
- the selected instance alone draws a dotted, image-bounds outline. No tile
  highlight, contact marker, or alternate placement geometry is introduced.

This decision changes only Level Editor interaction. Floating-artwork
persistence, projected-scene coordinates, collection-order rendering,
generation semantics, live-media ownership, and gameplay-inert behavior remain
as decided by ADR-0147 and ADR-0145.

## Consequences

- Free placement is visibly and mechanically independent of tile authoring.
- Selection is inspectable even when several copies share the same source art.
- Select cannot accidentally reposition art, and Move cannot unexpectedly
  change which instance the controls edit.
- Deletion is deterministic because it always acts on the named current
  instance.
- Authors can intentionally remove all selection chrome without deleting art.

## More Information

- Supersedes the Level Editor placement and interaction clauses of
  [ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md).
- Reuses the canonical HouseSelect and registered toolbar chrome per
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
- The secondary-button pan-only rule remains governed by
  [ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md).
