---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
refines: "[ADR-0071](0071-the-deliverable-is-the-instrument.md), [ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md), [ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md), and [ADR-0125](0125-predrawn-preparation-self-validates-before-generation.md)"
partially_supersedes: "[ADR-0141](0141-predrawn-generation-references-preserve-explicit-subterrain.md) unqualified all-active-surface inclusion and capture-edge clause"
---

# ADR-0142: An owner-authored frame defines the pre-drawn generation reference

## Context

The first canonical generation-reference capture fitted every non-background
pixel in the complete playable-plus-scenic visual surface and added equal
clearance around that result. That deterministic full-bounds export preserved all
authored pixels, but it also made the largest scenic footprint choose the
composition. The owner could author a deliberate scene in the Level Editor yet
could not choose the tighter, more useful view to hand to the image model.

A transient browser viewport is not sufficient authority. Its apparent crop
depends on pane dimensions, device-pixel ratio, local pan and zoom, and unsaved
browser state, so another preparation run cannot reproduce it from canonical
level data.

## Decision

Board data persists one versioned **pre-drawn generation frame**. The frame is a
screen-aligned 16:9 rectangle expressed in canonical projected-board coordinates
relative to the stable playable-board origin. It does not persist CSS pixels,
browser dimensions, device-pixel ratio, or raw transient ViewPane pan and zoom.

The Level Editor exposes this as an owner-operated framing instrument over the
shared board ViewPane. The owner positions and zooms the scene under the visible
16:9 frame and explicitly saves that view; the instrument converts the choice to
the canonical projected rectangle and previews the exact pixels that preparation
will capture. Changing ordinary editor camera state does not change the saved
frame. Only the frame in the canonical saved level is generation authority.

The frame is a presentation window over the canonical authored visual surface,
not another terrain surface or a content-deletion boundary:

- The complete playable outer envelope and every reference draw whose position or
  footprint is gameplay-authoritative in the semantic packet must lie fully
  inside the frame. This includes the required terrain, linear features,
  barriers, walls, props, footprints, and explicit Subterrain attached to that
  required geometry.
- Scenic-only terrain, props, and explicit Subterrain may be wholly outside the
  frame or clipped by it. Their canonical board data is unchanged; excluded
  pixels simply do not become appearance authority for that generation request.
- The source-frame rectangle never declares the playable perimeter, an outer
  envelope edge, a void, or a crop instruction for the generated result. The
  semantic packet remains the sole authority for gameplay boundaries.
- Inside the frame, ADR-0120 and ADR-0141 still apply: the one reference image
  owns appearance, every visible Subterrain face must be explicitly persisted and
  canonically exposed, and absence never synthesizes a skirt or cliff.

Preparation renders the canonical unit-free, ground-cover-free authored surface
through that exact saved frame. Decorative pixels may touch or cross a capture
edge by design; the former global all-alpha clearance test is replaced by
validation that the saved frame is finite, canonical, 16:9, and fully contains
all required gameplay-authoritative reference geometry. Missing, malformed, or
under-inclusive frame data fails closed. Preparation must not silently substitute
the complete paint bounds or the current browser viewport.

The normalized frame data, reference bytes, and their hashes are part of the
definition and request provenance. A frame change creates a new validated request
under ADR-0125. Once a valid canonical frame exists, deterministic preparation
still proceeds directly to `ready-for-generation`; the owner framing decision is
an authoring action, not a second approval checkpoint during preflight.

The generated output contract is unchanged. The model must produce one continuous
full-frame environment, may not treat the source crop edge as the board edge, and
may not return a hard-cropped board, black void, vignette, or floating plate.
Useful scenery and camera room in the generated candidate remain owner-reviewed
composition results under ADR-0123.

## Consequences

- The owner, rather than the largest scenic extent, chooses the composition handed
  to the image model.
- The same saved level always yields the same crop regardless of browser or
  screenshot environment.
- Scenic authoring may extend beyond the source crop without being deleted or
  accidentally promoted to gameplay geometry.
- Preparation gains a required persisted input and containment validation; old or
  incomplete levels must save a valid frame before they can become
  `ready-for-generation`.
- ADR-0141 is narrowed only at the selected frame boundary. Its explicit-only
  Subterrain topology and anti-synthesis rules remain authoritative everywhere
  the reference actually shows Subterrain.
