# Asset Generation Contract

This document turns the current art direction into implementation rules for
agents and humans producing production assets. The goal is an actual browser
game that looks like the approved generated pixel art, not a web layout that
roughly gestures at it.

Use this contract together with `docs/asset-terminology.md` (the vocabulary:
asset, frame, part, slot, state, assembly), `docs/ui-art-direction.md`, and
`docs/asset-pipeline-proposal.md`. For scenic backgrounds and unit portrait
backdrops, also use `docs/lore-anti-story.md` and
`docs/background-art-contract.md`.

## Core Decision

The playable game should be assembled from real pixel-art assets and live game
state. Generated concept renders are the style source and review reference;
they are not the final renderer for interactive systems.

Do not ask an agent to "make the UI look like the art" by inventing CSS. Ask it
to produce named bitmap assets, manifests, contact sheets, and in-game previews
that can be reviewed against the approved art.

## Hard Rule

Do not approximate the approved pixel-art style with CSS gradients, generic
borders, box shadows, rounded panels, DOM-drawn ornaments, or ad hoc SVG
redraws. CSS is layout glue. It may position, scale, hide, show, and load
assets; it should not be the medium that recreates rich pixel art.

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
- 2px transparent gutter
- live text only
- no CSS gradients, CSS ornaments, or DOM-drawn pixel-art substitutes
- contact sheet required at 1x and 2x
- in-app preview required beside the original crop
```

Bad task shape:

```text
Make the profile panel look like the art.
```

That leaves too much room for generic CSS approximation.

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

## Acceptance Checks

Before an asset family is wired into production routes, require:

- transparent runtime PNGs with no keyed background color remaining
- stable semantic frame names and manifest entries
- integer frame rectangles, anchors, and gutters
- no unintended semi-transparent halo or stray pixels
- screenshot evidence at actual board or UI scale
- comparison against the approved art crop or concept
- confirmation that live text remains live
- no CSS/SVG replacement for artwork that should be bitmap pixel art

Mechanical checks can reject broken assets. Human review accepts the style.

## Migration Posture

Art-backed screens and crops are allowed as bridges when they preserve approved
visual accuracy faster than a production asset kit can. They should remain explicit
references or temporary composition layers, not a reason to avoid building real
assets for reusable game systems.

The desired end state is a game made of disciplined pixel assets that matches
the generated art's mood, palette, silhouette language, and tactical clarity.
