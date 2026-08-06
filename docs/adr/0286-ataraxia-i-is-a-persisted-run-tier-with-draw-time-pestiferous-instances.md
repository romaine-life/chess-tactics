---
status: superseded by ADR-0492
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)"
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s Cacochymic unit-state name"
extends:
  - 0266-ataraxia-names-optional-run-difficulty-after-real-history.md
  - 0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md
  - 0271-core-cards-become-affected-when-drawn.md
partially_supersedes:
  - "[ADR-0269](0269-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)'s deferred prevalence algorithm and tuning-instrument clauses"
  - "[ADR-0271](0271-core-cards-become-affected-when-drawn.md)'s deferred affected-offer persistence shape"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)'s single semantic frame-slot clause"
---

# ADR-0286: Ataraxia I is a persisted Run tier with draw-time Pestiferous instances

## Context

The Great Mortality, Pestiferous card lifecycle, cumulative Ataraxia ladder,
one-in-eight prevalence target, and draw-time affected-instance rule are already
accepted. The live Run still started without a difficulty choice, purchased loose
army units from core bundle ids, and had nowhere to retain cross-Run unlocks,
affected offers, card membership, or deterministic attrition. ADR-0269 deliberately
left the exact prevalence algorithm pending an owner-operable instrument.

## Decision

- Run progression is a monotonic account-and-browser document whose
  `highestCompletedAtaraxiaTier` begins at `-1`. Completing tier `N` records at
  least `N`; therefore completing the baseline tier `0` unlocks **Ataraxia I**.
  The account copy lives in the owner-scoped `run_progression` relation introduced
  by migration 49, and offline/browser progress merges with it by numeric maximum.
- A new Run stores its selected `ataraxiaTier`. The installed selector exposes only
  tiers whose mechanics exist; future Ataraxia completion can remain recorded until
  its next tier is installed.
- Under Ataraxia I, every ordinary shop offer independently receives a seeded
  `1 / 8` Pestiferous roll when its core identity enters a particular shop slot.
  The seed binds the Run, Battle, slot, and core identity. The resulting offer id,
  complete pieces, cost, type, and effect seed are persisted in shop state, so
  reload, navigation, and Reset Shop cannot reroll it.
- Buying promotes that exact offer to one owned card record. A Pestiferous card
  marks every acquired unit **Plagued**, uses ADR-0265's per-piece discount, and
  retains membership independently from the flat army projection used by existing
  deployment and inspection systems.
- The committed Battle-victory transition resolves attrition before opening the
  shop or final-victory summary. Every owned nonempty Pestiferous card independently
  selects one remaining member from its persisted effect seed and Battle index,
  removes that unit from the army and card, records the exact loss, and retains the
  card when empty. Retry never reaches this transition and therefore never rerolls
  or duplicates attrition.
- Card Layout is the owner instrument for prevalence. It exposes a denominator
  control, a deterministic 64-draw realized sample, the authoritative `1 / 8`
  reset, and includes those values in the copied handoff. Runtime continues to use
  the authoritative denominator rather than an unsaved preview value.
- Standard and Pestiferous cards keep the same `RunCardFace` anatomy and accepted
  layout tuning but resolve different semantic frame slots. Ordinary cards use
  `ui/run/card-prototypes/frame-v1.png`; Pestiferous instances use
  `ui/run/card-prototypes/pestiferous-frame-v1.png`. The Pestiferous slot requires
  typed variant metadata, preventing its black bubbling-crude treatment from
  silently replacing the ordinary frame.

## Consequences

- Good: No Ataraxia remains clean, while the second difficulty choice now changes
  actual shop, persistence, price, army inspection, and Battle advancement state.
- Good: affected offers and losses are reload-stable facts, not UI-only labels or
  random rolls performed after commitment.
- Good: the exact prevalence can be inspected and compared without editing code.
- Cost: active Run format 5 owns card membership beside the army projection until
  a later accepted deployment-draw design makes cards the direct Battle input.
- Cost: the account progression relation must reach `main` and be applied through
  the repository's coordinated migration workflow before signed-in cross-device
  unlock sync is available.

## More Information

- [Game concept](../game-concept.md)
- [Persistence contract](../persistence.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0269](0269-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)
- [ADR-0271](0271-core-cards-become-affected-when-drawn.md)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
