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
pixels and a 1:1 canonical runtime path.

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
ordinary composited-tile direction above. Under ADR-0104 through ADR-0110, one
continuous generated painting may replace the ordinary terrain, road, prop, and
barrier pixels for a specific authored level while the canonical level remains
the sole authority for gameplay geometry and live units, grid, selection, and
tactical overlays.

Per [ADR-0109](adr/0109-predrawn-generation-packets-preserve-authored-level-semantics.md),
whole-level generation must not ask a model to infer the playable board from a
beauty render alone. Every request uses an authored-level packet containing:

- a unit-free exact projected grid and perimeter guide;
- board dimensions and projected axis directions;
- a canonical coordinate-by-coordinate terrain and footprint dump;
- exact road connectivity, blocking shared edges, exits, and outer boundary
  edges;
- separately labeled material/layout and style references; and
- explicit prohibitions against baked units, invented gameplay height, expanded
  footprints, extra roads, and a model-invented perimeter.

The guide owns spatial geometry, the semantic dump owns gameplay meaning, and
style references own only appearance. Boundary appearance may be generated
creatively, but its location is the canonical outer edge of the board. The
mutable process and prompt wording live in
[`art/predrawn-board-generation.md`](art/predrawn-board-generation.md); exact run
prompts remain text provenance while candidate media follows the live-storage
contract.

Per [ADR-0110](adr/0110-owner-fitted-grid-defines-predrawn-review-rectification.md),
candidate review exposes the complete authored grid over the untouched source.
The owner may fit monotonic row and column guides and inspect their correction
range. Development may inverse-warp the complete painting from that fit, but the
measurement is regeneration feedback rather than production acceptance: large,
non-separable, or semantic drift still rejects the generation, and accepted art
must return at the canonical native frame without spatial resampling.

Per [ADR-0111](adr/0111-predrawn-refit-target-dimensions-are-owner-configurable.md),
the review instrument's target row and column counts are owner-configurable. If
the candidate visibly contains an extra row or column, the owner sets the target
to the painted count before fitting guides. That target controls the refit
topology and the temporary post-picker review overlay. Per
[ADR-0112](adr/0112-predrawn-review-overlay-uses-the-saved-refit-grid.md), this
overlay retains the chosen count after `DONE`; canonical level dimensions,
interactive cells, and gameplay remain unchanged, leaving the generated excess
visible as evidence for the next generation pass.

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

## Acceptance Checks

Before an asset family is wired into production routes, require:

- a declared canonical 1× frame, opaque subject footprint, anchor, and draw rect
- native generation/render/export dimensions matching that contract
- no spatial resampling in the accepted path and asset-local baseline scale `1`
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
work until it is regenerated and passes the native-pixel gate.

The desired end state is a game made of disciplined pixel assets that matches
the generated art's mood, palette, silhouette language, and tactical clarity.
