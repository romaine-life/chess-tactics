---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by: "[ADR-0471](0471-placement-presets-replace-container-section-collections.md) preset ownership and application scope"
supersedes:
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md) one-recipe-per-Forest clause"
  - "[ADR-0465](0465-forest-art-presets-seed-explicit-editable-recipes.md) contents-only preset scope"
  - "[ADR-0469](0469-town-presets-compose-plans-and-editable-districts.md) global Town Plan and District composition"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0468](0468-placement-generators-randomize-unless-fixed-seed-is-enabled.md)"
---

# ADR-0470: Placement-generator Sections compose mixed and distinct approaches

## Context

ADR-0469 moved Town presets above a global Plan and made their child Districts content and sizing
recipes. That still put the Plan at the wrong layer. The intended authoring model is one large
Town or Forest patch containing multiple approaches, where each approach may have its own Plan or
scatter settings. Authors should not have to draw, size, or maintain internal polygons merely to
say that two approaches mix while another remains spatially distinct.

The same composition need exists in Forest. One part may be dense and tree-heavy while another is
sparse and rocky; some recipes should intermix over the same ground while others should form a
separate grove. Town and Forest therefore need one shared composition rule rather than parallel
special cases.

## Decision

- A saved Town or Forest owns exactly one author-selected outer grid patch. Internal territories
  are transient generator results and are never persisted or directly drawn by the author.
- Each container owns an ordered list of **Sections**. A Section is a complete local approach:
  - Town Sections own Plan, buildings, count, size range, frontage, landmarks,
    street setback, spacing, fit policy, looseness, and facing variation.
  - Forest Sections own contents, density, within-cell randomness, spacing,
    clumping, feathering, scale range, and orientation.
- Zero Sections and empty Sections are valid authoring states. Their disclosure and removal
  controls remain available; recipe validity disables only Generate at the action boundary.
- The first Section begins a generated territory. Every later Section explicitly relates to the
  current composition as either:
  - **Mixed**: share the preceding Section group's automatically chosen territory; or
  - **Distinct**: begin another automatically chosen territory inside the outer patch.
  Consecutive mixed Sections form one group, so a container may combine some approaches while
  keeping other groups separate.
- A shared deterministic composition primitive groups Sections, automatically apportions the
  outer patch evenly between distinct groups, and uses the current generation seed to choose its
  split and ordering. The author never sizes or edits those internal bounds. Regenerate may
  produce another valid arrangement. There are no Section area or territory-weight controls.
- Sections generated over the same or adjacent territory share collision occupancy. Mixed Town
  Plans and mixed Forest scatters therefore interleave without overlapping placed artwork.
- Town presets are full Section-local approaches. Applying **Village Hamlet**, **Mill Village**, or
  **Castle Borough** replaces that Section's Plan and all of its local recipe and placement fields,
  while preserving the Section's mixed/distinct relationship, other Sections, outer patch, seed
  mode, and generated output.
- Forest presets are likewise full Section-local approaches. Applying **All Trees**, **Lush
  Woodland**, or **Rocky Grove** restores concrete contents plus density, shape, scale, spacing,
  and orientation fields while preserving composition relationships and generated output.
- Generate and Regenerate remain the only actions that materialize or replace Scene Art. Presets,
  Section creation, relationship changes, and outer-patch selection only edit the saved recipe.
- Previously saved Forest global recipes normalize into one explicit distinct Section. Previously
  saved Town global Plan/settings normalize into explicit Section-local fields; the old global
  count is apportioned by the former section shares. New documents persist only the Section model.
  The existing optional board channels retain their absent-empty meaning, so no Level-format or
  database migration is required.
- Town Plans remain invisible placement guides. This decision does not generate road tiles and
  introduces no road-connectivity contract.

## Consequences

- The editor asks for one patch and creative intent, not internal geometry management.
- Town and Forest can express separate, combined, and hybrid compositions through the same model.
- Plan now appears at the layer it controls: inside a Town Section and inside its preset.
- Presets remain inspectable explicit recipes rather than persisted modes.
- Actual road generation, if added later, will need its own connectivity decision rather than
  being implied by today's invisible Town Plans.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)
- [ADR-0468](0468-placement-generators-randomize-unless-fixed-seed-is-enabled.md)
- [ADR-0469](0469-town-presets-compose-plans-and-editable-districts.md)
