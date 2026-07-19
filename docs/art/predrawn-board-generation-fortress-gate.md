# Fortress Gate pre-drawn generation example

This records the prompt packet behind the 2026-07-13 exploratory pass that first
combined a convincing full desert scene, a readable environmental perimeter,
and substantially improved adherence to the authored level. It is a worked
example for the mutable
[`predrawn-board-generation.md`](predrawn-board-generation.md) recipe, not an
accepted runtime-media record.

The generated image and its reference media remain local/private candidate
bytes. This file preserves only the text and deterministic semantic provenance
allowed in Git by ADR-0085.

The next isolated run is assembled and preflighted from
[`predrawn-board-runs/fortress-gate-isolated-v1/definition.json`](predrawn-board-runs/fortress-gate-isolated-v1/definition.json).
Its generated `prompt.txt`, packet, reference hashes, and request manifest in
that directory are the exact pending request authority. The historical prompt
below remains historical and must not be sent as the current request.

## Reference roles used

1. Unit-free 5x11 wire guide: exact geometry and placement authority.
2. Authored desert board render: material and landmark reference.
3. Prior full-screen desert pass and accepted skirmish artwork were supplied as
   appearance references in this historical run. ADR-0114 removes both from the
   isolated pipeline test; they must not be passed to the next regeneration.

## Canonical semantic packet

Coordinates are `(x,y)`, `x=0..4`, `y=0..10`. Grid `x+` travels down-right at
approximately 29 degrees; grid `y+` travels down-left at approximately 151
degrees. Both projected steps have equal length and remain parallel.

Tokens:

- `S`: flat passable sand.
- `T`: flat passable fortified stone at the same gameplay elevation as sand.
- `R`: cobblestone road overlay with no elevation change.
- `B`: compact impassable boulder occupying exactly one tile.
- `H`: compact impassable cottage occupying exactly one tile.

Tile matrix, `x=0` through `x=4` on every row:

```text
y=0:  S, S, S, S, S
y=1:  S, S, S, S, S
y=2:  S, S, S, S, S
y=3:  S, S+R, S+R, S+R, S+R
y=4:  S, S+R, S, S, S
y=5:  T+B, T+R, T, T+R, T+H
y=6:  S, S, S, S+R, S
y=7:  S, S, S, S+R, S
y=8:  S, S, S, S+R, S+R
y=9:  S, S, S, S, S+R
y=10: S, S, S, S, S+R
```

Road graph:

```text
Segment A:
(1,5) -> (1,4) -> (1,3) -> (2,3) -> (3,3) -> (4,3)
       -> outside through the x=5 edge

Segment B:
(3,5) -> (3,6) -> (3,7) -> (3,8) -> (4,8) -> (4,9) -> (4,10)
       -> outside through the y=11 edge
```

Blocking stone-fence/wall edges:

```text
(0,5)|(0,6)
(1,5)|(1,6)
(1,5)|(2,5)
(0,4)|(0,5)
(4,5)|(4,6)
(4,4)|(4,5)
(3,4)|(3,5)
(2,5)|(3,5)
```

Perimeter:

```text
outer y=0 edges of (0,0),(1,0),(2,0),(3,0),(4,0)
outer y=10 edges of (0,10),(1,10),(2,10),(3,10),(4,10)
outer x=0 edges of (0,0) through (0,10)
outer x=4 edges of (4,0) through (4,10)
```

Road thresholds open beside `(4,3)` and `(4,10)`, but the transition from
playable board to surrounding terrain stays legible.

## Exact prompt used

```text
Use case: stylized-concept
Asset type: full-screen 16:9 tactical-game battlefield art

PRIMARY REQUEST
Paint one continuous, polished desert environment containing the exact authored 5-column by 11-row battlefield described below. Make the playable perimeter unmistakable through a coherent in-world environmental boundary, while the surrounding desert continues naturally to every edge of the frame.

REFERENCE ROLES — STRICT AUTHORITY ORDER
Image 1: EXACT GEOMETRY AND PLACEMENT GUIDE. Its complete 5x11 wire grid, projection, cell count, lane, gate/barrier, boulder, and cottage positions are authoritative. Remove all guide lines from the final painting.
Image 2: AUTHORED MATERIAL AND LANDMARK REFERENCE. Preserve its desert surface character and gameplay arrangement. Do not preserve its black background or floating-board cliff presentation.
Image 3: ART-DIRECTION REFERENCE ONLY. Match its rich full-screen desert-world treatment and coherent boundary motif, but DO NOT copy its board outline, proportions, or object positions.
Image 4: STYLE REFERENCE ONLY. Match the polished hand-painted pixel-art finish and tactical readability, not its specific level.

PROJECTION CONTRACT
Use a parallel orthographic isometric board plane, not perspective convergence.
Grid x+ moves down-right at approximately 29 degrees from horizontal.
Grid y+ moves down-left at approximately 151 degrees from horizontal.
The two projected step vectors have equal screen length.
There are exactly 5 steps across the short axis and exactly 11 steps along the long axis.
Preserve the elongated parallelogram in Image 1. It must not become a square, compact rhombus, symmetric diamond, trapezoid, or perspective wedge.
The board may be uniformly scaled and translated to fit the 16:9 composition, but its angles, 5:11 cell structure, and gameplay coordinates must not change.

COORDINATE CONVENTION
Coordinates are (x,y), x=0..4, y=0..10. x+ follows the 29-degree down-right axis. y+ follows the 151-degree down-left axis.
S = flat passable sand.
T = flat passable fortified stone surface, at the SAME gameplay elevation as sand.
R = cobblestone road overlay; it does not change elevation.
B = compact impassable boulder occupying exactly one tile.
H = compact impassable cottage occupying exactly one tile.

EXACT 55-TILE CONTENT, x=0 through x=4 on every row:
y=0:  S, S, S, S, S
y=1:  S, S, S, S, S
y=2:  S, S, S, S, S
y=3:  S, S+R, S+R, S+R, S+R
y=4:  S, S+R, S, S, S
y=5:  T+B, T+R, T, T+R, T+H
y=6:  S, S, S, S+R, S
y=7:  S, S, S, S+R, S
y=8:  S, S, S, S+R, S+R
y=9:  S, S, S, S, S+R
y=10: S, S, S, S, S+R

EXACT ROAD GRAPH
Segment A is exactly:
(1,5) -> (1,4) -> (1,3) -> (2,3) -> (3,3) -> (4,3) -> outside through the x=5 edge.
Segment B is exactly:
(3,5) -> (3,6) -> (3,7) -> (3,8) -> (4,8) -> (4,9) -> (4,10) -> outside through the y=11 edge.
Do not add road to any coordinate absent from these two lists. Keep both segments integrated naturally through the fortified crossing composition shown by Images 1 and 2.

EXACT BLOCKING STONE-FENCE / WALL EDGES
Each pair below is an impassable crossing edge. Render a low stone fence, wall, or fortified barrier centered on that shared tile edge without consuming adjacent tiles:
(0,5)|(0,6)
(1,5)|(1,6)
(1,5)|(2,5)
(0,4)|(0,5)
(4,5)|(4,6)
(4,4)|(4,5)
(3,4)|(3,5)
(2,5)|(3,5)
The boulder at (0,5) and cottage at (4,5) are each exactly one tile in footprint and impassable. Do not enlarge either one.

EXACT PLAYABLE PERIMETER
The boundary is the OUTER edge of all 55 cells:
- outer y=0 edges of (0,0),(1,0),(2,0),(3,0),(4,0)
- outer y=10 edges of (0,10),(1,10),(2,10),(3,10),(4,10)
- outer x=0 edges of (0,0) through (0,10)
- outer x=4 edges of (4,0) through (4,10)
Every tile with x=0, x=4, y=0, or y=10 is therefore a border tile. Do not infer a different boundary from roads, walls, props, vegetation, texture bands, or open terrain.

BOUNDARY APPEARANCE
Boundary LOCATION is fixed; boundary APPEARANCE is creative. Choose one subtle but continuous environmental motif—low worn curb, rocky lip, shallow dry wash, sparse rim vegetation, or another believable desert treatment—and carry it around the exact outer perimeter. Leave natural openings where the road exits beside (4,3) and (4,10), but make both thresholds unmistakable. The outside world remains artistically continuous yet clearly non-playable through rougher terrain, denser rocks/vegetation, or another consistent visual distinction.

SCENE AND STYLE
Rich seamless full-screen desert landscape, atmospheric depth, warm cohesive light, polished readable pixel art. Keep the entire playable surface on one uniform elevation. Seam the road, sand, stone floor, walls, boulder, cottage, perimeter, and surrounding environment into one professional continuous painting.

CONSTRAINTS
No units, chess pieces, people, creatures, UI, coordinate labels, text, watermark, or baked grid lines.
No black box, black void, floating board, vignette frame, or hard rectangular crop.
No ramps, cliffs within the playable area, height tiers, pits, tactical elevation, extra buildings, extra blockers, extra fences, or invented road branches.
Geometry and semantics above override all artistic discretion.
```

## What changed from the weaker passes

The exploratory prompt above predates the camera-room work. ADR-0118 supersedes
the later fixed 3840x2160 requirement: a candidate keeps its actual output
dimensions, and it is not enlarged or regenerated only to hit a pixel count.
Future runs keep the semantic packet unchanged and aim to hold the complete 5x11
grid plus its immediate boundary in a centered safe area, with additional
continuous scenery on every edge for camera roaming. The exact percentage is
prompt guidance; useful four-direction panning in the real viewer is the review
authority.

- The model was not asked to infer the board from the beauty render.
- The 5:11 ratio and two axis directions were stated and also shown.
- Every road tile and blocking edge was declared semantically.
- One-tile footprints were explicit.
- The perimeter was defined as outer cell edges rather than described as a
  generic diamond.
- Boundary location and boundary appearance were separated.
- Full-scene continuation and no-black-void remained hard requirements.
- Units and unstated height were explicitly prohibited.

## Next amendment: top surfaces and continuous sand

The next experiment removes every source image containing a decorative vertical
board skirt or cliff face. The unit-free wire guide is the only geometry input;
no prior full-scene art is passed; finish and atmosphere are described in text.

The prompt adds this exact terrain interpretation:

```text
SURFACE CONTINUITY CONTRACT
Tile coordinates are semantic addresses, not visible square texture swatches.
Do not preserve, redraw, or imply the individual square boundaries of ordinary
terrain tiles. Do not give each sand cell its own rectangular patch, tint,
border, bevel, or repeated texture treatment. Paint the sand as one continuous
natural desert surface with broad irregular, non-grid-aligned variation:
wind-shaped dunes, scoured hardpan, gravel fans, cracked earth, sparse scrub,
small stones, and subtle color drift. These variations may cross many cell
boundaries and must not reveal the hidden grid. Only the authored cobblestone
roads, fixed footprints, blocking stone edges, and exact outer perimeter may
align visibly to cell geometry.

The geometry guide shows TOP SURFACES ONLY. Do not invent a vertical board
skirt, cliff face, attached side strip, extra row, or extra column. The perimeter
is a top-surface environmental transition, not an exposed vertical wall.
```
