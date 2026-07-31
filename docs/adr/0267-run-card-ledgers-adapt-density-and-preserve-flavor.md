---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0269](0269-card-types-author-effects-and-may-conceal-unit-targets.md)"
---

# ADR-0267: Run card ledgers adapt density and preserve flavor

## Context and Problem Statement

Cards must expose exact unit instances and stackable modifiers in their rules
area, but a fixed small row limit would discard mechanical variety before the
actual card has been tested. Conversely, letting dense contents silently crowd
out flavor text would destroy the authored identity that made the 49-card core
set tractable.

## Decision Drivers

- Exact contents and modifiers are required gameplay information.
- Flavor text is a stable part of every core card's identity, not optional
  filler surrendered by mechanically dense instances.
- Card combinations should be constrained by demonstrated legibility rather
  than a guessed row count.
- The first card template should remain coherent across sparse and dense
  contents.

## Considered Options

- Impose a three-row maximum before prototyping.
- Keep one fixed ledger scale and omit flavor text when contents overflow.
- Adapt ledger density within bounded readable layouts and preserve flavor in
  every case.

## Decision Outcome

Chosen: **there is no fixed gameplay row cap yet; the card ledger adapts its
density while retaining flavor text at the bottom.**

- Sparse cards use the room available to make their unit rows immediately
  legible. Denser cards may reduce row spacing, icon scale, and text size in
  deliberate density steps, following the broad precedent of text-heavy
  trading cards.
- The ledger always communicates every unit instance and modifier. It does not
  abbreviate away a property merely to fit the current template.
- Flavor text remains in its dedicated bottom region at every supported
  density. It is never removed to make room for rules content.
- The initial card experiment must compare representative sparse, ordinary,
  and worst-case dense compositions at the actual rendered card size. It must
  expose the density controls and row count for owner review under ADR-0071.
- No exact maximum row count or minimum type size is accepted yet. If a real
  composition cannot remain readable after bounded density adjustment, card
  dimensions, grouping, or the eventual row cap are reconsidered from that
  evidence.
- How repeated identical units are grouped or counted inside one row remains a
  separate unresolved presentation decision.

### Consequences

- Good: the deck does not lose possible combinations because of an untested
  three-row assumption.
- Good: authored flavor remains present even on mechanically unusual cards.
- Cost: the visual prototype must prove several density states rather than one
  fixed ledger layout.
- Cost: a row cap may still become necessary after testing; this decision
  deliberately does not promise unlimited readable density.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
- [ADR-0225](0225-run-bundle-cards-show-every-board-unit.md)
- [ADR-0262](0262-run-cards-keep-core-identities-while-units-carry-modifiers.md)
