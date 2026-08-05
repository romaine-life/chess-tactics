---
status: "accepted; chooser placement superseded by ADR-0467 and section-recipe-only scope superseded by ADR-0469"
partially_superseded_by: "[ADR-0467](0467-generator-recipe-presets-remain-visible.md) and [ADR-0469](0469-town-presets-compose-plans-and-editable-districts.md)"
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
  - "[ADR-0465](0465-forest-art-presets-seed-explicit-editable-recipes.md)"
---

# ADR-0466: Town building presets seed editable section recipes

## Context

Town sections already use the same explicit weighted entry model as Forest contents, but assembling
the common residential, mill, and castle mixes one building at a time repeats work. The Forest
preset interaction establishes the safe shortcut: expand a current catalog into visible rows, never
hide a durable mode behind the shortcut, and never materialize output before Generate.

## Decision

- The open **Add building** chooser offers three section-recipe starters above the individual
  building catalog:
  - **Village Homes** expands cottages, cabins, lodges, houses, huts, homes, barns, and farms at
    equal weight.
  - **Mill Village** expands the same homes at weight 4 plus mills and windmills at weight 1.
  - **Castle Borough** expands the same homes at weight 5 plus castles, towers, and keeps at weight
    1.
- A preset replaces only the selected section's building entries. Other sections, the Town plan,
  placement settings, and already generated output remain unchanged.
- Choosing a preset persists concrete source ids and weights through the existing Town recipe. The
  preset name itself is not stored, and every expanded entry remains replaceable, removable, and
  tunable.
- Town and Forest render these starters through one shared generator-recipe preset control.
  Choosing a starter never invokes Generate or Regenerate.

## Consequences

- Authors can establish common town mixtures with one choice and then refine every building entry.
- A saved Town never silently acquires newly installed building art; catalog expansion occurs only
  when the author deliberately reapplies a preset.
- Generate and Regenerate remain the sole output-changing boundary.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0465](0465-forest-art-presets-seed-explicit-editable-recipes.md)
