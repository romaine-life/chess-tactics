---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0002](0002-nine-slice-border-image-for-pixel-art-chrome.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0364](0364-cards-is-a-filterable-full-face-gallery.md)"
  - "[ADR-0371](0371-chartulary-is-the-held-card-gallery.md)"
---

# ADR-0506: Card gold groups use the open-rail divider

## Context

Cards and the Chartulary group their canonical card faces by live gold value. The group heading
was only the shared numbered cost coin, leaving a broad unowned strip above every card row. The
owner asked for visual punctuation there but explicitly rejected copy inside that space.

PixelLab generated an open circular coin cradle joined to two thin forged rails and a diamond end
cap. The owner reviewed the exact transparent result composited in the existing Cards gallery and
selected it. The generated source is 688×384, SHA-256
`230eab0e82646434ee603bbcb624a27d44dc3c4f81e2f68c2fa23ae1d0fb18c0`, PixelLab asset id
`e37879ee-c5a1-4f8c-81dc-5ac80424814c`.

## Decision

- `RunCardGoldTierDivider` is the one shared gold-group heading for both the Enchiridion Cards
  gallery and the Strategikon Chartulary. A gallery may not reproduce the ornament locally.
- The generated raster contains no label. The existing `RunCardCostCoin` remains a separate live
  child centered in its circular cradle, so the gold numeral and accessible currency name remain
  live UI rather than baked pixels.
- The exact generated PNG occupies
  `ui/run/card-prototypes/gold-tier-divider-v1.png` in live media. Git owns the renderer, prompt
  provenance, contracts, and tests, but no source, candidate, accepted pointer, or fallback bytes.
- The approved source remains byte-identical. Its transparent rows are clipped and its horizontal
  anatomy is composed as three source views: left cradle, stretchable undecorated rail span, and
  right end cap. The closed production presentation uses source slices
  `{top:138,right:56,bottom:139,left:132}`, a 38px draw height, a 47px left cap, and a 20px right
  cap. Only the middle rail span stretches.
- This presentation is an explicit, truthful exception to ADR-0076's normal native-1× gate. It is
  restricted to the exact slot, SHA, source dimensions, three-slice transform, and shared
  renderer named here; no other asset inherits permission to scale.
- Candidate review mounts the exact private bytes through that same renderer at
  `/enchiridion/cards?goldTierDividerReview=<version-id>`. The typed owner proof records the
  candidate SHA, slot snapshot, source geometry, slices, and draw geometry before standalone
  acceptance may move the live pointer.
- The exact already-accepted live-media evidence was written while this branch-local decision
  temporarily occupied number 0503. That evidence is immutable, so policy accepts that historical
  decision tag only on this exact slot and SHA; new evidence uses canonical `ADR-0506`. The legacy
  tag does not authorize another byte sequence, geometry, slot, or renderer.

## Consequences

- Every gold tier reads as one deliberate visual section while the card faces keep their existing
  order, size, and interaction.
- The empty rail remains ornament only; localization and accessibility never depend on generated
  lettering.
- Replacing the art requires another explicit decision because the backend accepts only the
  selected bytes and geometry.
- Browser resampling is limited to the documented source-to-draw presentation. The source itself
  is neither resized nor rewritten before live storage.
