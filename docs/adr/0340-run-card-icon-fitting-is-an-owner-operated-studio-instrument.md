---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s Cacochymic fitting label"
  - "[ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)'s Agminate fitting label"
refined_by:
  - "[ADR-0342](0342-studio-viewers-are-entered-through-catalog-and-own-only-local-controls.md)'s focused Viewer control rail"
  - "[ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)'s fifth property/state pair"
extends:
  - "[ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)"
---

# ADR-0340: Run-card icon fitting is an owner-operated Studio instrument

## Context

The paired-icon contact sheet proved the candidate pixels, but it showed too
many complete cards at once and made icon selection inseparable from an
agent-chosen placement. The property symbols also have different optical mass,
while every granted-state symbol occupies the same unit-ledger role.

## Decision

- Card Icon Fitting is a click-reachable Studio catalog category and embedded
  Viewer kind. The former `runIconPairReview=1` address is only a deep-link alias
  into that Viewer; it does not own another page layout.
- The fitting stage renders one active property/state pair through the canonical
  `RunCardFace`. The owner independently selects the property candidate and the
  state candidate from exact private or accepted live-media versions.
- Each property owns independent horizontal, vertical, and scale fitting because
  Pestiferous, Concinnous, Tactical, and Hieratic have different silhouettes and
  frames. Unit-state horizontal, vertical, and scale fitting is shared across
  Plagued, Positioned, Discipline, and Marshalled because they consume one
  ledger role.
- Every fitting control has an individual reset to the current canonical face
  baseline, plus Reset Current and Reset All actions. Preview zoom remains view
  state and is not saved as geometry.
- Candidate selections and fitting values save as a revisioned design-portfolio
  draft under `run-card-icon-fitting-v1`. This document is an owner handoff and
  editing ledger only: saving it does not approve candidates, change active
  media pointers, or install runtime geometry. Production cutover remains an
  explicit reviewed live-media and installed-configuration transaction after
  owner approval.

## Consequences

The owner can make the visual judgments at the real card size, return to the
work later, and hand off exact values without an agent guessing them. Candidate
exploration stays reversible and cannot accidentally publish unfinished icon
choices.
