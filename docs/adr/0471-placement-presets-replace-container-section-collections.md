---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md) Section-local preset ownership and application scope"
  - "[ADR-0467](0467-generator-recipe-presets-remain-visible.md) per-Section preset placement"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0468](0468-placement-generators-randomize-unless-fixed-seed-is-enabled.md)"
---

# ADR-0471: Placement presets replace container Section collections

## Context

ADR-0470 put complete generation settings inside explicit Town and Forest Sections, but it also
placed preset actions inside each Section and made a preset rewrite only that one Section. That
mistook the concrete recipe produced by a preset for the layer that owns the preset itself.

The intended richer authoring model is that a Town or Forest preset describes a complete layout
concept. Such a concept may be simple and contain one Section, or may combine several approaches
with distinct and mixed relationships. Authors then inspect and edit the resulting concrete
Sections rather than remaining inside a hidden preset mode.

## Decision

- Town and Forest presets belong to the saved container and render above its Section collection.
  Section cards do not contain preset buttons.
- Applying a preset replaces the container's complete Section collection with the preset's exact
  ordered collection of one or more Sections.
- Every materialized Section contains its complete concrete recipe and its mixed/distinct
  relationship. Town Sections include Plan, buildings, counts, scale, frontage, spacing, fit, and
  variation. Forest Sections include contents, density, spacing, clumping, feathering, scale, and
  orientation.
- **All Trees** is a valid simple one-Section Forest preset. **Lush Woodland** and **Rocky Grove**
  materialize richer mixed/distinct collections. **Village Hamlet**, **Mill Village**, and
  **Castle Borough** likewise materialize complete multi-Section Town collections.
- The materialized Sections are ordinary editable data. Authors may expand, collapse, remove,
  add, reorder through future instruments, change relationships, or tune any local field.
- Preset identity is not persisted. Clicking the same preset later rematerializes its canonical
  Section collection, deliberately discarding edits to the current collection.
- Applying a preset preserves the outer patch, seed mode, and existing generated Scene Art.
  Generate or Regenerate remains the sole output-materialization action.
- Existing saved Section collections already contain concrete data and require no format or
  database migration.

## Consequences

- A preset can express a whole layout rather than only a bag of contents for one Section.
- The preset's placement in the UI now matches its blast radius: it appears above the collection
  it replaces.
- Simple and rich presets share one interaction model; one Section is merely a collection of one.
- The author can always see and edit what a preset produced without retaining a hidden preset mode.

## More Information

- [ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md)
- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
