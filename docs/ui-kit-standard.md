# UI Kit Standard

One framing system for the whole app. This document is the source of truth for
how every screen draws panels, buttons, rows, fields, tabs, and icons. If a new
surface needs chrome, it composes from the types defined here — it does **not**
invent its own class namespace or its own art.

Status: proposed standard (grounded against `main` @ `0973279`). No surface has
been migrated yet. Studio surfaces are explicitly out of scope (see below).

## Why this exists

As of current `main`, framing is done six different ways — one bespoke class
namespace and art approach per screen:

| Surface | Prefix | Rules | Framing technique | Verdict |
|---|---|---|---|---|
| Settings | `settings-*` | 69 | baked full-frame crops, `background 100% 100%` stretch | best **art**, wrong **technique** |
| Lobbies | `utility-*` | 80 | `border-image` 9-slice of full assets | right **technique** |
| Campaign editor | `ce-*` | 165 | `slice-*` mini-assets + `100% 100%` stretch | broken |
| Level editor | `le-*` | 105 | ~flat CSS, 2 asset frames | wireframe |
| Skirmish | `skirmish-*` | 173 | flat CSS, **0** asset frames | unstyled chrome |
| Main menu | `mode-*` | 18 | sprite-sheet rect cropping | legit (true atlas) |

Across `style.css` there are currently **19** `100% 100%` stretches and **15**
`border-image` 9-slices — the codebase is split roughly down the middle between
the wrong technique and the right one. Settings (#114, "cleaned asset kit") is
the most recent surface and it added a *sixth* island rather than adopting any
existing one. That is the disease this standard ends.

## The decision

> Recorded as [ADR-0002](adr/0002-nine-slice-border-image-for-pixel-art-chrome.md);
> this section is the consolidated current-state of that decision.

**One kit = the Settings art direction, rendered with the Lobbies technique.**

1. **One technique — 9-slice via `border-image` of the full asset.** A single
   source PNG (corners + edges + stretchable center) scales to any element size.
   No `background-size: 100% 100%`. No per-size baked frames (no more
   `setting-row-frame` *and* `setting-row-tall-frame`). No `slice-*` mini-assets.
2. **One metadata source — patch margins in the live UI-kit projection.** Every
   framed asset declares `{ top, right, bottom, left }` margins; the renderer
   reads them from the backend catalog. Delete duplicate static manifests once
   their assets are folded in.
3. **One renderer — a shared `<Frame>` component (or one CSS utility class
   family)** that takes an asset id + state and emits the `border-image` rule
   from the manifest margins. No surface hand-writes `border-image` again.
4. **One icon mechanism + one icon set.** `gear`, `rook-blue`, `rook-red`, and
   the chess pieces are currently redrawn 3–4× across `main-menu/`, `skirmish/`,
   `utility/`, and `settings/`. Consolidate to one set referenced everywhere.
5. **Generate live-media candidates (method-verified); the concept is the style reference.**
   (Updated by [ADR-0011](adr/0011-chrome-art-generated-not-extracted.md) — this
   point used to say "extract the original," an early stopgap that beat codex's
   *code-drawn* redraws but produced dirty, asymmetric crops.) Chrome art is now
   produced by **codex img2img generation, verified via an `image_generation_call`
   event** (see [kit-forge.md](kit-forge.md)), or assembled from generated atoms
   by deterministic geometry in a temporary workspace. The accepted concept art
   is the style/palette reference fed into generation and the review target —
   **not** a crop source. Exact candidate bytes upload to live storage; no forge
   or assembler writes into the repository.
   Do not procedurally redraw chrome in code/CSS, and do not extract whole- or
   per-slice crops from the concept.
6. **Never patch with bespoke CSS.** CSS composes, positions, and state-switches
   art; it never recreates bevels, frames, glows, or corners with gradients.
7. **Every uploaded candidate is mechanically validated — no asset is "good" by
   eyeball alone.** The typed UI-kit validator rejects wrong dimensions, clipped
   borders, broken required symmetry, incomplete edges, or invalid alpha before
   review. Mechanical validation does not decide faithfulness or visual quality;
   those still require owner review of the exact candidate in the live surface.

## Canonical type catalog

Eleven types. Each screen is assembled from these. The "Source today" column is
the existing asset that becomes the basis for the canonical art (re-cut to true
9-slice where it is currently a baked/stretched crop).

| # | Type | Variants × states | Source today |
|---|---|---|---|
| 1 | **Button** | neutral / primary / danger × normal·hover·pressed·disabled | settings `neutral/primary/danger-button`; states from skirmish `action-*` (most complete) |
| 2 | **Icon button** (square) | neutral / selected / danger | ce `icon-button*`, settings `stepper-button` |
| 3 | **Panel / frame** | shell / content / rail / inset-well | settings `main-panel-frame`, `rail-panel-frame` |
| 4 | **Row / list item** | normal / selected | settings `setting-row-frame`; ce `row-*-selected` (cyan glow) |
| 5 | **Field / input** | text / select-dropdown | ce `field-input`, `field-select` (gap in settings kit) |
| 6 | **Toggle** | on / off | settings `toggle-on/off` |
| 7 | **Stepper** | +/- numeric | settings `stepper-button` |
| 8 | **Tab** | active / inactive (+ hover/disabled) | settings `active-tab`, `inactive-tab` |
| 9 | **Bar / tray** (full-width chrome) | header / footer | settings `header-frame`; ce `footer-bar` |
| 10 | **Section divider** | label rule | settings `section-divider-frame` |
| 11 | **Icon glyph** | one shared set | unify `main-menu` + `skirmish` + `utility` + `settings` icon-* |

The catalog's type 10 is a decorative labelled rule. A **structural box
divider** is a different shared primitive: a one-dimensional child bar inserted
between sections of an existing box. It does not create another frame type or
chrome role. Under [ADR-0092](adr/0092-dividers-inherit-their-host-chrome-role.md),
each structural divider inherits the rail, thickness, fit, and reach of its
`outer` or `inner` host; Chrome Lab owns independent visible band and joint
geometry for those two roles. Consumers compose the shared `ChromeDivider`
component as many times as needed and never paint local separator borders.
ADR-0239 extends that same primitive across both layout axes: horizontal
dividers separate stacked rows and vertical dividers separate adjacent columns.
The vertical form uses the host's vertical rail and rotated copies of the same
installed junction source; it is not another chrome role or media slot.
Under [ADR-0242](adr/0242-divided-inner-grids-own-one-rail-topology.md),
[ADR-0243](adr/0243-grid-crossings-use-the-installed-divider-joint-atom.md),
[ADR-0245](adr/0245-topology-junction-atoms-center-on-the-node.md),
[ADR-0246](adr/0246-boundary-junctions-center-on-the-frame-rail.md), and
[ADR-0248](adr/0248-topology-junction-ornaments-remain-upright.md),
dense table-shaped content uses the shared `DividedInnerChromeBox`: one
canonical inner 9-slice around the complete grid, with callers declaring only
column tracks and rows. The primitive derives every rail from CSS grid lines and
renders exactly one connectivity-addressed `ChromeJunction` at each node. Its managed
`ChromeDivider`s do not paint standalone endpoints. Perimeter nodes use the
role-owned divider-joint atom; interior crossings draw all four rails beneath
that same role-owned divider-joint atom and never compose host-frame corners.
Every topology atom centers on the node and uses the same upright, unreflected
divider-joint raster; its mask records connected rails but does not transform
the ornament. Interior nodes use the CSS grid-line coordinate directly. At a frame
boundary, the content edge is not the node: the primitive moves inward by half
the role rail's reach so the node lands on the visible frame rail's centerline,
never on its outer edge. A drawn scrollbar is a derived final track, never a
locally positioned divider. Consumers must not add divider elements, junctions,
aprons, or corrective offsets inside this composition.

Under [ADR-0093](adr/0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md),
the **rail edge** is every box's layout and alignment edge. Corner atoms and
divider joints are absolute ornament: their overhang does not alter box width,
Contents Box placement, sibling margins, or title alignment. A scrollport or
viewport boundary that would clip that ornament must provide a transparent
measured **clip apron** and compensating padding, preserving the rail coordinate
and vertical-only scrolling. Local collision clearance may keep ornament off a
composite control's own text, but it never moves the host rail.

Under [ADR-0100](adr/0100-title-and-controls-are-one-branched-rail-topology.md),
the persistent title and right-side Play/Level Editor controls are one branched
`outer`-rail shell. The title omits its bottom exterior rail, the controls omit
their top exterior rail, and one structural divider serves both boundaries.
Divider joints cover internal branches; outer corner atoms appear only at true
exterior corners. ADR-0103 supersedes that final exterior-corner clause for the
viewport shell: title/control rails flow beyond the screen edge without visible
corner atoms, while internal divider joints remain.

Under [ADR-0297](adr/0297-shell-workspaces-own-attached-bodies-and-inset-content-lanes.md),
`ShellControlsPanel` is the one production shell Controls rail. It creates the
fixed Controls title, titled outer role, placement class, and semantic seam
marker; gameplay and editor callers provide only workflow content and title
actions. Generated chrome targets that component-owned marker rather than a
list of consumer ids. Production code does not rebuild a panel titled Controls
from `OuterChromeBox` and `OuterChromeHeader`.

Under [ADR-0387](adr/0387-bought-cards-travel-into-a-title-reachable-chartulary.md),
the gameplay Controls title's action region contains the compact Strategikon
index followed by its rightmost open-codex mark. The index and the complete
Strategikon rail read one destination inventory; the book keeps ADR-0250's
visible-edge alignment, and the Chartulary shortcut is the measured endpoint
for Sectio card transfers rather than a second deck icon or a hard-coded screen
coordinate.

Under [ADR-0431](adr/0431-sectio-transactions-never-wait-for-presentation.md) and
[ADR-0481](adr/0481-sectio-offers-reveal-the-face-down-pile-beneath-them.md), removing an
adlected face reveals the accepted universal back in the pile's unchanged original seat. The
remaining piles never reflow, the revealed back is not interactive, and a later Adlectio can
launch immediately while independent card flights play out in the continuity layer.

Under [ADR-0490](adr/0490-run-card-units-reveal-a-larger-named-reading.md), every
occupied same-role unit stack on the canonical Run card face reuses one shared fixed
tooltip to show that canonical sprite at a larger reading size and spell out its chess
role. Repeated units therefore keep one stable popup as the pointer crosses between
them. The card remains the only Sectio action; the hover reading does not add a nested
control.

Under [ADR-0389](adr/0389-the-title-route-names-the-visible-strategikon-address.md),
the gameplay screen-name route retains the underlying Run phase and appends every
visible Strategikon address segment. Its section and nested Enchiridion labels come
from the same canonical inventories as the rails; route copy never reparses or renames
the destination independently.

Under [ADR-0101](adr/0101-title-bar-buttons-use-the-inner-box-role.md), every
button inside that persistent title bar consumes the registered `inner-box`
role. The inner role owns its frame and state art; the title-control primitive
owns only title-bar dimensions, padding, typography, and glyph layout. Raw
buttons in title action slots are forbidden so a title control cannot silently
form another chrome family.

Under [ADR-0104](adr/0104-title-bar-controls-are-typed-contributions-to-one-lane.md),
routed screens contribute closed typed control descriptions rather than title-bar
JSX. The persistent bar renders those controls, its structural divider, and the
music/settings/account controls in one App-owned lane. That lane exclusively owns
vertical alignment, button gaps, equal divider clearance, and trailing-edge
clearance; callers cannot provide layout classes, styles, padding, or wrappers.
Any title-bar control change must verify the rendered lane on a real route with
`npm run verify:titlebar -- <live-url> --size <width>x<height>` in addition to the
static contract checks.

Under [ADR-0300](adr/0300-only-the-brand-mark-navigates-home.md), only the visible
Chess Tactics shield in the leading brand lockup is a main-menu `NavButton`. The
title, screen name, route-transition status, and unused title-bar material are
inert orientation chrome. The lockup layout cannot stretch the navigation target;
the rendered title-bar gate requires the button border box to match the shield.

Under [ADR-0144](adr/0144-level-editor-events-use-the-shell-workspace.md), the
Level Editor Events instrument is content in the shell-owned board workspace,
not an `outer-panel` consumer or dialog. It fills that workspace while the title
bar and right controls remain fixed, and it inherits responsive bounds from the
shell rather than duplicating viewport measurements. Events may consume the
installed outer role's generated material through the shared fill-only primitive,
but it paints no second frame, rails, or corner atoms; its controls continue to
use registered inner chrome. Its open state is part of the canonical Level Editor
address (`eventsEditor=1`, with optional `eventsTab=other`) so a review link opens
the exact workspace state without requiring follow-up clicks. Under
[ADR-0297](adr/0297-shell-workspaces-own-attached-bodies-and-inset-content-lanes.md),
`ShellWorkspace` unconditionally creates its Controls-attached body and one
inner content container. Events supplies content and the main-menu-derived
inline-start/block insets; the shared container automatically mirrors that start
inset at inline end. The outer-role fill and body still reach Controls, while
header actions and rule controls share the inner content line. Events cannot
omit either layer or provide an inline-end value.

Under [ADR-0237](adr/0237-run-destinations-fill-the-shell-workspace.md), the same
ownership test applies to player-facing non-Battle Run destinations. Sectio/Loot,
the Sectio's upcoming-Battle preview, Victory, Army ledger and profile, card-aware Expunctio,
loading, and empty states fill the shell-owned playfield through the shared `RunWorkspace`/`ShellWorkspace`
composition. `RunWorkspace` supplies the
workflow content; `ShellWorkspace` itself supplies the same Controls-attached
body and default inset content container for every destination. Content gutters
and lipsanon reservation live inside that continuous body without creating an
inline-end shell gap. A primary frame or drawn scroll owner uses the shared
edge-attached content variant rather than authoring an end-padding exception.
Destinations do not add an
`OuterChromeBox`, outer-panel consumer, or duplicate title frame merely to
acquire a background; subordinate controls remain registered inner chrome.

Under [ADR-0433](adr/0433-leaf-chrome-uses-oak-over-structural-teal-fields.md),
material also communicates the last level of that hierarchy. Cool teal/blue
stone remains on structural fields that establish a region for subordinate
units. Terminal controls and identity/status plates use the installed oak leaf
surface. Dropdown triggers are leaves while their open popup bodies remain
structural fields. Repeated leaf renderers carry a data-owned texture phase;
they do not restart the surface per item, infer phase from `nth-child`, or move
the fill to a parent whose gaps must remain transparent.

Per [ADR-0386](adr/0386-shops-offer-read-only-intelligence-on-the-upcoming-battle.md),
the Sectio's `/run?view=battle-preview` destination composes the canonical
`FramedReadOnlyBoardView` and `LevelInfoCompact` inside that fill-only workspace.
It may lay those subordinate inner frames beside one another, but it cannot
instantiate a gameplay session, project the Run army, resolve setup positions,
or build a second board renderer. The address is valid only while the persisted
Run phase is Sectio.

[ADR-0346](adr/0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)
removes Deployment from that destination inventory. Deployment is a persisted
gameplay phase presented on the full canonical battlefield; its phase-specific
workflow replaces the contents of the shared `ShellControlsPanel`. It does not
instantiate `RunWorkspace`, `LevelPreviewColumn`, a second board frame, or a
level-manifest heading. Army/Lipsana workspaces may still cover the retained
Deployment battlefield through `ShellViewportSwap` exactly as they cover an
active Battle.

Per [ADR-0350](adr/0350-run-deployment-promotes-the-mounted-battlefield-in-place.md),
"retained" means the same mounted presentation, not a reconstructed Battle that
resembles Deployment. One Run Battle activity owns one director key, readiness
signature, session provider, `SkirmishBoard`, compositor tree, and camera across
both persisted phases. Phase-specific Controls may replace their contents, but
they cannot re-key that battlefield. Promotion to Battle adds the remaining
position in place. Arrival eligibility follows mounted unit identity per
[ADR-0351](adr/0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md):
newly placed or newly introduced units animate, while units already presented
during Deployment remain seated. The final manual arrival settles before the Run
promotes to Battle and begins the remaining formation's distinct automatic wave
([ADR-0352](adr/0352-final-discipline-arrival-precedes-the-automatic-deployment-wave.md));
the transition remains automatic and adds no confirmation control.

Under [ADR-0240](adr/0240-run-self-inspection-owns-the-left-shell-workspace.md)
and [ADR-0244](adr/0244-run-self-inspection-views-are-deep-linkable.md),
that same fill-only composition remains the workflow-neutral
`RunWorkspace`/`ShellWorkspace` primitive.
Run Army and Lipsana self-inspection reuse it to replace the complete left Play
workspace while title and Controls remain fixed; `/run?view=army` and
`/run?view=lipsana` open those exact workspaces. A shell workspace consumes the
installed outer-role fill but is never an `outer-panel` consumer: it owns no
exterior rails, corner atoms, viewport offsets, or second frame. Covered content
is passed through `ShellViewportSwap`, which owns the retained primary wrapper
and keeps it mounted, hidden, inert, and inaccessible until the workspace
closes. Hosts provide the open state instead of rebuilding those mechanics.
The body border box and edge-attached primary frames or drawn scroll rails meet
the Controls boundary. Ordinary inner controls instead share the content line
computed by the shell from the host's start inset. A source-level wrapper check
is not sufficient; live geometry verification compares both kinds of boundary
on the rendered route.

Under [ADR-0102](adr/0102-runtime-buttons-use-registered-inner-chrome.md), that
ownership rule applies to runtime controls throughout the application. The old
`mode-button` images have no runtime consumers; `.app-header-button` is
layout-only during its remaining name migration, and every use must carry a
registered inner unit path. The repository guard rejects both unowned uses and
direct runtime references to the retired frame sources.

Feature-unique art that is **not** a chrome type and stays per-feature: faction
**shields** (`ce shield-*`), the **board / preview frame** (`ce preview-frame`,
`skirmish portrait-frame`), and the **board renderers** themselves.

Gaps the settings kit does not yet cover and will need new assets: **Field /
input / select** (type 5) and a unified square **Icon button** (type 2).

## Mechanism spec

The canonical CSS shape for every framed control (what `<Frame>` emits):

```css
.frame {
  background: transparent;
  border-style: solid;
  border-color: transparent;
  image-rendering: pixelated;
  /* margins + widths come from the manifest, not hand-typed per surface */
  border-width: var(--frame-top) var(--frame-right) var(--frame-bottom) var(--frame-left);
  border-image: var(--frame-src) var(--frame-slice) fill / 1 stretch;
}
.frame[data-state="selected"] { border-image-source: var(--frame-src-selected); }
```

State is a data attribute swapping `border-image-source`. This is exactly the
Lobbies/`utility-*` pattern, generalized and fed by the manifest.

## Asset + slot convention

- One shared `ui/kit/*` semantic namespace with typed catalog metadata (type,
  variant, state, patch margins per asset).
- Per-feature slot namespaces keep only feature-unique art (shields, board frames).
- Source concepts are private live-media versions with provenance.

## Migration map + order

Out of scope: **Studio** (`/studio`, `/unit-studio`, tile/tileset
review + preview). The owner is evolving those under intense UI needs and will
style them to the app separately. Do not touch.

1. **Build the kit + `<Frame>` renderer** from the Settings art, re-cut to true
   9-slice with typed `ui/kit/*` backend-catalog metadata. Prove it on Settings and Lobbies (already
   closest) — they should look identical before/after but scale correctly.
2. **Skirmish** — highest payoff: 173 rules, 0 asset frames today. Reframe all
   chrome (panels, action buttons, rows, tabs, bars) onto the kit.
3. **Campaign editor** — retire `slice-*` slots and delete the duplicate static manifest;
   rebuild `ce-*` chrome on the kit; keep shields + preview frame.
4. **Level editor** — replace the flat-CSS `le-*` chrome with kit frames.
5. **Retire** orphaned/duplicate slots (`slice-*`, per-size baked frames,
   redundant icon copies) and collapse per-feature metadata into the live kit
   projection.

## Acceptance gates (per migrated surface)

- No `background-size: 100% 100%` or `slice-*` border-images remain on it.
- Every framed control routes through `<Frame>` / the kit classes.
- One source asset renders at multiple element sizes without distortion.
- Desktop screenshot matches the surface's concept.
- No new per-surface class namespace was introduced.

The repository-wide enforcement in ADR-0218 is stricter than a review
checklist: frontend build/check inventory CSS and React-inline background,
border, and box-shadow paint against the exact checked-in current-state
baseline. New or mutated entries fail. A tooltip additionally has one shared
source owner and must render its popup through registered inner chrome.
