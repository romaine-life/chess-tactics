---
status: "accepted; chooser-placement clause superseded by ADR-0467 and contents-only preset scope superseded by ADR-0470"
partially_superseded_by: "[ADR-0467](0467-generator-recipe-presets-remain-visible.md) and [ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md)"
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
---

# ADR-0465: Forest art presets seed explicit editable recipes

## Context

ADR-0464 made every Forest recipe concrete and inspectable, but assembling a useful recipe one art
entry at a time is unnecessary work for common cases. A shortcut must not reintroduce the retired
hidden swatch selection or become a durable mode whose meaning changes when the installed art
catalog changes.

## Decision

- The open **Add Forest art** chooser begins with three recipe starters and retains the individual
  art catalog below them:
  - **All Trees** expands every currently eligible literal tree with equal weight.
  - **Lush Woodland** expands all trees at weight 4 plus ferns, flowers, mushrooms, shrubs, bushes,
    logs, and stumps at weight 1.
  - **Rocky Grove** expands all trees at weight 5 plus rocks, boulders, and stone at weight 1.
- A preset replaces only the selected Forest's contents. It neither changes placement knobs nor
  generates output.
- Presets are catalog-aware authoring shortcuts, not persisted identities. Choosing one immediately
  materializes its concrete source ids and weights into the same explicit entry rows governed by
  ADR-0464. Those entries remain independently replaceable, removable, and tunable.
- “All Trees” is literal: placement-geometry metadata that seats a fern or flower like a tree does
  not classify it as tree art.

## Consequences

- Common recipes take one choice while remaining fully auditable and editable.
- Saved Forests do not silently acquire newly installed artwork; the current catalog is consulted
  only when the author deliberately reapplies a preset.
- Generate and Regenerate remain the only actions that change the selected Forest's output.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)
