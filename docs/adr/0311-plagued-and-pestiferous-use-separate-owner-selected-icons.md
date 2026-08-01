---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0198](0198-run-relics-use-live-native-ui-icons.md)"
  - "[ADR-0306](0306-enchiridion-filters-cards-and-previews-affected-types.md)"
  - "[ADR-0310](0310-plagued-iconography-depicts-the-condition-not-a-chess-piece.md)"
---

# ADR-0311: Plagued and Pestiferous use separate owner-selected icons

## Context

The condition-first PixelLab review in ADR-0310 produced distinct symbols for
the unit ability and the card property that grants it. Reusing one visual role
for both would collapse two related but different game concepts back into an
ambiguous generic disease glyph.

## Decision

- PixelLab Option 03, the rot-eaten skull with rising miasma, is the selected
  **Plagued** Unit Ability icon. Its typed live slot is
  `ui/kit/icons/game/plagued.png` and its runtime component is
  `unit-ability-icon` with variant `plagued`.
- PixelLab Option 01, the broad cracked miasma skull, is the selected
  **Pestiferous** card-property icon. Its typed live slot is
  `ui/kit/icons/card-properties/pestiferous.png` and its runtime component is
  `card-property-icon` with variant `pestiferous`.
- Both selections remain native 64×64 transparent PNGs and use empty media alt
  text because their adjacent visible labels own the accessible names.
- The Enchiridion Abilities row consumes the Plagued role. The Pestiferous row
  in Card Types consumes the property role; other card-property rows retain the
  same reserved icon seat until their own icon decisions exist.
- Acceptance requires the exact selected bytes to be mounted together on the
  Studio mapping surface at the real 34px Enchiridion seats. Unselected review
  candidates are archived after the two selected versions are installed.

## Consequences

- Plagued communicates the unit's condition while Pestiferous remains a
  recognizable card-level property.
- Runtime code cannot silently substitute either selection for the other.
- Later card-property icons can fill the already aligned selector seats without
  changing the Card Types column geometry.
