---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0338](0338-a-crafted-run-is-composed-from-real-transitions-not-authored-state.md)'s craftable opening Sectio"
  - "[ADR-0371](0371-the-chartulary-is-the-held-half-of-the-cards-reference.md)'s opening-Sectio acquisition of crafted held cards"
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s opening Shop"
  - "[ADR-0322](0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s opening card offers"
  - "[ADR-0347](0347-opening-shop-purchases-are-optional.md)'s opening-Shop transaction"
  - "[ADR-0368](0368-conflicts-open-with-bona-vacantia-instead-of-closing-with-loot.md)'s opening Bona-Vacantia-to-Sectio handoff"
  - "[ADR-0481](0481-sectio-offers-reveal-the-face-down-pile-beneath-them.md)'s no-hidden-gameplay-stock clause"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s independent per-seat rarity rolls and affordable opening deal"
---

# ADR-0494: Runs begin in Battle and Sectio deals a derived rarity pile

## Context

The opening Sectio asks a new player to evaluate a large generated card system before playing
one move. The first Battle already has a complete, legible starter formation in His Grace. It is
a better introduction to play that simple Battle, earn its reward, and only then meet the card
economy.

Independent 75/20/5 rolls at every offer seat make rarity rates correct only over a long sample.
They do not give a Run a physical deck-like identity, and they can leave much of the 721-card
catalog unseen indefinitely. The player should not need to inspect that catalog or a disclosed
market manifest before making the first decision.

## Decision

A new Run begins at Battle 1's Deployment. If the opening Conflict grants Bona Vacantia, the
Run begins on that choice and taking one lipsanon proceeds directly to Deployment; a War with no
opening lipsanon begins in Deployment immediately. There is no opening Sectio, offer row, or
Adlectio. His Grace, its King and two Pawns, and the existing eight starting gold remain.

Each Run owns a hidden, seed-derived **180-card Sectio pile**. Every pile contains exactly:

- 135 Common cards;
- 36 Uncommon cards; and
- 9 Rare cards.

Those quotas are the exact 75/20/5 distribution. Each rarity has its own deterministic shuffled
queue over the master catalog. Building a pile consumes that rarity's quota from the queue; if a
queue reaches its end, every remaining unseen identity enters the pile before a new shuffled pass
fills the rest. The three selected rarity groups are then shuffled together into the hidden pile.
Natural rarity streaks are accepted and are not smoothed.

Sectio reveals the next three cards and advances the pile cursor by three. Quartermaster's Ledger
reveals and consumes four instead. Offer rows never repeat a card identity, including when a row
crosses the boundary between two 180-card piles. When a pile is exhausted, the next derived pile
continues the per-rarity unseen queues before recycling identities.

Only the non-negative `sectioCardCursor` is persisted. Pile membership and order are derived from
the Run seed and cursor, so reload, account adoption, and cross-device resume preserve the exact
future without storing a 180-card manifest. Reset Sectio restores transactions while retaining the
same revealed row and cursor; it is not a redraw. There is no discard-to-see-next action.

RunSaveVersion advances to 26. Browser migration and append-only database migration 64 add cursor
zero to version-25 Runs. A version-25 opening Sectio preserves completed economy, army, card, and
lipsanon transactions but enters Battle 1's Deployment and removes the obsolete Sectio. An
in-progress post-Battle Sectio keeps its exact visible offers, drops only its obsolete `kind`
marker, and begins the new hidden sequence at cursor zero after that visit.

## Consequences

- The first playable decision is chess deployment and combat, not catalog evaluation.
- Every 180-card block has an exact, easily reasoned-about rarity budget while its visible rows
  retain shuffled surprise.
- A sufficiently long Run sees every identity in each rarity before that rarity recycles, without
  exposing a market list the player would feel obliged to study.
- Quartermaster's Ledger has one deterministic meaning: it consumes one additional pile card per
  Sectio.
- First-Battle reward tuning remains level work and is not coupled to this persistence change.

## More Information

- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [ADR-0481](0481-sectio-offers-reveal-the-face-down-pile-beneath-them.md)
- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
