---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
supersedes: "[ADR-0117](0117-predrawn-scenes-own-a-viewport-cover-zoom-floor.md)"
---

# ADR-0121: Pre-drawn pan stops at the art boundary

## Context

ADR-0117 included current pan when deriving the viewport-cover zoom floor. As a
user approached a painted edge, the control responded by raising minimum zoom.
That coupled two independent camera controls and produced surprising zoom jumps
instead of simply ending the drag at the available art.

## Decision

The complete transformed source frame and centered live viewport derive one
stable pre-drawn zoom-out floor. Current pan does not participate in that floor.

The shared `ViewPane` constrains pan separately. A drag proceeds along its
requested path until the first point where another viewport corner would leave
the transformed art polygon, then stops exactly at that boundary. Zooming or
resizing clamps an existing pan back inside the same boundary; it never raises
minimum zoom in response to pan.

Editor, gameplay, wheel, buttons, shortcuts, reset, and resize use this one
zoom-and-pan contract. Ordinary tiled boards remain unchanged.

## Consequences

- Panning cannot manufacture a zoom jump.
- Every direction remains draggable until the actual available art ends.
- Zoom-out has one stable centered limit regardless of prior camera movement.
- Generated overscan directly determines useful pan travel.
