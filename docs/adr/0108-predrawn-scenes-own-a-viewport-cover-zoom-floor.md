---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
---

# ADR-0108: Pre-drawn scenes own a viewport-cover zoom floor

## Context

A complete pre-drawn level is generated as full-scene art, not merely as the
playable grid. The ordinary fixed board zoom floor can shrink that painting
until the world backdrop becomes visible around it, defeating the continuous
scene. A hardcoded replacement percentage would fail across viewport sizes,
registered perspective corrections, and owner-authored framing.

## Decision

When a pre-drawn plate is active, the canonical `ViewPane` derives its effective
minimum zoom from the actual viewport and the transformed convex boundary of the
complete source frame. The boundary is the full generated painting after its
saved board homography, not the playable-grid diamond. The calculation includes
the current screen-space pan and rounds upward to the zoom precision exposed by
the controls, so rounding cannot reveal a background seam.

The derived floor replaces the ordinary zoom floor only while the pre-drawn
surface is mounted. Wheel zoom, Level Editor buttons, gameplay shortcuts, the
HUD stepper, and reset all consume the same resolved floor. If coverage needs a
zoom above the ordinary gameplay cap, that cap rises to the coverage floor; it
must not force the scene back below coverage. Ordinary tiled boards keep their
existing zoom range.

## Consequences

- Zooming out stops at the first scale where the complete painting covers the
  board viewport.
- Editor and gameplay cannot disagree about the lowest valid scene scale.
- Resizing the browser recomputes the floor from geometry instead of preserving
  a stale percentage.
- The playable grid remains unchanged; this is camera composition only.
