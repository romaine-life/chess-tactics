---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0240](0240-run-self-inspection-owns-the-left-shell-workspace.md)"
  - "[ADR-0381](0381-shops-offer-read-only-intelligence-on-the-upcoming-battle.md)'s addition of View Battle"
---

# ADR-0230: Run shops separate buying, army inspection, and selling

## Context

The first Run shop placed a plain-text army list and every Sell action inside
the narrow right Controls panel. That made the current army difficult to
understand, turned inspection into an accidental prerequisite for discovering
selling, and gave the shop a unique control-rail role instead of using the
existing shell as shop-level navigation.

The persistent army is also meaningful outside shops. It should support future
generated names and kill-based ranks without making those future systems a
prerequisite for a legible first roster.

## Decision

- A shop has three explicit main-pane destinations: **Shop**, **Army**, and
  **Sell Units**. The existing right Controls panel contains persistent
  destination navigation plus **Reset Shop**, **Continue to next Battle**, and
  the existing Run-level actions. It does not render roster rows or Sell
  actions.
- **Army** is an exploratory ledger available in every Run phase. Its default
  view is a scrollable, filterable list ordered by piece type. Each persistent
  unit has a stable per-type number; a future generated name may become the
  primary label without replacing that identity. Selecting a row replaces the
  ledger with a full-pane profile, and Back restores the ledger scroll
  position, ordering, and filters.
- A unit profile exposes its portrait, piece identity, current status, value,
  abilities, and future-compatible rank/kill fields. Its Sell action remains in
  one stable place: enabled during a shop and visibly disabled with an
  explanatory tooltip outside a shop. Opening Army over an active Battle does
  not unmount or pause that Battle; a timed clock continues.
- **Sell Units** is a separate transactional list rather than a mode of the
  detailed Army ledger. Every row exposes the exact unit identity, abilities
  and applicable lipsanon-derived effects, base value, exact return, and Sell
  action. The retained King stays visible but disabled. A sold unit remains as
  a disabled **Sold this visit** row until the shop ends or resets.
- Applicable inherited effects appear beside the unit like other abilities.
  Hovering or focusing the effect icon uses the shared tooltip and identifies
  the granting lipsanon, for example Positioned inherited from Training Linens.
- Selling is immediate and has no confirmation dialog. Shop entry persists a
  complete transaction snapshot. **Reset Shop** restores army, gold, lipsanon
  choices, offers, sold rows, and relevant counters to that snapshot; it never
  rerolls offers. Reset remains present across all three shop destinations and
  is disabled until the shop differs from its entry state.
- Army and Sell filters remember independently while the player remains in one
  shop. The next shop begins with type ordering again. Resetting transactions
  does not reset those viewing preferences.

## Consequences

- Buying, inspecting, and selling each have an explicit task-oriented home.
- The right panel remains the same shell-owned Controls surface instead of
  becoming a cramped roster implementation.
- Immediate sales remain safe to explore because the entire shop visit can be
  restored deterministically without enabling offer rerolls.
- Stable unit identities and a full profile give generated names, ranks, and
  additional statistics a compatible future home.
