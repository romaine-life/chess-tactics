---
status: superseded by ADR-0252
date: 2026-07-30
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0252](0252-lipsanon-references-switch-between-rows-and-a-grouped-reliquary.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0217](0217-run-lipsanon-icons-use-immediate-styled-tooltips.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0251: Lipsanon references use an artwork-first reliquary

## Context

The first Enchiridion lipsanon browser rendered every lipsanon as a full-width
selectable text row containing a native 64×64 icon. The list-row frame was
designed for named records rather than visual artifacts: it repeated far more
chrome than information, crowded or clipped the names, and made the icons fight
the row boundaries. The selected lipsanon then stretched one detail frame through
the remaining pane despite having only a short description and two statistics.

## Decision

- Enchiridion and Strategikon lipsanon references browse lipsana through one compact
  grid of native-size artwork.
- Each selectable lipsanon consumes the canonical `inner-asset-swatch` primitive,
  not `inner-list-row`. The active swatch uses the shared selected state.
- Lipsanon names and complete effects appear immediately through the shared styled
  tooltip on hover and keyboard focus. The interactive swatch itself remains
  the sole focus and activation target.
- The selected lipsanon record contains the native icon, name, effect, history
  counts, and history source. Its frame sizes to that content and anchors to the
  top instead of stretching through unused pane height.
- Narrow layouts stack the reliquary above the record; wide layouts place them
  side by side. Both hosts continue to use the same `LipsanaCodex` implementation.

## Consequences

- Lipsanon artwork becomes the browsing language, matching how lipsana are
  encountered during a Run.
- More lipsana remain visible without a tall scrollbar or repeated clipped
  labels.
- The detail frame communicates one selected record rather than resembling an
  empty full-height workspace.
