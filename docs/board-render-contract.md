# Board render contract (fixed-camera isometric sprites)

## Camera
The skirmish board is a **fixed isometric** view — the camera does **not** rotate, tilt,
or free-orbit (locked for the time being). This is the load-bearing decision: because the
viewing angle never changes, the board is a **2D sprite compositor**, not a runtime 3D
engine. Every tile, unit, rock, and portrait is a 3D model **pre-rendered in Blender to a
flat PNG** at the one true-isometric angle, then laid out isometrically in the DOM
(`frontend/src/render/iso.ts`, `BoardLabBoard.tsx`). Pre-rendered sprites are *optimal*
here, not a compromise — they capture full 3D (relief, self-shadow, protruding geometry)
from the only angle the player will ever see, at zero runtime cost.

If the camera ever needs to move, this contract is void and the board must become a
real-time 3D scene (and the units re-authored as meshes).

## Perimeter wall geometry

Every north and west perimeter wall uses the canonical full-height generated wall
geometry, regardless of material, wall art, or mirror presence. The former ordinary
short wall lane and mirror-selected tall wall variant are retired. Wall-art placement
must not swap the wall raster beneath it or carry a wall-height selector.

The full-height geometry preserves the existing logical perimeter edge, wall plane,
contact footprint, tangent span, seat anchor, projected back-edge/floor seam, visibility
corridor, and scene-depth semantics. Only the generated visual extent above that seam is
taller. Runtime consumers, editor palettes, Studio previews, thumbnails, and proofs use
the same full-height wall assets; no short-wall fallback or compatibility lane remains.
See [ADR-0086](adr/0086-all-perimeter-walls-use-full-height-geometry.md).

## Live wall mirrors

`kind: "mirror"` is a renderer contract, not a decorative label. Every mirror reflects
the current physical chess pieces that enter its wall-local board-axis visibility
corridor; there is no opaque decorative/off variant. Visibility is decided from each
piece's exact continuous board position before screen projection or aperture clipping.
It must not be inferred from projected pixels or a rounded movement source/destination
cell.

Grand Gallery's generated material is face-parity exact: its north frame and glass rasters are
horizontal pixel mirrors of west, with mirrored mount and aperture geometry. This affects only
the generated material projection; runtime board-grid reflection and facing rules below remain
unchanged. See
[ADR-0087](adr/0087-grand-gallery-wall-faces-are-exact-visual-counterparts.md).

For a mirror covering `N >= 1` wall cells from integer tangent anchor `a`, the authored
tangent interval is `I(a, N) = [a - 0.5, a + N - 0.5)`. A west-wall mirror casts inward
from `x = -0.5` along board `+X` and admits a physical piece `(px, py)` iff `py` is in that
interval. A north-wall mirror casts inward from `y = -0.5` along board `+Y` and admits it
iff `px` is in the interval. Physical board pieces already lie on the inward side of the
perimeter wall, so there is no additional depth cutoff. The lower bound is inclusive and
the upper bound exclusive: an exact upper-bound piece is excluded and belongs to the next
adjacent span, if present. Implementations must not epsilon-expand both ends. The interval
comes from supporting wall-cell coverage, never the glass pixels or aperture bounds.

When one mirror placement owns multiple authored spans, it uses the exact union of their
half-open intervals as one corridor. Contiguous spans coalesce naturally; a gap is not
filled by a bounding hull. A piece in the union is admitted once to the complete mirror
composition, never resubmitted by each supporting tile or depth clip segment. A piece
outside the union is not planned, fitted, clipped, or drawn. Aperture clipping is a final
raster boundary and cannot substitute for corridor admission.

For an admitted subject, the canonical shared 2D planner applies the complete wall-plane
transform to the exact continuous board-grid coordinate before projection. A west wall
at `x = -0.5` holds board Y and computes `r = (-1 - px, py)`; a north wall at `y = -0.5`
holds board X and computes `r = (px, -1 - py)`. These formulas have no field-of-view or
grid-depth compression factor. The physical piece, wall-plane intersection, and reflected
coordinate remain exact equal-distance counterparts along game-grid X for west or
game-grid Y for north. Fractional in-flight positions remain fractional.

The resulting virtual board coordinate passes through the ordinary canonical fixed
orthographic-isometric projection, making either grid axis appear along its expected
diagonal screen direction. There is no screen-space focal fit: the planner must not
converge a projected anchor toward an aperture point, reflect an already-projected anchor
about the aperture's screen-X centerline, or preserve projected screen Y as an alternate
placement rule. The reflected draw keeps exactly the physical board draw's resolved
screen-space width and height after normal unit sizing; there is no independent reflected
subject scale. Its seat-relative geometry transfers to the exact reflected floor-contact
anchor without a fitting lift or drop. Glass opacity and material treatment may change
appearance, but never reflected position, raster size, or floor contact.

Mirror orientation starts from the physical piece's semantic board-facing vector
`v = (vx, vy)`. A west wall requires the reflected visual facing `t = (-vx, vy)`; a north
wall requires `t = (vx, -vy)`. The final mirror draw retains one horizontal raster flip
for chirality. Because a horizontal flip under the canonical isometric projection maps a
visual board vector `(a, b)` to `(b, a)`, the planner first selects the accepted
directional sprite for `q = (ty, tx)` and then flips that raster. It must not blindly
reuse the physical piece's directional sprite or infer facing from its URL or pixels.
There is no perspective mirror camera, secondary projection, depth compression, shear,
or nonuniform foreshortening.
Gameplay, the level editor, Studio, read-only boards, previews, and thumbnails all consume
the shared planner or its draw plan. UI overlays, legal-move marks, editor/drag ghosts, and
other non-physical affordances never enter the subject list.

Each generated mirror asset owns its frame-aligned glass aperture and material layers:
frame, bevel, tint, foxing, scratches, and highlights remain authored pixels, while live
piece sprites are clipped and composited through that aperture. The aperture is visible
for inspection in Studio but is not arbitrary live Wall Art geometry; changing its shape
means revising the source asset. The effective visible mirror surface is the authored
aperture intersected with the union of its actual supporting wall-face segments. Each
support segment is tangent-bounded and capped on the board side by the generated wall's
projected back-edge/floor seam. Generated frame, generated glass, and live reflection all
use that same support union, including one-cell mirrors, so no mirror pixel draws on top
of the boundary tile. Painter-order depth bands remain a separate concern and cannot
serve as vertically unbounded mirror support. Every mirror mounts on the same canonical
full-height wall geometry used by ordinary walls. A full-body mirror's lower rail is a
grounded datum; generated glass/frame grows above that datum rather than translating the
whole assembly upward to catch a virtual raster. Grand Gallery is a full-body mirror: its
generated frame and continuous glass aperture must contain the tallest resolved
physical-unit silhouette at its exact 1:1 virtual seat before support occlusion. Its exhaustive physical
silhouette proof must classify every semantic board-axis wall crossing on both faces as
either supported glass or legitimate floor occlusion, with no outside-glass, unsupported,
or invalid pixels. A floor-occluded pixel is a final wall-topology clip, not a subject fit
or a supported-glass hit. Future full-body mirrors inherit both requirements. The smaller
Keep, Court, Chapel, and Witch's Eye mirrors may intentionally crop the unchanged exact-size raster at their authored
aperture; cropping is the final mask result, not a scale, shift, float, or depth fit. A
mirror assembly may use the available full-height relief while its logical wall plane,
contact footprint, anchor, span, and corridor remain unchanged. It never selects or
replaces its supporting wall geometry. Material or lens styling may alter generated glass
pixels and final alpha only; it may not distort reflection geometry. A multi-wall mirror
owns one continuous authored aperture, material treatment, and reflection plan across its
full coplanar span; per-tile clip windows must not restart or repeat it.

The reachable Studio Wall Art instrument renders this exact primitive and exposes the
aperture overlay, reflection opacity/material treatment, movable test pieces, and a
Grand Gallery tallest-unit/full-silhouette proof on both wall faces at normal board
scale. Its LOS proof reproduces the selected physical draw's destination alpha mask and,
for every opaque pixel center `p`, computes `wallHit = p + (wallSeat - subjectSeat)`, with
`wallSeat = project(-0.5, y)` west or `project(x, -0.5)` north. A hit passes only inside
both the complete authored aperture and the union of actual supporting-segment aperture
clips when it is on or above the projected wall/floor seam. A hit strictly below that seam
is instead accepted and reported as floor-occluded because the boundary tile owns that
region. Studio paints the exhaustive crossing silhouette by classification and draws only
a small representative ray set; it never pairs pixels from different directional
sprites. Grand Gallery must report supported-glass and floor-occluded counts separately,
require their sum to equal the visible physical-alpha total with no failures, and
separately keep the exact virtual raster fully contained. Small-mirror proofs instead
show their authored aperture crop without changing the underlying exact placement. Exact
reflected depth and subject size are fixed `1x` invariants, not authoring sliders. Full
terrain, walls, props, doodads, lighting,
particles, and shadows are outside the reflection subject set. The shared planner carries
semantic unit identity, palette, and facing so every consumer resolves the same reflected
orientation; an opaque physical draw operation alone is insufficient. For example, a
west-facing piece appears east-facing in a west mirror and remains west-facing in a north
mirror. See
[ADR-0085](adr/0085-mirror-surfaces-end-at-the-wall-floor-boundary.md) for the wall-face
support mask and current grounded full-silhouette proof;
[ADR-0084](adr/0084-full-body-mirrors-prove-grounded-board-axis-line-of-sight.md) for the
superseded all-supported-glass predecessor;
[ADR-0086](adr/0086-all-perimeter-walls-use-full-height-geometry.md) for the current
full-height wall and authored aperture-coverage rules;
[ADR-0083](adr/0083-mirror-aperture-coverage-is-authored-per-asset.md) for the superseded
mirror-specific wall-height lane and retained aperture-role derivation;
[ADR-0082](adr/0082-wall-mirrors-are-exact-one-to-one-game-world-reflections.md) for the
exact position, size, and floor-contact derivation;
[ADR-0081](adr/0081-wall-mirrors-reflect-piece-facing-in-board-grid-space.md) for the
carried-forward facing derivation; and
[ADR-0080](adr/0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md) for corridor
admission and canonical board-grid projection.

## The grid is logical, not a visual cage
A cell is a **gameplay address** (which square a piece occupies; what tessellates with
what). The **art anchored to that cell may spill out of it.** This is already true of
units — a king sprite towers far above its tile; a rook keep is a whole fortress. Tiles
get the same freedom: surfaces can be **bumpy** and **doodads can protrude** (grass tufts
standing up, loose pebbles, mossy stones). It is not rule-breaking; it is the standard
isometric-tilemap technique (Unity supports taller-than-cell tiles overlaying neighbors,
plus props/trees/elevated ground).

### The three real constraints
1. **Consistent contact footprint.** The *ground plane* where a tile meets its neighbors
   and where a unit stands is the same clean diamond on every tile (the 96×140 calibration
   — diamond ~96px wide, equator ~y27). Bumps and doodads live **above** that plane; they
   never move the contact edge. This keeps tiles tessellating and units seated.
2. **Back-to-front draw order** (painter's, by distance to camera) — already done for
   units; protrusions ride it so nearer things overlap farther things.
3. **Don't bury gameplay.** Doodads stay low/sparse enough not to hide a unit or make a
   cell ambiguous. Tall props (trees) would need per-object dynamic sorting — out of scope
   for now.

## Tiles, concretely
Tiles are 3D-rendered sprites (same pipeline as units), NOT flat textures painted on a
block. Use the packs' full content: **displacement/height maps** for real surface relief,
**normal maps** for micro-detail, and the **3D models / alpha grass cards** for protruding
doodads. Source packs ship all of these; rendering only the base-color flat was the bug
this contract corrects.

### Exposed faces and abrupt cuts

Per [ADR-0087](adr/0087-exposed-terrain-faces-own-independent-edge-treatments.md),
vertical topology is face-level, while [ADR-0105](adr/0105-subterrain-is-an-opt-in-drawable-surface.md)
makes its material an explicit opt-in Subterrain placement. The fixed camera sees logical south and east: south
is exposed when `(x, y + 1)` is void, and east when `(x + 1, y)` is void. The
canonical 96x180 side frame stores south in columns `0..47` and east in columns
`48..95`; a compositor draws only the exposed half. A persisted placement may select
a Subterrain material. It never makes an interior face visible, and an exposed face
without a placement remains empty.

`packages/board-render/src/render/terrainSides.ts` is the shared topology,
placement resolution and source-half authority. Gameplay, Studio/editor views,
client bakes, and server thumbnails must consume it rather than inventing local
exposure rules.

Abruptness comes from occupancy; treatment exists only when authored. Water cuts,
earth, rock, murals, and waterfalls are Subterrain choices, never tile or void-boundary fallbacks.

The runtime's two-pixel top dilation is seam-repair geometry. It is clipped to
the union of occupied logical diamonds, including holes, and must never paint a
top-color apron outside the map. A visible lip or cap is authored side media,
not generic renderer padding.

### Level Editor scenic terrain apron

Per [ADR-0096](adr/0096-level-editor-scenic-terrain-apron-is-decoration-only.md), the Level
Editor's persisted Scenic terrain rectangle may extend nearest-edge terrain tops independently by
zero to sixteen cells beyond its top, right, bottom, and left sides for an art-generation handoff
view. Decorative apron animation stays on frame zero. Those apron coordinates exist only in the terrain compositor.
Scenic cells use the ordinary editor region-selection and scoped Generate path. Generate rewrites
exactly the selected area across either side of the playable boundary and persists outside terrain
in the separate decorative-cell channel. The apron uses a separate static canvas.
The editor exposes separate Playable grid and Whole grid overlays; the former is always bounded to
the tactical board, and the latter includes scenic cells.

Per [ADR-0098](adr/0098-authored-board-extends-beyond-playable-grid.md), the full scenic rectangle is
the authored visual board. Ordinary terrain, road, river, fence, north/west wall-face, prop, doodad,
and cover tools use their canonical placement and renderer paths on either side of the playable
boundary, without per-tool Scenic toggles. Units and gameplay zones remain playable-only. Board
code preserves the complete visual scene; Level terrain, barriers, collision, movement, objectives,
promotion, and solver state project only the playable rectangle. The apron suppresses perimeter
side exposure where visual terrain continues; interior authored holes retain ordinary exposure. A
board without an authored terrain top does not synthesize an apron.

## Composed terrain and macrotiles

The runtime board is one composed terrain canvas, but its source data remains layered:

1. Explicitly authored Subterrain surfaces on exposed south/east faces.
2. Exactly one terrain top for every playable cell: either its 1x1 top sprite or the clipped
   portion of a macrotile from `EditorBoard.macroTiles` that owns the cell.
3. Road and river feature overlays.
4. Optional grid, cover, doodads, props, units, and tactical overlays.

A macrotile never changes movement, collision, terrain family, or cell addressing. Its catalog
entry declares a rectangular footprint and one board-space PNG. A placement may also declare
row-major `breaks`: footprint cells where the ordinary 1x1 top is exposed and the macrotile image
is clipped away. Generate may place a macrotile only when every footprint cell belongs to the same
generated section and terrain family. Macrotiles may touch but cannot overlap, including across
their broken cells. Painting or erasing a 1x1 terrain cell adds that cell to the placement's break
mask instead of discarding the whole composite. Resizing still rejects placements that no longer
fit. The logical cells remain available to movement, selection, roads, cover, and objects whether
their tops come from the composite or the underlying 1x1 terrain.

Generated media owns the top-down material idea, not board geometry. Source and
candidate bytes are private live-media records. Deterministic projection code runs
in a temporary workspace, projects a candidate into the canonical 96×54 cell
plane, seals projection misses, and requires every pixel in the projected
footprint to be opaque before uploading the result to its semantic macrotile
slot. There is no alpha apron and no repository bake path.

Whole placements suppress every underlying 1×1 top; broken placements use the
same canonical cell diamonds as a clip mask so only the requested 1×1 tops
return. The editor, play route, read-only viewers, and server thumbnails consume
the same persisted placements, break masks, and live catalog revision. Water
joins only after macrotiles can animate in lockstep with its terrain family, so a
larger tile never turns a living water field into a frozen slab.

The typed terrain projection declares a matrix rather than a hand-maintained
static manifest. Grass, dirt, stone, pebble, and sand each provide curated motifs
at `2×2`, `2×3`, `3×3`, `4×3`, and `4×4`; catalog metadata expands that matrix
into stable semantic slots. Generate cycles through the footprint sizes that fit
a region and uses each motif before repeating it, so adding catalog depth
produces visible board variety instead of repeatedly selecting the largest tile.
Each Generate terrain row owns its own composite-coverage and breakup controls. Coverage sets the
target share of that generated section drawn from macrotiles; breakup is a seeded per-cell chance
to expose the socket-solved 1x1 terrain beneath each accepted placement. The Tile palette exposes
the same catalog by footprint for direct authoring, and direct 1x1 paint uses the same break-mask
path as generated breakup.
