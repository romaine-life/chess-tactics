---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)'s treatment of Pestiferous and Tactical as complete type-line identities"
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)'s exploratory-candidate status and underspecified type line"
partially_superseded_by:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)'s completed live-frame import and shared runtime renderer"
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)'s removal of automatic literal behavior prose"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)'s replacement of the Tactical qualifier with Concinnous"
---

# ADR-0276: Run type lines declare primary families and affected qualifiers

## Context and Problem Statement

The trading-card frame has a dedicated middle strip, but ordinary Run bundle
cards initially appeared to have nothing to put there. Pestiferous and Tactical
describe affected-card behavior, while every current shop card still shares the
more fundamental fact that it contains units. Future cards may behave unlike a
unit bundle altogether, so removing the strip would erase a useful extension
point.

The owner also selected the third frame from the three 2026-07-31 generated
candidates as the visual direction. It is the only candidate that integrates a
compact top-right coin into the shared title bar as required by ADR-0275.

## Decision Drivers

- The middle strip should declare what the card is, not become an ability box.
- Ordinary cards need a complete type line rather than an empty decorative bar.
- Affected status should remain visible at a glance.
- The rules box must still explain behavior and enumerate the purchased units.
- The taxonomy should permit future non-unit cards without redesigning the
  frame.

## Decision Outcome

Chosen: **a primary card family followed by optional affected qualifiers.**

- Every current bundle card has the primary type **Units**.
- An ordinary card's complete type line is simply **Units**.
- A Pestiferous card reads **Units — Pestiferous**.
- A Tactical card reads **Units — Tactical**.
- Pestiferous and Tactical remain causal, rules-bearing classifications. Their
  appearance on the type line does not replace literal rules text or the
  Enchiridion definition.
- Whether multiple affected qualifiers may coexist, and their ordering or
  separator if they do, remains the existing open balance/presentation decision.
- Future cards with materially different play may introduce primary families
  such as **Event** without changing the frame anatomy.
- The lower rules box is ordered as a flexible composition rather than one prose
  paragraph: unit-ledger rows first, any card-level behavior needed for the
  offer next, and the core card's flavor text anchored at the bottom. Density
  continues to adapt under ADR-0270.

### Selected frame direction

- Selected source: the third of three generated frame candidates shown to the
  owner on 2026-07-31.
- Source artifact: `exec-92c6c187-17c9-4d23-b0ee-ec15dbd3850e.png`.
- Source dimensions: 1060 × 1484 pixels.
- Source SHA-256:
  `DF20F6D737B0FE73F87DE2B5050B08F909C4959C5A3E0A63B841403C2F5B687C`.
- The selection establishes the frame's visual direction. It is not yet an
  installed runtime asset: live-media import, layered runtime text and unit art,
  and in-application card-size review remain required.

### Consequences

- Good: the type strip always carries useful information.
- Good: ordinary, affected, and future non-unit cards share one stable frame.
- Good: the bottom box can prioritize the exact purchase contents without
  asking the type line to explain mechanics.
- Cost: Pestiferous and Tactical appear both as concise type-line qualifiers and
  as behavior the player can inspect in the rules/reference system.
- Deferred: exact ledger row grammar, reminder-text density, multiple-qualifier
  syntax, and future primary card families beyond Units.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)
- [ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)
- [ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)
