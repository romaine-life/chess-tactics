---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
extends:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0332](0332-eight-run-lipsanon-icons-ship-the-approved-resized-pixels.md)"
  - "[ADR-0359](0359-run-card-text-is-centered-in-per-frame-boxes.md)"
---

# ADR-0360: Two Run card frames ship normalised to the shared card box

## Context

Every Run card frame is a 1060x1484 canvas stretched to the same 5:7 element, so
what a card's size *looks* like is whatever the frame paints inside that canvas.
Measuring all five showed they do not agree:

| frame | painted card | ratio |
| --- | --- | --- |
| standard, pestiferous, tactical | 1009x1402 | 1.389 |
| concinnous | 1009x1420 | 1.407 |
| hieratic | 1008x1427 | 1.416 |

Same width, different heights — so these are not one card at three scales but
three slightly different card shapes. Side by side in the Shop, Concinnous
renders about 6px taller than Standard and Hieratic about 9px, which the owner
noticed unprompted.

Two shapes cannot be made to render identically inside one fixed element by
moving or padding the canvas; only by changing the art. Regenerating Concinnous
at the target shape was tried first and returned a different card — thicker
borders, different rivet spacing, the lattice texture lost — so it was rejected
on sight. Resampling the existing frames to the shared box was reviewed at 5x
against the originals and accepted: the softening is invisible at card size.

Resampling is not native 1x, and ADR-0076 refuses it. That refusal is correct
and stayed in force: the accept was blocked until this decision existed.

## Decision

Concinnous and Hieratic ship resampled to the shared 1009x1402 painted card box
at (26,42) on the unchanged 1060x1484 canvas. Their `nativeEvidence` uses schema
`run-card-frame-normalised-production-exception-v1`, names this ADR, and
truthfully records `native1x=false` with `spatialResampling=true`.

The backend admits that schema only for these two semantic slots, only for the
exact uploaded bytes, only when the recorded source frame hash matches the frame
being normalised, only on the native 1060x1484 canvas, and only when the recorded
transform is `painted-card-box-normalise-lanczos-1009x1402` with the source
painted height it was measured from. Every other raster family, and any future
replacement bytes for these two slots, remain governed by the ordinary ADR-0076
native-1x gate.

Because the transform moves each frame's drawn plates, both frames' boxes are
remapped through the same affine and land with the bytes, so the geometry always
describes the pixels being served (ADR-0359).

## Consequences

- All five frames paint an identical 343x476 card at Studio size.
- Two frames are no longer native 1x, and say so in their own evidence rather
  than passing the gate silently.
- Re-generating either frame later restores the ordinary gate: the exception is
  pinned to these hashes and cannot travel to new bytes.
- The exception is narrow by construction. A third frame with a different card
  shape is a reason to fix the generation, not to widen this list.
