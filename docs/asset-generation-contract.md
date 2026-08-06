# Asset Generation Contract

This document turns the current art direction into implementation rules for
agents and humans producing production assets. The goal is an actual browser
game that looks like the approved generated pixel art, not a web layout that
roughly gestures at it.

Use this contract together with `docs/asset-terminology.md` (the vocabulary:
asset, frame, part, slot, state, assembly), `docs/ui-art-direction.md`, and
`docs/asset-pipeline-proposal.md`, plus the live-storage rules in
[`runtime-asset-contract.md`](runtime-asset-contract.md). For scenic backgrounds and unit portrait
backdrops, also use `docs/lore-anti-story.md` and
`docs/background-art-contract.md`.

Production raster sizing is governed by
[ADR-0076](adr/0076-scaling-is-calibration-production-art-is-native-1x.md):
scaling may calibrate a candidate, but acceptance requires regenerated native
pixels and a 1:1 canonical runtime path. The narrow whole-board exception is
[ADR-0158](adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md):
the uploaded pre-drawn scene keeps its exact bytes as an immutable raw root,
while an approved grid adjustment creates a new deterministic raster child that
runtime consumes directly rather than warping the raw image again.

Storage and promotion are governed by
[ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md): generated media
is uploaded as a live candidate, accepted pointers live in Postgres, immutable
bytes live in private Blob Storage, and no production/review/source media is
published into Git.

## Core Decision

The playable game should be assembled from real pixel-art assets and live game
state. Generated concept renders are the style source and review reference;
they are not the final renderer for interactive systems.

Do not ask an agent to "make the UI look like the art" by inventing CSS. Ask it
to produce named live-storage candidates, provenance, contact sheets, and
in-game previews that can be reviewed against the approved art. A filesystem
export is temporary handoff material, never promotion.

## Hard Rule

Do not approximate the approved pixel-art style with CSS gradients, generic
borders, box shadows, rounded panels, DOM-drawn ornaments, or ad hoc SVG
redraws. CSS is layout glue. It may position, hide, show, and load assets; it may
scale candidates during review or transform a whole scene for user zoom. It must
not downscale an accepted asset locally to manufacture its canonical production
size, and it should not be the medium that recreates rich pixel art.

When the target visual detail is pixel-authored, produce transparent PNG assets
or sprite sheets and render them through canvas or DOM image layers.

## Art, Assets, And Live State

Use this split when deciding what to build.

### Keep As Art

Keep fixed, composition-specific imagery as art-backed bitmap references or
large image layers:

- full-screen concept renders used for review
- menu background landscapes and atmospheric scenes
- large illustrative battlefield previews that do not reflect live board state
- bespoke title art or logo lockups
- one-off splash, loading, or promotional images
- fixed decorative compositions that do not need independent state

These may be cropped from approved renders while the production asset kit is
being built.

### Convert To Assets

Convert anything the game controls independently into assets:

- terrain tiles, cliff edges, paths, water, bridges, spawn markers
- props such as rocks, shrubs, trees, ruins, and stumps
- chess pieces and faction variants
- UI frames, panel chrome, buttons, tabs, dividers, badges, and docks
- crests, role icons, gear icons, action icons, status icons, and resource icons
- hover, selected, pressed, disabled, warning, and notification states
- overlay sprites or procedural overlay primitives for move/threat/readability

The test is not only animation. If the game places it, repeats it, recolors it,
counts it, selects it, hides it, changes its state, or layers it against other
game objects, it should be an asset.

### Keep Live

Keep text and stateful values live:

- player names, profile status, rank, counts, timers, rewards, and stats
- menu labels unless they are part of a bespoke title/logo treatment
- accessibility labels, hit targets, focus state, and localization-ready copy
- selected, hover, disabled, signed-in, signed-out, and validation state

Live text should use an approved pixel font or bitmap-font pipeline, but it
should not be baked into art crops that need to change.

## Menu UI Guidance

Menus should feel like game UI, not ordinary web UI. A menu may combine:

- a large art-backed scenic background
- pixel UI asset frames and button states
- icon sprites and crests
- live text drawn with the approved type treatment
- transparent hit targets and accessible DOM state

For example, a profile/status panel should be decomposed into assets such as:

```text
ui/profile-panel-frame.9.png
ui/profile-panel-frame.9.json
ui/crest-lion.png
ui/icon-gear.png
ui/icon-rook-blue.png
ui/icon-rook-red.png
ui/button-sign-in.png
```

The game should place live copy and numbers into those assets. It should not
ship a single baked profile-panel crop containing all text, and it should not
replace the pixel frame with CSS borders.

## Board Guidance

The skirmish board should converge on a real pixel asset renderer:

- terrain and props come from tile/prop sheets
- pieces come from sprite sheets
- tactical overlays remain procedural or asset-backed, but never baked into
  terrain
- draw calls use integer logical coordinates
- `imageSmoothingEnabled` stays false for sprite rendering
- board-scale readability wins over zoomed-in beauty

Rendered board concepts are still valuable, but they should become references,
crop sources, or temporary bridge images while the real tile and piece kits are
being produced.

### Pre-drawn Whole-Level Plates

The pre-drawn board path is the deliberate complete-plate exception to the
ordinary composited-tile direction above. Its current authorities are ADR-0108,
ADR-0109, ADR-0110, ADR-0134, ADR-0135, ADR-0158, ADR-0162, ADR-0165,
ADR-0166, ADR-0168, ADR-0169, and ADR-0176.
A Level persists an explicit Legacy/AI background mode separately from its
remembered exact AI selection. Legacy mode renders the ordinary composed
environment. In AI mode, one continuous generated painting is the sole source
of baked environment pixels while the canonical Level remains the sole
authority for gameplay geometry. AI mode retains live units/pieces, explicitly
authored ground cover, tactical overlays such as the optional grid, selection,
movement, threat, zones, and objectives, and application/editor UI. It
suppresses every ordinary terrain, Subterrain, feature, generated region,
prop/scenery, fence/post, wall/wall-art, doodad, environmental shadow,
lighting, non-cover animation, and particle draw.

Per [ADR-0109](adr/0109-predrawn-generation-packets-preserve-authored-level-semantics.md)
and
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
whole-level generation must not ask a model to infer the playable board from an
image alone. Per
[ADR-0166](adr/0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md),
and
[ADR-0168](adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
every model-generation handoff binds one immutable Generation Reference and
uses an authored-level packet containing:

- a unit-free exact projected grid and perimeter guide;
- board dimensions and projected axis directions;
- a canonical coordinate-by-coordinate terrain and footprint dump;
- exact road connectivity, blocking shared edges, exits, and outer boundary
  edges;
- an autosaved owner-authored 16:9 generation frame in projected-board
  coordinates that fully contains the required gameplay-authoritative reference
  geometry;
- one immutable Generation Reference. It is unit-free and
  cover-free and is captured from the acknowledged working-copy frame and
  background mode. A
  Legacy reference contains the ordinary composed environment, including only
  explicitly persisted and exposed Subterrain. An AI reference contains the
  exact selected raster pixels and is explicitly non-isolated. The reference
  owns environment, materials, palette, lighting, texture language, and finish,
  with no named biome supplied independently by text; and
- explicit prohibitions against baked units, invented gameplay height, expanded
  footprints, extra roads, and a model-invented perimeter.

The Generation Reference remains the default isolated model input. The returned
AI-painted PNG is committed separately as a content-complete `kind='raw'` Raw
Pipeline Source. That exact raw is the pre-modification input of the
deterministic Board Art creation slot; it is not another model input merely
because several slots may reuse it.

Every Generation Reference suppresses units, additive ground cover, grid and
tactical overlays, labels, and UI. Cover creates avoidable occlusion around
geometry in the input. Per
[ADR-0162](adr/0162-predrawn-backgrounds-retain-live-ground-cover.md), this clean
generation input is independent of final composition: explicitly authored
ground cover remains a live, animated runtime layer and need not be baked into
the selected raster. In a Legacy reference, required gameplay-authoritative
terrain, roads, barriers, and props remain fully visible; ADR-0142 separately
permits scenic-only art to meet or cross the saved crop edge. In an AI reference,
the exact selected raster is captured without compositing the dormant legacy
environment beneath it.

Per
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md),
the owner-facing **Placed Art** destination distinguishes free, gameplay-inert
**Scene Art** from board-only nonblocking Doodads and board-only blocking Props.
Scene Art may appear anywhere in the authored visual scene and remains part of
a Legacy Generation Reference. Newly authored doodads and complete prop
footprints must remain playable. Preexisting off-board doodads and props are
not migrated away: they remain visible in Legacy capture and removable in the
editor even though they cannot seed a new off-board placement or move.

Per
[ADR-0141](adr/0141-predrawn-generation-references-preserve-explicit-subterrain.md),
a Legacy Generation Reference preserves every explicitly persisted Subterrain
placement visible inside the saved generation frame that the canonical shared
topology resolves onto an exposed face of the active visual terrain surface.
Absence remains empty: tiles, families, adjacency, exposure, generation, and
scenic fallback never synthesize a vertical material. These authored pixels
carry appearance only and do not declare gameplay height, additional board
addresses, or a larger envelope. An AI Generation Reference preserves its selected
raster pixels exactly and does not reconstruct Subterrain from dormant board
sprites. In either case, the generation prompt prohibits every additional
skirt, cliff, attached side strip, row, column, or implied elevation.

Per
[ADR-0142](adr/0142-owner-authored-frame-defines-predrawn-generation-reference.md),
the saved generation frame is a presentation crop rather than a second visual
surface. The Level Editor exposes a 16:9 owner framing instrument and persists
its result in canonical projected-board coordinates, independent of browser
dimensions, device-pixel ratio, and transient ViewPane state. The complete
playable envelope and every gameplay-authoritative reference draw represented in
the semantic packet must fit fully inside. Scenic-only terrain, Scene Art,
retained legacy off-board props and doodads, and Subterrain may clip or be
excluded without being deleted from board data. Decorative pixels may touch a
reference edge; that rectangle never
becomes gameplay perimeter evidence or permission for a hard-cropped generated
result. Missing, malformed, or under-inclusive frame data fails Generation
Reference capture. A successful capture persists immutable bytes plus its saved
mode, frame, Level revision, geometry and semantic identities, dimensions, and
hashes. Later mode or Level changes create another reference instead of
changing that record.

Per
[ADR-0158](adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md),
occlusion is a persisted immutable depth-aware mask child, not runtime inference
from the plate or runtime reconstruction from ordinary raised sprites. The mask
is bound to the exact raster parent, dimensions, coordinate basis, canonical
environment-geometry revision or hash, depth convention, generator version,
and content hash. The owner inspects the exact mask and real clipping result in
the application. Per ADR-0162, it clips both live units and live ground cover by
depth, while cover itself is excluded from the immutable environment-geometry
fingerprint. A missing or mismatched selected mask fails closed; an explicit
no-mask selection performs no environmental occlusion.

Per
[ADR-0180](adr/0180-predrawn-occlusion-selects-final-raster-pixels.md),
the alpha plane is owner-authored directly over the exact immutable warped
raster that becomes the mask's parent. Legacy tile, terrain, prop, doodad, and
Scene Art pixels or silhouettes are never sampled or imported into that
selection. A revision-pinned SlimSAM running off the UI thread in a browser
worker may propose three candidates from owner-placed positive and negative
points, but only explicit candidate acceptance changes the selected alpha.
Brush, eraser, Reset, Undo, and Redo provide a complete manual path when the
model is wrong or unavailable. The canonical alpha digest is authoritative;
model, revision, backend, prompt/manual counts, and the depth-assignment version
are provenance rather than runtime dependencies.

Depth is derived deterministically after acceptance. Each 8-connected alpha
component is handled independently. In every source-image column occupied by
that component, the bottom-most selected pixel maps through the exact parent
dimensions and world bounds to its canonical scene depth, and all selected
pixels above it in that component and column share that contact depth. Authoring
state creates no media. Only explicit **Create board with occlusion mask** emits the
immutable alpha/depth child, and the owner inspects that persisted clipping
result before Set. Runtime performs no segmentation inference.

Per [ADR-0120](adr/0120-canonical-top-only-image-owns-predrawn-appearance.md) as
partially superseded by ADR-0165, ADR-0166, and ADR-0168, the selected immutable
Generation Reference owns visible appearance while the semantic dump owns
gameplay meaning. A Legacy Generation Reference may serve the default isolated
test with no prior candidate, accepted plate, beauty render, or unrelated board
image. An AI Generation Reference is an intentional iterative input and records
non-isolated generation provenance. Reusing the returned Raw Pipeline Source
for another deterministic slot preserves that existing provenance; it is not
itself another model run. Boundary appearance may be generated creatively, but
its location remains the canonical outer edge of the board. The
mutable process and prompt wording live in
[`art/predrawn-board-generation.md`](art/predrawn-board-generation.md); exact run
prompts remain text provenance while candidate media follows the live-storage
contract.

An explicitly named comparative refinement follows
[ADR-0156](adr/0156-named-predrawn-candidate-refinements-are-separate-non-isolated-branches.md)
after owner review identifies a localized miss. It must use the same
preflight and a new generation handoff. Its exact saved Generation Reference and
byte-identical semantic packet retain authority, while a prior candidate may be
only the subordinate edit target. The request manifest records reference and
parent lineage, all reference hashes, the fixed operation, and
`isolatedPipelineEvidence: false`. It may not overwrite its parent, add another
raw result to the prior handoff, masquerade as an isolated result, or skip a
fresh game-surface review.

Generation preparation records the exact Generation Reference identity and
hash, working-copy semantic request and hashes, request hash, and actor/time.
Manual Codex generation occurs outside the application, so the application does
not know or claim that conversation's model, prompt, generation parameters, or
relationship to a later imported PNG. Changing the captured semantic request or
Generation Reference requires another prepared request. A Generation
Reference's saved frame and hash remain part of its provenance; changing the
current Level frame does not mutate it.

The owner-facing Board Art Pipeline separately records each creation slot's
exact Raw Pipeline Source identity and hash plus compatible canonical geometry
and deterministic processing context. It may record where the raw first entered
storage as descriptive provenance, but that slot does not own the raw and
another slot may reference the same immutable input. Intake does not require a
Generation Reference identity.

A lower-level preflight builder may separately resolve the same typed image
input and semantic-request identity and materialize a complete
`prompt.txt`, semantic packet, ordered content-hashed reference manifest, and
request manifest. Per
[ADR-0125](adr/0125-predrawn-preparation-self-validates-before-generation.md),
that deterministic tool reports `ready-for-generation` without an owner
checkpoint. Its files are separate text/tool provenance and do not cause the
application attempt to claim an external conversation's model, prompt, or
parameters. Mandatory owner judgment begins with the generated candidate
mounted on the game-owned review surface.

Per [ADR-0110](adr/0110-owner-fitted-grid-defines-predrawn-review-rectification.md),
candidate review exposes the complete authored grid over the untouched Raw
Pipeline Source.
The owner may fit monotonic row and column guides and inspect their correction
range. Large, non-separable, or semantic drift still rejects the generation;
the whole-image alignment cannot hide an incorrect level. Applying an accepted
fit creates a new immutable full-scene raster child through the versioned
deterministic rasterizer. The fit is retained as lineage and audit data, not as
a Level field that every renderer replays.

Per [ADR-0111](adr/0111-predrawn-refit-target-dimensions-are-owner-configurable.md),
the review instrument's target row and column counts are owner-configurable. If
the candidate visibly contains an extra row or column, the owner sets the target
to the painted count before fitting guides. That target controls the refit
topology and the pending pre-derivation proof overlay. Per
[ADR-0112](adr/0112-predrawn-review-overlay-uses-the-saved-refit-grid.md), this
optional authoring overlay retains the chosen count after calibration closes.
Once a raster child is created, that same count belongs to its immutable
derivation provenance and may drive the derived-raster proof overlay; it is not
a runtime warp instruction. Canonical level dimensions, interactive cells, and
gameplay remain unchanged, leaving generated excess visible as evidence for the
next generation pass.

Per ADR-0158, ADR-0165, ADR-0166, ADR-0168, and ADR-0466, the backend separately
owns optional Generation Reference records and each deterministic creation slot.
**Copy generation reference** reads the exact stored full-resolution reference
for an optional manual Codex boundary. Independently, Pipeline **Add AI
artwork** validates **Paste AI artwork**, native paste, or **Choose PNG file**
and stages one exact PNG as a local preview; invalid ingress creates no version
or slot. **Use this board** stores those unchanged bytes as an immutable,
settable Raw Pipeline Source and creates a slot bound to current working-copy
semantics and geometry without browser cropping, resampling, compositing,
warping, or a Generation Reference relation.

The Board Art Pipeline's workspace-level **New attempt** action remains
available with zero, one, or many slots and opens the eligible Raw Pipeline
Source chooser. Selecting a retained raw creates a slot that immediately
references that exact version and Blob and begins at grid fitting. It allocates
no duplicate media, does not mutate another slot, and does not repeat the model
handoff or fill another raw output.

Per
[ADR-0169](adr/0169-historical-raw-contracts-bind-only-from-saved-level-proof.md),
a historical raw missing later coordinate-basis/viewing-pane metadata may enter
that chooser only under the backend's exact saved-Level eligibility projection.
Fenced slot creation rechecks its frame/world bounds, Blob/content hash,
dimensions, original provenance, and v1 geometry, then atomically establishes
the immutable external raw-contract binding and any required ADR-0163 geometry
binding. The historical row is never rewritten. A read cannot establish either
repair, and a failed proof creates no slot.

The backend permits at most one current immutable registered-raster child and
one matching **Board with occlusion mask** child in that slot. No operation
mutates its parent or fills an occupied stage. Per ADR-0175, before occlusion exists the
owner may explicitly discard a rejected current warp: the exact artifact is
archived and retained, the slot's warp pointer is cleared under CAS, its direct
registration becomes the next grid-edit seed, and the same raw input may emit a
replacement current warp.
Per
[ADR-0181](adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
the owner may likewise discard the exact current mask without losing that
warp, its registration, or its saved cyan profile. The mask child remains
immutable: an unreferenced draft is archived, canonical-referenced history is
retained, and only the slot pointer is detached before replacement authoring.
For grid fitting, that preview tuning includes ADR-0171's coarse controls and
sparse shared-node local refinement. These remain pending instrument state
until the derive action commits one immutable child; retrying a rejected
committed mesh archives rather than mutates the prior raster.
Per ADR-0178, one bounded session-local Undo/Redo history snapshots the complete
pending calibration across both modes. Each completed drag or successful
discrete action is one atomic step, while rejected/no-op and view-only actions
create none. Derivation consumes the currently displayed restored snapshot and
does not persist the history itself.

The Level Editor's **Level Artwork** side controls leave the board visible and
navigate to separate URL-addressable **Generation References** and **Board Art
Pipeline** workspaces. This process destination uses the `level-artwork` route
layer and `levelArtworkEditor` workspace namespace; it never shares the
`placed-art` brush destination or subtype state. Generation References owns
immutable input capture and exact-reference copy/download. The Pipeline owns
source-agnostic **Add AI artwork**, exact-PNG preview, Raw Pipeline Source
commit, and current-board processing-slot creation. The Pipeline shows the owner-facing sequence **Raw Pipeline Source → Warped board → Board
with occlusion mask** for every slot and keeps **New attempt** outside any existing
slot. Neither raw reuse nor either deterministic transform requires an agent,
copied registration packet, or filesystem operation. Warped and
mask-bearing board artifacts never appear in the slot-input chooser.

`Set` records one remembered exact raster plus matching mask or explicit no-mask
state in the fenced working copy only. The separate Legacy/AI mode control
determines which background the working and saved Level renders. Private Save
pins mode and selection in private canonical content without making ready media
public. Official Review and publish/Publish is the official public transaction;
a separately labeled user-map Publish action may publish the private canonical
snapshot and exactly its active selected versions. Preview, Set, mode change,
Save, link copy, and either Publish action must not be conflated in labels or
success messages.

Migration groups every old complete or partial raw-to-warp-to-occlusion path as
an explicit historical slot. Branches become separate slots and may share
the same immutable old stage bytes. An existing `kind=raw` row is displayed as
a Raw Pipeline Source, never as a Generation Reference. Because the original
model input was not stored, migration records `missing-historical-source`; it
never fabricates a Generation Reference. Those artifacts retain their exact
bytes, settable state, hashes, and audit history. Its exact content-complete,
geometry-compatible Raw Pipeline Source may be selected as a separate writable
slot's input without fabricating the missing reference or generation
provenance. Missing historical coordinate metadata is supplied only by the
external ADR-0169 binding after exact fenced proof, never by mutation or a
client default. Every new writable slot requires one real Raw Pipeline Source
input.

Generation should reserve meaningful continuous scenery outside every playable
edge for camera travel. A centered safe area is useful prompt guidance, not an
exact acceptance measurement, and there is no mandatory 3840x2160 output.
Review tests four-direction panning at the centered viewport-cover zoom floor in
the real shared viewer. More reference pixels at the same grid-to-frame ratio do
not create more camera room.

### Full-Height Wall Assets

All perimeter wall materials use one canonical full-height generated geometry. The
generated wall face, anchor, back-edge/floor seam, footprint, material projection, and
below-anchor tail are identical whether the wall is bare or carries wall art. Runtime and
preview consumers must not select geometry by mirror presence.

The former ordinary short wall pixels and mirror-only `wall-tall-*` outputs are retired.
The full-height bake overwrites the canonical `wall-<material>-*` filenames/catalog
entries; parallel short/tall runtime lanes, `wallVariant` selectors, fallback defaults,
and short-wall proof expectations must be deleted end to end. Source history may retain
old renders only as clearly labeled retired evidence outside runtime asset paths. New
material bakes, thumbnails, contact sheets, and runtime seat proofs all target the
canonical full-height frame. See
[ADR-0086](adr/0086-all-perimeter-walls-use-full-height-geometry.md).

### Live Mirror Assets

A wall mirror is an assembly of generated material pixels and live game state. Its
frame, bevel, glass tint, foxing, scratches, and highlights are generated transparent
bitmap assets. Its reflected chess piece is never baked into those pixels; the shared
board renderer supplies the current physical unit through the frame-owned aperture.

Mirror fit follows the exact one-to-one game-world and wall-height rules in
[ADR-0086](adr/0086-all-perimeter-walls-use-full-height-geometry.md):

- the reflected draw keeps the physical board draw's resolved width and height, with no
  mirror-only scale or depth-compression treatment
- its feet remain on the exact reflected floor-contact anchor, with no vertical fitting
  offset
- Grand Gallery and any future full-body mirror mount on the same canonical full-height
  wall used everywhere else; their generated lower rails stay grounded while frame and
  glass use the available upward relief, and moving the whole assembly upward to catch
  the virtual raster is prohibited
- every mirror's generated frame and glass, plus its live reflection, are clipped to the
  same actual supporting-wall-face union, capped at the generated wall's projected
  back-edge/floor seam so the boundary tile occludes below-seam pixels
- a full-body assembly must contain the tallest resolved exact virtual raster before
  support occlusion and classify every opaque physical-draw pixel's board-axis wall
  crossing as either supported glass or floor-occluded at normal board scale on both wall
  faces, with the two counts reported separately and no outside-glass, unsupported, or
  invalid pixels
- intentionally small Keep, Court, Chapel, and Witch's Eye apertures may crop that same
  exact-size raster; cropping at the authored glass polygon is not a fit transform
- wall height never varies by mirror kind or presence; every assembly leaves the logical
  wall plane, contact footprint, anchor, span, back-edge/floor seam, and corridor
  unchanged
- mirror manifests use semantic `mirrorCoverage: "full-body" | "authored-crop"`
  metadata to drive aperture acceptance, never wall-height selection
- insufficient headroom in a full-body mirror requires a source and bake revision; do
  not stretch an existing frame, shrink or shift the live piece, float it above its seat,
  or append CSS, SVG, gradient, or code-painted wall pixels

Grand Gallery additionally uses exact face parity: the emitted north frame and glass are
horizontal pixel mirrors of the west frame and glass. Its north mount and normalized aperture
mirror the west geometry with polygon winding restored. Independently shearing directional
source highlights for the two faces is not an eligible bake because it changes the material's
visual identity by wall orientation. The image-generation gate compares every emitted RGBA
sample. See [ADR-0087](adr/0087-grand-gallery-wall-faces-are-exact-visual-counterparts.md).

Grand Gallery acceptance evidence must show the full tallest-unit reflection at 1:1
beside its physical board draw on both wall faces, with aperture bounds visible. It must
also show or report the exhaustive wall-hit silhouette from the physical alpha mask:
every west grid-X or north grid-Y crossing on the wall side lies inside both the authored
aperture and an actual supporting-wall segment, while every crossing below the projected
wall/floor seam is reported separately as floor-occluded. Supported-glass plus
floor-occluded must equal the visible-alpha total, with no failure class. Representative
rays may explain the construction, but cannot replace the per-pixel pass/fail gate. See
[ADR-0085](adr/0085-mirror-surfaces-end-at-the-wall-floor-boundary.md). Small
mirror evidence may show a partial silhouette, but must prove that it is an aperture clip
of the unchanged exact-size, exact-anchor draw. Contact sheets alone are insufficient:
include actual board-scale proofs without resampling or fitting displacement.

## Agent Task Shape

Asset-generation tasks should be narrow and concrete. A good task names the
asset family, source art, required frames, dimensions, states, and review
outputs.

Example:

```text
Create a pixel-art UI asset sheet matching the approved main-menu profile
concept.

Required assets:
- profile-panel-frame, 9-slice capable
- crest-frame
- sign-in-button: normal, hover, pressed, disabled
- settings-button: normal, hover, pressed
- force-counter-strip
- divider
- rook-icon-blue
- rook-icon-red

Constraints:
- visible refined pixels
- transparent PNG exports
- fixed frame sizes
- fixed native 1× subject footprint and anchor
- 2px transparent gutter
- live text only
- no spatial resampling between the accepted generation and runtime PNG
- source frame/atlas rect equals the canonical 1× draw rect
- no CSS gradients, CSS ornaments, or DOM-drawn pixel-art substitutes
- contact sheet required at 1x and 2x
- in-app preview required beside the original crop
```

Bad task shape:

```text
Make the profile panel look like the art.
```

That leaves too much room for generic CSS approximation.

## Game-Owned Review Handoff

An art-generation task is not complete when it has merely exported assets,
written manifests, or built contact sheets. Before an agent reports completion,
it must mount every candidate the owner is being asked to judge in a game-owned
viewing surface, open the exact deep link, and provide a focused capture from that
live route.

For board-visible art, the required default is a canonical-1× map proof over
representative terrain and neighboring game objects. Prefer an editable Level
Editor misc-map handoff. A dedicated Studio map may be used for a multi-candidate
bake-off only when it renders through the real game board stack, shows every
candidate in the batch, and keeps review assets isolated from accepted runtime
art. A catalog card, standalone image, or contact sheet does not replace the map.

This rule applies to calibration candidates and rejected or footprint-miss
candidates too. **Production status and presentation status are separate.** A
review-only mount does not promote the artwork, and the surface must preserve and
display its honest status. If a game-surface proof cannot be produced, record the
task as unfinished and identify the blocker rather than saying it is done.

A run that claims `review_ready` or `complete` must record:

- the game-surface kind and exact route;
- canonical display scale;
- a focused live-route capture;
- every candidate id presented on the surface;
- whether mounting is isolated review art or accepted runtime art.

Contact sheets remain useful supplementary proofs for pixel inspection.

## Design Portfolio And Touchpoints

The design portfolio is the visual review wall for assets, not only for full
screen renders. Each asset family should have a portfolio specimen that shows:

- approved reference crop or source render
- candidate sprite sheet
- manifest/frame table
- 1x and 2x contact sheets
- actual game-scale preview
- preview over representative terrain and overlays
- anchor, bounds, and gutter visualization when useful
- approved, needs-work, or rejected review state

Glimmung touchpoints are the run-level review object. A touchpoint should link
the asset task, branch, PR, checks, screenshots, contact sheets, and portfolio
route. The human review decision belongs there; agents should not treat a
mechanically valid sheet as artistically accepted.

## Asset Catalog Shape

The asset catalog should be explored as a tree, not as a flat list of tabs.
Use this hierarchy:

```text
category/
  asset type or family/
    individual asset
```

For example:

```text
buttons/
  main menu/
    main menu button frame
  textless/
    planned button family
icons/
  main menu button icons/
    sword icon
    crown icon
```

Category and type/family rows may be collapsible tree nodes. If a node also has
its own review page, expose a small launch affordance for opening that page
without toggling the branch. Do not add duplicate "overview" child rows just to
make a category clickable.

Keep related families grouped, but do not force composited UI into one asset.
For main menu buttons, the reusable button frame is a `button.main-menu` asset
family with state frames and slots. The icons that fit those slots are sibling
`button-icon.main-menu` assets. A rendered row is an assembly of frame state,
icon asset, live label, and action.

## Native-Pixel Production Gate

Scaling is encouraged while deciding how large an asset should read. A tuning
surface may shrink or grow a candidate, and the chosen frame, opaque subject
footprint, anchor, and role become the next generation brief. That scaled output
remains a **calibration candidate**; Save/Accept must not merely publish its scale.

Before production acceptance:

1. Freeze the canonical 1× frame, visible subject footprint, anchor/gutters, and
   DOM/canvas draw rect.
2. Regenerate, re-render, re-forge, or natively export the artwork at that pixel
   contract.
3. Preserve those authored pixels 1:1 through crop, translation, transparent
   padding, chroma cleanup, masks, composition, or atlas packing. Do not spatially
   resize them into the target, offline or live.
4. Record generation/export dimensions and prove intrinsic frame/atlas dimensions
   equal the canonical draw dimensions with asset-local baseline scale `1`.
5. Review an in-app proof at canonical 1×.

The transparent frame is not enough: the opaque subject must also be generated at
its final visible footprint. Nearest-neighbor scaling and
`image-rendering: pixelated` are still scaling, not acceptance. Whole-scene/user
zoom, DPR-specific exports, and declared 9-slice/tiled regions are the narrow
compositor exceptions defined by ADR-0076.

ADR-0332 adds one closed production exception: eight named Run lipsanon slots may
accept only their owner-approved 64×64 output hashes derived from archived
1254×1254 sources by the recorded chroma-key, crop, nearest-neighbor fit, and
alpha-threshold transform. Their evidence remains explicitly resampled. This
does not authorize another hash, another lipsanon icon, or another asset family.

## Acceptance Checks

Before an asset family is wired into production routes, require:

- a declared canonical 1× frame, opaque subject footprint, anchor, and draw rect
- native generation/render/export dimensions matching that contract
- no spatial resampling in the accepted path and asset-local baseline scale `1`
- or, only for the eight exact ADR-0332 Run lipsanon slot/hash pairs, the validated
  resized-production exception evidence and transform
- a family-specific machine gate for dimensions, provenance, and any permitted
  crop/pad-only pixel identity
- transparent runtime PNGs with no keyed background color remaining
- stable semantic frame names and manifest entries
- integer frame rectangles, anchors, and gutters
- no unintended semi-transparent halo or stray pixels
- screenshot evidence at actual board or UI scale
- comparison against the approved art crop or concept
- confirmation that live text remains live
- no CSS/SVG replacement for artwork that should be bitmap pixel art

Mechanical checks can reject broken assets. Human review accepts the style.

The live unit catalog already persists a monotonic `spatial-resampling` block and
refuses acceptance/restoration for recapture candidates. Its positive native-render
evidence is still named ADR-0076 debt: a missing block is not proof that an arbitrary
manual upload is native, so the external render manifest and 1× proof remain required
until that evidence becomes first-class catalog schema.

## Migration Posture

Art-backed screens and crops are allowed as bridges when they preserve approved
visual accuracy faster than a production asset kit can. They should remain explicit
references or temporary composition layers, not a reason to avoid building real
assets for reusable game systems. Likewise, a scaled candidate may remain live only
as an explicitly labeled calibration/legacy bridge; it is not accepted production
work until it is regenerated and passes the native-pixel gate, except for the
eight exact owner-approved outputs closed by ADR-0332.

The desired end state is a game made of disciplined pixel assets that matches
the generated art's mood, palette, silhouette language, and tactical clarity.
