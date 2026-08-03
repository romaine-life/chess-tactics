---
status: accepted; the Props placement boundary is superseded by ADR-0365
date: 2026-07-25
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0365](0365-props-stand-on-the-authored-surface-not-the-playable-grid.md)"
partially_supersedes:
  - "[ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)'s off-board prop and doodad authoring permission"
  - "[ADR-0145](0145-scenic-artwork-is-free-transform-generation-input.md)'s Level Editor Artwork destination and source-shelf naming"
  - "[ADR-0146](0146-scenic-artwork-reuses-object-selection-and-axis-sliders.md)'s Artwork-layer naming"
  - "[ADR-0148](0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md)'s Artwork-layer naming"
  - "[ADR-0149](0149-artwork-select-toggles-candidate-discovery.md)'s Artwork-layer naming"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s AI Artwork destination and route namespace naming"
refines:
  - "[ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
---

# ADR-0176: Placed Art and Level Artwork are separate editor destinations

## Context and Problem Statement

The Level Editor used **Artwork** for two unrelated things: direct,
gameplay-inert source-image placements on the scene and the process for
generating, fitting, selecting, and publishing a complete AI-painted level
background. Props and doodads also appeared as separate top-level destinations
even though all three are ways to place art into the authored scene.

Combining the AI workflow with a placement brush makes the control hierarchy
ambiguous and couples process-workspace URL state to the current board brush.
Conversely, keeping three separate placement destinations hides the one
meaningful choice among them: whether a placed image is visual-only, a
nonblocking board object, or a blocking board object.

ADR-0098 also allowed props and doodads across the complete authored scenic
surface. The owner now requires their placement semantics to remain legible:
only visual-only scene composition may extend beyond the playable board, while
tile-addressed gameplay objects remain inside it.

## Decision Outcome

### Two Level Editor destinations

The Level Editor has two separate top-level destinations:

- **Placed Art** owns direct scene-object placement and editing.
- **Level Artwork** owns the Level's Legacy/AI background mode and the complete
  AI background workflow, including Generation References and Board Art
  Pipeline workspaces.

Level Artwork is a process destination, not a brush. It does not inherit,
change, or render the Placed Art subtype selector. Placed Art does not contain
background-mode, generation, fitting, occlusion, Set, Save, or Publish
controls.

The destinations use distinct URL state. Their canonical layer values are
`placed-art` and `level-artwork`; Level Artwork process state uses the
`levelArtworkEditor` namespace. The retired top-level `artwork`, `doodad`, and
`prop` layer values and the ambiguous `artworkEditor` process namespace are not
current route authority. Internal persisted channel and brush identifiers may
retain `artwork`, `doodad`, and `prop` for wire compatibility; the owner-facing
labels and destination hierarchy do not.

### Placed Art types

Placed Art begins with one persistent, visible subtype selector:

1. **Scene Art** is the former direct/floating Artwork channel. It places
   installed structure source pixels at free canonical projected-scene pixel
   positions, remains gameplay-inert, and may be positioned anywhere in the
   authored visual scene, including outside the playable board.
2. **Doodads** use canonical tile-addressed doodad placement and rendering,
   remain nonblocking, and may be placed or moved only when their target lies
   inside the playable board.
3. **Props** use canonical tile-addressed prop placement and rendering, retain
   their blocking and footprint semantics, and may be placed or moved only when
   their complete footprint lies inside the playable board.
   **Superseded by [ADR-0365](0365-props-stand-on-the-authored-surface-not-the-playable-grid.md):**
   a prop's complete footprint must lie on the authored surface — the playable
   board plus the scenic apron — and gameplay isolation comes from the export
   projection rather than the placement boundary. Doodads are unaffected.

Scene Art is therefore the only **Placed Art** type that accepts a new
off-board position. (ADR-0365 adds Props to that list; Doodads remain
playable-only.) This does not revoke the separate scenic-terrain and
visual-feature decisions governing other Level Editor tools.

Switching the subtype changes the controls and active placement behavior in
place; it does not navigate to another top-level editor destination. Each
subtype keeps its established selection, transform, catalog, rendering, and
gameplay semantics except for the placement boundary above.

### Existing off-board objects

No destructive content migration removes or relocates an existing off-board
doodad or prop. Existing persisted objects continue to load, render, serialize,
and appear in generation references exactly where authored. The editor keeps a
reachable removal path for that retained data, but rejects new off-board
placement and rejects moving an existing doodad or prop to another off-board
position. Retention is compatibility for owned content, not permission for new
off-board authoring.

## Consequences

- The words in the control rail identify one concept each: Level Artwork is the
  complete-board AI workflow, while Placed Art is scene-object authoring.
- Scene Art, Doodads, and Props expose their visual-only, nonblocking, and
  blocking meanings as one deliberate choice.
- AI workspace state cannot collide with a placement brush or make an unrelated
  placement control appear selected.
- The playable boundary is visible in object semantics without deleting
  previously authored scenic content.

## Verification

Contract-complete implementation proves that:

- the Level Editor offers separate **Placed Art** and **Level Artwork**
  destinations and no top-level Artwork, Doodad, or Prop destinations;
- Placed Art's first control switches among Scene Art, Doodads, and Props
  without leaving the destination;
- Level Artwork alone exposes background mode, Generation References, and Board
  Art Pipeline navigation, using independently round-trippable URL state;
- Scene Art can be placed outside the playable board, Doodads cannot, and a
  Prop is rejected unless its complete footprint is playable;
- Doodads remain nonblocking and Props remain blocking in gameplay projection;
  and
- preexisting off-board doodads and props remain visible and removable after
  load while new placement and off-board moves fail without mutating content.
