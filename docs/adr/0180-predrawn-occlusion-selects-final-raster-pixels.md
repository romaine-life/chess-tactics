---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
  - "[ADR-0160](0160-automated-editor-verification-is-observation-only.md)"
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
---

# ADR-0180: Pre-drawn occlusion selects final raster pixels

## Context

AI-painted board artwork may add, remove, reshape, or restyle scenery relative
to the Legacy tiles and sprites that supplied its Generation Reference.
Reconstructing an occlusion mask from those Legacy assets therefore selects the
wrong pixels whenever the final painting diverges, including the ordinary case
where generation intentionally enriches the scene. The owner needs a precise,
repeatable way to choose which pixels in the exact warped painting should pass
in front of live units and ground cover without making a remote model or an
agent the author of that choice.

## Decision

### The exact warped raster is the only selection image

Occlusion authoring examines the immutable warped artifact that will be the
occlusion child's exact raster parent. Legacy tiles, terrain sprites, props,
doodads, Scene Art, and their silhouettes are never loaded, sampled, imported,
or projected into the selection. The resulting alpha plane says only which
pixels from that exact final painting may occlude live content.

The existing ADR-0179 gate remains: creating an occlusion-ready child requires
a valid saved cyan move-highlight profile bound to the attempt's exact current
warp. The profile remains a review gate and never becomes mask input.

### Local segmentation advises; the owner authors

The Board Art Pipeline opens occlusion authoring as a focused full-workspace
instrument over the exact warped raster. Its first advisory engine is a
revision-pinned SlimSAM model running in a browser worker, off the UI thread.
The source painting is processed locally in the browser and is not uploaded to
an inference service. Accepted alpha starts empty; neither model readiness nor
an initial prediction selects pixels.

The owner places positive points on pixels to include and negative points on
pixels to exclude. The engine returns three scored candidate alpha masks. A
candidate remains distinct from the accepted cyan selection until the owner
explicitly accepts it. The owner can discard a candidate, change prompts, and
compare the three alternatives.

Brush, eraser, Reset, Undo, and Redo operate directly on the accepted alpha, so
manual authoring remains complete even when model loading, inference, WebGPU,
or the suggested selection fails. Candidate pixels are advisory and have no
authority merely because their score is highest.

An observation-only editor session may operate these local inspection and mask
draft controls without becoming a writer. Create, Set, Save, Publish, and every
other server mutation remain disabled and fail closed without writer authority.
This makes real-route verification lease-free instead of requiring a synthetic
takeover.

The segmentation engine is replaceable rather than part of the persisted mask
format. Provenance records the exact engine model, immutable revision, and
execution backend used for accepted advisory pixels, together with prompt and
manual-edit counts. The canonical alpha digest records the owner's final
selection. Runtime never loads or invokes the segmentation model.

### Depth assignment is deterministic from the accepted alpha

The owner-approved alpha is partitioned into 8-connected components. For each
component and each source-image column occupied by that component, the
bottom-most selected pixel is its projected ground-contact sample. That sample
is mapped through the warped artifact's exact dimensions and world bounds to
the canonical scene-depth convention. Every selected pixel above it in the
same component and image column receives that contact depth.

Disconnected selected objects are evaluated independently. This prevents one
low object from supplying the depth of an unrelated object merely because both
occupy the same image column. The depth-assignment algorithm and version are
recorded in provenance along with the accepted alpha digest.

### Creation remains an explicit immutable boundary

Points, candidates, accepted alpha, manual edits, Undo/Redo history, pan, and
zoom are authoring-session state. None creates or mutates a background version.
Only the explicit **Create occlusion-ready board** action deterministically
encodes the accepted alpha and derived depth as the attempt's immutable
occlusion child, with exact parent, dimensions, world bounds, coordinate basis,
geometry binding, hashes, and selection provenance.

The owner then inspects the persisted clipping result before choosing whether
to Set that version on the Level. Set, Save, and Publish retain their existing
separate boundaries.

## Consequences

- Generated fences, trees, overhangs, and other enriched scenery can occlude
  units according to their actual final pixels rather than unrelated Legacy
  silhouettes.
- Browser-local inference adds a model download and device-dependent latency,
  but no inference service is required and the UI remains responsive.
- A poor or unavailable model cannot block completion because manual alpha
  authoring is a first-class fallback.
- The persisted result is deterministic and reviewable even though the
  advisory segmentation proposal is model-assisted.
- Screen-column ground-contact depth is a deliberately simple first depth
  algorithm. A later algorithm may create a new versioned child without
  changing this artifact or requiring runtime inference.

## Verification

Contract-complete implementation proves that:

- the worker receives the exact warped raster and never receives Legacy media;
- the pinned model runs off-thread and reports its exact model, revision, and
  backend;
- positive and negative prompts produce three separately selectable
  candidates, and no candidate changes accepted alpha without explicit Accept;
- brush, eraser, Reset, Undo, and Redo remain usable without a working model;
- alpha hashing and per-component column-bottom depth assignment are
  deterministic at the exact parent dimensions and world bounds;
- no background version is created before the explicit create action; and
- the immutable child is parent-bound, provenance-complete, inspectable, and
  consumed without runtime segmentation.
