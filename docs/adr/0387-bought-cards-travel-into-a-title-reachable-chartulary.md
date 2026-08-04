---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0322](0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s persistent Purchased marker"
  - "[ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)'s requirement that a bought offer remain in the Shop"
refines:
  - "[ADR-0250](0250-strategikon-book-aligns-to-the-controls-content-boundary.md)"
  - "[ADR-0335](0335-the-strategikon-is-a-run-wide-reference-not-a-battle-only-workspace.md)"
  - "[ADR-0371](0371-the-chartulary-is-the-held-half-of-the-cards-reference.md)"
  - "[ADR-0043](0043-ui-motion-system.md)"
  - "[ADR-0385](0385-scene-crossing-visuals-use-the-directors-continuity-layer.md)"
refined_by:
  - "[ADR-0388](0388-remaining-shop-cards-settle-into-their-new-seats.md)"
  - "[ADR-0389](0389-the-title-route-names-the-visible-strategikon-address.md)"
---

# ADR-0387: Bought cards travel into a title-reachable Chartulary

## Context

A Shop purchase changed gold, army, and the held-card register, but the card stayed in its Shop
seat under a **Purchased** label. The feedback said that a transaction completed and did not say
where the card now lived. The Chartulary existed, but it was behind the unfamiliar Strategikon
book and then behind a second rail choice, so there was no visible destination for a transfer.

The Strategikon rail already has the complete destination inventory and the accepted marks for
Enchiridion, the Martial Prosopography, the Chartulary, and the Lipsanotheca. Making a second
Chartulary-only deck icon would give one destination two identities and leave the other three
registers unnecessarily indirect.

## Decision

- The Controls title displays the four compact Strategikon destination marks immediately beside
  the existing book. Each mark directly opens its section; the book remains the rightmost mark,
  keeps its visible-edge alignment to the Controls content boundary, and still toggles the whole
  workspace. The complete section rail remains inside Strategikon.
- The title shortcuts and the full rail read one shared destination inventory. A label, hover
  title, route, or installed mark cannot drift between the two hosts. The Chartulary shortcut is
  also the real DOM destination for card transfer; there is no separate deck glyph or guessed
  coordinate.
- Buying a card launches the canonical `RunCard` face from its measured Shop seat to the measured
  Chartulary shortcut. It follows one straight centre-to-centre segment and shrinks until it fits
  inside the mark. The typed shared-element contribution travels in the director-owned continuity
  layer, escaping the Shop scroller and shell clipping without granting feature-owned portal authority.
- The purchase commits when the transfer lands. The source seat remains in layout but is visually
  absent during travel, preventing the remaining offers from jumping under it; the Shop and its
  phase controls are inert for that beat. If either endpoint cannot be measured, the transaction
  commits immediately rather than failing on presentation.
- Once committed, the bought offer leaves the Shop. Its durable home is `RunDocument.cards` and
  the Chartulary; Reset Shop restores the entry snapshot and therefore restores every bought offer
  exactly as before. The old permanent **Purchased** box is retired. A polite live announcement
  names the acquired card and its destination, and an exhausted deal says that every offered card
  is in the Chartulary.
- Card travel uses the functional-transfer duration token (`560ms`, matching the established
  lipsanon transfer beat) with the shared motion easings. Like that transfer, it remains one
  functional straight slide when Windows reports reduced motion: there is no arc, bounce, spin,
  parallax, or decorative loop to remove, and silently teleporting the card would erase the
  feedback that says where it went.

## Consequences

- A purchase explains both that a card was acquired and where the player can inspect it.
- Every Strategikon register is one click from the persistent Controls title in every Run phase,
  while the larger workspace rail retains its reading and wayfinding role.
- The Shop no longer spends permanent space repeating cards already held. Reset remains the
  repeatable purchase/animation instrument on the exact live surface.
- The purchase transaction waits one bounded presentation beat; the watchdog and geometry
  fallback prevent a backgrounded tab or missing endpoint from losing the action.

## More Information

- [Game concept](../game-concept.md)
- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
