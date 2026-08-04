# Studio control architecture

The studio is **one tool** with a single, consistent control architecture across
every mode and category. New things added to it (assets, portraits, …) inherit
this shape rather than inventing their own. This is the spec; the UI must match it.

## Intent (the why everything else serves)

Studio has two in-place states with different jobs:

- **Catalog** is the one cross-kind directory. It browses categories, selects an
  item or instrument, and owns the Open/Inspect affordance that enters it.
- **Viewer** is the focused destination for the one thing Catalog opened. A
  Viewer may be a live read-only specimen or an owner-operated definition and
  tuning instrument. In either case, its stage and rail stay about that one
  Viewer; it is not another catalog.

Board authoring belongs to the canonical Level Editor. The **Lab** affordance in
Studio's title bar navigates there; Lab is no longer a third in-place Studio
state. Place/Use actions may also open the Level Editor with the selected brush,
while Inspect/Edit actions enter the relevant Viewer.

> **Catalog chooses the destination. Viewer operates or inspects it. The
> Controls rail follows the current destination instead of repeating global
> navigation.**

The typed `viewerKind` registry remains the route and state identity behind each
Viewer. It is not a visible directory. Existing deep links and contextual
transitions between directly related Viewers remain addressable without putting
every unrelated kind in every control rail.

## Stability — the frame never moves

The topbar, the Controls panel, and the main pane are **fixed structural
regions**. Switching between Catalog and Viewer, changing category, or changing
Viewer focus changes what is *inside* those regions — never their position,
size, or whether they exist. The "Controls" heading sits at the **same place**
in Catalog and every Viewer. Nothing
slides down; nothing appears in one mode that displaces what's below it in
another. The cascade reflows the *contents* of the Controls panel **in place**;
the panel itself is anchored.

A sub-header — or any element present in one mode and absent in another — is
forbidden, because it shifts everything below it. That displacement is the single
clearest tell of an amateur UI. A serious instrument holds still: you operate it;
it does not rearrange itself under you. **If the layout jumps when you change
modes, it is wrong**, no matter how correct the contents are.

## Layout — the same in every Studio state

- **Topbar:** brand · **breadcrumb** (where you are) · the **workspace**
  controls. They are a typed contribution to the persistent title bar's one control lane,
  before its structural divider and invariant controls — so it costs the Controls
  panel no vertical space and cannot choose its own placement.
- The workspace controls are three fixed icon affordances — **open book**
  (Catalog) · **beaker** (Lab) · **magnifier** (Viewer). They are always present,
  live, and never reordered. Catalog and Viewer switch the in-place Studio state
  and remember their last state. Lab navigates to the canonical Level Editor.
- **One right-hand panel** (fixed width), headed **Controls** in Catalog and
  every Viewer. In Catalog its first control is the category selector. In a
  Viewer it contains only shared preview controls, when applicable, followed by
  controls or details owned by that Viewer. It never contains a global
  Viewer-kind or Catalog-category selector.
- **Main pane:** content only. It holds the catalog grid or the current Viewer
  stage.
- **No sub-headers, no per-pane titles, no "Back" button.** The breadcrumb
  conveys location; the Catalog tab *is* back. A sub-header is always a bug here.

## The control system is a namespaced cascade

Every control is **owned by exactly one node** in the tree below. The Controls
panel renders only the controls along the **active path**. Cross-kind navigation
belongs to Catalog, and Viewer controls belong to the active Viewer, so neither
can leak or duplicate into the other state.

```
workspace controls (Catalog · Lab · Viewer)    ← topbar · always present
│                                                Catalog/Viewer switch in place;
│                                                Lab navigates to Level Editor
├─ Catalog                                      ← cross-kind directory
│   └─ category (Tiles | Units | Assets | Artwork | Source Art)  ← tier-2 · top of Controls
│       ├─ Tiles   → search · family/collection filters · zoom
│       ├─ Units   → search
│       ├─ Assets  → search · process filter (All/Forged/Unverified) · zoom
│       ├─ Artwork → search · zoom
│       └─ Source Art → search · zoom · View Selected
│
└─ Viewer                                       ← one focused destination
    └─ current viewerKind (route/state identity; no global selector)
        ├─ Asset    → preview-in-context stage + gate/provenance details (read-only)
        ├─ Artwork  → full-art preview stage + group/size/path details (read-only)
        ├─ Source Art → placement/scale/eight-way candidate review + atomic install
        ├─ Unit Art → board-context unit art/size editor (live publish + candidates)
        ├─ Portrait → embedded unit-portrait crop editor (pan/zoom, per-piece)
        ├─ 9-Slice  → embedded kit 9-slice frame editor (nudge/align, dev-save)
        └─ Card Icon Fitting → paired icon selection and placement draft

Open/Inspect in Catalog enters a Viewer by item type. Place/Use opens the Level
Editor where applicable. The title-bar Catalog affordance returns to the one
cross-kind directory.
```

## The concepts, named

- **Studio state** — one of the two in-place destinations: **Catalog** (browse
  many) or **Viewer** (inspect or operate one). Each remembers its last state.
- **Lab affordance** — the fixed title-bar navigation to the canonical Level
  Editor. It is not an in-place Studio state.
- **Category** — the *kind of thing* you're browsing in Catalog (Tiles, Units,
  Assets, Artwork, Source Art). It governs **only the Catalog grid**. It does
  not gate Viewer routes. Its Open/Inspect action chooses the Viewer destination;
  its Place/Use action may instead open the Level Editor.
- **Viewer kind** — the typed route/state identity for a focused Viewer. It is
  selected by Catalog, a deep link, or a contextual transition from a directly
  related Viewer; it is not exposed as a global selector. Asset and Artwork are
  read-only; **Source Art**, **Unit Art**, **Portrait**, **9-Slice**, and other
  owner instruments are embedded editing kinds. This is single-item definition
  work rather than board authoring. Source Art still uses the shared game board
  inside the Viewer to prove each candidate's real placement, scale, and
  eight-way direction before atomic acceptance under
  [ADR-0173](adr/0173-structure-source-art-turntables-are-complete-source-only-live-groups.md).
  A placeable item's **Use** action opens the Level Editor; its
  **Inspect/Edit** action may open its embedded Viewer editor. The Catalog
  itself remains browse-only. Viewers are **never** separate layouts or pages;
  legacy deep links only enter the corresponding Viewer state.

## Editable board input

Per [ADR-0128](adr/0128-level-editor-secondary-drag-is-pan-only.md), the Level
Editor's primary mouse button performs the active tool action, while the
secondary button is pan-only everywhere in the board viewport, including over
filled terrain and object or barrier hit targets. Erasure requires the explicit
Erase tool; board targets never erase from a right-click or context-menu event,
and no movement threshold decides whether a navigation gesture becomes
destructive. Secondary gestures delegate to the canonical shared `ViewPane` so
playable and scenic content follow the same pan behavior.

The full Board Art grid-fitting viewport follows the same input policy:
primary-button gestures edit grid controls, while a secondary-button drag
scroll-pans the source artwork even when it begins over a cell or handle. The
browser context menu is suppressed and the pan never changes calibration.
Per
[ADR-0178](adr/0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md),
plainly labeled Undo and Redo controls remain visible in both grid modes and
span every pending calibration mutation. Their bounded history treats a
completed drag or compound button action as one step; pan, zoom, mode, and
selection changes never enter it.

## Level Editor Placed Art

Per
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md),
the Level Editor has one **Placed Art** destination instead of separate
Artwork, Doodad, and Prop destinations. Its first control is a visible subtype
selector:

- **Scene Art** owns the free projected-pixel `floatingArtwork` channel. It is
  gameplay-inert and is the only Placed Art type that accepts positions outside
  the playable board.
- **Doodads** are tile-addressed, nonblocking, and board-only.
- **Props** are tile-addressed and blocking; their complete footprint must
  remain inside the playable board.

The selector changes the active controls and brush in place rather than
navigating between top-level destinations. Existing off-board doodads and props
remain loaded, rendered, serialized, and removable, but neither placement nor
movement may create a new off-board position. Other scenic-terrain and
visual-feature tools retain their separately governed outer-scene behavior.

## Level Editor process workspaces

Events and Level Artwork authoring are process instruments rather than board
brushes. Events directly opens the shell-owned center workspace under
[ADR-0144](adr/0144-level-editor-events-use-the-shell-workspace.md). Its content
perimeter follows the shell-owned content-lane contract in
[ADR-0297](adr/0297-shell-workspaces-own-attached-bodies-and-inset-content-lanes.md):
the main-menu inline start automatically mirrors to inline end, block start
mirrors to block end, and the shell-owned fill and body remain edge-to-edge. Per
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md)
as renamed and separated by
[ADR-0176](adr/0176-placed-art-and-level-artwork-are-separate-editor-destinations.md),
**Level Artwork** instead begins as a normal right-rail control page with the
board still visible and operable. It shows the Level's persistent Legacy/AI
background mode, its remembered exact AI selection and validity, and explicit
buttons for the larger **Generation References** and **Board Art Pipeline**
instruments.
Those larger instruments replace the visible board inside the shell-owned
center workspace while the title and one right-side Controls rail remain
stable. The covered board stays mounted, inert, and inaccessible so its camera
and authoring state return unchanged. They share the shell fill primitive and
never create a second outer panel, dialog, or viewport-offset layout.

Those two button destinations are independently URL-addressable. Only while one
is open does it replace the visible board inside the shell-owned center
workspace. The covered board stays mounted, inert, and inaccessible so its
camera and authoring state return unchanged. These instruments share the shell
fill primitive and never create a second outer panel, dialog, viewport-offset
layout, or narrow duplicate of the full workflow in the rail.
The canonical route layers are `level-artwork` and `placed-art`; Level Artwork
workspace state uses `levelArtworkEditor` and never shares Placed Art brush
state or the retired `artworkEditor` namespace.

Per
[ADR-0166](adr/0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md),
the Generation References instrument owns saved-frame authoring and the
immutable, unit-free, cover-free images supplied to AI generation. It also owns
the explicit manual handoff that copies an exact full-resolution Generation
Reference and stages the returned AI-painted PNG through paste, direct `Ctrl+V`,
or **Choose PNG file instead**. The named commit stores those unchanged bytes
as an immutable Raw Pipeline Source. **Use existing Codex-painted board** may
explicitly import an editor-mounted result through that same raw-source ingress.
Neither path promotes or reclassifies the result as a Generation Reference.

Per
[ADR-0168](adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
the Pipeline owns server-backed deterministic creation slots. Its persistent
workspace-level **New attempt** action is available with zero, one, or many
slots and opens a chooser of eligible retained Raw Pipeline Sources. Selecting
one creates a slot that already references those exact bytes and begins at grid
fitting. The owner never has to enter the slot where the source first appeared,
and the new slot does not repeat the Copy/Paste/**Use this board** model
handoff. If no raw source exists, the chooser directs the owner to generation
handoff or the named exact-PNG raw-source import.

Per
[ADR-0170](adr/0170-derived-board-inspection-is-a-full-workspace-revision-gate.md)
as refined by
[ADR-0175](adr/0175-rejected-warp-retries-stay-in-the-same-pipeline-slot.md),
selecting full-size inspection for a warped result or a **Board with occlusion
mask** temporarily
replaces the Pipeline's scrolling slot manager inside that same shell workspace.
The diagnostic grid/cyan proof uses nearly the entire center work area; it is
not a dialog or an expanded card. For a warped result with no downstream
occlusion, its **Discard warped board and adjust grid** action archives that
rejected immutable artifact, keeps the same slot and exact Raw Pipeline Source,
preloads the rejected warp's direct registration, and returns to the full grid
fitter.

Per
[ADR-0179](adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md),
an accepted warp next exposes cyan move-footprint fitting as another focused
precision instrument, not a small slot card or right-rail form. Per
[ADR-0183](adr/0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md),
it uses the same viewport-level workspace treatment as the grid fitter and
covers the Level Editor shell while leaving the mounted Pipeline and its exact
slot state underneath. It renders the exact warped artwork with units hidden,
the registered grid visible, and live cyan move paint. Per
[ADR-0185](adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md),
cyan is the representative fitting preview for one shared cell-visual
footprint. The saved shape also governs runtime square-local move, attack,
threat, blocked, premove, selection, focus, hover, drop, and promotion visuals,
and Level Editor zone, tactical, ring, region, hover, and placement-preview
paint. Closing returns to the same slot without changing route identity or
taking an editor lease.

Per
[ADR-0184](adr/0184-cyan-footprint-fitting-supports-additive-tile-selections-and-outer-border-bars.md),
a plain playable-tile click selects it alone and Shift+click adds or removes
tiles without permitting an empty selection. The last-added selected tile is
primary and alone exposes the small top/right/bottom/left point handles. Shared
edges between selected tiles are hidden. An exposed edge selects the maximal
contiguous same-edge boundary bar containing it, stopping at gaps, notches,
disconnected components, and separate hole contours. A point drag adjusts one
primary-tile corner. A boundary nudge shifts each segment's supporting line
along artwork X or Y, intersects it with both unchanged neighboring lines, and
jointly validates both new endpoints; it never clamps endpoints independently
or partially accepts the group. Reset selected and Reset all restore full
diamonds. Right-drag pan and wheel zoom remain view-only.

Per
[ADR-0182](adr/0182-cyan-footprint-editing-has-image-axis-locks-and-native-pixel-nudges.md),
a separate precision toolbar exposes Free, X-only, and Y-only movement in the
artwork's horizontal and vertical image axes. A constrained drag preserves the
other point coordinate exactly. After selecting a point or boundary bar, four
visible direction buttons and the keyboard arrows request one native artwork
pixel; Shift+Arrow requests ten. Point movement rounds the normalized delta once.
Boundary-bar movement retains the exact pixel delta through each segment's
supporting-line intersection and then jointly rounds that segment's two
endpoints once. These actions use the exact raster/world transform, not the
current view zoom. Tile membership, primary tile, active point-or-boundary
selection, and axis mode remain session-local tool state.

The workspace keeps plainly labeled Undo and Redo controls visible. One
completed point drag, successful point-or-boundary keyboard or button nudge, or
discrete reset is one entry in its bounded 100-step session-local history. A
boundary bar and Reset selected are each all-or-nothing group entries; tile,
primary, and active-target selection, axis mode, pan, zoom, Save, and closing
never enter history. Explicit Save writes the exact displayed sparse profile as
the attempt's revision-CAS latest draft bound to the current warp. The schema
and backend contract remain unchanged: `predrawn-move-highlight-profile-v1`,
the existing API/event names, and database fields remain compatibility names
for the broader cell-visual-footprint role, with no migration. That profile is
not another artifact card or media version. New occlusion remains unavailable
with a concrete reason until the exact warp has a saved valid profile, including
an explicitly saved empty map when full diamonds are approved everywhere.

The workspace edits paint shape only. Canonical hit targets, cell and move
selection, movement, pathfinding, occupancy, placement validity, zone
membership, grid and fence hints, and solver state never consult the fitted
shape. Object presentation and other non-cell-local visuals keep their own
geometry.

Per
[ADR-0180](adr/0180-predrawn-occlusion-selects-final-raster-pixels.md),
**Edit occlusion mask** replaces the scrolling slot manager with another focused
full-workspace instrument over the exact immutable warped raster. It never
loads or projects Legacy tile, terrain, prop, doodad, or Scene Art pixels.
Units stay hidden. The workspace preserves ordinary right-drag pan and
wheel-zoom navigation while making accepted cyan alpha and the current advisory
candidate visually distinct.

A revision-pinned SlimSAM runs in a browser worker off the UI thread and uses
owner-placed positive and negative points to return three selectable
candidates. None changes accepted alpha until explicit Accept. Brush, eraser,
Reset, Undo, and Redo remain a complete manual authoring path when inference is
unavailable or inaccurate. The workspace identifies progress and failures
beside the affected controls instead of leaving an inert action.

Only explicit **Create board with occlusion mask** crosses the immutable media
boundary. It hashes the owner-accepted alpha, deterministically assigns depth
per 8-connected component from each source-image column's bottom-most selected
pixel and the exact parent world bounds, and records the exact
model/revision/backend, edit counts, and depth algorithm. The result returns to
full-size clipping inspection before Set. No segmentation model runs at
runtime, and the saved cyan-profile gate remains unchanged.

Per
[ADR-0181](adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
the completed artifact exposes **Discard mask & edit again**. The fenced action
detaches only the slot's exact current mask, preserves its Raw Pipeline Source,
warp, fitted registration, and cyan profile, and reopens the full mask editor.
A matching cloud working selection falls back to that same warp without a mask;
the action never rewrites canonical content. Unreferenced rejected mask media is
archived, while media still referenced by the canonical Level is retained as
immutable history without remaining the slot's current result.

Per
[ADR-0169](adr/0169-historical-raw-contracts-bind-only-from-saved-level-proof.md),
source eligibility in that chooser is a backend projection for the exact saved
Level. The UI consumes the server's eligibility and concrete issue fields and
never infers `coordinateBasis` or `viewingPane` defaults from browser data. An
eligible historical source is still rechecked and bound only during fenced
creation.

Every ineligible source remains visible with its concrete server reason beside
the source row or selected-source detail. A disabled action without a reason, a
global banner or toast detached from the source, and silently filtering the
source out are insufficient. If fenced creation rejects a source that appeared
eligible, the chooser stays open and replaces that source's colocated status
with the returned reason.

Each slot presents **Raw Pipeline Source → Warped board → Board with occlusion
mask**. Preview
tuning occurs before a deterministic stage is committed. Cyan fitting remains
attempt authoring between the two artifact stages rather than adding a fourth
artifact stage. A rejected warp may be archived and retried in that same slot
under ADR-0175, and a rejected mask may be detached and retried there under
ADR-0181. The same immutable raw may be selected by several slots without media
duplication or mutation. Attached occlusion depth is internal diagnostic data
on the final artifact rather than a second dropdown. Existing `kind=raw`
artwork uses the Raw Pipeline Source label. Warped outputs and Boards with
occlusion masks never appear in the source chooser. A migrated
source with missing historical generation provenance remains honestly labeled
but may start a new deterministic slot when its exact content and geometry
binding are valid.

Setting a fitted artifact embeds the exact canonical compatibility-named profile
and digest in the fenced working Level's schema-version-3 surface. It does not
leave a live link to the attempt draft. Historical schema-version-2 selections
remain readable and render full diamonds for every square-local visual
highlight.

Per
[ADR-0172](adr/0172-archiving-a-board-art-slot-forgets-only-dormant-legacy-selection.md),
the existing **Archive slot** action also owns removal of that slot's dormant
remembered selection while the working and saved Levels are in Legacy mode.
One fenced server transaction forgets those matching Legacy selections and
archives the slot, then the editor mounts the returned working and canonical
state. The visible Legacy board does not change. A matching AI-mode Level or
published output remains protected. The control explains this distinction and
never presents an unexplained disabled button or a second detach action.

## Terrain area authoring

Per [ADR-0129](adr/0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md), Generate
and Tile share one connected-terrain-area selector over the resolved playable-plus-scenic surface.
Generate may save and rerun that scope; Tile selection remains transient. Tile's Fill selected area
action stamps the exact armed single tile across the selected area in one undoable edit and leaves
every coordinate outside it unchanged.

Per [ADR-0131](adr/0131-sparse-scenic-terrain-separates-footprint-from-material.md), the Scenic
terrain instrument keeps its North, East, South, West, and All directions rectangle controls and
adds a distinct **Fill visible area** action. The shared `ViewPane` reports its live dimensions;
current pan, zoom, and canonical projection determine the exact non-playable tile diamonds that
intersect the visible work area. The action adds only those cells to the persisted
`decorativeFootprint`, not an enclosing rectangle or its offscreen tips. `decorativeCells` remains
the sole material store, so hidden material outside both the footprint and a reduced rectangle does
not reactivate itself. Grass writes canonical grass, while Match reference materializes only the
exact clamped playable-boundary tile and gives a projected void footprint membership without
material. Existing authored material remains unchanged, erasing a sparse cell removes its footprint
membership, one click creates one Undo step, and invalid or oversized requests report a no-op or
limit instead of a partial result. This reachable, camera-aware action is the owner instrument for
filling what is actually on screen; adding or undoing its sparse cells cannot recenter the editor
board.

## Visual standard — instrument-grade, not boxes

## Player reference workspaces

Strategikon is a Battle-context instrument, not a Studio surface, but it obeys
the same ownership boundary: the shell owns the reserved Controls column and
the workspace owns only the replaceable board rectangle. Its left rail is the
canonical main-menu tab primitive with a Battle-specific registry
(Enchiridion, the Martial Prosopography, and the Lipsanotheca). Enchiridion
itself is one shared content implementation mounted either in the main-menu
destination or inside Strategikon. The main-menu host retains the homepage
scene. The Battle host retains the current level scene and mounts Strategikon
in a dedicated child slot without fading, hiding, or replacing the Battle
workspace. Strategikon fills the complete board pane through the shared
fill-only primitive; it does not instantiate an `OuterChromeBox`, add exterior
rails, or leave a smaller framed island inside that pane. No child measures the
viewport or renders into the Controls column. Its rail and content start on the
main menu's exact responsive inline and block insets. Under ADR-0297 its primary
reference frame uses the semantic edge-attached content variant, so that frame
and its drawn scroll owner meet Controls while their own subordinate content
retains internal spacing. Its entry is the divider-safe, frameless open-codex
art control aligned to the Controls content boundary by ADR-0250, with
state-specific hover/focus information. Lipsanon references use the shared
dual-view browser from ADR-0254: a top-of-column Rows/Grouped tab switches
between corrected named rows and one containing inner frame around an unframed
icon grid. Lipsanon entries do not open tooltips; both views select the same
content-sized record as the sole visible description authority. In the
main-menu host, the two canonical rail anchors remain fixed while Enchiridion
content consumes the remaining visible canvas; the ordinary action-column width
does not cap it.
See ADR-0231 and ADR-0254.

Dense and restrained. A tier selector is a tight **segmented control** — one
cohesive unit, small — never a stack of fat full-width buttons that wrap to two
rows. Chrome is quiet: thin borders, compact spacing, a clear figure/ground where
the **surface is the star** and the controls recede around it. Hierarchy comes
from weight, grouping, and whitespace — not from giant boxes all shouting at the
same volume. The reference is a serious instrument (Grafana, a DAW, Figma's
panels), not a form made of big buttons. If a control is large enough to dominate
the surface it serves, it's wrong.

## Adding to the studio

A new thing (e.g. portraits) is: a new **category** in Catalog, plus its
non-catalog destination: a registered **Viewer kind** for inspection or
single-item operation, and/or a Place/Use action into the canonical Level Editor
when it is board-placeable. It inherits the topbar, breadcrumb, right panel, and
content-only main automatically. If adding it requires a new layout, the
architecture (not the new thing) is wrong.

**Mechanism — the catalog category registry.** Parity is enforced by code, not
discipline. The Catalog is driven by a single `catalogCategories` array in
`TilePreview.tsx`; each entry is `{ id, label, hint, main, controls }`. The
selector tabs, main pane, and the controls body are all rendered **by mapping
over that array / reading the active entry** (`activeCatalog`) — never by
per-category `if`/ternary branches. So adding a category means adding **one
entry**: you supply its `main` (the grid) and its `controls` (the rail body —
Search/Zoom/View-Selected/taxonomy, via the shared `CatalogControls` for
descriptor-backed categories), and you get the selector tab and the stable frame
for free. There is no second place to update, which is the whole point — a
category cannot ship missing from the selector. If you find yourself writing
`category === '…'` in the catalog controls, that's the regression this registry
exists to prevent.

A category's Open/Inspect action calls `openViewer(kind)` — it sets the typed
`viewerKind` and enters `studioMode === 'viewer'`. The route registry selects the
Viewer implementation; it is not rendered as another selector in the rail. Each
kind owns its **own** selection state (`selectedAssetName` vs
`selectedArtworkName`) — never one shared field, or a stale id from one leaks
into the other's stage. Read-only Viewers provide live Details; operated Viewers
provide only their shared preview controls and local instrument controls.

## Sound Effects candidate editing

The Sound Effects Viewer kind has two addressable states inside the same fixed
Studio shell. Its ordinary state edits the global sound-set profile and
assignments. A URL carrying `sfxReview=<version-id>` instead focuses one private
audio candidate: the main pane shows its complete waveform and exact selection,
while the standing Controls rail owns start/end sliders and numeric values,
complete/selection audition, reset, immutable derived-candidate save, and
proof-gated approval. The candidate instrument replaces the assignment content
for that focus; it is never inserted above it as an optional top block.

Every editable SFX candidate is also a live-backed card on the Sound Effects
Catalog shelf. Selecting a card and activating **Edit selected recording** opens
that same Viewer state; double activation is the direct catalog shortcut.
Candidate-review URLs reproduce only this click-reachable state. They are never
the sole navigation mechanism, and the catalog does not substitute a compiled-in
candidate list when its admin source is unavailable.
