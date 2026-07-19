---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
supersedes: "[ADR-0118](0118-predrawn-scenes-generate-a-camera-overscan-frame.md)"
partially_supersedes: "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md), [ADR-0105](0105-predrawn-candidate-review-uses-exact-board-plane-registration.md), [ADR-0106](0106-predrawn-registration-is-owner-picked-source-geometry.md), [ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md), and [ADR-0111](0111-predrawn-refit-target-dimensions-are-owner-configurable.md)"
---

# ADR-0123: Accepted pre-drawn scenes keep their pixels and saved alignment

## Context

The approved whole-board scene is an untouched 1672 by 941 pixel image. The
owner reviewed it through a deterministic whole-image alignment: four source
corners place the board plane, and monotonic row and column guides describe the
painted spacing inside that plane. Requiring a new 3840 by 2160 generation would
discard approved pixels without adding camera room, while baking the alignment
would resample those pixels and change the transformed outer boundary that the
owner approved.

Earlier decisions treated that alignment as development-only evidence and
required production art to return as an unregistered native-frame image. That
cannot reproduce the approved view from the approved bytes. The saved Level
needs enough stable information to resolve the live-media image and apply the
same continuous transform, without depending on a temporary URL, candidate id,
browser profile, or review tool.

## Decision

An accepted pre-drawn scene keeps the promoted image bytes exactly as reviewed,
at the image's actual pixel width and height. There is no required 3840 by 2160
frame and no minimum pixel size specific to pre-drawn scenes. Promotion must not
resize, upscale, rectify, re-encode, or regenerate an owner-approved image only
to satisfy a different frame size.

The Level's pre-drawn background declaration stores only durable semantic and
geometric data:

- the stable live-media slot;
- the accepted image's actual pixel width and height; and
- the exact versioned owner-approved alignment payload: the four source-pixel
  board corners, the refit row and column counts, the strictly monotonic
  normalized row and column guides used by the renderer, and the pinned boundary
  reference carried by the approved version-4 payload.

Every renderer applies that alignment to the one complete image. The guide map
and four-corner projective transform are one continuous whole-scene operation;
they do not crop the image, split it into objects or layers, or move individual
landmarks. The authored Level remains the authority for gameplay cells,
collision, units, barriers, objectives, and all other semantics.

The pinned boundary remains display-only even though it round-trips with the
exact approved alignment payload; it never affects the image transform,
gameplay, hit targets, or occlusion. Temporary preview URLs, candidate ids, blob
hashes, browser-local keys, and picker state are not part of the Level. They may
remain review and promotion evidence. The live-media catalog resolves the slot
to the accepted immutable bytes, and the saved alignment reproduces the approved
runtime view of those bytes. Before promotion, local review continues to use the
same alignment shape; promotion copies the exact approved payload into the
background declaration instead of persisting the review source.

Camera room is a composition result, not a pixel-count result. A candidate must
contain continuous meaningful scenery outside the playable boundary and be
reviewed in the real shared viewer with the boundary-constrained pan behavior of
[ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md). Centering the board in a
nominal safe area remains useful prompt guidance, but neither a centered-60%
measurement nor a 3840 by 2160 output is an acceptance gate. The owner-visible
pan result is the authority for whether the scene has useful surrounding room.

Acceptance evidence records the immutable media identity and actual dimensions,
the saved alignment declaration, and the owner-approved registered view. A
higher-resolution copy of the same composition is not a substitute for that
evidence and does not create more pan travel.

## Consequences

- The reviewed 1672 by 941 scene can become the runtime background without
  inventing or resampling pixels.
- Editor, gameplay, read-only views, and thumbnails can reproduce the same
  alignment from one canonical Level declaration.
- Level content remains independent of candidate URLs and live-media version
  ids while the stable slot continues to follow the live-storage lifecycle.
- Production rendering gains one narrow exception to ADR-0076: deterministic
  alignment of a complete whole-board scene is allowed, while asset-local scale
  repairs and independent object warps remain forbidden.
- Prompt framing may target generous surrounding scenery without confusing an
  output resolution or fixed percentage with camera room.
