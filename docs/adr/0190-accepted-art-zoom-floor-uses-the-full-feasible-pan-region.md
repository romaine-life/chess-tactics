---
status: "accepted"
date: 2026-07-27
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)'s centered-floor clause"
refines:
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)"
partially_superseded_by:
  - "[ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)"
---

# ADR-0190: Accepted-art zoom floor uses the full feasible pan region

## Context and Problem Statement

ADR-0121 correctly separated zoom-floor calculation from current pan, but defined the stable floor
by requiring an asymmetrically registered painting to cover the viewport at board-centred pan.
That can make a board draggable across visible accepted overscan while refusing any wheel zoom-out:
the opening camera and the centered safety floor collapse to the same zoom even though the
viewport could fit inside the accepted painting at a nearby valid pan.

ADR-0189 separately defines the artistic opening shot from playable-board geometry. That opening
composition must not silently become a standard zoom-out limit.

## Decision

The artistic opening camera remains board-centred and contains the projected playable-board frame
plus its configured margin.

The accepted-art zoom-out floor is independently the smallest zoom at which the complete viewport
can fit **somewhere** inside the accepted transformed artwork polygon. There is no additional
standard or board-relative zoom-out restriction. Current pan does not participate in calculating
this stable floor.

The feasible pan region at a zoom is the accepted polygon eroded by the viewport rectangle. When
wheel, stepper, reset, or resize changes zoom and the current pan is outside that region, the
camera moves to the nearest valid pan before applying ordinary edge-constrained movement. Dragging
continues to stop at the first accepted-art boundary and never changes the zoom floor.

For symmetric art, this produces the same floor as ADR-0121. For asymmetric art, it exposes all
safe zoom-out room while continuing to prevent every viewport corner from leaving accepted pixels.

## Consequences

- Good: opening composition and maximum zoom-out are genuinely independent.
- Good: generated overscan remains explorable even when its registration is asymmetric.
- Good: mouse-wheel zoom no longer appears disabled merely because board-centred pan is invalid at
  the next otherwise-safe zoom.
- Good: black pixels remain impossible because every accepted zoom has at least one valid pan.
- Cost: zooming out near an asymmetric edge may slightly adjust pan to remain within accepted art.

## Migration

- Replace centered-origin floor feasibility with full feasible-pan-region testing.
- Teach zoom and resize reclamping to recover the nearest valid pan when the old pan is invalid at
  the new zoom.
- Add an asymmetric accepted-art regression where the board-relative opening remains unchanged but
  the true zoom-out floor is lower.

## More Information

- [ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)
- [ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)
- [Board render contract](../board-render-contract.md)
