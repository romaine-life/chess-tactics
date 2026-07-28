---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0175](0175-rejected-warp-retries-stay-in-the-same-pipeline-slot.md)"
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
---

# ADR-0170: Derived board inspection is a full-workspace revision gate

## Context

Grid fitting is meticulous visual calibration, but the first derived-board
review placed the live grid and cyan-highlight proof inside the selected
artifact's small preview card. The proof was technically present while the
owner lacked the working area needed to judge individual grid lines, tactical
contrast, and useful camera travel.

A rejected fit cannot be corrected by mutating its immutable warped raster.
ADR-0168 already permits the same Raw Pipeline Source to seed another creation
slot, but making the owner return to a generic source chooser loses the exact
review context and makes refinement look unrelated to the artifact being
inspected.

## Decision

### Inspection owns the pipeline workspace while it is active

Warped and occlusion-ready artifacts expose **Inspect full size**. A newly
completed warp opens this inspection automatically.

Inspection temporarily replaces the Board Art Pipeline's scrolling slot
manager inside the existing shell-owned center workspace. It does not create a
dialog, scrim, second outer frame, or narrow rail duplicate. Its compact header
and footer leave the remaining available area to one live board viewport.
Closing inspection returns to the same selected slot and artifact.

The focused instrument renders the exact stored raster through the runtime
board compositor with units hidden. The saved refit grid and canonical cyan
move treatment are enabled by default and remain independently toggleable.
Cyan interaction is limited to authored playable cells; refit-only review cells
remain visual. Pan, viewport-cover fit, wheel zoom, explicit zoom controls, and
a legible zoom readout remain available. Every diagnostic overlay is local and
non-persistent.

### Grid refinement branches immutably from the inspected proof

Inspection exposes **Tweak grid in new attempt**. The action:

1. resolves the inspected artifact's exact Raw Pipeline Source;
2. reads the registration directly from that exact inspected warp rather than
   searching the raw source's potentially ambiguous sibling children;
3. creates a separate processing attempt referencing the same raw version and
   Blob;
4. opens the full grid-fitting instrument with that registration preloaded.

The prior attempt, warp, occlusion result, hashes, and media remain unchanged.
The transition performs no model call, clipboard handoff, upload, media copy,
crop, or reclassification. Saving the revised grid only stages that new
attempt's one permitted warp.

Missing write authority, stale or ineligible raw geometry, missing lineage, and
mutation failures remain visible in the focused instrument. They never collapse
into an inert button with no explanation.

## Consequences

- Derived-board review receives the same class of working area as the
  calibration that produced it.
- The owner can iterate from visual evidence without confusing mutation with
  version creation.
- Several attempts may carry different fits of byte-identical raw art while
  retaining exact, auditable lineage.
- The ordinary artifact detail returns to being a compact summary and entry
  point rather than a precision editor.

## Verification

Contract-complete implementation proves that:

- both derived stages open a focused, shell-owned full-workspace inspector and
  closing it restores the pipeline manager;
- warp completion enters that inspector only after the server-confirmed child
  can be read back;
- grid, cyan, pan, fit, and zoom controls work at the live route while units
  remain absent and refit-only cells remain non-interactive;
- refinement creates another attempt whose raw version identity equals the
  inspected attempt's raw identity and whose picker seed equals the inspected
  warp's direct registration, even when newer sibling warps exist; and
- the old attempt and every old artifact remain byte- and metadata-unchanged.
