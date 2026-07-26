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

The normal owner-operated preparation path is one command from `frontend/`:

```text
npm run predrawn:prepare -- --base-url <running-vite-url> --level-id <official-level-id>
```

It builds the shared renderer, loads the exact saved official level, derives the
board dimensions and semantic geometry, captures the saved owner-framed 16:9
generation reference—terrain tops plus explicitly persisted and exposed
Subterrain visible inside that frame—through Chrome, and writes the complete
request under `tmp-shots/predrawn-preparation/<run-id>/`. It self-validates and finishes with
`status: ready-for-generation`; it never calls an image model. Open the
click-reachable **Pre-drawn art → Reference** tool in the Level Editor to inspect
or download the same level-driven reference without the command. Preparation
fails closed until the canonical saved level contains a valid generation frame.

The lower-level request builder remains available for replaying an already
materialized definition/reference pair:

```text
npm run predrawn:build-run -- --definition <definition.json> --reference <generation-reference.png> --out <run-directory>
```

The shared preflight writes the fully expanded `prompt.txt`, canonical
`packet.json`, ordered and content-hashed `references.json`, and hashed
`request-manifest.json`. Per ADR-0125, deterministic preparation reports
`ready-for-generation` without an owner checkpoint. The artifacts remain
inspectable for audit; mandatory owner judgment begins with the generated
candidate on the game-owned review surface. Template prose and amendment
sections are not executable provenance.

### Named comparative refinement

After owner review identifies one localized miss in an otherwise useful
candidate, [ADR-0156](../adr/0156-named-predrawn-candidate-refinements-are-separate-non-isolated-branches.md)
permits a separately named comparative refinement branch.
It does not count as evidence that the isolated pipeline works. Build it through
the same preflight rather than assembling an edit prompt only in chat:

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
manifest, canonical reference bytes, and candidate bytes before writing a new
request. Image 1 remains the canonical geometry and appearance authority. Image
2 is the subordinate owner-reviewed edit target. The exact parent packet is
copied byte-for-byte, and the new manifest records both image hashes, parent
manifest hash, operation, branch, and `isolatedPipelineEvidence: false`.
Refinement output never overwrites its parent and requires a fresh owner review.

The first worked example is
[`predrawn-board-generation-fortress-gate.md`](predrawn-board-generation-fortress-gate.md).

## Background-version geometry identity

Every new generated, warped, or occlusion-ready artifact records the
cover-independent `predrawn-environment-geometry-v2` digest. Per
[ADR-0163](../adr/0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md),
an existing immutable v1 artifact is not regenerated or rewritten merely
because its historical digest included cover. The backend may bind that exact
v1 claim to v2 only after reproducing it from a server-held Level at a fenced
autosave, direct derivative creation, or Save/Publish boundary. A GET or preview
never performs migration. Once bound, changing live cover leaves the artifact
valid. Per
[ADR-0164](../adr/0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md),
changing baked terrain or environment geometry may remain safely autosaved or
recovered as an owner draft, but the earlier artifact is marked stale and its
Set and derivation actions are disabled. Save and Publish remain blocked until
the geometry again matches or a complete artifact for the current v2 digest is
selected.

## Authority order

Every input must have one named role. Never give several references without
stating which questions each is allowed to answer.

1. **Canonical generation-reference image:** exact unit-free, ground-cover-free
   authored surface inside the saved owner-authored 16:9 frame, including only
   explicitly persisted Subterrain that the canonical topology resolves onto
   exposed active visual-terrain faces within that frame. It owns visible
   geometry and all appearance shown by the crop: environment, materials,
   palette, lighting, texture language, boundary vocabulary, and finish. An
   absent face remains empty; never derive or synthesize a skirt, cliff, lip,
   cap, or attached side strip. Authored Subterrain is appearance, not gameplay
   height. Scenic-only art outside the saved frame has no authority in that
   request, and the crop edge is never the gameplay perimeter.
2. **Semantic packet:** canonical dimensions, coordinate convention, projection,
   per-address contents, linear-feature graphs, blocking edges, footprints,
   exits, the full outer grid envelope, and internal playable/non-playable
   transitions. It owns deterministic gameplay meaning.
3. **Text transformation requirements:** own only continuity, output framing,
   camera room, and prohibited inventions. Text must not name a biome or provide
   an independent style, palette, lighting scheme, material treatment,
   atmosphere, or terrain-detail list. The isolated default passes no prior
   candidate, accepted plate, beauty render, or unrelated board image.

The image wins questions of visible treatment; the semantic packet wins exact
topology and gameplay meaning. State this split inside the prompt.

## Prepare the packet

Before generation:

1. In the Level Editor, position and zoom the authored scene beneath the visible
   16:9 **Generation frame**, then choose **Apply to working copy**. The exact
   preview stays open and identifies whether the crop is still preview-only,
   saving, acknowledged by the durable working copy, or already canonical. A
   persistent Board-panel readout repeats the frame dimensions, origin, and
   persistence state after the picker closes. For an official level, use
   **Review & publish** to enter the existing Status/Publish workflow; applying
   the frame never promotes it by itself. Wait for the working-copy
   acknowledgement, then publish before preparing the level. **Published
   reference** deliberately reads only that canonical result. The saved value is a
   screen-aligned rectangle in canonical projected-board coordinates, never raw
   browser pan, zoom, CSS pixels, viewport dimensions, or device-pixel ratio.
   Open the generic `/predrawn-reference?levelId=<id>` owner tool or let
   `predrawn:prepare` capture its explicit `capture=1` transaction. It loads the
   canonical saved level rather than a board-specific fixture and must fail when
   the frame is missing, invalid, or does not fully contain the complete playable
   outer envelope and every gameplay-authoritative reference draw represented by
   the semantic packet. Export the exact saved crop without units or additive
   ground cover. Inside it, preserve authored terrain tops, linear features,
   barriers, props, floating visual-only source artwork, and explicitly persisted Subterrain on canonically exposed
   active visual-terrain faces. Suppress grass tufts and other additive ground
   cover because those pixels create avoidable occlusion in the generation
   reference. Per
   [ADR-0162](../adr/0162-predrawn-backgrounds-retain-live-ground-cover.md), the
   owner may add or change live ground cover after selecting the generated
   raster; it is not part of this generation input. Do not let pieces,
   selection overlays, UI,
   un-authored board skirts, or invented cliff faces enter the geometry input.
   Explicit Subterrain is authoritative appearance without gameplay height;
   every other vertical side can be mistaken for an extra row or column even
   when it is only presentation art. Scenic-only terrain, props, floating source
   artwork, and Subterrain
   may be clipped or excluded by the saved frame without being deleted from the
   level. Decorative pixels may touch the crop edge; do not restore the retired
   global all-alpha clearance rule. The crop edge is presentation only and never
   supplies perimeter evidence.
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
Image 1: THE ONLY IMAGE INPUT. It is the canonical unit-free, ground-cover-free,
TERRAIN-TOPS-PLUS-EXPLICIT-SUBTERRAIN render of this exact level, clipped to the
owner's saved 16:9 generation frame. Its complete {{COLUMNS}}x{{ROWS}} board,
projection, cell count, required roads, barriers, props, materials, and landmark
positions are authoritative. Scenic-only art outside this deliberate source crop
is not an input. Scenic buildings and props visible inside the crop remain
authoritative appearance even when they declare no gameplay footprint; preserve
them exactly where Image 1 shows them. The rectangular Image 1 edge is not the gameplay perimeter and
must not become a frame, cliff, void, or boundary in the output. Remove visible
tile seams from ordinary terrain in the final continuous painting. Every visible vertical
terrain face in Image 1 is an explicitly persisted Subterrain placement. Preserve
those authored exposed faces as appearance without turning them into gameplay
height. Do not invent any other vertical board skirt, cliff face, attached side
strip, extra row, or extra column.

No prior generated candidate, accepted whole-level plate, beauty render, or
unrelated style image is supplied. The semantic packet below resolves exact
meaning; Image 1 supplies appearance and finish.

NON-NEGOTIABLE OUTPUT TEST — DETILE ALL COPLANAR GROUND
The output is unusable if any horizontal terrain contains a cell-sized square,
isometric diamond, rhombus, repeated grid module, or four-sided material
island—even when no outline stroke is present. An abrupt cell-shaped change in
color, value, texture, density, wear, vegetation, or material counts as a
visible tile boundary and must be dissolved. Image 1 necessarily exposes flat
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
lips of actual, explicitly authored vertical Subterrain/cliff drop-offs visible
in Image 1. That narrow exception applies only to real vertical drop geometry;
it never permits a square patch, slab, panel, or border on an adjacent
horizontal top. Declared barriers and the complete outer envelope keep their
geometry, but they do not divide neighboring flat terrain into tiles.

PROJECTION CONTRACT
Use a parallel orthographic isometric board plane, not perspective convergence.
Grid x+ moves {{AXIS_X_DESCRIPTION}}.
Grid y+ moves {{AXIS_Y_DESCRIPTION}}.
{{STEP_LENGTH_RULE}}
There are exactly {{COLUMNS}} columns ({{X_CENTER_STEP_COUNT}} center-to-center
x+ steps) and exactly {{ROWS}} rows ({{Y_CENTER_STEP_COUNT}} center-to-center y+
steps). The outer envelope spans {{COLUMNS}} complete cell widths along x+ and
{{ROWS}} complete cell widths along y+.
Preserve the exact projected outline, angles, cell aspect, and proportions in
Image 1. Do not turn it into a square, symmetric diamond, trapezoid, perspective
wedge, or another projection.
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
envelope from the rectangular source-crop edge. The boundary does not imply a
vertical side wall: preserve only the explicit Subterrain faces visible in Image
1, and otherwise use a top-surface transition rather than a second strip of
grid-aligned terrain.

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
Subterrain from Image 1 only on its shown exposed faces; do not spread it or
reinterpret it as gameplay height.
No checkerboard, patchwork quilt, square terrain swatches, isolated slabs,
rectangular beds, inset panels, cell-by-cell tinting, or flat-terrain seams that
reveal hidden address boundaries. Hard cell-aligned terrain edges are permitted
only at actual authored vertical Subterrain/cliff drop-offs.
Do not expand any fixed footprint beyond its declared coordinates.
{{EXTRA_CONSTRAINTS}}
Geometry and semantics above override all artistic discretion.
```

## Review loop

1. Generate one candidate. Do not silently weaken the packet to obtain prettier
   art.
2. Open the Level Editor's dedicated **AI Artwork** workspace and upload the
   complete PNG. This creates a distinct **Codex-generated board**, records its
   exact hash and dimensions, and makes that exact immutable version selectable
   in the real game. It is not merely temporary handoff material.
3. Place the complete grid with the owner calibration instrument. First set the
   refit row/column counts to the grid actually painted by the candidate (which
   may expose an unwanted extra row or column), register its N/E/S/W source
   corners, then stretch monotonic internal guides only where painted geometry
   supplies evidence. Use `SNAP IDEAL GRID` to compare that count against the
   exact final projection angles, aspect, and equal cell spacing; it keeps the
   count and does not change the authored level. Before snapping, `PIN BOUNDARY`
   can preserve the hand-fitted painted edge as an independent magenta reference;
   its handles remain editable and it does not drive the artwork transform.
4. Choose **Generate warped board** to create the registered-raster child. The
   workspace shows this as a separate **Warped board**. The versioned deterministic rasterizer
   applies the complete guide map and four-corner transform once, persists a new
   full-scene raster and exact parent/provenance, and leaves the raw root
   untouched. It uses the named deterministic RGBA PNG encoder rather than
   browser-selected canvas compression, so identical sampled pixels produce the
   same artifact bytes and hash. Inspect that child under the canonical live grid with grid toggling
   under owner control. Its review grid retains the chosen refit count even when
   it differs from the authored gameplay dimensions; this exposes extra generated
   rows or columns without creating playable cells. Runtime will consume these
   derived pixels directly and must not repeat the warp.
   At the centered viewport-cover zoom floor, pan in all four screen directions.
   Reject the composition for production if useful camera travel requires first
   zooming far in, even when the cover floor successfully hides every frame edge.
5. Choose **Generate occlusion-ready board** for that exact warped raster. The
   workspace shows a separate **Occlusion-ready board** whose attached depth data
   is an internal part of that one selectable artifact, not an independent
   owner-facing mask choice. The depth data records its raster parent, dimensions,
   coordinate basis, canonical environment-geometry revision/hash, depth
   convention, generator version, and content hash. Compare the stored mask and
   real unit clipping before/after. A missing or mismatched selected mask fails
   closed and is never silently reconstructed from ordinary sprites.
6. Choose the exact board version and press **Set this board version**. Verify the editor
   identifies that artifact as the working-copy background. Set changes only
   the current fenced working copy; it does not Save or Publish. Use private
   Save to pin owner-scoped canonical content without making its media public,
   or official Review and publish/Publish to cross the public canonical
   boundary, then read back the exact version selection from the canonical Level.
   Derivation and installation require no Codex handoff, copied packet, editor
   URL, browser-local authority, or filesystem transform.
7. Classify misses separately: projection/cell geometry, semantic placement,
   perimeter readability, invented height, extra perimeter strips, visible
   square terrain patching, footprint scale, occlusion, or style.
8. Change the smallest relevant prompt section and preserve the rest. Record the
   exact revised prompt as the next run's text provenance.

Grid calibration measures and deterministically aligns separable internal
row/column drift over the complete plate. It cannot rescue semantic errors,
folded/non-monotonic geometry, independent landmark drift, or large corrections
that show the candidate missed the requested projection. An approved calibrated
candidate becomes a production choice by creating and selecting its immutable
registered-raster child and matching mask state. The raw uploaded bytes remain
an immutable parent, while the child intentionally owns the one deterministic
rasterization. The Level stores the exact version selection rather than runtime
alignment instructions.

## Amendment log

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
- **2026-07-14 — isolated pipeline test:** removed prior candidates, beauty
  renders, accepted plates, and unrelated style images from the default input.
  One canonical generation-reference art export plus serialized semantics and
  text direction must be sufficient.
- **2026-07-14 — ground-cover-free art authority:** generation-reference exports
  suppress grass and other additive cover while preserving terrain, roads,
  barriers, props, and floating visual-only source artwork. ADR-0162 keeps that
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
