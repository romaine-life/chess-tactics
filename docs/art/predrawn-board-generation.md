# Pre-drawn Whole-Level Generation

This is the mutable recipe for turning an authored level into one continuous
full-scene painting without giving the image generator permission to redesign
the level. It implements
[ADR-0109](../adr/0109-predrawn-generation-packets-preserve-authored-level-semantics.md).

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

The first worked example is
[`predrawn-board-generation-fortress-gate.md`](predrawn-board-generation-fortress-gate.md).

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
   cover: those pixels create avoidable occlusion and runtime may add accepted
   generated cover independently. Do not let pieces, selection overlays, UI,
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
{{COLUMNS}}-column by {{ROWS}}-row battlefield described below. Make the outer
grid envelope unmistakable through a coherent in-world environmental boundary, while
the surrounding environment continues naturally to every edge of the frame. Derive
the environment, materials, palette, lighting, texture language, and finish only
from Image 1; do not assign a named biome in text.

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
is not an input. The rectangular Image 1 edge is not the gameplay perimeter and
must not become a frame, cliff, void, or boundary in the output. Remove visible
tile seams from ordinary terrain in the final continuous painting. Every visible vertical
terrain face in Image 1 is an explicitly persisted Subterrain placement. Preserve
those authored exposed faces as appearance without turning them into gameplay
height. Do not invent any other vertical board skirt, cliff face, attached side
strip, extra row, or extra column.

No prior generated candidate, accepted whole-level plate, beauty render, or
unrelated style image is supplied. The semantic packet below resolves exact
meaning; Image 1 supplies appearance and finish.

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
The board may be uniformly scaled and translated to fit the composition, but its
angles, cell structure, and gameplay coordinates must not change.

COORDINATE CONVENTION
Coordinates are (x,y), x={{X_RANGE}}, y={{Y_RANGE}}.
{{COORDINATE_AXIS_EXPLANATION}}

SURFACE DEFINITIONS
{{ANONYMOUS_SURFACE_DEFINITIONS}}

EXACT {{CELL_COUNT}}-CELL CONTENT
{{CELL_MATRIX_WITH_PLAYABILITY_AND_ELEVATION}}

SURFACE CONTINUITY CONTRACT
Cell coordinates are semantic addresses, not visible square texture swatches.
Do not preserve, redraw, or imply the individual square boundaries of ordinary
terrain. Do not give each cell its own rectangular patch, tint, border, bevel,
or repeated texture treatment. Continue the visible treatment in Image 1 as
continuous surfaces with broad irregular, non-grid-aligned variation derived
from that image. Those variations may cross many cell boundaries and must not
reveal the hidden grid. Preserve only real authored transitions between unlike
surfaces, elevations, playable/non-playable addresses, linear features,
footprints, barriers, and the outer envelope.

EXACT LINEAR-FEATURE GRAPH
{{LINEAR_FEATURE_COORDINATE_SETS_CONNECTIONS_AND_EXITS}}
Coordinate lists are unordered sets, never implied paths. Do not add, remove,
reorder, reconnect, or extend a feature beyond its explicit graph.

EXACT BLOCKING EDGE OBJECTS
{{BLOCKING_EDGES}}
Each entry is centered on the shared tile edge. It blocks only the declared
crossing and does not consume either neighboring tile unless a footprint above
explicitly says otherwise.

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
No unstated ramps, cliffs within the playable area, height tiers, pits, tactical
elevation, buildings, blockers, fences, or road branches.
No un-authored vertical board skirt, cliff face, attached side strip, extra row,
or extra column around the playable surface. Preserve explicitly authored
Subterrain from Image 1 only on its shown exposed faces; do not spread it or
reinterpret it as gameplay height.
No checkerboard, patchwork quilt, square terrain swatches, cell-by-cell tinting, or
terrain seams that reveal ordinary tile boundaries.
Do not expand any fixed footprint beyond its declared coordinates.
{{EXTRA_CONSTRAINTS}}
Geometry and semantics above override all artistic discretion.
```

## Review loop

1. Generate one candidate. Do not silently weaken the packet to obtain prettier
   art.
2. Mount the complete candidate in the real game as a temporary pre-drawn plate.
3. Place the complete grid with the owner calibration instrument. First set the
   refit row/column counts to the grid actually painted by the candidate (which
   may expose an unwanted extra row or column), register its N/E/S/W source
   corners, then stretch monotonic internal guides only where painted geometry
   supplies evidence. Use `SNAP IDEAL GRID` to compare that count against the
   exact final projection angles, aspect, and equal cell spacing; it keeps the
   count and does not change the authored level. Before snapping, `PIN BOUNDARY`
   can preserve the hand-fitted painted edge as an independent magenta reference;
   its handles remain editable and it does not drive the artwork transform.
4. Save the registration, inspect the reported correction range, and compare
   the inverse-warped complete plate under the canonical live grid with grid
   toggling under owner control. After the picker closes, the temporary review
   grid retains the saved refit count even when it differs from the authored
   gameplay dimensions; this exposes extra generated rows or columns without
   creating playable cells. The registered candidate activates the real
   editor's pre-drawn lock immediately; live-media acceptance is not required
   for this review, and the temporary source is not persisted into the level.
   If the owner accepts the result, promotion keeps the candidate bytes at their
   actual dimensions and saves only the stable media slot plus the exact approved
   versioned alignment payload in the Level. Its pinned boundary round-trips but
   remains display-only. Promotion does not save the temporary source, candidate
   id, browser-local key, or picker state.
   At the centered viewport-cover zoom floor, pan in all four screen directions.
   Reject the composition for production if useful camera travel requires first
   zooming far in, even when the cover floor successfully hides every frame edge.
   Turn `Occlusion` on and off to compare the real depth pass, then turn
   `Seed mask` on to inspect the exact canonical prop/fence/post/wall silhouettes
   in magenta. This is deterministic board-geometry evidence, not visual-model
   segmentation of the candidate. Reject or regenerate a candidate whose painted
   raised geometry does not align closely enough with that seed.
5. After saving and read-back verification, use `COPY CODEX HANDOFF` to transfer
   the exact source and serialized registration to the agent. Do not copy the
   editor address bar; route, document, layer, and browser state are not part of
   the calibration.
6. Classify misses separately: projection/cell geometry, semantic placement,
   perimeter readability, invented height, extra perimeter strips, visible
   square terrain patching, footprint scale, occlusion, or style.
7. Change the smallest relevant prompt section and preserve the rest. Record the
   exact revised prompt as the next run's text provenance.

Grid calibration measures and deterministically aligns separable internal
row/column drift over the complete plate. It cannot rescue semantic errors,
folded/non-monotonic geometry, independent landmark drift, or large corrections
that show the candidate missed the requested projection. An approved calibrated
candidate becomes production art by promoting its untouched bytes and copying
the exact approved versioned alignment into the pre-drawn background declaration.
Do not bake the alignment into new pixels or regenerate merely to reach a fixed
output size.

## Amendment log

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
- **2026-07-14 — actual image size and saved production alignment:** ADR-0118
  removes the fixed 3840x2160 acceptance gate. Promotion keeps the exact approved
  bytes and stores actual dimensions plus the exact approved whole-image
  alignment in the Level. The pinned boundary round-trips but stays display-only;
  preview identity and browser state remain outside canonical content.
- **2026-07-14 — isolated pipeline test:** removed prior candidates, beauty
  renders, accepted plates, and unrelated style images from the default input.
  One canonical generation-reference art export plus serialized semantics and
  text direction must be sufficient.
- **2026-07-14 — ground-cover-free art authority:** generation-reference exports
  suppress grass and other additive cover while preserving terrain, roads,
  barriers, props, and floating visual-only source artwork. Runtime-generated cover remains an independent optional
  layer.
- **2026-07-14 — measured export bounds (superseded by ADR-0142):** the initial
  export framed the complete rendered paint bounds with padding and failed when
  artwork touched a capture edge. The current path instead uses the saved
  canonical generation frame and permits scenic-only pixels to clip.
- **2026-07-14 — camera overscan:** separated pixel resolution from camera room.
  ADR-0118 later removed this amendment's exact 3840x2160 and centered-60%
  acceptance gates; the current recipe retains a centered safe area as prompt
  guidance and judges camera room by four-direction panning in the real viewer.
- **2026-07-14 — locked editor review before acceptance:** a valid registered
  candidate now mounts directly in the real editor and activates the complete
  baked-art lock without persisting temporary candidate metadata.
- **2026-07-14 — compact registration handoff:** added a saved-value-only copy
  action that transfers the candidate source and exact serialized registration
  without requiring an editor URL or shared browser-local state.
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
