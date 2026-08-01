---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0316](0316-plagued-icon-candidates-are-reviewed-in-context.md)"
refines:
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0198](0198-run-relics-use-live-native-ui-icons.md)"
  - "[ADR-0313](0313-enchiridion-filters-cards-and-previews-affected-types.md)"
---

# ADR-0317: Plagued iconography depicts the condition, not a chess piece

## Context

ADR-0316 directed the first PixelLab family toward a cracked, poisoned pawn.
All sixteen candidates therefore described the same afflicted object, while
the Unit Ability needs to communicate the more general condition of sickness,
poison, decay, weakness, and struggle regardless of which unit bears it.

## Decision

- Plagued icon exploration must depict the condition itself. Candidate motifs
  may include a decayed skull, coughing or fevered figure, limp hand, diseased
  organ, wilted growth, parasite, corrupted blood, or another immediately
  legible sign of sickness and decay.
- A Plagued candidate must not contain a pawn or any other chess-piece
  silhouette. The icon also continues to exclude text, a surrounding panel,
  weapons, shields, potion bottles, and the modern biohazard mark.
- A generation batch deliberately assigns distinct motif descriptions to its
  candidates. It must not return a nominally varied family that repeats one
  central object sixteen times.
- The accepted UI-kit palette, native 64×64 output, live-media provenance, and
  in-context Studio review requirements remain unchanged. Rejected candidate
  families are retained only as archived media history and are excluded from
  the actionable review surface.

## Consequences

- Review compares genuinely different symbols for Plagued rather than surface
  variations of one mistaken premise.
- The eventual glyph can apply equally to every unit type.
- Owner selection remains an explicit step before installation or runtime role
  wiring.
