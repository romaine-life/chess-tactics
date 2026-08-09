---
status: accepted
date: 2026-08-07
deciders: Nelson, Claude
partially_supersedes:
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s rule that stale environment geometry blocks activating, saving, or publishing an AI selection"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
---

# ADR-0516: The playable grid is placed over AI artwork by hand

## Context

A Level in `ai` background mode renders one immutable raster and suppresses the baked environment
families. ADR-0165 bound that selection to an **environment-geometry digest**: the raster is valid
only while the board still hashes to the geometry the art was generated from. A mismatch is `stale`,
which hides the plate and refuses to activate, save, or publish the selection.

`cols` and `rows` are inputs to that digest, so the board's dimensions were pinned by it. The Level
Editor enforced the same thing twice more: the Board control page replaced its whole authoring
surface with a read-only `Pre-drawn board · N×N` card, and `commitEditorBoard` refused any board
whose baked-art signature changed at all — dimensions included.

That is the right rule for a **tileset** board, where the raster was rendered *from* the terrain and
a terrain change makes the picture a lie. It is the wrong rule for the thing the owner is actually
doing. The artwork is not a rendering of the grid; it is a painting the grid sits on. Growing a
board from 6×6 to 7×7 does not make a single painted pixel wrong — it means more grid on the same
picture. The restriction was inherited from tileset thinking and cost the owner a decision that was
always theirs.

Three facts make the freedom cheap, and they were established before this decision, not assumed:

- The plate is already drawn at absolute `worldBounds` in projected space, with no dependence on
  `cols`/`rows`. "The grid grows over a fixed picture" is what the renderer does today.
- Every background version stores its generating board in `operation.semanticRequest.boardCode`,
  so nothing about the art's provenance is lost when the board moves away from it.
- A square with no terrain entry is already open ground to the rules: `canTraverse` returns true,
  `haltsTravel` returns false, elevation is 0. Unauthored terrain has never trapped a piece.

## Decision

### The grid's size and placement are owner decisions, not artwork properties

In `ai` mode the Board control page authors the playable window: **Width**, **Height**, and a
four-way **Move grid over artwork** pad. The baked-environment families — terrain, Subterrain,
paths, props, fences, walls, wall art, and Placed Art — stay locked and suppressed, because those
pixels genuinely are the plate's.

Resizing and sliding are **declared playable-window operations**. They commit through a path that
is exempt from the baked-art signature guard, because rebasing or pruning coordinates is the
mechanical consequence of what the owner asked for rather than an edit contradicting the plate. The
guard remains in force for every other commit, on top of the layer lock that already prevents
painting those families.

### Sliding moves the picture, not the scene

The legacy grid move rebases the whole authored scene inside its scenic rectangle, which is correct
when the environment *is* that scene. Over a plate the same intent is served by moving the picture
the other way. The Level records an owner-authored `predrawnPlateOffset` in projected board pixels,
and one shared render seam (`predrawnRenderSurface`) folds it into the surface's world bounds for
the editor plate, gameplay, both thumbnail renderers, and the occlusion depth map, so they cannot
drift apart.

The selection's own `worldBounds` are never rewritten. They are part of the artifact's identity and
every lineage check compares them exactly. The offset is a separate, Level-side answer to "where do
I want the picture", and **Reset** returns it to the artwork's own registration.

Because the picture moves rather than the scene, no scenic apron has to exist first, nothing is
rebased, and no unit, prop, or zone tile is dropped by a slide.

### Deliberate detachment is a state, not a defect

A Level records `predrawnGridDetached` once the owner resizes or slides the grid over a plate. While
set, the environment-geometry comparison is skipped: the selection is `valid`, the artwork renders,
and the Level activates, saves, and publishes normally.

Detaching answers exactly one question — "does this raster depict this exact terrain" — and the
owner has answered it. Every other check still applies and still fails closed: artifact resolution,
lineage, stage completeness, archive status, and the schema-v3 move-highlight profile's binding to
its exact background version. A profile cell the board no longer covers becomes uncalibrated and
falls back to the full-cell highlight instead of invalidating the selection.

Setting a newly generated artifact clears both the detachment and the offset, because that art *was*
generated from the geometry on screen and arrives bound to it again.

### New squares arrive as open ground

A grow seeds every new square with the terrain of its nearest authored neighbour. This is not
cosmetic: the editor's grid overlay and hit targets are built from the terrain map, so a square with
no entry would be traversable to the rules but invisible and unclickable in the editor. The seeded
value carries a terrain family, which is where a later obstacle or water square hangs. Until the
owner specifies otherwise the square is ordinary traversable ground.

### Storage

Both fields are written to the board code only when set, and a zero offset encodes as no offset. No
existing Level's board code changes, and no Level gains a field it did not have.

## Consequences

- The owner sizes and places the grid over their own artwork without regenerating it, and without
  asking the system's permission for a decision the system could not make.
- An AI board's terrain becomes purely invisible movement rules, decoupled from appearance. That is
  a real split, and obstacles or water placed under a plate are the natural next thing to want.
- "Stale" now means only what it says: art bound to geometry it no longer depicts, on a Level that
  never claimed otherwise. It is no longer reachable by an ordinary resize.
- A detached selection cannot prove it depicts its board, and must not be read as evidence that it
  does. The provenance is still recoverable — the generating board is stored on the version.
- Undo and redo step across resizes and slides, guarded now by selection identity rather than by the
  baked-art signature those operations change on purpose.

## Verification

- The real render planner emits a byte-identical plate draw op at 5×11 and at 6×12, and shifts it
  by exactly the offset and never rescales it (`packages/board-render/tests/predrawnLevel.test.mjs`).
- A detached selection with mismatched geometry is `valid`, while an incomplete lineage on the same
  detached board is still `unavailable`; a detached grid that outgrows its move-highlight
  calibration keeps the artwork (`frontend/src/ui/predrawnSelectionValidity.test.ts`).
- Detachment and offset round-trip through the board code, and a board that never moved its grid
  encodes byte-identically to before (`frontend/src/ui/boardCode.test.ts`).
- History steps across a resize and a hand placement but refuses a different plate selection
  (`frontend/src/ui/predrawnEditorPolicy.test.ts`).
- The live Board page on an AI Level shows working Width/Height steppers and an enabled
  Move-grid pad.
