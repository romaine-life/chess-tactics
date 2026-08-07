---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s nine-material exclusion and seven authored-exception count"
---

# ADR-0502: Queen and Pawn receive the complete connected set

## Context

ADR-0493 bounded generated rosters at nine material, then retained Queen behind Pawn as one
authored exception. That produced only one Queen + Pawn formation while Knight + Pawn, Bishop +
Pawn, and Rook + Pawn each received every legal connected two-cell arrangement. The lone
exception accidentally made the Queen's protected arrangement look privileged and omitted the
deliberately awkward Queen-forward and side-by-side cards that make formation position legible.

The hidden Sectio sequence is derived from the master catalog, Run seed, and cursor. Expanding the
catalog therefore changes the meaning of a persisted cursor even though the stored JSON fields do
not otherwise change.

## Decision

Queen + Pawn is the one roster allowed to exceed the ordinary nine-material generated-card bound.
It receives all six connected two-cell formations in the two-row band: either unit may occupy the
front seat of the vertical domino, and either may stand left or right on each of the front and back
horizontal rows. Front/back and left/right remain distinct.

The existing `pq-front` identity remains the named Pawn-front/Queen-back card and replaces its
equivalent generated identity. The other five arrangements use generated identities. All six are
Rare and cost ten gold. During the shared-art prototype they use the accepted Queen illustration;
their exact miniature-board diagrams remain the rules authority.

The generated core increases from 714 to **720 cards**. Because `pq-front` is now inside the
generated grammar, the separately added authored exceptions decrease from seven to six. The offer
catalog therefore increases from 721 to **726 cards**, or **727 referenceable cards** including His
Grace. Its rarity inventory becomes 197 Common, 415 Uncommon, and **114 Rare**. The hidden 180-card
pile still contains exactly 135 Common, 36 Uncommon, and 9 Rare cards.

RunSaveVersion advances to 27. Browser migration and append-only database migration 65 preserve
held cards, visible offers, army, economy, phase, and Deployment state while explicitly resetting
`sectioCardCursor` to zero. The next future Sectio sequence therefore begins honestly against the
expanded catalog instead of silently reinterpreting an old cursor.

## Consequences

- Queen + Pawn now follows the same positional completeness players can infer from the other
  single-piece + Pawn pairs.
- Awkward Queen-forward and side-by-side arrangements remain real offers rather than curated-out
  mistakes.
- The rare inventory grows by five cards without changing the visible 5% Rare quota.
- Existing visible and owned card identity survives the migration; only unrevealed future order
  restarts.

## More Information

- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)
- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
