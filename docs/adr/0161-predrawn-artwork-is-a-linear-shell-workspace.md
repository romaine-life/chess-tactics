---
status: "superseded by ADR-0154"
date: 2026-07-20
deciders: Nelson, Codex
superseded_by: "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
refines:
  - "[ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
---

# ADR-0161: Pre-drawn artwork is a linear shell workspace

## Context

The first owner-operated pre-drawn pipeline put upload, background history,
grid fitting, raster derivation, mask selection, depth inspection, installation,
archive, and publication handoff into the narrow Board control rail. It exposed
two background versions plus a separately selected mask even though the owner
performed three sequential operations. That storage-oriented presentation made
the final result feel like two independently coordinated values instead of the
third artifact in one understandable workflow.

Pre-drawn artwork is not an ordinary board brush. Like Events, it needs the
editor's full left workspace while the title and control rail remain stable.

## Decision

The Level Editor exposes a URL-addressable **AI artwork** control page. Opening
it replaces the visible board with content inside the shell-owned left
workspace. The persistent title and right control rail remain mounted. The
covered board also remains mounted but inert and inaccessible, preserving its
camera and editor state. The artwork surface composes the same reusable shell
workspace primitive as Events; it does not create another outer panel, dialog,
viewport measurement, or independent chrome family.

The owner-facing history is one ordered artifact chain. Every immutable version
is represented as one board artifact:

1. a `raw` raster is a **Codex-generated board**;
2. its `warped` child is a **Warped board**; and
3. an `occlusion` child is an **Occlusion-ready board** whose visible board is
   its exact source raster and whose version identity owns the matching depth
   data.

The third artifact remains backed by the raster-plus-mask selection required by
ADR-0158, but that pairing is an implementation detail. Selecting or setting an
occlusion-ready artifact deterministically resolves both identifiers from that
single artifact. The owner never coordinates a background dropdown with a mask
dropdown. A missing, archived, cross-document, or otherwise invalid source
raster makes the artifact unusable rather than falling back to a nearby image.

The workspace shows each artifact as a distinct selectable version with its
preview, operation, parent, readiness, working-copy state, and canonical state.
The action for the selected artifact creates the next artifact and selects the
new result after the server acknowledges it:

- upload or add the mounted generation creates a Codex-generated board;
- grid fitting stages alignment on that generated board and **Generate warped
  board** creates its child; and
- **Generate occlusion-ready board** creates the third artifact from the exact
  warped board.

Depth inspection belongs to the selected occlusion-ready artifact as diagnostic
detail. It is not a second selection axis. Archive acts on the one selected
artifact. **Set this version** changes only the fenced cloud working copy;
**Review and publish** or **Review and save** remains the separate canonical
boundary.

Generation-frame authoring, saved/published reference access, and the immutable
artifact workflow live together in this workspace. The ordinary Board page
keeps board viewing controls and no longer contains the pipeline instrument.
The right rail may summarize the artwork workflow and provide navigation, but
it may not duplicate the full instrument or squeeze its controls back into the
rail.

## Consequences

- The visible model matches the work: generated board → warped board →
  occlusion-ready board.
- Storage remains normalized and renderer-compatible without exposing the mask
  as an independent owner choice.
- Branches and retries remain distinct immutable artifacts rather than mutating
  a stage in place.
- The artwork instrument gains enough space for readable previews, lineage,
  diagnostics, and actions while preserving the Level Editor shell.

## Verification

- The exact Level Editor route can enter the AI artwork page through the normal
  control-page selector and encode that page in its route state.
- A three-version lineage renders as three artifacts and an occlusion artifact
  maps to one exact `{ backgroundVersionId, occlusionVersionId }` selection.
- No independent occlusion-version selector exists in the owner workflow.
- The Board page no longer mounts the version manager.
- The board remains mounted, inert, and hidden while the artwork workspace is
  visible, and returns with its camera state intact.
- The workspace uses the shared shell fill and registered inner controls at
  desktop and responsive widths.

## More Information

- [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)
- [ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
