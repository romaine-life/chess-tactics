---
status: superseded by ADR-0492
date: 2026-08-02
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)'s deferred Hieratic Run mechanics"
extends:
  - 0327-tactical-cards-roll-one-in-eight-and-may-cost-twelve.md
  - 0328-tactical-targets-are-chosen-at-acquisition-and-use-the-discipline-icon.md
  - 0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md
  - 0343-agminate-replaces-marshalled-as-the-formation-ability-name.md
  - 0344-opening-shop-cards-roll-qualifiers-at-every-core-value.md
---

# ADR-0345: Hieratic draws one in eight and grants Agminate at acquisition

## Context

Hieratic was accepted as the fourth card property, paired with Agminate, with an
accepted name, steel-armor frame and icon pair — but ADR-0339 deferred its
prevalence, price, target rule and acquisition behavior, so no Hieratic offer
could enter a Run. Three qualifiers drew and a fourth existed only in the
Enchiridion reference. The owner requires Hieratic in play.

Agminate is already a live ability: lipsana grant it, and deployment seats an
Agminate unit by role — the King to a board edge, Rooks to the back-row corners
or beside an Agminate King, Bishops onto opposite colors — rather than by the
rank preference Positioned expresses.

## Decision

- **Prevalence.** Every shop-card draw that has not already become Tactical,
  Pestiferous or Concinnous has a seeded one-in-eight chance to become Hieratic.
  Hieratic resolves last, so the three accepted earlier rates are unchanged and a
  card still carries at most one qualifier. Realized share: 9.5% of draws at No
  Ataraxia and 8.3% under Ataraxia I. Opening Shops draw it on the same terms as
  every other Shop, under ADR-0344.
- **Price.** Agminate adds **three gold**, the same as Discipline. It seats a
  unit in its role's formation rather than a rank, and its King/Rook/Bishop rules
  interlock, so it is priced above Positioned's two rather than beside it. A
  Hieratic card may therefore reach twelve gold.
- **Target.** Exactly one contained unit gains Agminate, drawn from the offer's
  persisted effect seed **at acquisition**, as ADR-0328 established for Tactical.
  A multi-unit offer conceals the outcome and names the property without the
  unit; a one-unit offer shows the forced result on the unit itself. The offer
  therefore stores no target index, and the owned card stores the exact unit id.
  Hieratic and Tactical draw from the same effect seed under different labels, so
  the two never mirror each other.
- **Storage.** Active Run format 12 adds the `hieratic` card type. The granted
  ability persists under the existing non-presentational `marshalled` identifier
  per ADR-0343; no icon, frame or fitting changes. The server validates a
  Hieratic offer by the shared affected-pricing rule and requires its recorded
  target to actually carry Agminate, exactly as it does for the other two
  acquisition qualifiers.
- **Instruments.** Card Layout gains a Hieratic specimen, its own prevalence
  denominator with the authoritative reset, and a realized-draw sample; the
  Enchiridion entry states the accepted effect and is no longer provisional.

## Consequences

- Good: the fourth property is a real Run choice rather than a reference card,
  and Agminate becomes reachable without a specific lipsanon.
- Good: no accepted rate moves. Tactical stays a literal 12.5% and Pestiferous
  keeps its Ataraxia I share; only the standard-card share falls, from 76.6% to
  67.0% at No Ataraxia.
- Cost: format 12 makes in-progress Shop documents unsupported under the repo's
  migration policy, so a Run sitting in a Shop when this ships is replaced rather
  than adapted.
- Cost: the paired property/state icons remain uninstalled at runtime per
  ADR-0339's deferred production cutover, so a live Hieratic card is currently
  identified by its frame, type line and price rather than its icon.

## More Information

- [Game concept](../game-concept.md)
- [Persistence contract](../persistence.md)
- [ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)
- [ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)
