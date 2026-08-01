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

## Fence rail and post depth

Fence rails and posts share one continuous fixed-isometric depth model. A post is seated halfway
between the farther and nearer incident rail-owner bands at its canonical vertex. Consequently, a
rail overlaps its far endpoint post (the north-east/right endpoint of an E rail), while its near
endpoint post overlaps the rail. Junction posts use that same vertex depth: farther incident rails
remain behind the post and nearer incident rails cross in front of it. No renderer may give posts
an unconditional foreground cap over every incident rail, and gameplay, the Level Editor, Studio,
live previews, pre-drawn occlusion geometry, and thumbnails must consume the shared depth function. See
[ADR-0298](adr/0298-fence-posts-interleave-with-incident-rails-by-depth.md).

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
Editor's persisted Scenic terrain rectangle may extend terrain independently by zero to sixteen
cells beyond its top, right, bottom, and left sides for an art-generation handoff view. Those four
names remain the storage compatibility fields; the editor labels them by the board's canonical
North, East, South, and West edges. Per
[ADR-0131](adr/0131-sparse-scenic-terrain-separates-footprint-from-material.md), the active visual
terrain surface is the union of that optional rectangle and every valid non-playable coordinate in
the compact persisted `decorativeFootprint` set. The footprint records activity only;
`decorativeCells` remains the sole material store. Authored material outside both the rectangle and
footprint stays hidden, preserving rectangle shrink and re-expansion. Scenic coordinates exist only
in the visual board projection.
Scenic cells use the ordinary editor
region-selection and scoped Generate path. Generate rewrites exactly the selected area across
either side of the playable boundary and persists outside terrain in the separate decorative-cell
channel. The editor exposes separate Playable grid and Whole grid overlays; the former is always
bounded to the tactical board, and the latter includes the rectangle-plus-footprint scenic surface.

Per
[ADR-0126](adr/0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md),
an unpainted scenic coordinate clamps to the exact corresponding playable boundary coordinate and
inherits terrain only when that coordinate owns a terrain top. Synthesis never searches for a
nearby occupied substitute. An explicitly authored scenic terrain cell overrides synthesis at its
own coordinate.

Per
[ADR-0127](adr/0127-scenic-terrain-extent-growth-copies-the-authored-canvas-edge.md)
and [ADR-0129](adr/0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md),
increasing a cardinal extent is a separate deterministic authoring operation with an explicit
Generation mode. **Match reference tile** copies an explicit scenic terrain tile only from the
directly adjacent, exactly aligned coordinate on the old whole-canvas edge; an unpainted or playable
source leaves the destination unpainted for ADR-0126 exact playable-boundary fallback. **Grass**
instead writes the canonical base grass tile into every otherwise-unauthored destination in the new
band. Both preserve an already authored destination. Growth performs no ray, nearest-neighbor,
sideways, diagonal, pixel, or model search. Multi-cell increases proceed as ordered one-cell steps;
all-directions uses North, East, South, West order and one undo transaction. Reducing and later
re-extending preserves hidden authored destinations. The Generation choice is transient tool state;
the resulting explicit scenic tile identifiers are the persisted authority.

The distinct **Fill visible area** action does not grow those extents. The shared `ViewPane`
reports its live content dimensions from its `ResizeObserver`; the editor combines those dimensions
with current pan and zoom, then uses the canonical isometric projection and exact
tile-diamond/viewport intersection to identify currently visible non-playable coordinates. It
adds only that sparse set to `decorativeFootprint`, so no surrounding offscreen diamond tips are
created. Existing authored material is preserved. In **Grass** mode it writes the canonical base
grass tile at an otherwise-unauthored destination. In **Match reference tile** mode, each
otherwise-unauthored destination resolves only from its exact clamped playable boundary coordinate
under ADR-0126 and writes material only when that coordinate owns terrain; an exact projected void
receives footprint membership but no material. Viewport fill performs no scenic-edge search, ray
or nearest-neighbor scan, pixel inspection, or model inference. One successful click commits both
footprint and material changes as one undoable edit. An invalid or oversized request reports a
no-op or limit and must not partially change either authority. Erasing an active sparse coordinate
removes its footprint membership, so retained material outside the rectangle does not reactivate
itself.

This same resolved topology governs rendering, region-family selection, and scoped Generate input.
Per [ADR-0137](adr/0137-subterrain-follows-the-visual-terrain-surface.md), explicit Subterrain may
occupy an exposed south or east face on any coordinate in this active visual terrain surface.
Playable and scenic coordinates have identical visual-face authoring rights; Subterrain remains
visual-only and never enters gameplay projection.
The Tile layer uses that same connected-area selection without creating a saved Generate region.
Its Fill selected area action atomically writes the exact selected single tile to playable and scenic
destinations, breaking overlapping composite terrain placements only where it writes and changing
nothing outside the selection.
Playable and scenic terrain share one depth-coherent compositor pass, so nearer scenic tops cover
farther side faces.
While any rectangular or sparse scenic terrain is active, the complete terrain pass stays on
animation frame zero rather than continuously repainting a large canvas. Ordinary playable
animation resumes only when the scenic surface is empty.

Per [ADR-0098](adr/0098-authored-board-extends-beyond-playable-grid.md), extended by ADR-0131's
rectangle-plus-footprint surface, each active scenic coordinate belongs to the authored visual
board. Ordinary terrain, road, river, fence, north/west wall-face, and cover tools use their
canonical placement and renderer paths on either side of the playable boundary, without per-tool
Scenic toggles. Per
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md),
new doodad and prop placement is instead playable-only: a doodad target must be playable, and every
cell in a prop footprint must be playable. Existing off-board doodads and props remain rendered,
serialized, and removable, but cannot authorize another off-board placement or move. Whole grid
display and resolved-area selection continue to recognize the same active terrain union. Units and
gameplay zones remain playable-only. Board code preserves the complete visual scene; Level terrain,
barriers, collision, movement, objectives, promotion, and solver state project only the playable
rectangle. Scenic terrain suppresses perimeter side exposure where resolved visual terrain
continues and retains ordinary exposure beside a resolved void. A board without an authored
terrain top does not synthesize scenic terrain.

The Level Editor anchors its `TileGrid` origin to the playable cells. Adding or undoing rectangular
or sparse scenic terrain therefore does not recenter the projected board or move the camera; the
canonical board-space projection itself remains unchanged.

### Placed Art and Scene Art

Per
[ADR-0147](adr/0147-floating-artwork-uses-projected-scene-pixels.md) and
[ADR-0148](adr/0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md),
the **Scene Art** subtype of
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md)'s
**Placed Art** destination may contain direct placements of installed structure
source art. The persisted `floatingArtwork` channel is not the prop or doodad
channel: a placement has a stable instance id, source-art id, and integer
center in canonical unzoomed projected-scene pixels, plus a canonical eight-way
direction and per-instance source scale. It has no board coordinate, tile,
footprint, contact point, terrain eligibility, blocking, depth seat, or
gameplay projection.

The shared renderer centers the selected source frame on `pixelX`/`pixelY` and
draws floating artwork above the authored board scene in collection order.
Authors never store or edit `z`. A change of direction selects a complete
installed `<direction>-back`/`<direction>-front` media pair. South may use the
legacy `back`/`front` pair. Missing pairs are unavailable rather than flattened,
planar-rotated, or silently substituted. Per-direction source calibration may
override the drawable's default scale and split geometry.

Per [ADR-0150](adr/0150-structure-source-art-turntables-are-complete-source-only-live-groups.md),
[ADR-0151](adr/0151-source-art-review-requires-interactive-board-placement.md),
and
[ADR-0173](adr/0173-structure-source-art-turntables-are-complete-source-only-live-groups.md),
new or upgraded Scene Art sources install as complete atomic eight-direction
groups. A direction may point both named halves at one full `flat-contact`
turntable raster without changing the legacy prop/doodad `back`/`front` split.
`sourceOnly` structure rows, including landmarks, participate in this Scene Art
channel but never synthesize gameplay props, doodads, seats, footprints,
terrain rules, or blocking. Shared readers normalize their deliberately omitted
gameplay fields to empty terrain eligibility and non-blocking behavior; prop,
doodad, and Prop Seat catalog projections exclude them instead of requiring or
synthesizing placement policy. Before installation, the exact private
candidates are reviewable through a transient `BoardLabBoard` placement proof
with the same free pixel center, scale, drag, and shared eight-way direction
controls; candidate media identities never enter persisted board content.

The Level Editor's Placed Art destination begins with a Scene Art / Doodads /
Props selector. Scene Art lists the installed raw structure catalog.
Clicking a source swatch toggles a viewport-sized free-placement brush that
converts the primary pointer directly to projected-scene pixels; tile,
prop/doodad, and barrier hit targets do not participate. A dynamically growing
Selected dropdown lists stable placed instances and includes None. Select may
change that current instance but never move it. Per
[ADR-0149](adr/0149-artwork-select-toggles-candidate-discovery.md), Select is
a toggleable discovery mode: its first click draws image-bounds candidate
outlines around every selectable artwork, and its second click exits that mode,
clears the current artwork, and removes candidate plus current outlines. Move
drags only the current instance and suppresses candidate outlines; the
Scene Art Delete toolbar action immediately deletes the current instance.
The current instance has a distinct dotted image-bounds outline, and blank-board
clicks do not clear it. Details remains locked to that instance and provides
full-width slider-plus-number rows for X px, Y px, and Scale, installed-direction
selection, duplicate, and delete. The layer introduces no visible placement
marker or alternate grid geometry. Board resizing neither shifts nor prunes it.
These controls do not create or mutate a prop/doodad definition.
Scene Art renders into the canonical pre-drawn generation reference and is
visual-only in its semantic packet. It is the only Placed Art subtype that
accepts new positions beyond the playable rectangle. Doodads remain
nonblocking and playable-only; Props remain blocking and require a wholly
playable footprint. Existing off-board doodads and props continue to render in
the reference and remain removable without a destructive migration. Placed
Art's baked-content controls are locked and the corresponding legacy pixels
are suppressed while AI background mode is active because those pixels are
already baked into the plate.

### Pre-drawn generation frame

Per
[ADR-0142](adr/0142-owner-authored-frame-defines-predrawn-generation-reference.md),
board data persists one versioned, screen-aligned 16:9 generation frame in
canonical projected-board coordinates relative to the stable playable origin.
The Level Editor presents that frame over the shared `ViewPane`: the owner may
pan and zoom the scene beneath it and explicitly save the resulting rectangle.
The persisted value is the projected rectangle, not CSS pixels, device-pixel
ratio, browser dimensions, or transient ViewPane pan and zoom. Ordinary camera
movement therefore cannot silently change a prepared reference.

The generation-reference compositor renders the canonical unit-free,
ground-cover-free authored visual surface through exactly that saved frame. The
complete playable outer envelope and every draw whose position or footprint is
gameplay-authoritative in the semantic packet must lie fully inside. Scenic-only
terrain, Scene Art, retained legacy off-board props and doodads, and Subterrain
may cross the frame edge or remain wholly outside it; clipping changes neither
their board data nor active visual-surface membership. A decorative alpha pixel
touching a source edge is valid and must not trigger a full-paint-bounds refit.
The frame rectangle never becomes a playable boundary, visual-terrain boundary,
void, collision edge, or runtime camera constraint.

Per
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
the generation-reference compositor captures one immutable Generation
Reference from the canonical saved Level through exactly that frame. Its saved
background mode chooses the environment pixels: Legacy captures the ordinary
composed environment, while AI captures the exact selected AI raster. Both
forms remove units, live ground cover, grid and tactical overlays, labels, and
application UI. An AI mask contributes no pixels when no live unit or cover
subject exists.

The complete playable outer envelope and every draw whose position or footprint
is gameplay-authoritative in the semantic packet must lie fully inside the
frame. In Legacy mode, scenic-only terrain, Scene Art, retained legacy off-board
props and doodads, and Subterrain may cross the frame edge or remain wholly
outside it; clipping changes neither their board data nor active visual-surface
membership. A decorative alpha pixel touching a source edge is valid and must
not trigger a full-paint-bounds refit. The frame rectangle never becomes a
playable boundary, visual-terrain boundary, void, collision edge, or runtime
camera constraint.

Generation Reference capture loads only the frame and background mode in the
canonical saved Level and fails closed when the frame is missing, malformed,
non-16:9, or fails required-geometry containment. It persists the exact
resulting PNG, normalized frame, source mode, selected AI identity when
applicable, Level revision, environment-geometry digest, semantic-packet
identity, and hashes. Later changes create another Generation Reference instead
of rewriting an existing one. This reference crop is independent of a
generated candidate's later owner-fitted registration and deterministic
whole-image warp; generated output remains one continuous full scene and may
not reproduce the source rectangle as a hard crop or floating-board edge.

## Composed terrain and macrotiles

Per [ADR-0284](adr/0284-board-views-render-the-complete-authored-visual-scene.md),
the runtime board renders the complete authored visual-terrain surface rather than clipping
environment pixels to the gameplay rectangle. The same scene plan is used by War, Campaign,
Skirmish/test play, previews, analysis viewers, and thumbnails. Off-grid visual coordinates remain
render-only: the playable rectangle still exclusively owns hit targets, units, zones, collision,
movement, objectives, promotion, and solver state. The opening camera remains centered on the
playable contact surface under ADR-0189 and ADR-0191, so surrounding art does not reframe play.

The runtime board is one composed terrain canvas, but its source data remains layered:

1. Explicitly authored Subterrain surfaces on exposed south/east faces.
2. Exactly one terrain top for every active visual-terrain coordinate: a playable cell uses either
   its 1x1 top sprite or the clipped portion of a macrotile from `EditorBoard.macroTiles` that owns
   the cell, while scenic coordinates resolve through the rectangular/sparse decorative surface.
3. Road and river feature overlays.
4. Optional grid, cover, doodads, props, Scene Art, units,
   and tactical overlays. Scene Art is omitted here once the
   pre-drawn plate has baked it in.

### Pre-drawn board surfaces

Per
[ADR-0158](adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md),
and
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
a board persists both an explicit `legacy`/`ai` background mode and a separately
remembered exact AI selection: one immutable raster version plus either one
matching depth-aware occlusion-mask child or an explicit no-mask state. Ordinary
cell and object data remain present and gameplay-authoritative in both modes;
neither mode creates a different coordinate system or flattened rules document.
Per
[ADR-0179](adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md),
a fitted selection uses a schema-version-3 surface that embeds one exact
canonical, compatibility-named cyan move-highlight profile snapshot bound to the
selected warped background and current cover-independent environment geometry.
Per
[ADR-0185](adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md),
that fitted cell footprint shapes every square-local visual highlight rather
than cyan move paint alone. Historical schema-version-2 surfaces remain valid
and use the complete canonical diamond for every cell-local highlight.

Legacy mode ignores the remembered AI selection for rendering and composes the
ordinary authored environment. AI mode makes the selected raster the sole source
of baked environment pixels. The planner then
suppresses terrain tops, Subterrain, roads, rivers and other linear features,
macrotiles and generated regions, props and scenery, fences and posts, walls and
wall art, doodads, environmental shadows, lighting effects, non-cover
environment animation, and particles. Per
[ADR-0162](adr/0162-predrawn-backgrounds-retain-live-ground-cover.md), explicitly
authored ground cover remains a live additive layer with its canonical
back/front unit depth and animation on both playable and scenic visual terrain.
Exact Levels never synthesize ambient cover. Live units/pieces and their
unit-owned presentation, ground cover, tactical overlays such as the optional
grid, selection, movement, threat, zones, and objectives, and application/editor
UI remain above the raster.

Per
[ADR-0172](adr/0172-archiving-a-board-art-slot-forgets-only-dormant-legacy-selection.md),
switching to Legacy does not itself forget the remembered AI selection. The
owner's explicit **Archive slot** action may remove a matching dormant selection
from Legacy working and canonical Levels as part of the same fenced archive
transaction. This changes no rendered Legacy pixel or other Level field. A
matching AI-mode Level fails closed instead of losing its active background.

Generation Reference is not settable runtime art. Per
[ADR-0168](adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
a server-owned creation slot begins with one exact, content-complete Raw
Pipeline Source as its pre-modification input, then admits at most one warped
raster and one current **Board with occlusion mask** in that order. The same immutable raw
version may be referenced by several slots without copying or reclassifying it;
each slot's warp uses that raw as its deterministic raster parent. The raw
raster remains directly settable.
Per
[ADR-0110](adr/0110-owner-fitted-grid-defines-predrawn-review-rectification.md),
the owner may instead fit four source corners and strictly monotonic internal
row/column guides over that complete untouched source, with an equal-spacing
reference and numeric correction range. Per
[ADR-0171](adr/0171-local-predrawn-grid-correction-uses-a-shared-vertex-mesh.md),
the owner may then refine isolated painted grid-line drift through sparse
shared-intersection controls. A selected cell exposes four vertices, but each
adjustable interior vertex belongs to every adjacent cell. Boundary vertices
remain visibly locked to the coarse fit so surrounding scenery keeps that exact
map; there are no disconnected cell corners, object warps, or layer warps.
Every affected quadrilateral must remain non-degenerate, consistently oriented,
and non-self-intersecting.
Per
[ADR-0111](adr/0111-predrawn-refit-target-dimensions-are-owner-configurable.md),
the owner controls the refit row and column counts without changing playable
cells, hit targets, movement, or authored level dimensions. Applying the fit
runs one versioned deterministic rasterization and emits a new immutable
full-scene raster child. It records its exact parent and transform provenance;
runtime never repeats the guide map, shared mesh, or homography. Registrations
without local refinements retain the canonical version-1 raster operation and
its exact evaluator. A canonical version-5 registration with sparse local
refinements requires `grid-warp-v2` and
`shared-predrawn-rasterizer-v2`; crossed algorithm/registration versions fail
closed.

Occlusion generation emits an immutable depth-aware mask child bound to the
exact raster version, dimensions, coordinate basis, canonical environment-
geometry revision or hash, depth convention, generator version, and content
hash. Per ADR-0179, a new occlusion child may be created only after the owner
has saved a valid cyan profile for that exact current warp; an explicitly saved
empty sparse map approves full diamonds everywhere. The profile is a workflow
gate and Level snapshot, not mask pixels or mask lineage. The mask's stored
alpha and depth clip live-unit and live-ground-cover pixels where painted
environment pixels are nearer. Ground cover is absent from the background
environment-geometry fingerprint because it is neither baked into the selected
raster nor used to derive the mask; cover-only edits do not stale either
artifact. Tactical overlays and UI remain readable above the environment unless
another named contract explicitly says otherwise. An explicit no-mask selection
applies no clipping. Missing or mismatched selected art fails closed; no
consumer may restore composed environment draws, repeat a runtime warp, choose
a mutable slot's newest image, or derive a replacement mask from canonical
sprites.

Per
[ADR-0163](adr/0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md),
new artifacts use only the cover-independent
`predrawn-environment-geometry-v2` fingerprint. The exact v1 algorithm,
including its historical cover maps, is retained solely to prove an existing
immutable v1 row against a server-held Level. Migration 30 records that proof as
an external immutable v1-to-v2 binding; it never changes the artifact's
operation or provenance. The binding may occur only at the first fenced
pre-mutation autosave, direct derivative creation, or Save/Publish fallback.
Reads never bind. Once proven, cover-only edits continue to match v2. Per
[ADR-0164](adr/0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md),
a baked terrain or environment edit may still autosave or be recovered as an
owner draft, but it makes the selected art explicitly stale. The artwork UI
disables AI activation, Set, and derivation for that stale version. Per
ADR-0165, a dormant stale selection does not block Generation Reference capture
or Save while the Level's explicit mode is Legacy. AI Save and every AI
publication remain blocked until the owner restores matching geometry or
selects a complete artifact for the current v2 digest.

Editor, read-only viewer, gameplay, browser thumbnail, and server thumbnail all
resolve the same saved background mode and, in AI mode, the same exact
raster-plus-mask selection and schema-version-3 cell-visual-footprint snapshot
when present. Its serialized field and schema names remain the established cyan
move-highlight compatibility names. A missing AI selection or malformed
required profile fails closed and never silently changes the saved mode to
Legacy.

Per [ADR-0135](adr/0135-predrawn-registration-is-owner-picked-source-geometry.md)
the four source corners and full internal row/column fit remain owner-authorable
in the running app against the untouched raster. Automatic geometry may seed
that instrument, but it never outranks an owner-picked control. Guide movement
is clamped between neighboring guides so the board cannot fold or reorder cells.
Per ADR-0171, explicit **Coarse grid** and **Local cells** modes make the
precision sequence legible. Local mode renders the fitted grid as shared
piecewise segments, lets the owner select one cell and drag or nudge its four
shared vertices, visibly locks boundary vertices, highlights every neighboring
cell affected by the active interior vertex, and can reset one vertex, the
selected cell, or all local refinements.
The version-5 payload stores at most 1,024 row-major sparse source-pixel
overrides; the shared validator clamps or rejects any move that would fold an
affected cell.
Refit count changes rebuild only the changed axis with equal spacing and never
resize the Level or select a playable subset. Clicks, drags, nudges, count
changes, spacing reset, and restore change pending authoring state. The explicit
derive action submits the exact displayed state, persists the resulting raster
child and lineage, reads it back, and only then reports success. Browser-local
or URL state is never installation authority.

Per
[ADR-0178](adr/0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md),
one bounded session-local Undo/Redo history spans that complete pending
calibration in both Coarse grid and Local cells. It snapshots working corners,
pinned boundary, refit counts, both guide arrays, and sparse mesh overrides.
Each completed drag and successful discrete edit is one step; dimension,
spacing, snap, and restore operations remain atomic. Rejected/no-op edits and
view-only pan, zoom, mode, and selection changes create no entry. Saving or
deriving consumes the currently restored state but does not persist the history.

The derived raster's review grid continues to use its recorded refit row and
column count. The ordinary authored-cell grid returns when no calibration proof
is active. Review-grid cells never become editor hit targets or gameplay cells.
In the source fitter, the visible fitted lines pass through the recorded shared
mesh intersections rather than redrawing only straight whole-row and
whole-column guides.
Artifact inspection may layer the canonical live cyan move treatment over
authored gameplay cells as a local readability proof. Its toggle and currently
sampled cell remain local diagnostics, do not modify the raster, and never
extend interaction onto refit-only review cells.

Per
[ADR-0179](adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md),
post-warp cyan fitting is a separate explicit authoring workspace over the exact
warped raster. Per
[ADR-0183](adr/0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md),
that precision instrument uses the grid fitter's viewport-level workspace
treatment rather than the Board Art Pipeline's smaller center column. The
mounted editor, exact slot, route identity, and writer authority remain
unchanged underneath it.

Each sparse playable-cell entry stores four top/right/bottom/left integer points
from 0 through 10,000 in `cell-diamond-10000-v1`; an omitted entry means the full
`[5000,0,10000,5000,5000,10000,0,5000]` diamond. A custom quadrilateral must stay
contained, strictly convex, consistently ordered, and non-degenerate.

Per
[ADR-0185](adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md),
the resulting quadrilateral shapes every visual treatment whose meaning is
"highlight this cell." Runtime move, attack, threat, blocked, premove,
selection, focus, hover, drag/drop, and promotion paint uses it whenever that
state is drawn on the cell plane. Level Editor square-local zone, tactical,
ring, region, hover, and placement-preview paint uses it as well. This applies
equally to fills, outlines, textures, animation, and cell-plane rings; cyan move
paint is the fitting workspace's representative preview rather than the
profile's exclusive consumer.

The complete canonical diamond remains the hit target. Cell identity and
selection, movement and pathfinding, occupancy and placement validity, zone,
region, objective, and promotion membership, and every solver rule remain
canonical. Grid lines, fence/barrier hints, and other topology guides do not use
the fitted clip. Units, objects, path arrows, labels, and other independently
shaped visuals retain their own geometry. A fitted pixel therefore never adds,
removes, or redirects logical state.

The attempt retains one fenced, revision-CAS latest profile bound to its exact
current warp. Saving canonicalizes sparse cells and records the profile digest;
discarding the warp clears that draft. Setting a board copies the exact profile
content and digest into the schema-version-3 Level surface. Runtime reads only
that embedded snapshot and never follows the attempt's later mutable draft.
Malformed or mismatched schema-version-3 data fails closed, while a
schema-version-2 surface preserves the historical full-diamond treatment.

The viewport-level workspace keeps units hidden and the registered grid visible.
Per
[ADR-0184](adr/0184-cyan-footprint-fitting-supports-additive-tile-selections-and-outer-border-bars.md),
a plain tile click replaces selection and Shift+click toggles additive selection
without permitting an empty set. The last-added selected tile is primary and
alone exposes four small point handles. Shared edges between selected tiles are
hidden and ineligible. Each exposed edge selects the maximal contiguous
same-edge boundary bar containing it; gaps, notches, disconnected components,
and separate hole contours do not bridge bars. Cell navigation collapses the
selection to one tile. The workspace also provides reset-selected/reset-all,
pan, wheel zoom, and plainly labeled Undo and Redo. Per
[ADR-0182](adr/0182-cyan-footprint-editing-has-image-axis-locks-and-native-pixel-nudges.md),
Free/X-only/Y-only tool state constrains pointer, keyboard, and button movement
along the artwork's horizontal and vertical image axes. A constrained point
movement preserves the locked coordinate exactly while remaining inside the
canonical diamond. Four visible direction buttons and Arrow keys move the
selected point or every segment in the selected boundary bar by one native
artwork-raster pixel; Shift+Arrow moves ten. Each boundary segment moves as a
complete supporting line: its shifted line is intersected with the two unchanged
neighboring lines, and its two integer endpoints are chosen jointly through the
canonical footprint validator. A boundary-bar request is accepted for every
segment or rejected without changing any segment. Pixel deltas are derived from
the exact surface frame and world bounds into `cell-diamond-10000-v1`,
independent of view zoom.

One completed point drag, successful point-or-boundary keyboard or button
nudge, or discrete reset is one of at most 100 session-local history steps. One
boundary-bar nudge and Reset selected each commit their complete group
atomically. Tile membership, primary tile, active point/boundary selection, axis
mode, pan, zoom, Save, and closing are not history. A canceled pointer drag
restores its starting profile without adding history. Explicit Save commits the
currently displayed sparse profile, never the transient history or tool state;
the profile schema and backend contract remain unchanged.

Per
[ADR-0170](adr/0170-derived-board-inspection-is-a-full-workspace-revision-gate.md),
that proof temporarily owns the Board Art Pipeline's full shell workspace
rather than living inside an artifact preview card. It remains unit-free and
provides grid/cyan toggles, viewport-cover fit, pan, and zoom. **Tweak grid in
new attempt** preserves the inspected result, creates a separate slot from its
exact Raw Pipeline Source, and opens the grid fitter with the inspected warp's
direct registration. It performs no model handoff, upload, media copy, or
mutation of the prior lineage.

Per [ADR-0113](adr/0113-predrawn-calibration-can-snap-to-the-canonical-grid-shape.md),
`SNAP IDEAL GRID` converts the current refit count to the exact runtime projection
shape using the canonical `TILE_STEP_X`/`TILE_STEP_Y` axis vectors and one uniform
scale. It preserves the current center and closest scale when possible, keeps the
result inside the source frame, and resets internal guides to equal spacing. It
does not change the selected counts or authored level geometry.

Per [ADR-0114](adr/0114-predrawn-calibration-keeps-an-independent-pinned-boundary.md),
the owner may pin the current four outer corners as a separate painted-boundary
reference. Its contrasting four-line outline and independently draggable handles
remain visible while the working grid is snapped or edited. Version-4 and
version-5 registration preserve that reference with derivation provenance, but the
reference is display-only and never participates in the emitted pixels, review
grid, hit targets, gameplay, or runtime background declaration.

Per
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
as renamed and separated by
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md),
Level Artwork is a normal right-rail control page that leaves the board visible.
It owns the persistent Legacy/AI mode control, remembered-selection status, and
buttons to the URL-addressable **Generation References** and **Board Art
Pipeline** center workspaces. Its canonical route layer and process namespace
are `level-artwork` and `levelArtworkEditor`; they never reuse Placed Art brush
state. Only an open process workspace covers and makes the still-mounted board
inert. Generation References manages immutable level-derived model inputs and
their manual AI handoff. Board Art Pipeline presents separate deterministic
creation slots, each with one exact Raw Pipeline Source input and at most one
current warped board and **Board with occlusion mask**. Workspace-level **New
attempt** chooses an eligible retained raw and creates a slot already ready for
grid fitting; warped and mask-bearing artifacts may not be slot inputs. The
slot's post-warp cyan profile is mutable attempt authoring state rather than a
fourth artifact stage. A new occlusion result requires that saved profile. The
last artifact deterministically owns its exact raster and attached depth data;
an owner never coordinates separate background and mask selectors. Invalid or
incomplete lineage is unavailable rather than repaired by fallback.

Per
[ADR-0181](adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
**Discard mask & edit again** detaches the exact current mask without changing
its immutable pixels, the warp, registration, or cyan profile. A matching
working selection becomes that same warp without occlusion; canonical content
does not change outside the normal Save or Publish boundary.

`Set this board version` applies the artifact as the remembered exact AI
selection only to the current fenced editor working copy and must visibly
identify what is now set. For a fitted warp it also embeds the exact canonical
cyan profile as schema-version-3 Level content; it does not retain a mutable
attempt pointer. The separate Legacy/AI control decides which environment the
working Level renders. Both are content mutations, but neither does Save,
Review, Publish, move a global media pointer, or imply canonical success.
Private Save or official Review and publish/Publish is the separate canonical
transaction. Private Save keeps its pinned ready versions owner-scoped; only
official publication or the separately labeled owner user-map Publish action
makes its exact selected versions public.

ADR-0158 partially supersedes ADR-0115's mandatory installation handoff. A
compact source/registration copy may remain as optional diagnostic or provenance
export, but deriving, setting, saving, and publishing cannot require Codex,
clipboard transfer, an editor URL, shared browser state, or a filesystem step.

Per [ADR-0121](adr/0121-predrawn-pan-stops-at-art-boundary.md),
the selected raster version's persisted frame dimensions and world bounds—not
the playable grid diamond or a runtime-transformed source polygon—define a
viewport-cover zoom floor while AI background mode is active. A remembered
selection in Legacy mode does not affect the camera. The shared
`ViewPane` recomputes one floor from its live dimensions, rounds upward only at
fine numerical safety precision, and reports it to editor and gameplay zoom
controls. The floor must not be rounded to the coarser human-facing wheel or
stepper increment, because doing so can erase valid zoom-out room in a small
preview. Pan never changes that floor: it proceeds until the
viewport reaches the raster art edge and then stops. Zoom and resize clamp
an existing pan back inside. Wheel, stepper, shortcut, and reset paths must not
cross the floor. If it exceeds the ordinary gameplay cap, the cap rises to the
floor; ordinary tiled boards retain their existing zoom range.

Per [ADR-0189](adr/0189-board-facing-views-open-on-playable-geometry.md),
that art-derived floor is a safety boundary, not the opening composition.
Board-facing live and static views derive their opening frame from the stable
projected playable-board presentation. Per
[ADR-0191](adr/0191-board-opening-frame-uses-the-playable-contact-surface.md),
that presentation is the union of playable cell contact diamonds and excludes
fixed tile sprite relief/headroom, units, props, doodads, scenic terrain, and
generated art. The frame expands by five percent of its own width and height on
every side, is contained and centered in the measured viewport, and is then
raised only when the accepted-art cover floor requires it. Gameplay, Reset, the Level Editor,
selected-level preview, replay/solver views, browser authoring bakes, server
list derivatives, and social cards consume the same primitive. Per
[ADR-0201](adr/0201-board-cameras-fit-the-actual-owning-viewport.md) and
[ADR-0259](adr/0259-the-live-play-composition-is-the-authority-derived-views-conform.md),
gameplay is composed in real viewport pixels: the persistent title bar and the
real-pixel HUD rail keep their authored dimensions, and the playfield takes the
remaining browser rectangle. The live gameplay camera frames the largest 4:3
drawable viewport inside that playfield while the board art bleeds full-screen
behind the floating chrome; that framed pane remains the measurement,
accepted-art coverage, and input rectangle. Per
[ADR-0204](adr/0204-all-board-viewing-panes-match-play.md) as amended by
ADR-0259, ordinary rendered game-board panes share the same canonical 4:3
board window: selected-level and read-only previews, replay and solver boards,
Gym and Game Lab boards, Studio board viewers, and canonical or
unsaved-authoring thumbnails. Per
[ADR-0278](adr/0278-level-editor-board-fills-its-authoring-workspace.md), the
main Level Editor is a full-canvas authoring surface instead: its complete
workspace allocation is the one measured, clipped, and interactive viewport,
with no fixed-aspect seat inside it. Compact raster delivery is 288×216. Source
media, model inputs, fixed-format exports, and social cards retain their
required artifact dimensions because they are not application board viewports.
Every board surface applies the same playable-contact-surface opening policy. The natural
opening fit may raise the gameplay zoom ceiling rather than being stopped by
its ordinary human-control cap. User camera input releases automatic framing
until a level change or Reset.

Per [ADR-0190](adr/0190-accepted-art-zoom-floor-uses-the-full-feasible-pan-region.md),
the safety floor is the smallest zoom at which the viewport can fit anywhere
inside the accepted transformed-art polygon. It is not restricted to
board-centred pan and there is no separate standard zoom-out size. The opening
camera remains board-centred; when a lower safe zoom makes that pan invalid,
the camera reclamps to the nearest feasible pan. Current pan never raises the
stable floor, and every feasible pan still keeps every viewport corner inside
accepted pixels.

Per ADR-0158,
the cover floor is a safety limit rather than a substitute for camera room. The
raw and derived versions keep their recorded actual dimensions; no fixed pixel
dimensions or exact board-to-frame percentage are an acceptance gate.
Continuous world art outside the playable boundary must supply owner-approved
pan travel in the real shared viewer. Raising resolution without changing the
composition does not create camera room.

While AI background mode is active, the editor must reject changes to dimensions,
cells, terrain, Subterrain, macrotiles, roads, rivers, props and scenery, fences,
walls, wall art, generated regions, cuts, exits, doodads, and other baked
environment content. Ground cover remains normally editable across the complete
authored visual-terrain surface alongside units, rules, zones, and tactical
authoring. Legacy mode restores ordinary environment rendering and those tools.
Changing baked environment geometry there may stale the remembered AI selection
and requires a new matching attempt before that selection can become active AI
content again; changing cover does not.

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
