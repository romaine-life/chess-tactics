---
status: "accepted; Town section-preset placement clause superseded by ADR-0469; remaining per-Section placement superseded by ADR-0471"
partially_superseded_by: "[ADR-0469](0469-town-presets-compose-plans-and-editable-districts.md) and [ADR-0471](0471-placement-presets-replace-container-section-collections.md)"
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0465](0465-forest-art-presets-seed-explicit-editable-recipes.md) chooser-placement clause"
  - "[ADR-0466](0466-town-building-presets-seed-editable-section-recipes.md) chooser-placement clause"
---

# ADR-0467: Generator recipe presets remain visible

## Context

ADR-0465 and ADR-0466 placed recipe starters inside the expandable **Add Forest art** and **Add
building** catalogs. Those catalogs also serve a second task: replacing one existing entry. Presets
were deliberately absent in that replacement state, so two nearly identical grids exposed different
controls and an author looking at the individual-art grid could reasonably conclude that no presets
existed.

## Decision

- Forest presets remain visible directly in the selected Forest's **Contents**, before its explicit
  entries and **Add Forest art** action.
- Town presets remain visible directly in every expanded section's **Buildings**, before its
  explicit entries and **Add building** action.
- The expandable art and building grids choose individual sources only. They do not own or hide
  recipe-level actions.
- Preset expansion, persisted concrete entries, editable weights, and the Generate-only output
  boundary remain unchanged from ADR-0465 and ADR-0466.

## Consequences

- An author can discover and apply a preset without opening an unrelated individual-source picker.
- Adding and replacing one entry use the same simple catalog, while recipe starters occupy one
  stable location.
- Forest and Town retain the shared generator-preset renderer and interaction language.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0465](0465-forest-art-presets-seed-explicit-editable-recipes.md)
- [ADR-0466](0466-town-building-presets-seed-editable-section-recipes.md)
