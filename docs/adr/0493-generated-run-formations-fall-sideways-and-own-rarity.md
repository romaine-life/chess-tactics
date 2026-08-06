---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md)'s bounded nineteen-card deck, random legal translation, Standard-only frame, and tabled rarity"
---

# ADR-0493: Generated Run formations fall sideways and own rarity

## Context

The nineteen-card formation prototype proved that a card can communicate an exact
deployment shape, but it made the shapes look exceptional without giving the player a
system to learn. The intended system is closer to a small falling-piece game: cards carry
compact formations, combat order matters, and already-played formations physically constrain
the cards that follow. Authoring only the most obviously useful chess relationships hides
that system and removes the silly or awkward cards that make a large pool legible as a pool.

Producing dedicated names and illustrations for every formation would block gameplay
iteration. The accepted forty-nine composition illustrations already cover every generated
composition in the current material bound and can be shared while formation-specific art is
authored later.

Material price also failed as a rarity proxy. Pawn-heavy cards may cost a great deal without
being desirable, while an opposite-color Bishop pair is unusually efficient at six gold.
Rarity must therefore be explicit card data and must describe desirability rather than price.

## Decision

The offer deck has a deterministic **714-card generated core**. It enumerates every
edge-connected footprint of one through four occupied cells in a two-row, four-column band,
normalizes horizontal translation, preserves front/back row, and treats left/right mirrors as
distinct. Every occupied cell receives a Pawn, Knight, Bishop, Rook, or Queen; assignments over
nine material are excluded and repeated units are indistinguishable. This produces 10
single-unit, 45 two-unit, 252 three-unit, and 407 four-unit cards.

Seven existing authored formations remain as explicit exceptions because they preserve already
held card identity or a deliberately useful chess primitive outside that grammar: the protected
and reversed Pawn triangles for Knight and Bishop, the diagonal Bishop pair, Queen behind Pawn,
and the vertical Rook pair. The active offer deck therefore contains **721 cards**; His Grace
remains the separate non-removable starter, making 722 referenceable cards.

Generated cards own stable ids, ordered piece seats, exact cells, material value, rarity, and a
temporary composition-art id. Existing accepted composition artwork, title, and flavor may be
shared by every formation with that roster. Shared presentation is deliberate prototype debt,
not missing content, and never changes the exact formation diagram. The diagram always prints
both deployment rows, including an empty row, so front and back singleton cards remain visibly
different.

Every offer card owns one of three rarities:

- **Common** uses the Standard frame. Pawn-only cards, a single minor piece with Pawns, ordinary
  single pieces, and same-color Bishop pairs begin here.
- **Uncommon** uses the accepted white Concinnous frame. A Rook or two non-Pawn pieces begins
  here unless a stronger rule applies.
- **Rare** uses the accepted forged-steel Hieratic frame. Any Queen, two Rooks, three or more
  non-Pawn pieces, or formation containing two Bishops on opposite-colored cells is Rare.

The Bishop test uses board parity: their `(x + y) % 2` values differ. It applies to every card
containing such a pair, not only the bare two-Bishop composition. Price remains the sum of the
units' material and never changes with rarity.

Sectio rolls rarity before identity: 75% Common, 20% Uncommon, and 5% Rare per offer seat, then
chooses a distinct seeded card from that tier. The opening applies the same roll while limiting
candidates to the eight starting gold. If a requested tier has no eligible unused card, the
draw falls back to the complete eligible pool rather than leaving a seat empty.
The generated and retained pool contains 197 Common, 415 Uncommon, and 109 Rare cards; those
inventory counts never replace the explicit 75/20/5 appearance rate.

Formation `y = 0` is the front deployment row and `y = 1` is the row behind it. A card enters
the two-row deployment band from the right and advances left as one rigid piece until its next
translation would collide with terrain, authored occupancy, or an already-settled card. This
fills the band left-to-right while preserving holes and overhangs created by earlier shapes.
The visible arrival slides from the same side instead of using the ordinary vertical unit drop.

If a complete shape cannot enter, the existing utilitarian recovery remains: seats try their
authored row from left to right, then any remaining legal deployment cell. Units for which no
cell remains are blocked. This fallback is deterministic and intentionally secondary to getting
the first complete Run playable.

RunSaveVersion advances to 25. A version-24 Run in Deployment or Battle returns to the empty
Deployment deal boundary so no persisted random formation plan survives into sideways settling.
All held cards and their stable seats remain intact.

## Consequences

- The complete combinatorial card system is playable before dedicated art or naming is complete.
- The exact formation diagram, not the shared illustration, remains rules authority.
- Weak and awkward cards are ordinary members of the pool rather than omissions.
- Rarity is learnable from one frame language and can be rebalanced independently of prices or
  the number of cards in each tier.
- Deployment order now produces deterministic spatial consequences. Rerolling Deployment still
  matters because it changes the dealt card order.
- The complete catalog is large enough that reference and Studio surfaces may need additional
  filtering or windowing as a presentation follow-up; that does not reduce the live deck.

## More Information

- [ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md)
- [Game concept](../game-concept.md)
- [ADR-0282](0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md)
