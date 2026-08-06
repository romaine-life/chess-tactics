# Pre-drawn Whole-Level Generation

This is the mutable recipe for turning an authored level into one continuous
full-scene painting without giving the image generator permission to redesign
the level. It implements
[ADR-0109](../adr/0109-predrawn-generation-packets-preserve-authored-level-semantics.md)
and the owner-operated immutable installation boundary in
[ADR-0158](../adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md).

Amend this file whenever a reviewed pass teaches us a better instruction. Keep
the authority order intact unless a later ADR changes it. Preserve exact prompts
for notable runs as text provenance; do not commit generated or source-media
bytes here.

Per
[ADR-0165](../adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md)
and
[ADR-0166](../adr/0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md),
the optional reference-first generation path and the independent artwork-intake
path begin in the Level Editor's **AI Artwork** side controls:

1. choose the intended **Legacy** or **AI** background mode and 16:9 generation
   frame, then wait for the Level Editor working copy to finish autosaving;
2. open **Generation References** and create an immutable reference from that
   exact acknowledged working-copy appearance and frame, then copy its
   full-resolution PNG for manual Codex generation; and
3. when any finished AI-artwork PNG is available, open **Board Art Pipeline**,
   use **Add AI artwork** to paste or choose it, review and explicitly commit it
   as a **Raw Pipeline Source**, then begin grid fitting. Pipeline intake does
   not require or bind the Generation Reference from step 2. A later **New
   attempt** may reuse that Raw Pipeline Source without another upload.

Per
[ADR-0168](../adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
that same workspace-level **New attempt** action may select any eligible
retained Raw Pipeline Source, including the exact source already used by another
slot. The new slot immediately references the same version and Blob and starts
at grid fitting. It does not require another model call, clipboard handoff,
download, upload, or second raw output. Warped and mask-bearing board artifacts
cannot start slots.

A Legacy reference captures the ordinary composed environment through the saved
frame. An AI reference captures the exact selected AI raster. Both are unit-free,
ground-cover-free, grid-free, tactical-overlay-free, and UI-free. The saved
Generation Reference records its exact bytes and hash, dimensions, frame,
source mode, selected raster when applicable, working-copy Level revision,
geometry digest, semantic-packet identity, and provenance. Later Level edits
never change it.

The optional generation-preparation handoff resolves the saved Generation Reference rather than
recapturing the current Level. Its durable request records the exact reference
identity and hash, working-copy semantic request and hashes, request hash,
actor/time, and whether the generation is non-isolated. The application does
not know or claim the external Codex conversation's model, prompt, or
parameters.

**Copy generation reference** reads the exact original PNG when an owner wants
that model input. Pipeline **Add AI artwork** independently validates clipboard
paste, native paste, or **Choose PNG file** and stages any finished PNG as a
local review preview. Invalid input creates no version or slot. The explicit
raw-source commit stores those unchanged bytes as one immutable Raw Pipeline
Source and creates a processing slot bound only to current working-copy
semantics and geometry. Mandatory owner judgment begins with the candidate on
the game-owned review surface.

The Board Art creation slot separately records one exact Raw Pipeline Source
input plus compatible canonical geometry and processing context. Several slots
may reference the same raw without copying it. The source's generation
provenance remains unchanged; another deterministic slot is not another model
run.

The lower-level command path may separately materialize `prompt.txt`,
`packet.json`, content-hashed `references.json`, and
`request-manifest.json` only when it names the same persisted Generation
Reference and canonical semantic-request identity. Those files are separate
text/tool provenance; their existence does not let the Board Art Pipeline claim
the external conversation's model, prompt, or parameters. A filesystem
definition/reference pair is diagnostic input, not an alternate authority and
never creates an input-less model handoff or silently substitutes for the exact
server-bound Generation Reference.

### Named comparative refinement

After owner review identifies one localized miss in an otherwise useful
candidate, [ADR-0156](../adr/0156-named-predrawn-candidate-refinements-are-separate-non-isolated-branches.md)
permits a separately named comparative refinement branch.
It does not count as evidence that the isolated pipeline works. Build it through
the same reference-bound preflight rather than assembling an edit prompt only in
chat. The lower-level replay form remains:

```text
npm run predrawn:build-run -- \
  --definition <definition.json> \
  --reference <generation-reference.png> \
  --parent <parent-generation-request-directory> \
  --candidate <owner-reviewed-candidate.png> \
  --refinement <coplanar-de-tiling|restore-source-scenery> \
  --branch <unique-review-branch-id> \
  --out <new-generation-request-directory>
```

The preflight validates the complete parent prompt, packet, references,
manifest, immutable Generation Reference bytes, and candidate bytes before
writing a new attempt request. Its exact Generation Reference remains the
reference-appearance authority and the semantic packet remains geometry
authority. Image 2 is the
subordinate owner-reviewed edit target. The exact parent packet is copied
byte-for-byte, and the new manifest records reference identity, both image hashes,
parent manifest hash, operation, attempt, and
`isolatedPipelineEvidence: false`. Refinement output never overwrites its parent
or fills another committed slot in the old attempt and requires a fresh owner
review.

The first worked example is
[`predrawn-board-generation-fortress-gate.md`](predrawn-board-generation-fortress-gate.md).

## Background-version geometry identity

Every saved Generation Reference and every new raw, warped, or mask-bearing
board artifact records the cover-independent
`predrawn-environment-geometry-v2` digest. A Raw Pipeline Source remains an
independent reusable media identity. Each warped or mask-bearing board artifact
belongs to one server-owned creation slot, which references one exact raw input
and admits at most one committed result at each deterministic stage. Per
[ADR-0163](../adr/0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md),
an existing immutable v1 artifact is not regenerated or rewritten merely
because its historical digest included cover. The backend may bind that exact
v1 claim to v2 only after reproducing it from a server-held Level at a fenced
autosave, direct derivative creation, or Save/Publish boundary. A GET or preview
never performs migration. Once bound, changing live cover leaves the artifact
valid. Per
[ADR-0164](../adr/0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md),
changing baked terrain or environment geometry may remain safely autosaved or
recovered as an owner draft, but the remembered earlier artifact is marked
stale and its AI activation, Set, and derivation actions are disabled. Legacy
mode can still Save and create another Generation Reference. AI Save and Publish
remain blocked until the geometry again matches or a complete artifact for the
current v2 digest is selected.

## Authority order

Every input must have one named role. Never give several references without
stating which questions each is allowed to answer.

1. **Model image input:** one exact immutable Generation Reference. It is the
   unit-free, ground-cover-free,
   overlay-free crop from one acknowledged autosaved working-copy revision and
   its 16:9 frame. In Legacy mode it contains the ordinary composed authored
   surface, including only explicitly persisted Subterrain that captured topology
   resolves onto exposed faces. In AI mode it contains the exact selected
   raster and records non-isolated provenance. The reference owns appearance
   evidence only: environment, materials, palette, lighting, texture language,
   boundary vocabulary, and finish. An image edge or model-painted feature is
   never gameplay-perimeter or topology authority.
2. **Semantic packet:** captured working-copy dimensions, coordinate convention, projection,
   per-address contents, linear-feature graphs, blocking edges, footprints,
   exits, the full outer grid envelope, and internal playable/non-playable
   transitions. It owns deterministic gameplay meaning.
3. **Text transformation requirements:** own only continuity, output framing,
   camera room, and prohibited inventions. Text must not name a biome or provide
   an independent style, palette, lighting scheme, material treatment,
   atmosphere, or terrain-detail list. A Legacy-reference generation can be the
   isolated default with no prior candidate, accepted plate, beauty render, or
   unrelated board image. AI-reference generation is deliberately non-isolated.

The image wins questions of visible treatment; the semantic packet wins exact
topology and gameplay meaning. State this split inside the prompt.

## Prepare the packet

Before generation:

1. Choose and verify one exact Generation Reference. Choose the Level's actual
   **Legacy** or **AI** background mode. Open **Level Artwork → Generation
   References**, position the scene beneath the visible 16:9 frame, then choose
   **Apply to working copy**. The exact preview identifies whether the crop is
   preview-only, saving, or durably acknowledged. Applying never publishes by
   itself: wait for autosave, then choose **Create generation reference**. The frame is a
   screen-aligned rectangle in canonical projected-board coordinates, never raw
   browser pan, zoom, CSS pixels, viewport dimensions, or device-pixel ratio.
   Capture locks that acknowledged working-copy Level and fails when the frame is missing,
   invalid, or does not fully contain the playable outer envelope and every
   gameplay-authoritative reference draw represented by the semantic packet.

   The resulting Generation Reference contains no units, additive ground cover,
   grid, selection, tactical overlay, labels, or UI. A Legacy capture preserves
   the composed authored environment—terrain tops, linear features, barriers,
   scenery, props, doodads, walls, Placed Art's visual-only Scene Art, and
   explicitly persisted Subterrain on canonically exposed active faces. A face
   without authored Subterrain stays empty; capture never invents board skirts
   or cliff faces. An AI capture preserves the exact selected raster pixels and
   does not composite dormant Legacy sprites or apply a mask without live
   subjects. Per
   [ADR-0162](../adr/0162-predrawn-backgrounds-retain-live-ground-cover.md),
   live cover remains independently editable after selection and never enters
   the reference. Scenic-only terrain, retained off-board props and doodads,
   Scene Art, and Subterrain may clip at the frame without being deleted from
   the Level.
   Decorative pixels may touch the crop edge; it is presentation only and never
   supplies perimeter evidence.

   Read back the persisted Generation Reference and its exact hash, source mode,
   frame, working-copy Level revision, selected AI identity when applicable,
   geometry digest, and semantic-packet identity before creating a generation
   handoff.
   Later changes to the Level or frame create another reference; they never
   silently change that handoff's input.
2. Record `columns`, `rows`, the `(x,y)` convention, and which screen-space axis
   each coordinate follows.
3. Record the two projected grid directions as angles or vectors. Keep the
   visual grid authoritative; the numbers are reinforcement.
4. Dump every coordinate in a compact matrix. Define each token in gameplay
   language: surface, road overlay, fixed footprint, traversal, and elevation.
   Surface tokens declare semantics, not visible square patches: ordinary
   terrain must flow continuously across internal cell edges unless a real
   gameplay boundary says otherwise.
5. Express every linear feature as an unordered coordinate set plus its exact
   connected shared edges and authored exits/stubs. Never serialize a disconnected
   or branching feature as one ordered path.
6. Express fences and walls as shared coordinate edges and say whether crossing
   that edge is blocked. Do not describe an edge object as an occupied tile.
7. Enumerate the complete rectangular outer grid envelope, including envelope
   edges owned by non-playable addresses. Record intentional feature crossings as
   openings. Record passable-to-non-playable internal transitions separately;
   holes and gaps do not redefine the outer envelope.
8. Enumerate direct source-art placements separately as visual-only landmarks:
   preserve their visible contact position, rendered direction, and relative
   scale from Image 1, but never infer a footprint, blocker, elevation, or other
   gameplay authority from them.
9. State which artistic decisions are free. Boundary material may be free;
   boundary location is not.
10. Repeat the global invariants: one flat gameplay plane unless the level says
   otherwise, exact footprints, no units, no extra roads or blockers, one
   continuous painting, and a full environment outside the board.

The durable path exports these fields directly from canonical level data and
fails closed when the durable layers disagree with `boardCode`. A manually
transcribed packet is legacy/exploratory input only, not the default preparation
path and not evidence that another level is supported.

## Reusable prompt contract

The executable expansion lives in
`frontend/scripts/build-predrawn-generation-run.mjs`; its materialized
`prompt.txt` is exactly what a model receives and remains available for audit. The template
below documents the stable clauses. Replace every `{{PLACEHOLDER}}` when reading
or replaying it manually, and remove unused optional lines rather than leaving
ambiguous instructions.

```text
Use case: stylized-concept
Asset type: full-screen 16:9 tactical-game battlefield art at the model's native output size

PRIMARY REQUEST
Paint one continuous, polished environment containing the exact authored
{{COLUMNS}}-column by {{ROWS}}-row battlefield described below. Make the complete
outer grid envelope—but not its internal cell tessellation—unmistakable through
a coherent in-world environmental boundary, while the surrounding environment
continues naturally to every edge of the frame. Derive the environment,
materials, palette, lighting, texture language, and finish only from Image 1;
do not assign a named biome in text.

CAMERA-ROOM FRAME
Use the model's native 16:9 output dimensions; do not resize or upscale the image
solely to reach a fixed pixel count. Keep the complete grid envelope and its
immediate environmental boundary near the center of the frame, leaving generous
continuous, meaningful scenery on every edge for camera roaming. This is
composition guidance, not permission to change the grid and not an exact
acceptance threshold. The surrounding scene is not padding or crop
allowance.
Do not enlarge, compact, distort, or redesign the grid to fill the extra canvas.
Do not use a vignette, frame, repeated texture, empty field, or low-detail border.

REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1: THE ONLY PRIMARY IMAGE INPUT. It is immutable {{INPUT_ROLE}}
{{INPUT_VERSION_ID}}, supplied byte-for-byte from the server-bound generation
input. {{INPUT_ROLE_PROVENANCE}}
Its complete {{COLUMNS}}x{{ROWS}} board, projection, cell count, required roads,
barriers, props, materials, and landmark positions are constrained by the
semantic packet below. Visible scenery and materials are authoritative
appearance evidence even when they declare no gameplay footprint. Image 1's
edge and any model-painted boundary are not gameplay perimeter or topology
evidence and must not become an unsupported frame, cliff, void, strip, row, or
column in the output. Remove visible tile seams from ordinary terrain in the
final continuous painting.

{{INPUT_GEOMETRY_RULES}}
{{INPUT_PROVENANCE_RULES}}
The semantic packet below resolves exact meaning; Image 1 supplies appearance
and finish. Do not invent any vertical board skirt, cliff face, attached side
strip, extra row, or extra column not supported by both authorities.

NON-NEGOTIABLE OUTPUT TEST — DETILE ALL COPLANAR GROUND
The output is unusable if any horizontal terrain contains a cell-sized square,
isometric diamond, rhombus, repeated grid module, or four-sided material
island—even when no outline stroke is present. An abrupt cell-shaped change in
color, value, texture, density, wear, vegetation, or material counts as a
visible tile boundary and must be dissolved. Image 1 may expose flat
tile-shaped authoring patches; preserve their material identity and approximate
placement, but erase their polygonal contours rather than polishing or
reproducing them.

Fuse adjacent coplanar terrain into continuous material fields across the
entire frame, inside and outside the playable area, including surrounding
scenery. This applies both within one surface id and between different surface
ids or playable states at the same elevation. Replace cell-stepped interfaces
with broad, blended, irregular, non-grid-aligned transitions. Preserve topology
without preserving the square contour. Render every connected linear feature
as one continuous feature with no per-cell segmentation. Broad variation and
surface detail should cross many hidden cell edges.

The only terrain edges allowed to retain a hard grid-aligned contour are the
lips of actual, explicitly authored vertical Subterrain/cliff drop-offs declared
by the semantic packet and shown by Image 1. That narrow exception applies only
to real vertical drop geometry; it never permits a square patch, slab, panel,
or border on an adjacent horizontal top. Declared barriers and the complete
outer envelope keep their geometry, but they do not divide neighboring flat
terrain into tiles.

PROJECTION CONTRACT
Use a parallel orthographic isometric board plane, not perspective convergence.
Grid x+ moves {{AXIS_X_DESCRIPTION}}.
Grid y+ moves {{AXIS_Y_DESCRIPTION}}.
{{STEP_LENGTH_RULE}}
There are exactly {{COLUMNS}} columns ({{X_CENTER_STEP_COUNT}} center-to-center
x+ steps) and exactly {{ROWS}} rows ({{Y_CENTER_STEP_COUNT}} center-to-center y+
steps). The outer envelope spans {{COLUMNS}} complete cell widths along x+ and
{{ROWS}} complete cell widths along y+.
Preserve the exact projected outline, angles, cell aspect, and proportions
declared by the semantic packet and visual grid. Use Image 1 where it agrees;
never preserve prior-image drift over those authorities. Do not turn the board
into a square, symmetric diamond, trapezoid, perspective wedge, or another
projection.
The board may be uniformly scaled and translated to fit the composition, but
its angles, latent placement structure, and gameplay coordinates must not
change or become visible terrain edging.

COORDINATE CONVENTION
Coordinates are (x,y), x={{X_RANGE}}, y={{Y_RANGE}}.
{{COORDINATE_AXIS_EXPLANATION}}

SURFACE DEFINITIONS
{{ANONYMOUS_SURFACE_DEFINITIONS}}

EXACT {{CELL_COUNT}}-CELL CONTENT
The matrix fixes semantic occupancy and topology only. It is not a pixel-exact
mask for flat terrain edges.
{{CELL_MATRIX_WITH_PLAYABILITY_AND_ELEVATION}}

COPLANAR DE-TILING REMINDER
The matrix above is not a visible mosaic. Before finalizing, mentally ignore
roads, barriers, objects, the outer envelope, and actual vertical cliff faces.
If the remaining flat-ground color or texture changes let a viewer reconstruct
any individual cell, repeated cell size, or the x+/y+ grid axes, repaint those
changes as continuous terrain.

EXACT LINEAR-FEATURE GRAPH
{{LINEAR_FEATURE_COORDINATE_SETS_CONNECTIONS_AND_EXITS}}
Coordinate lists are unordered sets, never implied paths. Do not add, remove,
reorder, reconnect, or extend a feature beyond its explicit graph.

EXACT BLOCKING EDGE OBJECTS
{{BLOCKING_EDGES}}
Each entry is centered on the shared tile edge. It blocks only the declared
crossing and does not consume either neighboring tile unless a footprint above
explicitly says otherwise.

EXACT FIXED FOOTPRINTS
{{FIXED_FOOTPRINTS}}
This gameplay-footprint list does not enumerate scenic-only appearance.
Preserve every scenic building, structure, and prop visibly authored in Image 1
without promoting it to a gameplay footprint.

EXACT OUTER GRID ENVELOPE
{{OUTER_ENVELOPE_EDGES_AND_OPENINGS}}
This is the full rectangular coordinate envelope, including boundary edges owned
by non-playable addresses. Do not infer a different boundary from linear
features, walls, props, vegetation, texture bands, or open terrain.

EXACT INTERNAL PLAYABLE/NON-PLAYABLE TRANSITIONS
{{INTERNAL_PLAYABILITY_TRANSITIONS}}
These internal edges preserve holes and gaps without shrinking or redefining the
outer envelope.

BOUNDARY APPEARANCE
Outer-envelope LOCATION is fixed; its APPEARANCE comes from Image 1. Carry one
coherent in-world treatment derived from Image 1 around the exact envelope.
{{EXIT_THRESHOLD_RULES}} The outside world remains artistically
continuous yet clearly non-playable through material, density, roughness, or
another consistent visual distinction. Do not infer, move, or reshape the outer
envelope from the image edge. The boundary does not imply a vertical side wall:
preserve only the explicit Subterrain faces supported by the semantic packet
and visible in Image 1, and otherwise use a top-surface transition rather than a
second strip of grid-aligned terrain.

SCENE AND STYLE
Extend the visual language of Image 1 into a seamless full-screen scene. Do not
substitute a separately named biome, palette, lighting scheme, or style.
Keep every address at the gameplay elevation declared by the semantic packet.
Seam surfaces, linear features, footprints, edge objects, envelope, and
surrounding environment into one professional continuous painting.

CONSTRAINTS
No units, chess pieces, people, creatures, UI, coordinate labels, text,
watermark, or baked grid lines.
No black box, black void, floating board, vignette frame, or hard crop.
No unstated gameplay ramps, cliffs within the playable area, height tiers,
pits, tactical elevation, footprint buildings, blockers, fences, or road
branches. Preserve scenic-only buildings, structures, and props visibly
authored in Image 1.
No un-authored vertical board skirt, cliff face, attached side strip, extra row,
or extra column around the playable surface. Preserve explicitly authored
Subterrain only where the semantic packet declares it and Image 1 shows its
appearance; do not spread it or reinterpret it as gameplay height.
No checkerboard, patchwork quilt, square terrain swatches, isolated slabs,
rectangular beds, inset panels, cell-by-cell tinting, or flat-terrain seams that
reveal hidden address boundaries. Hard cell-aligned terrain edges are permitted
only at actual authored vertical Subterrain/cliff drop-offs.
Do not expand any fixed footprint beyond its declared coordinates.
{{EXTRA_CONSTRAINTS}}
Geometry and semantics above override all artistic discretion.
```

## Review loop

1. When a level-derived model input is useful, select an exact immutable Generation
   Reference in **Generation References** and choose **Copy generation
   reference** to place its exact full-resolution PNG on the clipboard. Work
   with Codex. Whenever finished artwork is available—from that handoff or any
   other source—open **Board Art Pipeline** and use **Add AI artwork**, **Paste
   AI artwork**, native paste, or **Choose PNG file**. Review
   the local preview and explicitly commit those unchanged bytes as a Raw
   Pipeline Source. This raw-source intake does not require or record the Generation Reference used
   upstream. Do not silently weaken a prepared semantic request to obtain
   prettier art. The application does not claim the model, prompt, or
   parameters used in the external conversation.
2. In **Board Art Pipeline**, choose the persistent workspace-level **New
   attempt** action and select one eligible Raw Pipeline Source. This may be the
   source just created or the exact pre-modification source already used by
   another slot. Verify the selected version and hash plus its compatible
   geometry binding. Eligibility comes from the backend; an unavailable source
   keeps its concrete reason beside that source in the chooser. For a
   provably compatible historical raw missing later coordinate metadata, the
   fenced create transaction establishes ADR-0169's external binding from the
   exact saved Level without rewriting the source. The new slot immediately
   exposes the unchanged Raw Pipeline Source as a selectable board; it does not
   copy the source back to Codex, wait for another PNG, or create another raw
   output. A compatible historical raw may be selected without fabricating its
   missing generation provenance.
3. The Raw Pipeline Source is immediately usable through **Use unchanged
   board**. This sets its exact pixels at the original viewing-pane placement
   with no corrected raster and no occlusion mask; it does not apply a fitted
   grid. If the painted grid needs a different placement, open **Adjust grid
   (optional)** against that Raw Pipeline Source. Place the complete grid
   with the owner calibration instrument. First set the
   refit row/column counts to the grid actually painted by the candidate (which
   may expose an unwanted extra row or column), register its N/E/S/W painted-image
   corners, then stretch monotonic internal guides only where painted geometry
   supplies evidence. Use `SNAP IDEAL GRID` to compare that count against the
   exact final projection angles, aspect, and equal cell spacing; it keeps the
   count and does not change the authored level. Before snapping, `PIN BOUNDARY`
   can preserve the hand-fitted painted edge as an independent magenta reference;
   its handles remain editable and it does not drive the artwork transform.
   After the coarse fit, switch to **Local cells** only where a painted
   intersection still drifts. Select a cell and move one of its adjustable
   interior shared vertices; the same vertex changes every adjacent cell, and
   the affected neighbors remain highlighted. Boundary vertices remain visibly
   locked to the coarse controls so outside scenery keeps that exact map. Use
   one-pixel or Shift+ten-pixel nudges for exact work. Reset the active vertex,
   the selected cell's shared refinements, or all local refinements without
   altering the raw source.
   One persistent Undo/Redo history covers every pending coarse, boundary,
   dimension, spacing, snap, local, and opening-restore edit. A completed drag
   is one step and compound operations remain atomic; pan, zoom, mode, and
   selection changes are not history.
4. Once the fit is correct, choose **Use fitted board**. This single owner action
   saves exact-source recovery state, fills the creation slot's one corrected-
   artwork stage, and selects that result on the working copy. There is no
   separate ordinary create or acceptance step. The versioned deterministic rasterizer
   applies the complete guide map, optional shared-vertex mesh, and four-corner
   transform once, persists a new
   full-scene raster and exact parent/provenance, and leaves the generated
   result untouched. It uses the named deterministic RGBA PNG encoder rather
   than browser-selected canvas compression, so identical sampled pixels
   produce the same artifact bytes and hash. Inspect that child in the focused
   full Board Art Pipeline workspace under the canonical live grid with grid
   toggling under owner control. Its review grid
   retains the chosen refit count even when it differs from the authored
   gameplay dimensions; this exposes extra generated rows or columns without
   creating playable cells. The same inspection surface provides a local cyan
   move-highlight preview on authored playable cells so the owner can judge
   tactical-overlay readability against the warped pixels. Its diagnostic
   toggle and sampled cell are non-persistent. It reuses the canonical live
   move treatment, stays unit-free, and never paints diagnostics into the
   artifact or turns refit-only review cells into hit targets. Runtime consumes
   these derived pixels directly and must not repeat the warp. If this fit is
   rejected before occlusion, **Discard warped
   board and adjust grid** archives this exact immutable child, clears it from
   the same creation slot, and opens the full grid fitter over the unchanged Raw
   Pipeline Source with this child's direct saved registration preloaded. The
   next warp remains in the same slot. This performs no model call, clipboard
   handoff, upload, or media copy.
   A retained or published corrected board instead exposes **Refit board**. That
   action starts a new slot from the exact raw parent and opens the fitter with
   the retained version's durable registration; it never mutates the retained
   artifact.
   At the centered viewport-cover zoom floor, pan in all four screen directions.
   Reject the composition for production if useful camera travel requires first
   zooming far in, even when the cover floor successfully hides every frame edge.
5. Only when preparing optional occlusion, fit and explicitly save the cell
   visual footprints for this exact warp. The
   persisted profile and existing controls retain their cyan move-highlight
   compatibility names. Per
   [ADR-0183](../adr/0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md),
   **Edit cyan highlights** opens the same viewport-level precision workspace as
   the grid fitter instead of confining this work to the Pipeline's center
   column. It keeps units hidden, shows the saved review grid and live cyan
   paint as the representative cell-footprint preview, and returns to the same
   slot when closed without changing the editor lease.

   Per
   [ADR-0184](../adr/0184-cyan-footprint-fitting-supports-additive-tile-selections-and-outer-border-bars.md),
   click a playable tile to select it alone, or Shift+click to add/remove tiles
   while keeping at least one selected. The last-added tile is primary and owns
   the four small point handles. Shared edges between selected tiles are hidden;
   selecting an exposed edge targets its maximal contiguous same-edge boundary
   bar, stopping at gaps, notches, disconnected components, and separate hole
   contours. Point dragging adjusts one primary-tile corner. Nudging a selected
   boundary bar shifts every segment through the existing supporting-line
   calculation and either accepts the complete group or changes nothing. Each
   saved coordinate is an integer from 0 through 10,000 inside the canonical
   cell diamond. Omitted cells use the full diamond, so **Save cyan footprints**
   with no custom cells explicitly approves the default everywhere. Custom
   shapes follow
   [ADR-0185](../adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md):
   they shape every square-local runtime move, attack, threat, blocked, premove,
   selection, focus, hover, drop, and promotion visual, plus Level Editor zone,
   tactical, ring, region, hover, and placement-preview paint. They never change
   hit targets, cell or move selection, movement, pathfinding, occupancy,
   placement validity, zone membership, grid or fence hints, or solver state.
   Per
   [ADR-0182](../adr/0182-cyan-footprint-editing-has-image-axis-locks-and-native-pixel-nudges.md),
   **Free**, **X only**, and **Y only** constrain movement on the artwork's
   image axes. Point movement preserves a locked coordinate exactly; a boundary
   nudge shifts every selected segment's line along that image axis. The visible
   arrows use one-native-artwork-pixel steps; keyboard arrows use the same step
   and Shift+Arrow uses ten pixels, independent of view zoom. Reset the selected
   tiles or all cells as needed. A boundary-bar nudge or selected reset is one
   all-or-nothing history entry. Right-drag pans, the mouse wheel zooms, and the
   visible Undo/Redo controls retain up to 100 session-local point-drag,
   point-or-boundary nudge, and reset edits. Saving persists only the current
   sparse profile as the attempt's revision-CAS latest draft bound to this warp,
   not tile/primary/boundary selection, axis state, undo history, or another
   media version.
6. Occlusion is optional and is not required to set either the unchanged or
   corrected board. When live units should pass behind painted scenery, per
   [ADR-0180](../adr/0180-predrawn-occlusion-selects-final-raster-pixels.md),
   choose **Add occlusion (optional)** for that exact warped raster after its valid
   cyan profile is saved. The focused full Board Art Pipeline workspace shows
   only the exact immutable warped PNG that will become the mask's parent;
   Legacy tiles, terrain, props, doodads, Scene Art, and their silhouettes are
   never loaded or used to seed mask pixels. Accepted alpha starts empty and
   units remain hidden.

   Wait for the revision-pinned browser-local SlimSAM worker when model help is
   useful. Place positive points on pixels to include and negative points on
   pixels to exclude, compare its three candidates, and explicitly Accept only
   the candidate worth keeping. Candidate alpha remains visibly distinct from
   accepted cyan alpha. Discard or reprompt freely. Use brush and eraser for
   exact pixel correction, with Reset and visible Undo/Redo covering manual
   selection edits. Model failure or an unsupported inference backend never
   blocks this manual path.

   On **Create board with occlusion mask**, each 8-connected accepted-alpha
   component is processed independently. In every source-image column it
   occupies, its bottom-most selected pixel supplies the projected
   ground-contact depth through the exact parent dimensions and world bounds;
   that component's selected pixels above it in the same column share the
   contact depth. The application hashes the accepted alpha and records the
   exact model/revision/backend, prompt/manual counts, depth algorithm, raster
   parent, dimensions, coordinate basis, canonical environment-geometry
   revision/hash, depth convention, generator version, and content hash.
   Nothing is persisted before that explicit create action.

   Inspect the immutable artifact's real clipping before Set. Its attached
   depth data is internal to that one selectable artifact, not an independent
   owner-facing mask choice, and runtime performs no segmentation inference.
   The saved cyan profile remains a required review gate, not mask pixels. A
   missing or mismatched selected mask fails closed and is never reconstructed
   from ordinary sprites.

   Per
   [ADR-0181](../adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
   reject an unsatisfactory result with **Discard mask & edit again**. The
   action preserves this slot's exact warp, fitted registration, and cyan
   profile, then reopens the mask editor. If the working Level selected the old
   mask it falls back to the same warp without occlusion; canonical content
   remains unchanged until the ordinary Save or Publish boundary. The old
   immutable result is archived when unreferenced or retained as canonical
   history when still needed.
7. Choose **Use unchanged board** for a Raw Pipeline Source, or choose the exact
   optional derived artifact and press **Set this board version**. Verify the
   editor identifies it as the remembered working-copy AI selection. A fitted
   selection embeds the exact canonical compatibility-named profile and digest
   in the Level's schema-version-3 surface; later edits to the attempt draft
   cannot mutate that snapshot. Historical schema-version-2 selections continue
   to use full diamonds for every square-local highlight. Set does not Save,
   Publish, or silently change canonical content.
   Use the separate Legacy/AI mode control to choose which background the Level
   actually renders, then use private Save or official Review and
   publish/Publish to cross the applicable canonical boundary. Read back both
   saved mode and exact selection.
   The manual Codex handoff ends when the Raw Pipeline Source is committed.
   Derivation and installation require no further handoff, copied packet,
   editor URL, browser-local authority, or filesystem transform.
8. Classify misses separately: projection/cell geometry, cell-visual footprint,
   semantic placement,
   perimeter readability, invented height, extra perimeter strips, visible
   square terrain patching, footprint scale, occlusion, or style.
9. Change the smallest relevant prompt section and preserve the rest. Start a
   new generation handoff for a changed working-copy semantic request or
   Generation Reference. If the exact external prompt is retained as text
   provenance, keep it separately; the application does not claim that prompt,
   its model, or its parameters.
   Reject a committed warp or mask with its same-slot discard action when the
   Raw Pipeline Source and approved upstream work remain valid. Start another
   deterministic slot when changing the Raw Pipeline Source or intentionally
   keeping alternative current results side by side.

Grid calibration measures and deterministically aligns coarse separable drift
plus bounded local painted-grid-line drift over the complete plate. Local
correction is one continuous shared-vertex mesh and cannot rescue semantic
errors, move an object independently, accept folded/non-monotonic geometry, or
hide large corrections that show the candidate missed the requested projection. An approved calibrated
candidate becomes a production choice by creating and selecting its immutable
registered-raster child and matching mask state in that creation slot. The Raw
Pipeline Source remains an immutable parent, while the child intentionally owns
the one deterministic rasterization. The Level stores the exact version
selection rather than runtime alignment instructions.

## Amendment log

- **2026-08-05 — fitted grid is one durable selection action:**
  [ADR-0468](../adr/0468-using-a-fitted-grid-saves-and-selects-its-board.md)
  makes **Use fitted board** create/resume the immutable corrected raster and
  select it on the working copy. Exact-source recovery prevents silent reseeding;
  unchanged raw selection explicitly ignores the fit.
- **2026-08-05 — raw boards bypass optional processing:** ADR-0158's selectable
  immutable raw root and explicit no-occlusion selection are surfaced directly
  as **Use unchanged board**. Grid correction and occlusion remain available as
  optional derived tools rather than acceptance gates.
- **2026-08-05 — source-agnostic AI artwork intake:**
  [ADR-0466](../adr/0466-ai-artwork-intake-is-source-agnostic.md) keeps
  Generation References as an optional model-input library while Board Art
  Pipeline accepts any valid PNG. Intake records exact raw bytes plus current
  working-copy semantics and geometry, not a producing-reference relation.
- **2026-07-26 — fitted cells shape every square-local visual:**
  [ADR-0185](../adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md)
  broadens the fitted quadrilateral from cyan move paint to all runtime and
  Level Editor square-local highlight paint. Canonical interaction, movement,
  occupancy, zone, topology, and solver geometry remain unchanged, and the
  existing profile/schema/database names remain compatibility vocabulary with
  no migration.
- **2026-07-26 — multi-tile cyan boundary fitting:**
  [ADR-0184](../adr/0184-cyan-footprint-fitting-supports-additive-tile-selections-and-outer-border-bars.md)
  adds Shift+click tile selection, one primary tile for point handles, and
  exposed contiguous boundary bars while hiding internal shared edges.
  Boundary nudges and selected resets remain all-or-nothing single history
  steps without changing the persisted profile contract.
- **2026-07-26 — mask retries stay in the same slot:**
  [ADR-0181](../adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md)
  renames the final owner-facing artifact **Board with occlusion mask** and adds
  **Discard mask & edit again**. The fenced action preserves the warp,
  registration, cyan profile, and slot while detaching only the immutable
  current mask and returning to the full editor. A matching working selection
  falls back to warp-only; canonical content changes only through Save or
  Publish.
- **2026-07-26 — per-cell cyan move footprints:**
  [ADR-0179](../adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)
  gives each post-warp attempt one revision-CAS latest sparse profile, edited
  with four contained visual-only handles per playable cell in a full reversible
  workspace. A saved profile is required before new occlusion; Set embeds its
  exact digest-bound snapshot in a schema-version-3 Level surface, while
  schema-version-2 Levels retain full-diamond compatibility. ADR-0185 later
  partially supersedes this entry's original cyan-only rendering scope.
- **2026-07-26 — viewport-level cyan fitting and whole-edge edits:**
  [ADR-0183](../adr/0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md)
  moves cyan fitting from the Pipeline center column into the grid fitter's
  viewport-level precision workspace. A cell point remains individually
  editable, while selecting an edge lets one native-pixel nudge move its whole
  supporting line and jointly derive both endpoints in one Undo step.
- **2026-07-25 — one reversible grid-fitting history:** ADR-0178 gives Coarse
  grid and Local cells one bounded session-local Undo/Redo stack over the exact
  complete pending calibration. Every successful adjustment is reversible,
  completed drags and compound actions are atomic, and view navigation does not
  pollute history.
- **2026-07-25 — Level Artwork and Placed Art are separate:**
  [ADR-0176](../adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md)
  names the AI background process destination **Level Artwork** and groups
  direct placement under **Placed Art** with a Scene Art / Doodads / Props selector.
  Scene Art remains free projected-pixel, gameplay-inert generation input and
  is the only Placed Art type that accepts new off-board positions. Doodads are
  playable-only and nonblocking; complete Prop footprints are playable-only
  and blocking. Existing off-board doodads and props remain visible in
  references and removable without a destructive migration.
- **2026-07-25 — shared local grid refinement:** ADR-0171 retains the
  four-corner and row/column coarse fit, then allows at most 1,024 sparse
  source-pixel overrides at shared grid intersections. A version-5 mesh
  registration uses `grid-warp-v2` /
  `shared-predrawn-rasterizer-v2`; v1-v4 registrations keep the exact v1
  evaluator. Neighboring cells share every edge, all affected cells must remain
  non-folded, boundary nodes stay coarse, and the complete painting including
  outside scenery is rasterized once.
- **2026-07-24 — historical raw-contract proof:** ADR-0169 keeps historical raw
  operation and provenance metadata immutable. Fenced processing-attempt
  creation may establish one external coordinate/viewing-pane binding only
  after exact saved-Level frame/bounds, v1 geometry, content, and provenance
  proof. The backend owns picker eligibility, and every failure stays beside
  the affected source in the open chooser.
- **2026-07-24 — creation slots begin with reusable raw inputs:** ADR-0168
  separates model handoff from deterministic processing. Workspace-level **New
  attempt** selects one exact retained Raw Pipeline Source and immediately
  starts at grid fitting. Several slots may reference the same raw without
  mutation, reclassification, upload, or media duplication. Each slot owns
  only its warp and occlusion-ready results.
- **2026-07-24 — superseded raw-as-model-input path:** ADR-0167 briefly treated
  an existing Raw Pipeline Source as input to another model handoff and expected
  a second raw result. ADR-0168 supersedes that path; it is not the current
  workflow.
- **2026-07-23 — explicit manual model bridge:** ADR-0166 names the immutable
  model input **Generation Reference** and the returned AI-painted PNG **Raw
  Pipeline Source**. The handoff copies the exact full-resolution reference,
  stages clipboard or file ingress for review, and explicitly commits the
  returned bytes. An explicitly mounted preexisting Codex result may be
  imported directly as raw. The application does not claim the external
  conversation's model, prompt, or parameters. ADR-0168 supersedes ADR-0166's
  placement of that handoff inside a deterministic creation attempt.
- **2026-07-22 — saved references, bounded attempts, and persistent background
  mode:** ADR-0165 separates the immutable image supplied to AI from generated
  runtime art. The object now named Generation Reference captures the saved
  active Legacy or AI background without units, cover, overlays, or UI. The
  side-control page now named Level Artwork remains separate from its
  URL-addressable reference and pipeline managers. The Level saves Legacy/AI mode
  independently from its remembered AI selection. ADR-0168 supersedes the
  original generated-stage ownership inside each attempt.
- **2026-07-20 — immutable owner-operated installation:** ADR-0158 replaces the
  runtime warp, runtime sprite-derived occlusion, and mandatory Codex handoff.
  Upload creates a settable immutable raw root; grid adjustment emits a raster
  child; occlusion emits a persisted depth-aware mask child; `Set` affects only
  the fenced working copy, and Save/Publish remains the canonical boundary.
- **2026-07-20 — scenic appearance is not a gameplay footprint:** owner review
  found that `EXACT FIXED FOOTPRINTS (0)` and the prohibition on unstated
  buildings could erase houses visibly authored in Image 1. The prompt now
  distinguishes gameplay footprints from scenic-only appearance, explicitly
  preserves every visible scenic building/structure/prop, and supports a named
  `restore-source-scenery` comparative edit for an otherwise useful candidate.
- **2026-07-20 — coplanar terrain de-tiling:** owner review found that merely
  prohibiting seams was contradicted by asking the model to preserve unlike
  surface transitions. Cell and surface assignments now own material placement
  and topology without owning a square pixel contour. Every same-elevation
  transition must blend into an irregular, non-grid-aligned continuous field;
  only explicitly authored vertical Subterrain/cliff drop-offs may retain a
  hard grid-aligned terrain edge.
- **2026-07-19 — saved owner-authored generation frame:** ADR-0142 replaces the
  complete-paint-bounds capture with a canonical saved 16:9 crop chosen through
  the Level Editor instrument. Required gameplay-authoritative reference geometry
  must remain fully inside; scenic-only art may clip or be excluded. The crop
  edge is not the gameplay perimeter, and generated output remains a continuous
  full scene rather than a hard-cropped board.
- **2026-07-19 — explicit Subterrain in the generation reference:** ADR-0141
  partially supersedes the blanket top-surfaces-only exclusion. The canonical
  image preserves only explicitly persisted Subterrain resolved onto exposed
  active visual-terrain faces inside the ADR-0142 frame. An absent face remains
  empty, and prompts prohibit spreading that art into a generic skirt, cliff,
  attached strip, or gameplay height.
- **2026-07-14 — self-validating preparation:** ADR-0125 removes the deterministic
  owner checkpoint. A fail-closed pass reports `ready-for-generation`; mandatory
  owner judgment begins after an actual candidate exists.
- **2026-07-14 — board-driven preparation instrument:** added one-command
  preparation from a canonical official level id, a click-reachable generic
  generation-reference/download tool, exact graph/envelope derivation, measured
  Chrome capture, and a fail-closed request manifest. No grid dimensions or
  capture coordinates are supplied on the command line or hard-coded per level.
- **2026-07-14 — actual image size and saved production alignment (production
  path superseded by ADR-0158):** ADR-0123 removed the fixed 3840x2160 acceptance
  gate but kept runtime alignment in the Level. The current path preserves exact
  uploaded bytes as the immutable raw parent, materializes alignment into a new
  registered-raster child, and stores the exact raster-plus-mask version
  selection instead of runtime alignment instructions.
- **2026-07-14 — isolated pipeline test (now the ADR-0165 Legacy-reference
  default):** removed prior candidates, beauty renders, accepted plates, and
  unrelated style images from the default input. One immutable Legacy
  Generation Reference plus serialized semantics and text direction must be
  sufficient.
- **2026-07-14 — ground-cover-free art authority:** generation-reference exports
  suppress grass and other additive cover while preserving terrain, roads,
  barriers, props, and visual-only Scene Art. ADR-0162 keeps that
  input clean while restoring explicitly authored ground cover as an independent
  live layer over the selected raster.
- **2026-07-14 — measured export bounds (superseded by ADR-0142):** the initial
  export framed the complete rendered paint bounds with padding and failed when
  artwork touched a capture edge. The current path instead uses the saved
  canonical generation frame and permits scenic-only pixels to clip.
- **2026-07-14 — camera overscan:** separated pixel resolution from camera room.
  ADR-0118 later removed this amendment's exact 3840x2160 and centered-60%
  acceptance gates; the current recipe retains a centered safe area as prompt
  guidance and judges camera room by four-direction panning in the real viewer.
- **2026-07-14 — locked editor review before acceptance (temporary-source clause
  superseded by ADR-0158):** the current editor activates the complete baked-art
  lock from an immutable raw or registered background version; temporary source
  metadata is not installation authority.
- **2026-07-14 — compact registration handoff (installation role superseded by
  ADR-0158):** the saved-value-only copy remains optional diagnostic/provenance
  export. The owner derives, sets, saves, and publishes exact versions directly
  in the application without an agent, editor URL, or shared browser-local state.
- **2026-07-13 — independent pinned boundary:** added a persistent four-line
  painted-edge reference that remains visible and editable while the working
  grid is snapped or tuned, without affecting rendering or gameplay.
- **2026-07-13 — ideal-grid snap:** added a deterministic snap from the current
  refit count and placement to the exact canonical projection with equal cells,
  giving the owner a final-geometry template for count experiments.
- **2026-07-13 — post-picker grid continuity:** the visible candidate-review
  grid now retains the saved refit row/column count after `DONE`, while editor
  hit targets and gameplay cells remain authored-level geometry.
- **2026-07-13 — owner-configurable refit dimensions:** the calibration target's
  row and column counts may be set to the candidate's visibly painted grid. This
  prevents an extra generated column from being compressed into the authored
  board and leaves the mismatch visible against the unchanged gameplay grid.
- **2026-07-13 — owner-fitted full-grid calibration:** replaced the corner-only
  review step with monotonic row/column fitting, a numeric distortion report, and
  a development inverse-warp preview over the complete continuous painting.
- **2026-07-13 — top-surfaces-only and continuous terrain:** removed decorative
  vertical board sides from geometry inputs so they cannot become an extra
  row/column; ordinary terrain tokens now describe gameplay semantics only, and
  the painting must dissolve tile swatches into broad irregular variation that
  crosses hidden cell boundaries.
- **2026-07-13 — initial recipe:** added strict reference roles, a full tile and
  edge semantic packet, orthographic axis directions, explicit perimeter edges,
  creative-appearance/fixed-location boundary language, one-plane and no-units
  constraints, and full-scene continuation beyond the board.
