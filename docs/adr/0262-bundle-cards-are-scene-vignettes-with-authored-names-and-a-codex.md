---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
extends:
  - 0225-run-bundle-cards-show-every-board-unit.md
  - 0247-run-unit-profiles-use-persistent-tile-backed-board-scenes.md
  - 0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md
refines:
  - 0256-individual-relics-are-routable-from-the-main-menu-enchiridion.md
partially_superseded_by:
  - 0280-unit-card-art-uses-dedicated-database-prompt-plans.md
---

# ADR-0262: Bundle cards are scene vignettes with authored names and a codex

## Context

ADR-0225 put every bundle unit on the card as its installed board sprite, but the
card remained a flat sprite grid over chrome — a rectangle, not a card. The owner
asked for cards that read as cards: scene artwork with the units standing on a
battlefield, evocative authored names, trading-card proportions, and an
Enchiridion record of every card in the game. The repository already owns the
canonical pieces of that scene: the shared read-only board renderer, live terrain
and prop catalogs, seeded ground cover (ADR-0247), and a generated 49-bundle deck.

## Decision

- A bundle card's artwork is a deterministic battlefield vignette: a 3×3
  walkable-terrain mini-board (with a render-only scenic apron so every window
  crop is full-bleed field) carrying the bundle's units on formation seats,
  seeded ground cover, and optional live props. A card's identity is its piece
  composition: every carrier of the same pieces — draft offer, shop bundle,
  Enchiridion record, review fixture — resolves to one canonical card id, which
  is the only seed input, so the same card shows the same scene and name
  everywhere. ADR-0225 continues to hold: every piece renders once with its
  canonical installed board sprite through the shared renderer. The
  highest-value piece anchors the centre seat.
- The card face is portrait (5:7): scene window on top, then a name plate, then
  the gold/action footer. It remains one registered inner-chrome whole-card
  action; a `reference` mode mounts the identical face without an action for
  reference hosts.
- Every deck bundle carries a unique authored banner name (e.g. the lone Queen
  is “Regal Serenity”), recorded per bundle id and enforced by test. Bundles
  outside the deck read as their prose contents.
- The Enchiridion gains a Cards section: the full deck grouped by gold value, one
  selected record described by its exact card face. Selection follows the relic
  transport rules — the main menu addresses `/enchiridion/cards/<bundle-id>`
  (an address-only update inside one retained scene, as ADR-0256 gave relics);
  the Battle-hosted Strategikon keeps ephemeral selection. One shared
  `ReferenceTrigger` carries both codices' entries.
- The scene plan is the future art-generation source: an enriched restyle of the
  same vignette may later back the scene window as installed live media, with the
  units still drawn on top by the runtime. Terrain, cover, prop, and unit pixels
  stay live-storage-backed; the card persists nothing.

## Consequences

- Draft, shop, art-review, and Enchiridion all deal one card component from one
  module, so a face change lands everywhere at once.
- Card scenes vary across the deck but never per viewing, and catalog art updates
  flow into every existing card without invalidating a seed.
- Players can audit the complete purchasable deck, by name, before ever meeting a
  shop.
- The formation seats hold at the deck's 9-piece maximum; a future larger bundle
  would need a larger stage, not a new card anatomy.
