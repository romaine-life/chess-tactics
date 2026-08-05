---
status: "accepted; seed-interaction clause superseded by ADR-0468 and one-recipe-per-Forest clause superseded by ADR-0470"
partially_superseded_by: "[ADR-0468](0468-placement-generators-randomize-unless-fixed-seed-is-enabled.md) and [ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md)"
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0129](0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md)"
---

# ADR-0464: Forests are saved rerunnable generator instances

## Context

The Level Editor's Forest tool began as a scene-pixel paint brush and was later moved onto the
logical board grid. Its control model remained a transient exception: one unsaved area, one flat
thumbnail-toggle palette, an empty initial species list, uniform source selection, and generated
placement ids keyed only by seed and cell. The panel therefore hid the recipe behind selected
borders, could not reopen a Forest after reload, and could not distinguish two Forests that reused
the same seed and cells.

Terrain Generate and Town already establish the editor's settings-backed generator contract. A
named saved unit owns its scope and recipe, recipe members are explicit rows with visible names and
weights, selecting an area does not materialize output, and Generate or Regenerate is the explicit
replacement action.

## Decision

- A board may carry multiple named saved **Forest instances**. Each owns one logical-grid rectangle,
  a weighted list of source-art entries, density, within-cell randomness, spacing, clumping, edge
  feathering, scale range, orientation policy, and seed.
- Dragging an area or pressing **Add Forest** saves and selects a Forest without creating Scene Art.
  The settled grid highlight remains visible. The selected Forest remains reachable through the
  same saved-unit selector used by Terrain Generate and Town.
- Forest contents use the shared explicit entry-list primitive: add, visibly named source, remove,
  disclosure, and **How often** weight. The thumbnail catalog appears only while choosing an entry;
  selected borders are not the stored-recipe display.
- Generate materializes ordinary visual-only `FloatingArtworkPlacement` data. Regenerate replaces
  only placements owned by that Forest instance, preserving hand-placed Scene Art, Town buildings,
  and other Forests even when areas overlap. Generated placement identity includes the saved Forest
  id as well as seed, logical cell, and candidate slot.
- Removing, erasing, or clearing Forests removes both the saved instances in scope and only their
  owned generated placements. Clear Board also removes saved Town and Forest instances rather than
  leaving invisible recipes behind.
- The retired transient Forest brush and its selected-border species recipe are deleted. Previously
  materialized unowned Forest pixels remain ordinary Scene Art; they do not retain a hidden legacy
  generator path.
- The board code gains an optional saved-Forest channel. Its canonical absent value is the exact
  empty Forest list, so existing Level format version 2 documents already normalize to current
  meaning and require neither a Level-version edge nor a database migration.

## Consequences

- Forest, Town, and Terrain Generate now share one legible select–tune–generate–retune interaction.
- Relative source frequency is owner-controlled and auditable instead of hardcoded uniform choice.
- Forest recipes survive autosave, reload, undo/redo, and handoff independently of their generated
  Scene Art.
- Two Forests may overlap or reuse a seed without taking ownership of one another's placements.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
