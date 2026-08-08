---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
restores:
  - "[ADR-0413](0413-royal-purple-belongs-to-praecipuus-not-starter-status.md)'s royal-purple frame for His Grace"
  - "[ADR-0414](0414-selected-starter-card-media-becomes-dedicated-runtime-identity.md)'s selected Praecipuus frame identity"
partially_supersedes:
  - "[ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md)'s Standard-frame-for-every-card rule"
refines:
  - "[ADR-0495](0495-rarity-colors-the-standard-frame-metalwork.md)'s frame-family rarity rule"
  - "[ADR-0506](0506-card-gold-groups-use-the-open-rail-divider.md)'s gold-tier band coin"
---

# ADR-0530: His Grace keeps royal purple, and a priceless coin is struck with a crown

## Context

Two separate things had left the starter card reading as an ordinary one.

**The frame.** ADR-0413 gave His Grace the owner-selected royal-purple Praecipuus frame, and
ADR-0414 promoted that frame to its own semantic slot and byte identity. ADR-0492 then retired
card properties wholesale and declared that all active cards use the Standard frame. Praecipuus
was a *card property*, so His Grace lost its purple as a side effect of that sweep rather than
as a decision anyone made about this card. The accepted raster was never retired: it has been
sitting active in the catalog, addressed by nothing.

**The coin.** Every card face carries a coin. A priced card strikes its price on it; His Grace,
which cannot be bought, struck it blank. A blank coin does not read as "this card has no price" —
it reads as a coin whose number failed to load. The same blank coin heads the starter band in
both card galleries, so the one card the player always holds was marked by an absence in three
places at once.

## Decision

- **The starter Chartulary takes the Praecipuus frame.** `runCardFrameSlot` resolves the
  royal-purple slot for a starter card and the Standard rarity table for every dealt one.
- Praecipuus is a frame family of exactly one card at one fixed rarity, so it owes no
  Common/Uncommon/Rare triplet. ADR-0495 forbids rarity *substituting* another family's
  material; nothing can ask this family for a material it lacks, because nothing but His Grace
  ever resolves it. Purple therefore cannot leak into a dealt Common card.
- **A coin that carries no price is struck with a crown**, in the numeral's own seat, at the
  numeral's own size. The coin remains the socket; the numeral and the crown are the two things
  that can be struck on it. His Grace is the King's own card, so the mark is his.
- The mark is one transparent native 64×64 raster in its own typed slot,
  `ui/run/card-prototypes/cost-crown-v1.png`, with the `run-card-cost-crown` runtime component.
  It never redraws the coin, so one raster serves every coin at every size.
- The mark's seat is a **square** measured against the whole drawn coin — `.75` of it, measured
  on the real coins at both sizes. The mark's own square raster is what positions it: the
  transparent margin the art carries *is* the layout, so a wide mark and a tall one both land
  correctly with no second rule. It is sized against the coin rather than the flat striking face
  because the face is where a *numeral* must stay — digits are tall and would ride the bevel —
  while a mark is drawn wide and low and reads better crossing onto the bevel than shrunk to
  clear it.
- The mark is **smoothly resampled, never `image-rendering: pixelated`**. It draws at roughly a
  sixth of its native size, and nearest-neighbour at that ratio is decimation: it drops most of
  the rows and shreds the silhouette into an illegible smear. `pixelated` is correct when pixel
  art is magnified and actively wrong when it is reduced this far. Two things had to be true
  together for the mark to read at all — its own canvas padding must not eat the seat, and the
  reduction must average rather than drop.
- Every surface that seats the coin reads one mark — the card face, both gallery band dividers,
  and the gold filter chips — so a starter band and the card beneath it cannot disagree.
- Resolution is **optional**. Until a mark is accepted, the coin prints exactly as it did
  before. An ornament under review can never take a screen down with it, and the mark stays
  outside the card face's image-readiness protocol for the same reason: it must not be able to
  hold a whole card unpresented.
- Candidates are reviewed on the real galleries at `?crownCandidate=<versionId>`, the same way
  the gold-tier divider is reviewed. Acceptance remains the owner's.

This changes no card data, price, rarity, deck, Klerosis, persistence schema, or database. No
migration is required, and no Run in progress is affected.

## Consequences

Purple again says what ADR-0413 decided it says: the King's exceptional authority, on the one
card that is never bought and never removed. The starter coin states its own rule instead of
looking like a failure to load, and it states it identically wherever the card is filed.

A future priceless card would take the same mark without new media. A future card that needs a
*different* mark costs one raster in the same slot family, not a second kind of ornament beside
the coin.

## More Information

- [ADR-0413](0413-royal-purple-belongs-to-praecipuus-not-starter-status.md)
- [ADR-0414](0414-selected-starter-card-media-becomes-dedicated-runtime-identity.md)
- [ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md)
- [ADR-0495](0495-rarity-colors-the-standard-frame-metalwork.md)
- [Runtime asset contract](../runtime-asset-contract.md)
