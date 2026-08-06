# Chess Tactics UI Art Direction Contract

This document is the source of truth for the current visual redesign. Treat it
as binding for implementation work unless the product direction changes in a
later design review.

## Decision Records

Individual decisions — with their context, alternatives, and rationale — are
recorded as ADRs in [`adr/`](adr/) (see the [decision log](adr/decision-log.md)).
Those records are authoritative for *why* a choice was made. This contract is the
consolidated *current-state* view: it states the rules in force now and should
cite the ADR each derives from. When the two disagree, the ADRs win and this doc
is brought back into line.

## Deciding UI Tradeoffs (game-UI vs product-UI)

When game-UI guidance (immersion, theme, density) conflicts with product-UI
guidance (clarity, breathing room, convention), decide with the criteria and
surface-based tie-break in [ADR-0006](adr/0006-ui-decision-criteria.md):

1. If it breaks the usability floor (legibility, contrast, target size,
   label↔control proximity), usability wins.
2. Otherwise pick the lean by surface — **in-game (board/HUD)** leans game-UI
   (immersion, glanceability, density OK); **menus/chrome (settings, studio,
   editors)** leans product-UI (clarity, breathing room) while still wearing the
   game skin.
3. Within that lean, the accepted concept art is the reference for the look.

## Chosen Direction

**Dark Strategy Pixel battlefield inside a dark low-glare app shell.**

The default battlefield should be night-leaning, low-glare, and comfortable for
long play sessions. Pieces, overlays, and key terrain features should stay
visually distinct and colorful enough to read at a glance. Bright daytime maps
are allowed as occasional level/biome variants, but they are not the default
look. Do not interpret the bright mockups as approval for a white app UI or a
bright app background.

The first production biome is **moonlit grassland**: grass, water, cliffs,
stone paths, rocks, and trees under cool night lighting. It should preserve the
readability and tactical friendliness of the bright strategy mockups without
making the whole app bright.

The target experience is a compact tactics puzzle that also feels like a tiny
campaign battlefield. It should be easy to distribute and play with friends in a
browser, so the visual system must be feasible with 2D web rendering, canvas
layers, DOM HUD panels, and sprite/tile assets.

## Inspirations

- **Into the Breach:** isometric tactical clarity, puzzle-like turns, explicit
  threat language, immediately readable board state.
- **Advance Wars:** bright faction readability, approachable campaign-map tone,
  clean tactical UI.
- **Fire Emblem:** unit identity, roster attachment, tactical drama.
- **Chessmaster:** chess dignity, elegant board/piece presentation, serious
  chess identity, low-noise interface.
- **Chess:** role silhouettes, spatial logic, abstract rules made visible.

These are references for qualities, not sources to copy.

## Non-Negotiables

- Browser-first. Avoid any direction that requires a heavy native/game-engine
  pipeline to look acceptable.
- Small refined pixels are allowed and preferred; oversized chunky retro pixels
  are not the goal.
- The app shell is dark theme by default. Use low-glare navy, charcoal, and
  muted steel surfaces with off-white text.
- Battlefields default to dark/night or dusk environments. Bright daytime
  environments are allowed as special map variants, but they still live inside
  the dark app shell.
- The first board target is moonlit grassland.
- Board state must be readable faster than it is beautiful.
- Gameplay overlays must remain obvious over every terrain type.
- Chess identity must be preserved through piece silhouettes and role language.
- Avoid full painterly rendering as an implementation target. Rendered mockups
  are mood references, not literal production requirements.

## Visual Balance

The current center of gravity is:

- **Primary:** Dark Strategy Pixel
- **Secondary readability:** Bright Strategy Pixel
- **Secondary restraint:** Chessmaster Refined Pixel

Use Dark Strategy Pixel for the default mood, comfort, and app identity. Borrow
from Bright Strategy Pixel for terrain clarity, faction color, and readable
overlays. Use Chessmaster Refined Pixel to keep pieces and UI from becoming too
toy-like or noisy.

## Board Rules

The board is the first visual priority.

Do:

- Keep isometric presentation.
- Use readable grass, water, stone, road, bridge, cliff, tree, and rock
  materials tuned for night/dusk by default.
- Use moonlight, cool shadows, reflective water, and selective warm highlights
  to make the battlefield feel dark without becoming muddy.
- Keep tile boundaries visible without making the grid feel like spreadsheet
  chrome.
- Make water and cliffs attractive but not visually dominant.
- Keep move overlays cyan/blue and threat overlays orange/red.
- Support bright daytime maps and future biomes without changing the UI system.
- Design terrain as reusable tiles and props that can be rendered in canvas.

Avoid:

- Gloomy purple backgrounds as the dominant read. Dark should mean low-glare and
  readable, not muddy.
- Painterly tile detail that cannot plausibly become a tile sheet.
- Terrain clutter that hides piece silhouettes or overlays.
- Board framing that competes with tactical information.

## Piece Rules

Pieces should read as chess pieces first and tactical units second. They are not
literal Staunton pieces, and they are not humanoid soldiers wearing chess hats.

Do:

- Use strong chess silhouettes at actual board scale.
- Use player ivory/cobalt/gold and enemy charcoal/vermilion/gold.
- Put faction color on bases, trim, banners, shields, enamel, or icon accents.
- Keep pieces sprite-friendly: compact, outlined, readable, and easy to animate
  later.
- For the current pass, animation scope is minimal: pieces only need simple
  movement feedback when they move. Do not design around elaborate idle,
  attack, capture, or death animations yet.
- Preserve role identity:
  - Pawns: standard bearers, shield pawns, compact sentries.
  - Knights: horse-head silhouette, helm/standard hybrid, strong profile.
  - Bishops: mitre, diagonal pennant, signal-piece silhouette.
  - Rooks: fortress/tower silhouette with battlements.
  - Queens: tall command piece with crown authority.
  - Kings: protected command post or dignified standard, not an action hero.

Avoid:

- Fully humanoid fantasy units.
- Exact Staunton replicas.
- Painterly miniature detail that disappears at board scale.
- Piece designs that require many animation frames to feel alive.

## UI Shell Rules

The interface should be dark, quiet, and tactical. The board can be colorful;
the chrome should be low-glare.

Do:

- Use dark navy, charcoal, muted blue-gray, and subdued steel panels.
- Use cool teal/blue stone for structural fields that hold subordinate units,
  and installed oak for terminal leaf controls or status plates (ADR-0433).
- Use off-white text, not pure white walls of UI.
- Use cobalt for primary/player actions, red/orange for power/threat, and gray
  for wait/disabled states.
- Keep selected-unit, actions, roster, threats, and event log clearly separated.
- Keep pixel typography restrained and readable.
- Let pieces, overlays, and select terrain accents carry most of the saturated
  color.

Avoid:

- White sidebars or large pale panels.
- Generic sci-fi dashboard chrome.
- Purple-heavy palettes.
- Oversized pixel text inside dense panels.
- Decorative borders that reduce information density.

## Implementation Shape

The intended web implementation is:

- Canvas-rendered isometric board and overlays.
- Canvas, SVG, or sprite-sheet pieces.
- DOM/CSS top HUD, side panel, menus, lobby, and editor.
- Optional sprite sheets for terrain and pieces after the first code pass proves
  scale and readability.

Do not begin with a full asset pipeline unless the code-rendered prototype
cannot reach an acceptable style. The first production pass should prove the
style with the existing architecture.

### Render accuracy rule (binding)

Decide per UI element by whether it carries rich *rendered* detail — painterly
art, a crest, lighting, illustration:

- **Rendered detail → art-backed.** Use the approved render itself (e.g. a
  percentage crop of `main-menu-aspirational.png`) as the image layer and overlay
  only transparent live DOM controls/hotspots. This is how the accepted mode
  buttons (01), brand plate (02), and the profile/status panel (03) are built.
  Do NOT reconstruct rendered art in DOM/CSS/SVG: CSS yields stylized geometry,
  not rendered artwork, and hand-drawn SVG cannot match a rendered lion crest.
- **Simple / text / utilitarian chrome → DOM/CSS** (dock labels, HUD labels,
  forms). These have no rendered detail to lose.
- **Text is always live, never baked.** Even inside an art-backed element, keep
  copy and numbers as live DOM text (a webfont matching the concept's type)
  overlaid on the art — never painted into the image. Baking text breaks
  localization, accessibility (resize / screen readers), crisp scaling, and
  dynamic content (live counts, rotating news). Art-back the *visuals* (crest,
  icons, frame, background); render the *words and numbers* live. The only baked
  text allowed is stylized logo/title lettering that is itself part of the art
  identity (e.g. the painted mode-button labels). Confirmed by game-UI
  localization and accessibility guidance.

Test: would redrawing it in code lose rendered detail visible in the concept? If
yes, keep the art. (Origin of this rule: element 03 was rebuilt in DOM/SVG and
could not match the concept's lion — its crest came out a sunburst. The fix was
to art-back it like 01/02.)

## Current Screen Concept References

The June 2026 screen concepts are binding visual references for the UI overhaul:

- [Main menu aspirational concept](art/ui-screen-concepts/01-main-menu-aspirational.png)
- [Campaign editor concept](art/ui-screen-concepts/02-campaign-editor.png)
- [Level editor concept](art/ui-screen-concepts/03-level-editor.png)
- [Skirmish concept](art/ui-screen-concepts/04-skirmish.png)

Use these as direction targets, not literal implementation screenshots. The
production UI should preserve their mood, hierarchy, low-glare shell, rich
isometric board presence, and tactical information density while adapting to the
actual app architecture.

The main menu concept is intentionally aspirational. Keep the saved image as a
growth reference for future features such as profile state, lobbies,
achievements, and richer account/status panels. Daily/news is not part of the
current main-menu target. The first
implementation pass may reduce the main menu to the modes the app actually has
today.

The level editor and skirmish concepts are the immediate product targets. They
should drive the first concrete UI sweep because they define the practical tool
layout, HUD structure, tile palette, brush controls, roster, selected-unit
panel, threat language, and low-glare chrome.

The production implementation has moved beyond the earlier
[art-backed UI bridge](art-backed-ui-bridge.md) into the shared live-DOM kit. The
homepage family uses one continuous generated scenic backdrop, one invariant title
bar, shared settings-twin rails, live rows, and data-backed board previews. The saved
concept renders remain direction and comparison references rather than runtime screens.

The default work surfaces are `/`, `/enchiridion`, `/enchiridion/units`,
`/enchiridion/terrain`, `/enchiridion/cards`, `/enchiridion/card-types`,
`/enchiridion/lipsana`, `/enchiridion/abilities`, `/play/select`, `/play/select/continue/<mode>`, `/play/select/skirmish`,
`/play/select/levels`, `/play/select/campaign/<id>`, `/editor`,
`/editor/level`, and exact `/play?...` for a selected live board. The main menu has
five top-level controls — Play, Editor, Lobbies, Enchiridion, Settings — and Play owns the shared
Continue/Skirmish/Run/Levels/Campaign selector described by ADR-0074, ADR-0232,
ADR-0294, ADR-0356, and ADR-0474. Clicking Play lands on Continue after content and Run
authority settle. Its rail control says only **Continue**. The action column is
the resume surface itself and mounts no detail column: it shows exactly one
activity — the most recently updated resumable one, as its title, facts, and one
final **Continue** action — offering no mode list and no second activity, and states
**Nothing to continue** once when there is none. Ordinary Run remains a
separate neutral preparation surface between Current Run and Start New Run.
Run preparation uses Campaign Levels' master-detail geometry, with current-Run
facts plus Play or Ataraxia plus Start Run in the right detail column. Play follows the current-Run
facts, and Start Run follows the Ataraxia selector plus any replacement disclosure instead of
pinning either final action below an empty column spacer. It omits feature-pitch and
authored-War copy, and the Ataraxia choice is the shared scrollable dropdown
with unavailable installed tiers visible but disabled. Every tier, including **Ataraxia 0 — The
Untroubled Mind**, presents its subtitle in the selector and its literal impact
beneath it. In the Run title bar, Ataraxia's tooltip is instead a compact cumulative
list headed only **Ataraxia**: every active tier is one small canonical carved-numeral
row beside its model-owned effect, with no appended mechanic-definition panes; tier
zero reads **Standard rules.** (ADR-0289, ADR-0290, ADR-0291, ADR-0390, ADR-0391, ADR-0475).
On Run defeat, the result shade belongs only to the battlefield viewport. The persistent
title bar and right Controls panel remain fully visible and operable for post-Battle
inspection. The result is therefore non-modal and offers paid **Retry**, **New Run**, and
**Main Menu**, with no terminal-defeat Undo; New Run routes through the existing preparation
and replacement confirmation (ADR-0428).
On Run victory, the settled board stays fully visible and inspectable. An unframed,
bottom-justified **Victory** acknowledgement fades over it with one prominent **Rewards >**
action and no shade, recap card, or terminal-victory Undo. Rewards opens the persisted aftermath
report. The complete won-Battle scene, including its Victory action and current Controls state,
fades completely away before the complete report scene fades in; the two phases never appear or
mutate in parallel, and both legs use the shared UI fade duration. That
workspace seats its information box on the 45%-from-top optical centre, places Victory above it
and the Back/Continue actions below it without centring the combined stack,
and does not repeat the Conflict/Battle measures already present in the title bar. **Back** beside
Continue returns to the exact won board without leaving or recomputing the persisted aftermath;
the live Battle hands that review snapshot directly to aftermath before any best-effort disk write,
so the report reached from Rewards always presents Back. Rewards returns to the same report, while
Continue is the irreversible accounting handoff.
Non-Sectio Controls likewise omit the one-item, no-op **Run views** group and are static layouts,
not empty scroll panes (ADR-0452, ADR-0454, ADR-0455, ADR-0456, ADR-0457).
On Bona Vacantia, the room-caption corner stays empty: no workspace heading,
instructional prose, or placeholder label repeats the room identity. The persistent
title bar is the sole textual location label unless a future accepted art decision
depicts the room within the authored scene artwork. The runtime mat stage fits the
actual scene slot at every viewport aspect ratio; the review instrument's 16:9 canvas
does not impose a scroll region on the Run workspace. The mat presents only the three
lipsana. A unit-targeted take
flies to the held strip provisionally, then the exact Martial Prosopography
ledger/profile replaces the mat. Its normal section-tab column is absent here;
that established-width column instead explains the chosen lipsanon, the granted
ability, the confirmation boundary, and the action that restores the untouched
mat. The provisional lipsanon appears only once, in the canonical held strip;
the decision column does not repeat its icon or the phase name. Each ledger row
explicitly says **Select**, the unit profile supplies the grant action, and only
that action reveals the Sectio. On landing, the moving lipsanon remains carried at
the strip coordinate outside both scene fades until the incoming canonical strip
is visible beneath it; it never blinks out during the ownership handoff
(ADR-0030, ADR-0297, ADR-0383, ADR-0384, ADR-0385).
Enchiridion is immediately above Settings. In Battle, frameless open-codex art
at the same visual scale as the Controls title and aligned to the Controls
content boundary opens
Strategikon; its hover/focus information names the unfamiliar destination and
summarizes its references, army, card, and lipsanon contents under ADR-0250. The
four Strategikon section marks sit immediately beside that rightmost book and
directly open the same destinations as the complete workspace rail. Title and
rail read one shared destination inventory, and the visible Chartulary mark is
the measured endpoint for an adlected card's shrinking transfer and the measured origin for
the face-down Deployment deal into the numbered Controls stack. When an adlected card leaves
the Sectio layout, it reveals the accepted face-down card registered beneath it in the same pile
seat. Every original pile remains fixed; the back is non-interactive presentation rather than a
replacement offer or stock count (ADR-0387, ADR-0419, ADR-0420, ADR-0481). Every occupied unit
sprite on the canonical card face immediately raises the shared fixed tooltip on pointer hover.
That reading repeats the same canonical player-side sprite at a materially larger scale and names
its chess role in live prose; repeated units of one role share one stable reading, so crossing
between them does not replace or move the popup. An unacquired offer never invents a persistent
personal name. In Sectio the complete card remains the one action, so unit readings introduce no
nested controls (ADR-0490). The persistent
active Deployment card never compacts around a played unit: its authored density, sprite scale,
and stack seats remain fixed while the departed occurrence becomes a visible vacancy (ADR-0427).
title route always appends the visible Enchiridion section on the standalone host,
and on a Run keeps the underlying phase before appending Strategikon, its section,
and that same Enchiridion reference—for example
`Enchiridion › Cards` or `Sectio › Strategikon › Enchiridion › Cards`
(ADR-0389, ADR-0408). Every named segment is a frameless `NavButton` to its
canonical address, so the route is a keyboard- and pointer-operable breadcrumb rather
than orientation-only copy (ADR-0409). Address-only segments are owned directly by the
persistent App title configuration, so Play-hosted Strategikon and standalone Enchiridion
routes do not disappear while a scene is loading; only live document state such as the
Run phase enters through the route portal (ADR-0410). Reference ancestors own empty
routes: activating Strategikon or Enchiridion removes the exposed child and leaves the
appropriate rail over its authored background; Units appears only at an explicit Units
address, with no placeholder panel at any empty root (ADR-0411). Strategikon's
rails are canonical main-menu rail columns: every destination added to either
column inherits the exact menu-tab width, stack gap, inset, and stone-continuity
language rather than defining host-local geometry. Strategikon replaces the board
only. The right Controls
column remains present and is outside the Strategikon content rectangle. Its
fill occupies that complete board pane without adding an outer frame, and its
route transition leaves the current level scene mounted; only main-menu
Enchiridion uses the homepage scene. Under ADR-0297, Strategikon's shell-owned
body reaches the Controls boundary while its edge-attached content retains the
shared responsive start and block insets; workflow CSS does not recreate a
mirrored end perimeter. Per ADR-0336, every Strategikon route mounts the exact
accepted command-archive pixels from the required DB-owned application-UI role
between that fill and the real content. The shared shell clips the decorative
layer and applies the closed owner-approved cover, pixelated, 0.68-opacity
treatment; no candidate/admin lookup or repository fallback participates.
In both
hosts, lipsanon references use the
ADR-0254 dual-view browser: a compact Rows/Grouped tab sits above the selection
column; Rows uses corrected named list frames, while Grouped uses one containing
inner frame around an otherwise unframed native-icon grid. Neither view opens
lipsanon tooltips: the selected content-sized record is the sole visible
name/effect/history authority. Card Types follows that master-detail reading:
the third column contains the four affected-type names and the fourth contains
only the selected Volunteer-based card face; it does not compare four card
previews simultaneously (ADR-0315). Cards is intentionally different: it mounts
no fourth column. After the two rail predecessors, the terminal third column
owns the remaining canvas and shows real card faces in left-to-right rows with
one top-to-bottom drawn scroll; its pinned filters do not create another scroll
region (ADR-0364). In the main-menu host, the two canonical rail
anchors remain fixed while Enchiridion content consumes the remaining visible
canvas; the ordinary action-column width does not cap it. The generated no-board scenic
background remains the accepted background-only scene. Daily/news and the duplicate
bottom dock remain absent. The production route must not bake a board into the
background or grow a separate battlefield preview panel. `/design/*/render` routes preserve the approved renders for comparison:
`/design/main-menu/render`, `/design/campaigns/render`,
`/design/level-editor/render`, and `/design/skirmish/render`.
`/design/main-menu` remains the asset review board for comparing candidate
asset families before wiring them into a bridge.

The main menu acceptance state lives in
[main-menu-acceptance.md](main-menu-acceptance.md). As of the current pass, the
five-entry mode rail, invariant title bar, shared live-DOM kit, and scenic background
are settled. Daily/news is removed.
The real board/battlefield layer is out of scope for this pass, and desktop is
the validation target. Profile/account and the overall desktop composition still
need review.

Per [ADR-0442](adr/0442-expunctio-is-a-card-first-gallery.md), Expunctio is a
card-first two-column gallery. Each tile grows from its complete canonical card
face and arranges its fee and action beside that primary record; the shared drawn
scrollbar owns overflow. His Grace keeps the accepted gold socket but omits its
misleading zero numeral and zero-price accessible wording on every canonical face.
Per [ADR-0443](adr/0443-athetize-is-the-card-action-within-expunctio.md), the
workspace and fee remain Expunctio, while each available card's action reads
**Athetize** and its completed state reads **Athetized this visit**.
Per [ADR-0444](adr/0444-expunctio-card-tiles-remain-opaque-in-every-state.md),
unavailable, unaffordable, spent, and completed tiles retain the same opaque
canonical card and inner-chrome rendering as available tiles. Status copy and
the disabled action control communicate state; whole-tile opacity never does.
Per [ADR-0445](adr/0445-card-companions-align-to-painted-frame-keylines.md),
card-adjacent copy and controls align to the frame pixels rather than the card's
transparent 5:7 canvas. The first companion line's visible ink meets the painted top
rail and the action's painted lower rail meets the card's painted lower rail;
responsive sizing derives both insets from the active frame geometry.
Per [ADR-0446](adr/0446-expunctio-tiles-use-shell-surface-and-oak-actions.md),
Expunctio does not repeat the card's printed title beside its canonical face.
Each tile keeps its inner frame but borrows the installed outer-role surface used
by the title bar and Controls panel; its action keeps the canonical control frame
over the registered `hybrid-wood-oak` surface.
Per [ADR-0489](adr/0489-alienatio-fades-the-departure-and-flips-the-next-card-frame.md),
Aliene commits immediately but remains visually legible: the sold figure fades over
its exact old card seat while each stable survivor glides into the compact committed
stack. Selection and cycling remain stationary; only the completed transaction moves
the affected figures, and the surrounding physical panel never reflows.
Per [ADR-0448](adr/0448-expunctio-scrollbar-keys-to-the-terminal-frame-rail.md),
the final tile's straight frame rail and the shared drawn scrollbar meet one
bottom keyline at the end of the gallery. The corner atom may continue below
that rail through its measured clip apron, and the scrollbar reserves the same
live overhang at its block end rather than extending to the ornament's tip.

## Parallel Work Boundaries

Use these boundaries when delegating to agents.

### Design Contract

Owns this document. Updates vocabulary, principles, decisions, and open
questions. Does not implement UI.

### Board Rendering

Owns terrain, grid, cliff, water, background, and overlay rendering in
`frontend/src/app.js`. Avoids piece redesign and non-board UI layout.

### Piece Style

Owns piece silhouette/rendering in `frontend/src/app.js` or future piece assets.
Avoids terrain palette and side panel layout.

### HUD And Sidebar

Owns `frontend/index.html` and `frontend/src` shell/panel CSS for the top HUD,
selected unit, actions, roster, legend, and log. Avoids canvas rendering.

### Menus And Editor

Owns main menu, party picker, lobbies, campaign editor, and level editor
styling. Avoids gameplay canvas changes.

### Responsive And Accessibility

Runs after the first integration. Owns mobile layout, scroll behavior, touch
targets, contrast, font sizing, and low-glare checks.

### Asset Pipeline

Owns a proposal, not first-pass implementation. Evaluates code-drawn sprites,
hand-authored sprite sheets, generated pixel art cleanup, file organization,
scaling rules, and maintenance costs.

## Current Implementation Plan

1. Lock this contract.
2. Board rendering pass: make the live board read as Dark Strategy Pixel
   moonlit grassland while preserving Bright Strategy Pixel readability and the
   dark app shell.
3. Piece style pass: improve silhouettes and faction language at board scale.
4. HUD/sidebar pass: rebuild the shell as dark low-glare tactical UI.
5. Menu/editor pass: bring non-game screens into the same system.
6. Responsive/accessibility pass.
7. Decide whether a dedicated sprite/tile asset pipeline is necessary.

## Asset Source Decision

Production pixel art may be generated by agents rather than hand-drawn by an
artist. Generated art should still be processed into usable game assets:

- normalized tile and piece sprite sheets
- consistent camera angle and scale
- transparent or cleanly keyed backgrounds
- controlled palettes and outlines
- predictable file names and metadata
- no dependency on one-off full-screen mockup renders for gameplay

Per [ADR-0076](adr/0076-scaling-is-calibration-production-art-is-native-1x.md),
scaling is allowed to calibrate an asset's required footprint, but the scaled
candidate is not production art. Once its 1× frame, visible subject bounds, and
anchor are approved, regenerate/re-render it at those pixels and serve it 1:1;
offline downscaling and asset-local live scale are not acceptance paths.

The goal is to use generated art as the source for production sprites and tiles,
not merely as inspiration. The implementation should still treat those outputs
as real assets that need cleanup, slicing, consistency checks, and browser-safe
rendering rules.
