# Pre-drawn Whole-Level Generation

This is the mutable recipe for turning an authored level into one continuous
full-scene painting without giving the image generator permission to redesign
the level. It implements
[ADR-0100](../adr/0100-predrawn-generation-packets-preserve-authored-level-semantics.md).

Amend this file whenever a reviewed pass teaches us a better instruction. Keep
the authority order intact unless a later ADR changes it. Preserve exact prompts
for notable runs as text provenance; do not commit generated or source-media
bytes here.

The first worked example is
[`predrawn-board-generation-fortress-gate.md`](predrawn-board-generation-fortress-gate.md).

## Authority order

Every input must have one named role. Never give several references without
stating which questions each is allowed to answer.

1. **Geometry guide:** exact unit-free projected top-surface grid, cell count,
   perimeter, roads, barriers, and fixed landmark positions. It owns spatial
   layout. Omit decorative vertical board skirts and cliff faces unless authored
   gameplay height explicitly requires them.
2. **Semantic packet:** canonical dimensions, coordinate convention, projection,
   tile contents, road graph, blocking edges, footprints, exits, and outer
   boundary. It owns gameplay meaning.
3. **Material/layout reference:** the author's prototype or prior board image. It
   explains visual intent but cannot move geometry.
4. **Style references:** accepted art or a promising prior candidate. They own
   palette, finish, atmosphere, and environmental richness only.

If references disagree, the earlier role wins. State this inside the prompt.

## Prepare the packet

Before generation:

1. Export a unit-free, top-surfaces-only guide from the canonical level. Do not
   let pieces, selection overlays, UI, decorative board skirts, or vertical
   cliff faces enter the geometry input. A vertical side can be mistaken for an
   extra row or column even when it is only presentation art.
2. Record `columns`, `rows`, the `(x,y)` convention, and which screen-space axis
   each coordinate follows.
3. Record the two projected grid directions as angles or vectors. Keep the
   visual grid authoritative; the numbers are reinforcement.
4. Dump every coordinate in a compact matrix. Define each token in gameplay
   language: surface, road overlay, fixed footprint, traversal, and elevation.
   Surface tokens declare semantics, not visible square patches: ordinary
   terrain must flow continuously across internal cell edges unless a real
   gameplay boundary says otherwise.
5. Express roads as connected coordinate chains with explicit outside exits.
6. Express fences and walls as shared coordinate edges and say whether crossing
   that edge is blocked. Do not describe an edge object as an occupied tile.
7. Enumerate the exact outer perimeter edges. Name every intentional visual
   opening, such as a road threshold, while keeping that threshold legible.
8. State which artistic decisions are free. Boundary material may be free;
   boundary location is not.
9. Repeat the global invariants: one flat gameplay plane unless the level says
   otherwise, exact footprints, no units, no extra roads or blockers, one
   continuous painting, and a full environment outside the board.

For exploratory work, a manually transcribed packet is allowed only after it is
checked against the serialized canonical board. The durable pipeline should
export these fields directly from level data.

## Reusable prompt template

Replace every `{{PLACEHOLDER}}`. Remove unused optional lines rather than leaving
ambiguous instructions.

```text
Use case: stylized-concept
Asset type: full-screen 16:9 tactical-game battlefield art

PRIMARY REQUEST
Paint one continuous, polished {{BIOME}} environment containing the exact authored
{{COLUMNS}}-column by {{ROWS}}-row battlefield described below. Make the playable
perimeter unmistakable through a coherent in-world environmental boundary, while
the surrounding environment continues naturally to every edge of the frame.

REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1: EXACT GEOMETRY AND PLACEMENT GUIDE. It shows TOP SURFACES ONLY. Its
complete {{COLUMNS}}x{{ROWS}} wire grid, projection, cell count, roads, edge
objects, and landmark positions are authoritative. Remove all guide lines from
the final painting. Do not invent a vertical board skirt, cliff face, attached
side strip, extra row, or extra column.
Image 2: AUTHORED MATERIAL AND LANDMARK REFERENCE. Preserve its level-content
identity. Do not preserve any placeholder, black void, review background, units,
grid, or UI.
Image 3: ART-DIRECTION REFERENCE ONLY. Match its full-scene environmental
treatment, but DO NOT copy its board outline, proportions, or object positions.
{{ADDITIONAL_REFERENCE_ROLES}}

If references disagree, Image 1 and the semantic packet below win.

PROJECTION CONTRACT
Use a parallel orthographic isometric board plane, not perspective convergence.
Grid x+ moves {{AXIS_X_DESCRIPTION}}.
Grid y+ moves {{AXIS_Y_DESCRIPTION}}.
{{STEP_LENGTH_RULE}}
There are exactly {{COLUMNS}} steps across the short axis and exactly {{ROWS}}
steps along the long axis.
Preserve the elongated parallelogram in Image 1. Do not turn it into a square,
compact rhombus, symmetric diamond, trapezoid, or perspective wedge.
The board may be uniformly scaled and translated to fit the composition, but its
angles, cell structure, and gameplay coordinates must not change.

COORDINATE CONVENTION
Coordinates are (x,y), x={{X_RANGE}}, y={{Y_RANGE}}.
{{COORDINATE_AXIS_EXPLANATION}}

TILE TOKEN DEFINITIONS
{{TILE_TOKEN_DEFINITIONS}}

EXACT {{CELL_COUNT}}-TILE CONTENT
{{TILE_MATRIX}}

SURFACE CONTINUITY CONTRACT
Tile coordinates are semantic addresses, not visible square texture swatches.
Do not preserve, redraw, or imply the individual square boundaries of ordinary
terrain tiles. Do not give each sand cell its own rectangular patch, tint,
border, bevel, or repeated texture treatment. Paint {{PRIMARY_TERRAIN}} as one
continuous natural surface with broad irregular, non-grid-aligned variation:
{{TERRAIN_VARIATION}}. Those variations may cross many cell boundaries and must
not reveal the hidden grid. Only authored roads, fixed footprints, blocking edge
objects, and the exact outer perimeter may align visibly to cell geometry.

EXACT ROAD GRAPH
{{ROAD_GRAPH}}
Do not add road to a coordinate absent from this graph.

EXACT BLOCKING EDGE OBJECTS
{{BLOCKING_EDGES}}
Each entry is centered on the shared tile edge. It blocks only the declared
crossing and does not consume either neighboring tile unless a footprint above
explicitly says otherwise.

EXACT PLAYABLE PERIMETER
{{PERIMETER_EDGES}}
{{BORDER_TILE_REINFORCEMENT}}
Do not infer a different boundary from roads, walls, props, vegetation, texture
bands, or open terrain.

BOUNDARY APPEARANCE
Boundary LOCATION is fixed; boundary APPEARANCE is creative. Choose one coherent
in-world motif appropriate to {{BIOME}} and carry it around the exact outer
perimeter. {{EXIT_THRESHOLD_RULES}} The outside world remains artistically
continuous yet clearly non-playable through material, density, roughness, or
another consistent visual distinction. The boundary is a top-surface transition,
not a vertical side wall or a second strip of grid-aligned terrain.

SCENE AND STYLE
{{SCENE_AND_STYLE}}
Keep the entire playable surface at the gameplay elevations declared by the
semantic packet. Seam terrain, roads, footprints, edge objects, perimeter, and
surrounding environment into one professional continuous painting.

CONSTRAINTS
No units, chess pieces, people, creatures, UI, coordinate labels, text,
watermark, or baked grid lines.
No black box, black void, floating board, vignette frame, or hard crop.
No unstated ramps, cliffs within the playable area, height tiers, pits, tactical
elevation, buildings, blockers, fences, or road branches.
No vertical board skirt, cliff face, attached side strip, extra row, or extra
column around the playable surface.
No checkerboard, patchwork quilt, square sand swatches, cell-by-cell tinting, or
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
5. After saving and read-back verification, use `COPY CODEX HANDOFF` to transfer
   the exact source and serialized registration to the agent. Do not copy the
   editor address bar; route, document, layer, and browser state are not part of
   the calibration.
6. Classify misses separately: projection/cell geometry, semantic placement,
   perimeter readability, invented height, extra perimeter strips, visible
   square terrain patching, footprint scale, occlusion, or style.
7. Change the smallest relevant prompt section and preserve the rest. Record the
   exact revised prompt as the next run's text provenance.

Grid calibration can measure and temporarily rectify separable internal
row/column drift over the complete plate. It cannot rescue semantic errors,
folded/non-monotonic geometry, independent landmark drift, or large corrections
that show the candidate missed the requested projection. A promising calibrated
candidate remains review art until regenerated at its native production frame
and promoted through the live asset lifecycle.

## Amendment log

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
