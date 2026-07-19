---
status: "superseded by ADR-0123"
date: 2026-07-14
deciders: Nelson, Codex
superseded_by: "[ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md)"
---

# ADR-0118: Pre-drawn scenes generate a camera-overscan frame

## Context

ADR-0117 prevents the edge of a complete pre-drawn painting from entering the
board viewport by raising the zoom floor as the camera moves. A painting whose
frame only barely surrounds the registered playable grid is therefore safe but
has almost no useful pan travel until the user zooms far in.

Increasing pixel dimensions without changing the composition does not solve the
problem. Registration maps the painted grid back to the same canonical board
geometry, so a higher-resolution image with the same grid-to-frame ratio has the
same camera envelope.

## Decision

A pre-drawn generation packet owns a **camera-overscan frame** outside the exact
playable perimeter. The generated painting remains a 16:9 full scene, but the
registered grid and its immediate boundary occupy the centered 60% of the frame
in each screen axis. The outer 20% on every edge is continuous, meaningful world
art rather than padding, a vignette, a repeated texture, or disposable crop
allowance.

Exploratory and production prompts request an exact 3840 by 2160 pixel frame.
This is both the authored native frame and the composition target; a smaller
generation may be used only as an explicitly non-production composition study.
The grid geometry guide remains authoritative and is framed inside the same
central safe area before generation. The generator may not enlarge, compact, or
otherwise reshape the grid to fill the additional canvas.

Review measures the result after registration in the real `ViewPane`. At the
centered viewport-cover zoom floor, the owner must be able to pan in all four
screen directions while the complete transformed painting still covers the
viewport. ADR-0117 remains the safety authority: it may raise zoom as the camera
approaches an edge, but it is not a substitute for authored overscan.

## Consequences

- Normal zoom begins with explorable world beyond the playable board instead of
  a composition already pressed against the viewport.
- Pixel resolution and camera room are treated as separate requirements.
- The generation guide and finished scene use the same framing contract, so
  adding canvas cannot silently change board projection or cell scale.
- Existing narrow-frame candidates remain calibration references but must be
  regenerated with overscan before production acceptance.
