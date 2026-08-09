---
status: accepted
date: 2026-08-09
deciders: Nelson, Claude
partially_supersedes:
  - "[ADR-0116](0116-registered-predrawn-candidates-activate-the-locked-editor.md)'s prop clause"
refines:
  - "[ADR-0516](0516-the-playable-grid-is-placed-over-ai-artwork-by-hand.md)"
  - "[ADR-0518](0518-the-board-assembles-obstacles-before-armies.md)"
  - "[ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md)"
---

# ADR-0534: An obstacle stands on the artwork; it is not painted into it

## Context and Problem Statement

[ADR-0116](0116-registered-predrawn-candidates-activate-the-locked-editor.md) locked prop authoring
on a plate board along with tiles, paths, fences, walls and wall art, on one reason that was right at
the time: *"a continuous pre-drawn plate already owns these pixels."* A tree painted into the picture
cannot also be painted by the editor without the board saying two different things about the same
square.

Two decisions since have narrowed what that reason actually covers.
[ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md) took ground cover back out of the
lock: cover is authored, animated and drawn live over the immutable raster, so it contradicts
nothing, and it was excluded from the environment-geometry digest so a cover edit cannot stale the
art. [ADR-0516](0516-the-playable-grid-is-placed-over-ai-artwork-by-hand.md) went further and said
the quiet part out loud — an AI board's terrain is *"purely invisible movement rules, decoupled from
appearance"*, and **"obstacles or water placed under a plate are the natural next thing to want."**

And rocks stopped being scenery. [ADR-0518](0518-the-board-assembles-obstacles-before-armies.md)
established what a rock is in this game: *"the obstacle that shapes a position: blocking one path is
most of what makes one board different from another"* — enough that rocks were given the army's fall
curve and drop before it. A board whose obstacles are the position cannot have its obstacle tool
locked because the *scenery* is already painted.

So the lock, as written, refuses the one prop kind that is not decoration.

## Decision Outcome

**A rock may be placed on a pre-drawn board. It stands ON the artwork rather than being painted into
it, and it is the only prop kind that may.**

Placed Art stays reachable on a plate board and narrows to **Props → Rocks**. Scene Art, Forest, Town
and Doodads remain shut, and trees and houses leave the prop palette: those are scenery, scenery is
what the plate already painted, and offering those brushes would offer edits the renderer then
refuses to show. A rock placed here draws live, blocks movement, and drops into place on ADR-0518's
entrance exactly as one standing on tiles does — the fall resolves from `propDef().kind`, so nothing
about the choreography is per-board.

### One props channel, with a note about which anchors are live

The board gains `liveProps` — a set of anchors in the existing `props` map that stand on the plate
rather than being baked into it. Not a second props map: occupancy, the terrain-family gate, the
hover ghost, the Move tool, erase, resize pruning and the `layers.props` projection all keep working
off the single canonical channel (ADR-0059), and a live rock stamps its collider through the same
path every other prop does.

The marker is what makes this a no-migration change, and it is load-bearing for a reason worth
stating plainly: **a generation reference includes props**, so a plate generated from a board that
had rocks has those rocks painted into it. Rendering every rock on every AI board live would stand a
second rock on top of each painted one. No existing board carries a marker, so every existing board
renders exactly as it does today, and only rocks placed after the art exists come alive.

`liveProps` is written to the board code only when non-empty, sorted and de-duplicated, and a marker
whose prop is gone is dropped rather than kept. `commitEditorBoard` settles that invariant once, so
erase, a resize that prunes a prop off the board, and the Move tool's vacated anchor stay correct
without each knowing about the field.

### Nothing depicts it, so nothing about the artwork answers for it

A live obstacle leaves every channel that describes what the raster shows:

- **The environment-geometry digest.** Placing or erasing one does not stale the artwork — the same
  carve-out ADR-0162 made for cover, and for the same reason. This needs **no schema version of its
  own**: no board could carry a marker before the field existed, so every hash already persisted
  against v1 or v2 is reproduced byte-identically by the filtered input. That is the difference from
  ADR-0162, where cover was already present in existing boards and the bytes genuinely changed.
- **The baked-art commit guard.** A marked rock contradicts no pixel the plate owns. The same
  placement *without* a marker claims to be baked geometry and is still refused, as is every other
  family.
- **The occlusion seed.** A live rock has no baked pixels to mask with; seeding one would have it
  erase whatever passed behind it as though the raster depicted it, and erase its own sprite besides.
- **The generation reference**, and the required-bounds the crop may not cut. A reference that showed
  a live obstacle would ask the next generation to *paint* it, and the owner would end up with a rock
  in the picture and the same rock standing on top of it.

It keeps everything that describes where things are: it is still occluded by painted foreground
through the plate's depth map, because prop ops ride `layer: 'scene'` — the layer that already clips
live unit and cover pixels — and that survives a grid slide, since ADR-0516's plate offset folds into
the depth map through the same shared seam.

### The kind gate is enforced at render, not only in the editor

`liveProps` stores anchors, not kinds, so widening the set later costs nothing. But the renderer
checks the kind itself: a hand-authored board code that marks a cottage does not get to stand it on a
painting that already drew its own. The editor and the renderer therefore agree without the storage
format having to be the thing that enforces it.

## Consequences

- The obstacle course is authorable on AI boards, which is what makes one painting into several
  different positions. Terrain there was already invisible movement rules (ADR-0516); now the thing
  the player can see and the thing that blocks them are the same object again.
- **The rock is not in the painting's light.** This is the real cost and it is an art problem, not a
  code one. A unit reads as an actor standing on a scene; a rock claims to *be* the terrain, so a
  palette or light-direction mismatch reads as a sticker in a way a mismatched knight does not. The
  open [ADR-0045 §D](0045-units-deploy-with-a-staggered-drop-in.md) landing effect and a contact
  shadow are the mitigations, and both are still open.
- **Two kinds of rock can coexist on one board** — painted ones with no collider, live ones with one.
  The drop is the tell, and it is worth leaning on deliberately: generate plates without rocks and
  place every obstacle live, so what falls is what blocks.
- Regenerating art over a board that holds live obstacles is safe: the reference excludes them, so
  the new plate does not depict them and they keep standing on it.
- No content migration, no board code change for any existing level, no fingerprint schema version,
  and no RunSaveVersion.

## Verification

- On a plate board, an unmarked prop draws nothing while a marked rock emits `layer: 'scene'` ops
  carrying its `structure` identity, and a marked tree or house still draws nothing; a board with no
  plate is unaffected (`packages/board-render/tests/predrawnLiveObstacles.test.mjs`).
- A live obstacle leaves the occlusion seed, does not change the environment-geometry digest, and
  reproduces the v1 and v2 inputs byte-identically for a board without one
  (`packages/board-render/tests/predrawnOcclusion.test.mjs`).
- `preservesPredrawnBakedArt` admits a marked rock and refuses the same placement unmarked; Placed
  Art is no longer a locked layer but every kind except Props is
  (`frontend/src/ui/predrawnEditorPolicy.test.ts`).
- `liveProps` round-trips, encodes byte-identically when empty, and drops a marker whose prop is gone
  (`frontend/src/ui/boardCode.test.ts`).
- The live Level Editor on an AI level offers Placed Art → Props → Rocks and nothing else, and the
  placed rock renders over the plate on the real board.
