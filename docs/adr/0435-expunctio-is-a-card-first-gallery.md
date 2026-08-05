---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0030](0030-scrollbars-never-vanish.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
---

# ADR-0435: Expunctio is a card-first gallery

## Context

The first Expunctio player surface placed each canonical card face in a wide, fixed-height
ledger row beside its description, fee, and action. The face was too small to be the primary
record, its authored frame extended beyond the row boundary, and the list exposed a native
platform scrollbar instead of the application scrollbar. His Grace also printed a zero in its
gold socket everywhere, implying that the permanent card participated in ordinary card pricing
even though Expunctio correctly made it unavailable.

## Decision

- Expunctio presents held cards as a card-first gallery. At desktop widths the gallery uses two
  columns; each tile gives the canonical card face the leading, largest seat and arranges identity,
  attached-unit, fee, and action information beside it. A tile's height follows the complete card
  face rather than constraining the face to a fixed ledger-row height.
- Narrow widths reduce the gallery to one column without shrinking the card below a useful reading
  size. The card and its companion controls may stack only at the smallest supported width.
- The gallery scrolls through the shared `KitScroll` drawn rail. It never creates a native
  `overflow: auto` owner or exposes an operating-system scrollbar.
- His Grace retains the canonical gold coin artwork in its title socket but prints no zero numeral.
  The canonical card projection owns this exception, so every runtime and reference face, plus its
  accessible name, omits the misleading zero-price claim. Other cards continue to print their
  projected cost normally.

## Consequences

- The card itself is legible enough to explain the record before the supporting text is read, and
  its frame cannot bleed across a neighboring tile.
- More than one gallery row may require scrolling, but the always-present themed rail makes that
  capacity explicit and stable.
- His Grace still uses the same accepted coin and card-frame media as every other canonical face;
  this changes only the live numeral and cost wording.
