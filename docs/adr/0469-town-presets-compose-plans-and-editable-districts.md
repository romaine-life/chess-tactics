---
status: superseded
superseded_by: "[ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md)"
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0466](0466-town-building-presets-seed-editable-section-recipes.md) section-recipe-only preset scope"
  - "[ADR-0467](0467-generator-recipe-presets-remain-visible.md) Town section-preset placement clause"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
  - "[ADR-0468](0468-placement-generators-randomize-unless-fixed-seed-is-enabled.md)"
---

# ADR-0469: Town presets compose Plans and editable Districts

## Context

The first Town preset pass copied Forest's content-starter model too literally. **Mill Village** and
**Castle Borough** appeared inside one Town section and replaced only its building weights. A Town,
however, also has a global street Plan and already supports multiple spatial sections with separate
shares, building recipes, scale ranges, frontages, and blend boundaries. Calling a one-section
building mixture a Town preset hid that richer composition and made its relationship to Plan
ambiguous.

## Decision

- A whole **Town preset** is visible before Plan and expands into a complete editable composition:
  one global Plan, one or more Districts, blend, building count, street settings, fit policy, and
  variation settings. It keeps the saved Town's name, selected area, seed mode, and current seed,
  and never generates output on selection.
- The UI calls Town sections **Districts**. Each District owns an explicit building recipe, share,
  scale range, and frontage, exactly as the persisted section model and generator already do.
- Every expanded District offers **District presets**. Applying one replaces that District's
  building recipe and all District-local settings while leaving the Plan and other Districts
  unchanged.
- **Village Hamlet** creates one residential District around a Village Green. **Mill Village**
  creates separate residential and mill Districts along a Roadside Row. **Castle Borough** creates
  separate residential and fortified Districts along Lanes.
- The Town generator retains one continuous global street Plan. It assigns plots to Districts by
  their shares and uses Blend to control sharp boundaries, transition bands, or full interleaving;
  each plot then uses its owning District's building recipe, scale, and frontage.
- Preset identities are not persisted modes. Presets expand to the ordinary explicit Plan,
  District, and setting fields, so authors can inspect and change every value and can reapply a
  preset to restore its definition.
- Forest Contents presets remain content recipes in this change. A future multi-grove Forest model
  may use the same composition pattern, but it needs an explicit spatial partition contract rather
  than borrowing Town streets or silently changing the meaning of existing Forest presets.

## Consequences

- Plan no longer appears to be an unexplained setting outside the scope of a Town preset.
- One Town can mix independently chosen residential, mill, and fortified District presets while
  preserving connected streets and one saved generator identity.
- The previous `townBuildingPresets` feature is retired rather than kept as a parallel preset path.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0466](0466-town-building-presets-seed-editable-section-recipes.md)
- [ADR-0467](0467-generator-recipe-presets-remain-visible.md)
