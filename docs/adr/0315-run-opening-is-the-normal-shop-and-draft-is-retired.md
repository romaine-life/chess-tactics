---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0317](0317-run-shops-allow-every-affordable-card-purchase.md)'s multi-card shared Shop transaction and format-10 purchase state"
  - "[ADR-0316](0316-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s format-9 card vocabulary, two-Pawn army, eight-gold budget, and purchase feedback"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s separate opening-draft phase"
  - "[ADR-0237](0237-run-destinations-fill-the-shell-workspace.md)'s Opening draft destination"
  - "[ADR-0313](0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)'s opening-specific one-step purchase transaction"
  - "[ADR-0314](0314-run-openings-begin-with-only-the-permanent-king.md)'s draft-phase normalization"
extends:
  - 0230-run-shops-separate-buying-army-inspection-and-selling.md
  - 0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md
  - 0314-run-openings-begin-with-only-the-permanent-king.md
---

# ADR-0315: Run opening is the normal Shop and draft is retired

## Context and Problem Statement

The nine-gold opening used the normal card face and purchase language but lived
on a separate Muster screen. Buying a card immediately changed the Run to
Deployment, unlike a later Shop purchase, which stays visibly purchased until
the player explicitly continues. The owner requires the opening to be the real
Shop, not a parallel screen that imitates one.

## Decision Drivers

- One purchase concept must have one state machine and one player-facing screen.
- Buying a card must never implicitly enter a Level.
- Opening purchases need the normal purchased state, Reset Shop transaction,
  Army/Sell inspection, and explicit Continue action.
- Retiring the parallel path must satisfy the repository migration policy.

## Considered Options

- Keep Muster and add a local Continue button.
- Restyle Muster to resemble Shop more closely.
- Represent the opening as the normal Shop and delete Muster/draft end to end.

## Decision Outcome

Chosen: **a fresh Run begins in the normal Shop with `kind: opening`; the
separate draft phase and screen are retired.**

- Active Run format 8 begins in phase `shop`. Its `RunShopState` is the same
  transaction used after Battles and is distinguished only by `kind: opening`.
- The opening Shop starts with the permanent King, 9 gold, and the three seeded
  distinct-valued standard Units offers governed by ADR-0313/0305.
- `buyBundle` performs the opening purchase. The Shop stays mounted, marks the
  card purchased, updates Army/cards/gold, supports Sell Units and Reset Shop,
  and disables the other bundle cards exactly like a later Shop.
- Continue is disabled before an opening card is bought. After purchase, the
  explicit **Continue to first Battle** action enters Deployment without
  incrementing `battleIndex`; later Shops retain **Continue to next Battle** and
  their existing increment behavior.
- Opening Shop offers never receive Ataraxia shop effects, victory gold, Loot,
  or paid-relic offers. Its displayed context is Starting gold rather than a
  fake Victory reward.
- `DraftPanel`, the `draft` Run phase, `DraftOffer`, `draftOffers`,
  `chosenDraftId`, `chooseDraft`, draft-mode card behavior, and their UI/test
  inventory are deleted. Historical committed units tagged with source `draft`
  normalize to source `shop`; format-8 writes containing retired draft fields
  or unit sources are rejected.
- Per `docs/migration-policy.md`, draft-phase documents are unsupported rather
  than adapted through a compatibility screen or fallback. Older committed
  Runs already in Deployment, Battle, post-Battle Shop, or Victory may still
  normalize their unrelated historical fields to the current format; retired
  draft fields are removed from those committed documents.

### Consequences

- Good: opening and later purchases now share one real transaction and UI.
- Good: buying never navigates; only the explicit Continue action enters a
  Level.
- Good: Reset and inspection behavior no longer need an opening-only copy.
- Good: the retired Muster surface cannot drift from Shop again.
- Cost: an unfinished Run saved in the retired draft phase is no longer
  resumable and must be started again.
- Cost: the shared Shop model carries a small `kind` distinction so Continue
  advances to Battle 0 for the opening and to the next index after a victory.

## More Information

- [Migration policy](../migration-policy.md)
- [Persistence](../persistence.md)
- [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)
- [ADR-0313](0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)
- [ADR-0314](0314-run-openings-begin-with-only-the-permanent-king.md)
