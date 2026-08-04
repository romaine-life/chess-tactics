---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s Pestiferous/Cacochymic pair name"
  - "[ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)'s Hieratic/Agminate pair name"
partially_supersedes:
  - "[ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)'s visible em-dash qualifier suffix"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)'s visible Concinnous type-line suffix"
  - "[ADR-0313](0313-enchiridion-filters-cards-and-previews-affected-types.md)'s Type IV placeholder name"
  - "[ADR-0315](0315-card-types-uses-enchiridion-master-detail-columns.md)'s Type IV placeholder name"
  - "[ADR-0328](0328-tactical-targets-are-chosen-at-acquisition-and-use-the-discipline-icon.md)'s generic forged-shield Discipline icon"
  - "[ADR-0329](0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md)'s visible Concinnous and Tactical type-line suffixes and forged-steel assignment to Concinnous"
  - "[ADR-0324](0324-run-card-frames-declare-native-content-boxes.md)'s assignment of the measured steel geometry to Concinnous"
extends:
  - "[ADR-0198](0198-run-lipsanon-icons-are-installed-live-art-and-persistently-visible.md)"
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
  - "[ADR-0330](0330-run-card-type-lines-use-the-lower-optical-baseline.md)"
---

# ADR-0339: Run-card properties and unit states use paired icons

## Context

The card type strip has the same useful right-side visual seat that a Magic:
The Gathering card gives to its set symbol. Chess Tactics has no sets. Printing
an unfamiliar causal property after **Units** makes that narrow strip do glossary
work, while reusing the granted unit-state symbol would collapse cause and
result into one concept. The Plagued/Pestiferous decision already established
the correct two-icon pattern.

The fourth affected-card reference also needs a name. **Hieratic** is the
deliberately formal adjective for the card property paired with Marshalled.

## Decision

- The left side of every current unit card's type strip says **Units**. Affected
  cards show their card-property icon in the strip's right-side symbol seat.
  They no longer print an em dash or qualifier name on the card face. Ordinary
  cards leave the symbol seat empty.
- Each causal card property and resulting unit state owns a distinct typed icon:

  | Card property | Granted unit state |
  | --- | --- |
  | Pestiferous | Plagued |
  | Concinnous | Positioned |
  | Tactical | Discipline |
  | Hieratic | Marshalled |

- The property icon is present whenever the card's persisted qualifier is
  public. The unit-state icon is present only beside a unit whose exact state is
  public. A multi-unit Tactical offer therefore shows Tactical in the type strip
  but no Discipline marker until acquisition chooses its target; a one-unit
  Tactical offer may show both because the target is forced.
- Hover and keyboard focus explain unfamiliar symbols immediately. The
  interactive card's accessible name includes the property and effect. The
  symbol itself is not a nested focus target inside a purchase button; inert
  reference faces may expose the same tooltip as their focus target.
- All eight assets are native transparent 64x64 PNG roles in the live UI-kit
  catalog. Card properties use component `card-property-icon`; unit states use
  component `unit-ability-icon`. Runtime code resolves the typed semantic role
  and never substitutes a shield, flag, movement glyph, Unicode character, or
  one member of a pair for the other.
- The already selected Tactical/Discipline PixelLab sources are candidate `0`
  (`37914847-8684-4b5e-817b-74d19e57daca`) and candidate `4`
  (`f22e81a8-628a-495c-ae43-45aa2cd17b2a`) respectively. Concinnous/Positioned
  and Hieratic/Marshalled remain owner selections to be made in a game-owned
  review surface before their candidates can be installed.
- Candidate review mounts every pair in the real card type-strip and unit-state
  seats at rendered and native sizes. Production cutover is atomic: the textual
  suffixes and generic placeholders remain the current production presentation
  until every affected production path can resolve its required accepted typed
  role without fallback.
- **Hieratic** names the fourth causal property and replaces the Enchiridion
  **Type IV** placeholder. It owns the dedicated
  `ui/run/card-prototypes/hieratic-frame-v1.png` slot and the owner-confirmed
  steel-armor candidate version `6ddbdeb9-08ae-4c8c-9924-041bee70d7f0`, exact
  native SHA-256
  `cdd9a3e017881f69c49c343f6cc9e721320f3681a1a3787b2a3166ec7ea26cdf`.
  Its measured steel geometry moves with those pixels. Concinnous retains its
  accepted white frame; white and steel are not aliases. This decision does not
  introduce Hieratic shop offers or choose their prevalence, price, targeting,
  or acquisition rule; those mechanics require a separate decision before the
  type can enter a Run.

## Consequences

Cards retain the readable primary type while the symbol seat communicates the
causal property compactly. The paired vocabulary teaches that card properties
bestow unit states without pretending they are the same object. Hieratic is
named, illustrated in forged steel, and ready for icon review without silently
inventing its unfinished Run mechanics.
