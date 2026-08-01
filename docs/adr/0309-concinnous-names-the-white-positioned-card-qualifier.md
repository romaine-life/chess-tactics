---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)'s Tactical name and open-ended positive-enhancement family"
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)'s illustrative Tactical type label"
  - "[ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)'s Tactical affected qualifier"
  - "[ADR-0285](0285-run-card-type-lines-use-one-optically-centered-baseline.md)'s named Tactical label example"
extends:
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)"
---

# ADR-0309: Concinnous names the white Positioned card qualifier

## Context

ADR-0272 used **Tactical** as the working affected-card classification for a
positive enhancement authored by a card, with one contained unit becoming
Positioned as its initial simple form. The mechanic now needs a distinct white
card treatment opposite Pestiferous black, and its player-facing adjective
should carry the game's deliberately ornate vocabulary while describing
harmonious arrangement rather than generic strategy.

The approved white treatment already exists in live storage under the obsolete
Tactical semantic identity. The mechanic never shipped, so retaining that name
as a compatibility lane would create two identities before the feature exists.

## Decision

**Concinnous** is the canonical affected qualifier for a Units card that causes
exactly one contained unit to become Positioned upon acquisition.

- The type line reads **Units — Concinnous**.
- The literal rules/reference statement is: **“Upon acquisition, one unit on
  this card becomes Positioned.”** Per ADR-0305, detecting the qualifier does
  not automatically inject this sentence into the card's Contents Box; the
  affected unit uses the direct hidden/revealed property presentation.
- The Enchiridion definition is: **“Concinnous — skillfully and harmoniously
  arranged; elegantly fitted together.”** The unfamiliar adjective is
  intentional player-facing vocabulary rather than an internal codename.
- The exact target is seeded and persisted when the offer is created. Before
  purchase its identity is hidden; acquisition reveals that stored target
  rather than rolling after commitment. Positioned retains its existing
  two-gold value.
- Concinnous records the rule that authored the enhancement. A card does not
  become Concinnous merely because a contained unit gains Positioned from a
  relic or another external source.
- Concinnous is this specific one-unit Positioned qualifier, not an umbrella
  name for arbitrary positive modifiers. Future card-authored enhancements may
  receive their own causal qualifiers.
- Concinnous cards resolve the dedicated live-media slot
  `ui/run/card-prototypes/concinnous-frame-v1.png`. The exact accepted bytes of
  the obsolete `tactical-frame-v1.png` slot move to that semantic identity
  without regeneration or spatial resampling, and the Tactical slot retires.
  The card retains the shared `RunCardFace` anatomy and shared type-line tuning.
- **Tactical** is retired from this card taxonomy without a compatibility alias.
  Ordinary uses of “tactical” elsewhere in the game retain their ordinary
  meaning and are unaffected.
- Appearance probability, eligible-card rules, multiple-qualifier coexistence,
  and future Concinnous frame replacements remain separate decisions.

## Consequences

- Good: the qualifier is an adjective that fits the established
  **Units — qualifier** grammar and teaches an obscure word whose meaning is
  materially connected to positioning.
- Good: white Concinnous and black Pestiferous cards communicate opposed
  harmonious and deteriorating conditions without changing the common card
  anatomy.
- Good: the already accepted native frame pixels remain byte-identical while
  their stable semantic identity becomes truthful.
- Cost: the Enchiridion and direct property presentation must teach the word;
  the name alone is intentionally insufficient for a first-time player.
- Cost: implementing the card still requires a separately recorded prevalence
  and eligibility rule.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)
- [ADR-0274](0274-relics-grant-unit-owned-deployment-abilities.md)
- [ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)
- [ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)
- [ADR-0285](0285-run-card-type-lines-use-one-optically-centered-baseline.md)
- [ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)
