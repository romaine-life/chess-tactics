---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0218](0218-new-ui-surface-paint-is-build-blocked.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0445](0445-card-companions-align-to-painted-frame-keylines.md)"
partially_supersedes:
  - "[ADR-0445](0445-card-companions-align-to-painted-frame-keylines.md)'s repeated-heading anchor"
---

# ADR-0446: Expunctio tiles use shell surface and oak actions

## Context

The first card-first Expunctio gallery repeated each card name beside the complete
canonical face, spending vertical attention on text already printed prominently on
the card. Its inner-role tint also made each tile read as a separate dark overlay
rather than part of the installed shell, while the action shared that same dark
fill instead of the requested wooden control material.

The installed chrome family already owns both requested materials: the outer-role
surface is shared by the persistent title bar and Controls panel, and
`hybrid-wood-oak` is a registered named surface available beneath canonical frames.

## Decision

- Expunctio companion copy omits the repeated card name. The canonical card face
  remains the sole title owner; status, attached units, fee, and action remain. The
  surviving first line's visible ink inherits the painted top keyline.
- The tile keeps its canonical inner frame while an opt-in shared fill layer borrows
  the installed outer role. It therefore follows the same live surface selection,
  scale, and tint as the title bar and Controls panel without duplicating media CSS.
- Every Expunctio card action keeps the canonical inner text-button frame and uses
  the registered `hybrid-wood-oak` named surface beneath it.
- `InnerChromeBox` owns the optional fill-layer composition so another inner-framed
  consumer can reuse a role or named surface without constructing a local overlay.

## Consequences

- Tiles spend less vertical hierarchy on duplicate identity and read as part of the
  same shell as the persistent chrome.
- Re-skinning the installed outer role automatically re-skins these tile fills.
- The action's wooden material remains live-media-backed and surface-contract safe;
  no Expunctio-specific color, gradient, or texture is introduced.
