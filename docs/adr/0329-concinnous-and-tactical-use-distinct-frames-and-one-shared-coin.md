---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0338](0338-run-card-properties-and-unit-states-use-paired-icons.md)'s replacement of visible qualifier suffixes with right-side property icons and reassignment of forged steel from white Concinnous to Hieratic"
partially_supersedes:
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)'s retirement of Tactical"
  - "[ADR-0313](0313-enchiridion-filters-cards-and-previews-affected-types.md)'s Type III placeholder"
extends:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0324](0324-run-card-frames-declare-native-content-boxes.md)"
  - "[ADR-0328](0328-tactical-targets-are-chosen-at-acquisition-and-use-the-discipline-icon.md)"
---

# ADR-0329: Concinnous and Tactical use distinct frames and one shared coin

## Context

Concinnous is the forged-steel Positioned qualifier. Tactical is separately
needed for the blue-water Discipline qualifier, so the two semantic identities
must not alias. The earlier accepted white mockup also established the desired
gold coin treatment retained as the shared coin source.

## Decision

Concinnous remains **Units — Concinnous**, grants one stored hidden target
Positioned for two gold, and resolves the forged-steel
`ui/run/card-prototypes/concinnous-frame-v1.png` slot. Tactical is restored as
**Units — Tactical**, grants one acquisition-time random unit Discipline for
three gold, and resolves the blue-water
`ui/run/card-prototypes/tactical-discipline-frame-v1.png` slot. The prior
`tactical-frame-v1.png` identity remains retired rather than reopening a closed
live-media lifecycle.

Every card takes the same accepted gold coin pixels from
`ui/run/card-prototypes/cost-coin-source-v1.png` and overlays the live integer;
frame variants do not own separate coin treatments. The Concinnous frame uses
accepted SHA-256
`0069be656caaebd00c0dd47e7e7a21d5c4f8978d170ecea1cbd11647767e75f3`.
The shared coin source uses accepted SHA-256
`7ababc58bca64fedd65f42fb5592dab21ea15b48b743ddddafc481571fb1e29f`,
and the water frame uses accepted SHA-256
`6c54a0a6dc48f56a3cf21c83d57d08cfbf11a501ae90f820b527c07cf40d3140`.
The final frame-pointer restoration is atomic promotion batch
`e0cbec15-4fd2-4efb-8e68-3f9b64e56cc4`.

In the Enchiridion Card Types reference, Tactical replaces the provisional
**Type III** record and uses the same shared Volunteer specimen as the other
affected-card types. **Type IV** remains provisional.

## Consequences

Forged-steel Concinnous and blue Tactical communicate different acquisition rules
without forking the shared card anatomy. A coin replacement is one live-media
promotion for every card.
