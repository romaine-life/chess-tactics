---
status: superseded by ADR-0249
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0249](0249-strategikon-book-art-is-the-title-control.md)"
supersedes:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)'s labeled Strategikon action presentation"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0101](0101-title-bar-buttons-use-the-inner-box-role.md)"
---

# ADR-0233: Strategikon uses a divider-safe book control

## Context

Strategikon belongs in the Controls panel title band, but spelling out its name
requires a wide inner frame. Seating that frame at the ordinary titled-panel
inset crosses the title's riveted bottom divider, violating the shared chrome
topology and making an important navigation action look like panel copy.

Important navigation elsewhere uses compact icon-only controls whose accessible
name and hover information explain their destination. The installed Studio
Catalog glyph is already the canonical open illuminated codex.

## Decision

- The Controls title band opens Strategikon through one icon-only square
  navigation control using the installed open-codex glyph. The visible word
  **Strategikon** is removed from the control.
- The control consumes the registered inner tool-square chrome primitive. Its
  complete frame and hit target remain inside the wooden title band and clear
  the riveted bottom divider.
- In Battle, its accessible name is **Open Strategikon** and its hover title is
  **Strategikon — inspect battle references, the current army, and held
  relics.**
- While Strategikon is open, the same active control is named **Return to
  Battle** and its hover title explains that closing Strategikon does not leave
  the current fight.
- The route ownership, mounted-Battle behavior, reserved Controls column, and
  Strategikon contents established by ADR-0231 do not change.

## Consequences

- Strategikon reads as peer navigation rather than another labeled option.
- The title divider remains one uninterrupted structural boundary.
- Mouse and keyboard users can identify the unfamiliar book control without
  exposing a permanent text label.
