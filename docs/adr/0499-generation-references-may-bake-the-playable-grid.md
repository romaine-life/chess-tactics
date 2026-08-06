---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s overlay-free Generation Reference requirement"
  - "[ADR-0476](0476-generation-references-freeze-the-autosaved-working-copy.md)'s overlay-free PNG requirement"
refines:
  - "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md)"
---

# ADR-0499: Generation References may bake the playable grid

## Context

The generation-frame picker must show the playable grid so the owner can judge
the board's placement inside the AI painting frame. Generation Reference capture,
however, always removed that same grid. A clean reference is useful when the
source terrain already makes the topology clear, while a baked playable grid is
useful when the image model needs stronger visual evidence of the exact cell
projection and count. Neither choice is correct for every generation pass.

The existing grid-free rule also made the visible Generation References preview
disagree with any workflow that deliberately wanted to hand the model the grid.
Because a Generation Reference is immutable provenance, this choice cannot be an
unrecorded screenshot-time accident.

## Decision

Generation Reference capture offers an explicit **Bake playable grid** choice.
It defaults off for every newly mounted capture surface, preserving the clean
reference as the ordinary path. Turning it on draws the canonical playable-grid
layer over the exact capture preview and includes that layer in the saved PNG.
Scenic terrain outside the playable rectangle receives no grid.

The generation-frame picker always shows the playable grid as framing evidence;
that instrument display does not itself choose the later capture result. The
choice belongs to each immutable Generation Reference, so the owner may create
both clean and gridded references from the same acknowledged working copy and
frame without changing Level data or the saved frame.

Every new reference records `gridOverlay: none|playable` in its immutable
operation, provenance, and semantic-request binding. Its byte hash therefore
identifies the exact chosen pixels. Historical references without this field are
interpreted as `none` and are never rewritten.

The grid is an additional visual geometry guide, not semantic authority. The
canonical packet remains authoritative for dimensions, topology, playable
addresses, features, blockers, and perimeter. Units, additive ground cover,
tactical highlights, labels, and editor UI remain excluded in both modes.

## Consequences

- The on-screen reference preview is the exact clean or gridded image that will
  be saved and copied.
- The owner can deliberately compare clean and grid-assisted model passes while
  preserving unambiguous provenance for each input.
- The playable grid reuses the shared board-grid renderer; capture does not
  create a second projection or a scenic-grid variant.
- Existing Generation References and their hashes remain unchanged.

## Verification

- The framing picker shows the playable grid regardless of the later capture
  choice.
- Generation References defaults **Bake playable grid** off and visibly updates
  the exact preview when toggled.
- A clean export contains no grid layer; a gridded export rasterizes the shared
  playable-grid SVG into the PNG.
- New stored source metadata and semantic binding record the selected mode, and
  historical metadata without the field validates as `none`.
