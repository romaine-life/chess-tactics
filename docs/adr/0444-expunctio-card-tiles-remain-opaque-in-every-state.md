---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0218](0218-new-ui-surface-paint-is-build-blocked.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
---

# ADR-0444: Expunctio card tiles remain opaque in every state

## Context

The card-first Expunctio gallery initially reduced an entire tile to 72% opacity whenever its
action was unavailable, unaffordable, spent, or already completed. Because opacity composites the
complete subtree as one layer, the treatment faded both the canonical card pixels and the shared
inner-chrome frame over the market scene. His Grace consequently appeared translucent even though
its unavailable status was already stated in copy and by its disabled action.

Availability is transaction state, not a change to the physical card or its authored art. A card
must remain a solid primary record while the surrounding controls explain whether the player can
act on it.

## Decision

- Every Expunctio tile retains full opacity in every transaction state: available, unavailable,
  unaffordable, spent, and completed.
- The canonical card face and shared `InnerChromeBox` remain the sole visual surfaces. Expunctio
  does not add a local background fill or fabricate another panel treatment to restore solidity.
- Status copy, price presentation, and the canonical disabled `ChromeButton` communicate why an
  action cannot be taken. Whole-tile opacity is not a status channel.

## Consequences

- Authored card art and chrome no longer reveal the market scene through a disabled-state fade.
- Unavailable cards remain fully legible for comparison with actionable cards.
- Disabled-action semantics remain unchanged and require no model or persistence migration.
