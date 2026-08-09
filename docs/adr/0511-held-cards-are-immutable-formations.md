---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0432](0432-aliene-is-the-alienatio-action-verb.md)"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)"
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)"
  - "[ADR-0485](0485-expunctio-unit-pointer-targets-include-the-visible-outline.md)'s Expunctio-selection clauses"
  - "[ADR-0487](0487-expunctio-selection-swaps-content-within-persistent-seats.md)"
  - "[ADR-0488](0488-expunctio-unit-selection-uses-one-blue-mark.md)"
  - "[ADR-0489](0489-alienatio-fades-the-departure-and-flips-the-next-card-frame.md)"
  - "[ADR-0508](0508-alienatio-leaves-the-authored-formation-seat-vacant.md)"
partially_supersedes:
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s Alienatio operation"
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)'s individual-unit disposal and discounted-fee clauses"
  - "[ADR-0486](0486-run-disposal-prices-use-directional-gold-marks.md)'s gain transaction mark"
  - "[ADR-0332](0332-eight-run-lipsanon-icons-ship-the-approved-resized-pixels.md)'s installed Paid Crossing asset"
refines:
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)"
---

# ADR-0511: Held cards are immutable formations

## Context

Alienatio let a player sell one unit while retaining its card. The Paid Crossing likewise removed
one promoted Pawn for gold. Both mechanics made the formation printed on a held card cease to be
the formation that would later deploy. That forced the player to resolve gaps, survivor reflow,
disconnected shapes, individual collision, card-price discounts, and a second sale action before
the core economy and formation play had earned that complexity.

Fair Scales existed only to improve Alienatio's payout. Once individual-unit disposal leaves, it
has no independent rule. The gain-direction gold mark likewise has no remaining Run transaction.

## Decision

- A held card is one formation. The player cannot voluntarily remove or sell one attached unit.
  Battle casualties may still leave empty seats because they are combat history, not a shop edit.
- Alienatio and its **Aliene** action retire end to end. Expunctio contains no unit picker,
  selection mark, individual return, departure copy, or survivor-reflow animation.
- Expunctio remains the only Sectio disposal rule. At most once per visit, **Athetize** removes one
  eligible held card and every unit still attached to it for the existing fee: printed card value
  plus attached-unit value. His Grace remains ineligible.
- The Paid Crossing (`mercenary-boat`) and Fair Scales (`fair-scales`) retire. Their gameplay
  registry entries, craft support, installed drawable bindings, live media slots, and active-save
  references retire together. The gain transaction drawable retires; the loss mark remains.
- The lipsanon offer pool temporarily contains seven entries. Later conflicts may reveal fewer
  than three unseen choices after that smaller pool is exhausted. Replacement lipsana are a later
  design decision, not part of this retirement.
- RunSaveVersion 28 and migration 66 own the boundary. An open version-27 Sectio returns to its
  exact entry snapshot so no partial Alienatio, Adlectio, Expunctio, or dependent purchase survives
  under changed rules. Retired lipsana are removed from held, seen, offered, and paid records;
  Bona Vacantia offers are repaired from the active pool; the retired promotion cash-out runtime
  ledger is removed. Historical migration vocabulary remains immutable.

## Consequences

- The card the player buys continues to mean the formation it shows. Sectio presents one clear
  card-level removal decision rather than a card action and a nested unit action.
- Formation gaps can still communicate Battle losses without becoming an economy subsystem.
- Two completed lipsanon identities and one generated transaction mark remain archived as history
  but cannot appear in current catalogs or Runs.
- Existing in-progress Sectio transactions are deliberately rewound once during migration; this
  is safer and more legible than guessing how an edited formation should survive the rule change.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [Shared UI primitives](../shared-ui-primitives.md)
- [Runtime asset contract](../runtime-asset-contract.md)
