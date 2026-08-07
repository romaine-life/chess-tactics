---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0432](0432-aliene-is-the-alienatio-action-verb.md)'s grammatical distinction between the operation noun and its player-facing action verb"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)'s retirement of the standalone Alienatio destination and presentation family"
  - "[ADR-0511](0511-held-cards-are-immutable-formations.md)'s retirement of the Alienatio operation"
partially_supersedes:
  - "[ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)'s buying and selling terminology"
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)'s purchase terminology"
  - "[ADR-0388](0388-remaining-shop-cards-settle-into-their-new-seats.md)'s purchase terminology"
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)'s deferral of the operation names"
extends:
  - "[ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)"
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)"
---

# ADR-0393: Adlectio and Alienatio are the movements within Sectio

## Context

**Sectio** correctly names the phase as an ill-assorted aggregate acquired in the wake of
catastrophe, but its two movements still appeared as the plain interface labels **Buy** and
**Sell Units**. Those words described modern controls rather than what happens to the people in
the Run.

The card is not merely an object bought into inventory. It admits an expensive group of people
whose varied backgrounds may not suit war and whose addition ordinarily makes the army less
consistent. In Roman public life, *adlectio* was admission into a body by direct appointment.
That sense also joins the game's existing **Adlected** unit state: direct appointment is already
the established idea, while the noun names the broader admission event.

A relinquished unit moves out of the player's ownership in return for value. Latin juridical
*alienatio* names the transfer of a thing into another's ownership. It therefore names disposal
without reducing the person to a modern shop button.

## Decision

- **Adlectio** is the canonical name of admitting one offered card and its contained people into
  the Run. The card action, accessible announcement, Chartulary copy, craft transition, model
  function, stored offer-id set, and acquired-unit provenance use that vocabulary.
- **Alienatio** is the canonical name of relinquishing one existing army unit for value. The
  Sectio destination, route query, scene identity, workspace, filters, unit action, reset copy,
  model function, stored relinquished-unit collection, DOM/CSS contracts, tests, and review
  screen-art identity use that vocabulary.
- RunSaveVersion 18 and database migration 55 remain the one unshipped migration boundary. They
  now transform version 17 directly from `shop`, `purchasedCardOfferIds`, `soldUnits`, and Shop
  unit provenance into `sectio`, `adlectedCardOfferIds`, `alienatedUnits`, and `adlectio`.
  No intermediate version-18 Sectio shape has shipped or been applied, so creating version 19 or
  migration 56 would preserve a fictional public state.
- The paid lipsanon offered by **Merchant's Shopkey** remains a purchase. It transfers property;
  it does not admit a person or group into the army and therefore is not Adlectio.
- The existing **Adlected** ability is not renamed. It is the adjective for a unit appointed to
  a special deployment privilege; **Adlectio** is the noun for the card-bundle admission event.
- Historical ADR prose and the version-17 side of the migration retain Buy, Sell, purchase,
  `purchasedCardOfferIds`, and `soldUnits` where they identify the retired behavior or shape.

## Consequences

- The Sectio control row reads **Sectio · View Battle · Alienatio**.
- Offered card actions announce **Adlectio**; completed cards are adlected into the Chartulary.
- Army provenance can distinguish the phase (`sectio`) from the admission operation
  (`adlectio`) without a display alias.
- Existing active Runs, craft links, wrap art, and Alienatio review art move in migration 55
  without erasure or regenerated media.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
- [ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)
