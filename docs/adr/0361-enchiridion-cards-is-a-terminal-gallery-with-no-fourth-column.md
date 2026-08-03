---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0262](0262-bundle-cards-are-scene-vignettes-with-authored-names-and-a-codex.md)'s Enchiridion selected-record presentation"
refines:
  - "[ADR-0254](0254-enchiridion-content-owns-the-remaining-menu-canvas.md)"
  - "[ADR-0030](0030-scrollbars-never-vanish.md)"
  - "[ADR-0313](0313-enchiridion-filters-cards-and-previews-affected-types.md)"
  - "[ADR-0314](0314-run-card-presentations-promote-atomically.md)"
---

# ADR-0361: Enchiridion Cards is a terminal gallery with no fourth column

## Context

ADR-0262 introduced the Cards reference as a text-row selector in the third
column and one selected card face in a fourth. Once the shared trading-card face
became the complete readable record, those rows repeated the card's title and
contents only to choose the same information again. The selector consumed a
whole column without contributing a distinct reference representation.

The Enchiridion already has the geometry needed to avoid that duplication.
ADR-0254 fixes the main rail and Enchiridion section rail as predecessor anchors,
then gives the terminal content column every remaining pixel through the normal
end gutter. A destination does not owe a fourth column merely because another
destination, such as Card Types, has a master-detail reason to mount one.

## Decision

- Cards deliberately mounts no fourth column. After the two canonical rail
  predecessors, its terminal third column consumes the complete remaining
  Enchiridion content rectangle under ADR-0254.
- The compact descriptive rows and separate selected-card detail are retired.
  The real shared `RunCard` faces are the browser records themselves.
- Cards fill each gallery row from left to right, then continue from top to
  bottom through one shared `KitScroll`. The gold and contained-unit filters stay
  pinned above that vertical scroll region. No horizontal or nested card-row
  scroll is introduced.
- Gold grouping remains visible through the shared numbered coin headings, and
  exact-gold plus contained-unit filters continue to intersect as ADR-0313
  requires.
- Main-menu `/enchiridion/cards/<card-id>` addresses remain valid. An addressed
  card is scrolled into view and marked in the gallery rather than copied into a
  detail column. The Battle-hosted Strategikon keeps equivalent ephemeral
  gallery focus without gaining main-menu routes.
- Every gallery item renders the same live-media-backed reference face used by
  the Run. ADR-0314's per-face atomic promotion still applies while the gallery
  is loading or a live asset changes.

## Consequences

- The complete remaining Enchiridion canvas contributes useful card-reading
  space instead of reserving a duplicate selector/detail pair.
- Players scan the deck with ordinary wheel direction and see several complete
  cards at once; there is only one drawn wooden scrollbar for the gallery.
- Individual card addresses remain useful for links, reload, and history without
  dictating a master-detail layout.
- Card Types remains a deliberate four-column master-detail destination under
  ADR-0315; this decision changes Cards only.
