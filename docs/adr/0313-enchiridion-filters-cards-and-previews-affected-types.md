---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0329](0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md)'s replacement of Type III with Tactical"
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)'s replacement of Type IV with Hieratic"
  - "[ADR-0510](0510-enchiridion-cards-filters-rarity-on-structural-teal.md)'s third independent Rarity filter and structural teal/oak filter hierarchy"
extends:
  - 0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md
  - 0272-card-types-author-effects-and-may-conceal-unit-targets.md
  - 0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0313: Enchiridion filters cards and previews four affected-type slots

## Context

The Enchiridion Cards section exposes all 49 core Units cards, but its value-
grouped list cannot yet answer two ordinary deck questions: which cards have a
particular gold value, and which contain a particular kind of unit. The
Enchiridion also has no single place where a player can compare the ways a Units
card may be affected.

Only Pestiferous and Concinnous currently have accepted names and literal
behavior. Two additional affected-card designs are being decided in parallel.
Their absence must not cause this reference structure to invent mechanics or
expand the runtime card model prematurely.

## Decision

- The Cards section provides two independent exact filters: **Gold** and
  **Contains**. Each defaults to **All**. When both are active, a core card must
  match both; a contained-unit match means the composition includes at least one
  unit of that type.
- Filtered results retain the existing gold grouping, routable record controls,
  and canonical `RunBundleCard` detail. An empty result is stated explicitly.
- Enchiridion gains a peer **Card Types** section in both the main-menu host and
  Battle-hosted Strategikon.
- Card Types presents four affected-type slots with the canonical `RunCardFace`.
  Every preview reuses **The Volunteer** core card's title, live illustration,
  unit ledger, and flavor as temporary placeholder art/content; only its affected
  qualifier, literal rule, applicable price, and typed frame may vary.
- **Pestiferous** and **Concinnous** use their accepted names and effects. The
  remaining two entries are plainly labeled **Type III** and **Type IV**, with
  their names and effects marked pending. Those entries reserve reference
  layout only: they do not add runtime `RunCardType` values, generate card rules,
  or imply available gameplay mechanics.
- When the parallel card-type decisions land, they replace the two provisional
  records in the shared reference data rather than creating another tab or card
  renderer.

## Consequences

- Players can narrow the core deck by economy and composition without losing
  the established card-record/detail structure.
- Affected-card concepts have one comparable, player-facing reference surface,
  while provisional work remains visibly provisional.
- The reference can be completed before all lore names and mechanics settle,
  without allowing placeholders to leak into persisted Run state.
