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

Under [ADR-0144](adr/0144-level-editor-events-use-the-shell-workspace.md), the
Level Editor Events instrument is content in the shell-owned board workspace,
not an `outer-panel` consumer or dialog. It fills that workspace while the title
bar and right controls remain fixed, and it inherits responsive bounds from the
shell rather than duplicating viewport measurements. Events may consume the
installed outer role's generated material through the shared fill-only primitive,
but it paints no second frame, rails, or corner atoms; its controls continue to
use registered inner chrome. Its open state is part of the canonical Level Editor
address (`eventsEditor=1`, with optional `eventsTab=other`) so a review link opens
the exact workspace state without requiring follow-up clicks.

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
