# Loading surface inventory

Status: audited 2026-07-19 against `origin/main` at `b5e6a5c9`, with the unmerged
startup-font correction in PR #507 noted separately.

This is the migration ledger for ADR-0136. It inventories user-visible loading,
not every asynchronous operation. Autosave, uploads, AI runs, clipboard notices,
audio buffering, and background synchronization belong here only when they can
change the first complete frame or replace already-visible pixels.

## Verdicts and priorities

- **PASS**: the complete visual unit is hidden/inert until its real renderer has
  acknowledged a painted frame, with an explicit failure path.
- **PARTIAL**: some critical resources are gated, but the surface can still expose
  placeholders, late pixels, proxy readiness, or independently arriving content.
- **FAIL**: the surface visibly constructs itself, swaps fallback content, or treats
  React/fetch completion as visual readiness.
- **N/A**: intentionally progressive, user-requested work inside an already complete
  surface. It still needs stable geometry and an honest local state.

Priority describes user impact: P0 is the ordinary launch/play path, P1 is a major
product/authoring surface, and P2 is a specialized tool or secondary interaction.

## System-level inventory

| ID | Owner / surface | Current mechanism | Verdict | Priority | Required migration |
| --- | --- | --- | --- | --- | --- |
| SYS-01 | Initial HTML and entry module | Static dark document; the module renders `Loading live assets...` immediately. Main currently forces a system font during bootstrap and later removes that override. | **FAIL on main**; corrected but unmerged in PR #507 | P0 | Merge the font gate; keep the status unpainted until the final face is verified. Retain the cold/throttled font-frame assertion. |
| SYS-02 | Global live authorities | `main.tsx` blocks App on the complete media, drawable, unit, and prop-seat catalogs. Errors become one retryable startup surface. | **PARTIAL** | P0 | Replace whole-catalog startup with a bounded shell manifest. Preserve DB/Blob authority and explicit failure; do not weaken the gate merely to improve latency. |
| SYS-03 | Installed chrome | Chrome source images are loaded into canvases, converted to data URLs, and CSS is composed before App import. A later hook records a `requestAnimationFrame`, but startup readiness is composition completion, not observed browser paint. | **PARTIAL** | P0 | Make installed chrome a shell-manifest participant and acknowledge application of the generated CSS plus a painted shell frame. |
| SYS-04 | Persistent title bar/account cluster | Title art participates in the cold-menu director, but account identity fetches after mount and can replace anonymous controls/avatar content. Individual title-bar glyph `<img>` elements do not report readiness. | **PARTIAL** | P0 | Declare the stable title-bar frame and visible glyphs shell-critical. Treat account identity as a reserved-geometry progressive value or include it in the shell boundary; never allow control geometry to change. |
| SYS-05 | Route code loading | One stable Suspense boundary preserves the old screen during soft navigation. A cold direct load of any lazy route shows a generic unowned `Loading…` block. | **FAIL** | P0 | Replace the generic fallback with a route-owned shell whose manifest and failure state are known before reveal. Add direct-cold-load coverage for every lazy route family. |
| SYS-06 | Heavy-route veil | The veil waits for React transition completion and, for `/play`, the board-art store. Other heavy/editor and lazy destinations are not tied to a complete surface acknowledgement. | **PARTIAL** | P0 | Gate veil reveal on a destination surface token, not `isPending`. Every heavy route must explicitly resolve painted or failed. |
| SYS-07 | Light-route entrance | `ArtRouteChrome` can hold on a caller-provided Boolean; enrollment and the meaning of `ready` are local conventions. Several light screens omit it. | **PARTIAL** | P0 | Replace ad hoc Booleans with the same manifest/frame token used by heavy routes. Make an explicit declaration mandatory for every route. |
| SYS-08 | Resource sharing | Board terrain and scene renderers share `imageResources`; most UI `<img>` nodes and local `new Image()` probes do not. Audit found 90 direct UI `<img>` sites and 11 imperative `new Image()` sites. | **FAIL** | P1 | Introduce shared image records for critical UI resources and surface-level painted acknowledgements. Plain `<img>` remains valid only for progressive/noncritical content with stable geometry. |
| SYS-09 | Failure semantics | Startup, route error boundary, board, thumbnail group, and several labs expose errors. Play hydration and some menu destinations say “reopen” rather than providing an in-place retry; some image failures silently fall back or remain blank. | **PARTIAL** | P0 | Standardize `loading → painted` or `loading → error → retrying` at the owning boundary. Eliminate silent blanks and navigation-as-retry. |
| SYS-10 | Instrumentation | Loading Lab records selected resource timings and named events. Coverage is concentrated in startup/menu/thumbnails/board and does not declare expected manifests or unresolved resources. | **PARTIAL** | P1 | Show each active surface, its declared critical manifest, resource state, compositor acknowledgements, reveal time, cache provenance, and terminal error. |
| SYS-11 | Automated visual assertions | `shot.mjs` asserts menu and board atomicity; PR #507 adds shell-font atomicity. There is no assertion for route fallbacks, Play data+thumbnail unity, editor, title-bar/account, or Studio catalogs. | **PARTIAL** | P0 | Add assertions keyed to the inventory journeys below. CI must fail on visible partial states, not only missing final state. |

## Product-surface inventory

| ID | Route / visual unit | Critical resources and current readiness | Reveal / failure behavior | Verdict | Priority | Required migration |
| --- | --- | --- | --- | --- | --- | --- |
| SUR-01 | `/` bootstrap status | Layout font plus enough shell code/CSS to draw the status. Main currently paints in system UI then swaps. | Visible immediately; startup failure replaces it. | **FAIL on main** | P0 | PR #507 is the minimum fix; retain it as one participant in SYS-01, not as the complete loading-system solution. |
| SUR-02 | `/` main-menu background, title, and primary buttons | `coldReveal` waits for separate preload `Image` objects for background/title/button art. Button readiness gets one rAF after proxy decode; the rendered `<img>` nodes themselves do not acknowledge paint. | Atomic group reveal and explicit full-screen retry exist. | **PARTIAL** | P0 | Preserve the group boundary, but have the actual background/title/button consumers acknowledge their first complete painted frame. Include every visible first-frame glyph in the manifest. |
| SUR-03 | Main-menu ambience/rain | Vendored scripts/WASM and streaming world initialize independently and fail soft. | Decorative canvas arrives after the menu and may visibly begin later. | **N/A**, provided it never changes layout or blocks interaction | P2 | Label as opportunistic in Loading Lab and verify its late arrival cannot flash a fallback field or disturb the shell. |
| SUR-04 | Main-menu destination column | Settings/Play/Lobbies render eagerly; Campaign Editor uses a local Suspense boundary whose fallback is an empty destination column. | Column can be visibly empty while its chunk loads. | **FAIL** | P0 | Warm the destination manifest on intent and keep the outgoing/covered destination until the incoming column has painted or failed. |
| SUR-05 | `/play/select/skirmish` and `/play/select/levels` data | `ensureCampaignsHydrated()` drives a local `loading` Boolean. The surrounding menu chrome is already visible; rows display textual loading placeholders. Errors instruct the user to reopen Play. | Content replaces placeholder rows and campaign rail entries independently. | **FAIL** | P0 | Make Play data part of the destination-column manifest. Reveal rail, selected panel, and first viewport only when canonical content state is resolved; provide in-place retry. |
| SUR-06 | `/play/select/campaign/:id` visible thumbnail group | Canonical save/publish derivatives are requested eagerly. `ThumbnailSurface` keeps the group hidden/inert until every expected image fires load plus rAF, with retry on failure. | Atomic after the level list is known. | **PASS within its current boundary** | P0 | Enlarge the boundary to include Play data/rail/selected panel so the complete destination, not merely the thumbnail subgroup, is atomic. Replace proxy rAF with a reusable painted-image acknowledgement if browser tests expose a gap. |
| SUR-07 | Below-fold canonical thumbnails | Current canonical derivatives are eager because every canonical thumbnail starts `near=true`; the group waits for all levels, not only the first viewport. | Correct but potentially over-broad and slow for long campaigns. | **PARTIAL** | P1 | Manifest only initially visible derivatives as surface-critical; schedule below-fold derivatives opportunistically without allowing their arrival to alter visible layout. |
| SUR-08 | Unsaved authoring thumbnails | IntersectionObserver triggers client board baking near the viewport; fixed boxes remain placeholders until paint. | Individual progressive reveal; bake errors can remain a neutral placeholder without a group error unless a caller supplies one. | **PARTIAL** | P1 | Keep authoring-only baking, but require the owning authoring surface to declare which previews are initially critical and surface failures explicitly. |
| SUR-09 | `/play` canonical campaign/level resolution | Route content may hydrate campaigns before selecting the level. `boardSettled` prevents the board mounting against a placeholder level. | Heavy veil is armed, but on a cold direct route generic Suspense/chrome can precede level resolution. | **PARTIAL** | P0 | Define one `/play` manifest spanning route chunk, canonical level snapshot, required board media, HUD glyphs, and compositors. The veil must consume its terminal token. |
| SUR-10 | `/play?map=...` shared map and `/play?lobby=...` connection | Local status chips (`Loading map…`, `Connecting…`) render in the battlefield while data/network state resolves. | Designed loading chrome is visible; errors are explicit, but it is not enrolled in the route boundary and may coexist with late HUD/title assets. | **PARTIAL** | P0 | Decide and encode the complete loading composition for each mode. Either keep a deliberate stable status screen as the revealed surface or hold the route veil; do not mix both accidentally. |
| SUR-11 | Playable board stack | `boardArtReady` requires terrain, barriers, and scene compositor acknowledgements. The whole board remains opacity 0 and inert; failure exposes retry. | Cold/throttled assertion shows no highlight/hit target before the complete board frame. | **PASS** | P0 | Add level-scoped manifest acquisition ahead of mount and include any visually separate board-critical layer introduced later. Keep compositor acknowledgement as the standard. |
| SUR-12 | Gameplay HUD, title-bar controls, portraits, and icons | These render outside or alongside the gated board and contain ordinary `<img>` elements with no aggregate readiness. | Can pop in independently even when the board itself is atomic. | **FAIL** | P0 | Move all first-frame gameplay chrome into the `/play` surface boundary or reserve final geometry and paint it before the veil reveal. |
| SUR-13 | `/editor` Campaign Editor primary workspace | `loaded` holds `ArtRouteChrome` until campaign hydration finishes. Official/private hydration and recent draft document loads are separate; `loaded` can settle while draft cards are still arriving. | Campaign chrome fades once, but secondary lists can populate later. Errors are status strings; retry often means reopening. | **PARTIAL** | P1 | Declare the first viewport: campaign data, visible draft summaries/cards, their icons, and chrome. Fetch draft summaries without N body fetches where possible; add in-place retry. |
| SUR-14 | `/editor/level` durable document and editor chrome | `editorReady` gates `ArtRouteChrome`, title controls, and inertness. A timeout races campaign hydration before auth/document resolution; numerous palette/tool images remain ordinary `<img>` nodes after reveal. | Document errors are explicit and retryable. The editor may reveal with late palette pixels or a timed-out canonical baseline lookup. | **PARTIAL** | P1 | Remove elapsed-time influence from first-frame authority resolution; distinguish degraded/offline explicitly. Add an editor manifest for visible board, palette slice, controls, and chrome, then require actual board/chrome paint acknowledgement. |
| SUR-15 | Editor palette/catalog scrolling | Many tile/unit/prop/wall/fence/feature images load independently; one tile thumbnail rewrites its `src` on error, causing a visible fallback swap. | Cards can construct themselves during/after editor reveal. | **FAIL** | P1 | Serve bounded, size-appropriate catalog thumbnails; gate the visible palette slice and schedule the rest opportunistically. Replace `src` mutation fallback with explicit error state. |
| SUR-16 | `/lobbies` shell and level picker | Lobby UI reveals synchronously. Official levels hydrate in a nested hook and replace `Loading levels.`. User avatars are unmanaged remote images. | Local progressive placeholders; no in-place level retry. | **PARTIAL** | P1 | Treat initial lobby list/connection state as the route composition; gate an opened level picker as a coherent sub-surface and reserve avatar geometry with explicit failure. |
| SUR-17 | `/party` | Synchronous utility shell; no identified first-frame content fetch in the component. | Uses shared art-route chrome without a readiness token. | **PARTIAL / low evidence** | P2 | Instrument a cold route and explicitly declare an empty manifest or the real network dependencies. No route may opt out by omission. |
| SUR-18 | `/settings/*` base settings | Core settings are local and synchronous inside the persistent menu. Tab panel crossfades are timer-driven presentation, not resource readiness. | Stable for ordinary tabs. | **PASS for base tabs** | P1 | Register an explicit empty/local manifest and visual assertion so future async additions cannot silently bypass the system. |
| SUR-19 | `/settings/tracks` | Fetches `/api/bgm` after the tracks view opens and shows a stable settings row. This is user-requested secondary content. | Honest local loading/empty/error copy inside an already complete surface. | **N/A / acceptable progressive sub-surface** | P2 | Add in-place retry and ensure album/track media, if added, use bounded thumbnails and stable geometry. |
| SUR-20 | `/studio` route shell and chunk | Large lazy Studio chunk uses the generic cold Suspense fallback. No Studio-wide readiness token exists. | Shell can reveal before selected catalog/viewer resources. | **FAIL** | P1 | Give Studio a route manifest for its chrome, selected catalog, selected viewer, and first visible card slice. Direct deep links must declare the same bounded manifest. |
| SUR-21 | Studio catalogs (Pages, Artwork, Assets, Chrome, Units, etc.) | Many direct `<img>` nodes; some use browser `loading="lazy"`, some eager, most have no load/error aggregation or fixed painted acknowledgement. | Cards and thumbnails visibly pop in independently. | **FAIL** | P1 | Standardize a catalog-card image primitive with reserved geometry, shared resource state, first-viewport group gate, below-fold scheduling, and explicit error. |
| SUR-22 | Studio viewers/editors | Rail, Surface Tiles, Drawables, Predrawn Reference, Wall Candidate Review, and others each implement local loading/error state. Some decode candidate images before canvas paint; others report proxy `onload` or a local Boolean. | Behavior and retry semantics differ by viewer. | **FAIL as a system**, although several individual viewers are locally careful | P1 | Require every viewer to expose the common surface token. Reuse the board compositor gate where a real board is mounted; use painted-image/canvas acknowledgements elsewhere. |
| SUR-23 | `/predrawn-reference` | Level fetch has explicit loading/error state. Source images are decoded and capture readiness is tracked for tooling. Cold route still sits under generic Suspense; visible chrome is not atomically tied to capture sources. | Tool can display `Loading saved level…` then construct board/export frame. | **PARTIAL** | P2 | Decide whether the loading message is the deliberate complete surface; otherwise hold route reveal until the reference frame paints. Enroll its detailed capture readiness in Loading Lab. |
| SUR-24 | `/portrait-editor` and other direct lazy tools | Lazy chunk under generic fallback; portrait images render as ordinary `<img>` elements. | Direct cold load and palette changes can swap visible images. | **FAIL** | P2 | Add route/viewer manifest and a shared painted-image boundary; pre-acquire the selected portrait before replacing the current one. |
| SUR-25 | App update/reload | Update banner is intentionally progressive and reloads to a new build. Stale lazy chunk errors trigger one automatic reload. | Can add a banner after the shell is complete; reload re-enters bootstrap. | **N/A**, but bootstrap guarantees apply | P2 | Reserve banner overlay geometry and include update-triggered reload in cold-start assertions. |

## Confirmed strengths worth preserving

1. The gameplay board is the best current implementation: actual renderer
   acknowledgements, one owning boundary, inertness, explicit failure, and a
   high-frequency cold/throttled assertion.
2. Canonical list thumbnails are correct delivery artifacts: compact immutable
   derivatives from the canonical DB/Blob-backed content path, not client board
   reconstruction.
3. The stable Suspense boundary correctly preserves an already-painted screen during
   soft navigation; the defect is the unowned cold fallback and lack of a destination
   painted token.
4. Startup critical failure, route render/chunk failure, board failure, and thumbnail
   group failure already demonstrate the desired explicit error direction.
5. Loading Lab and `shot.mjs` are appropriate owner instruments, but neither yet knows
   the complete expected surface inventory.

## Architectural gaps revealed by the inventory

The code has a vocabulary and several good primitives, but not an enforceable loading
system. The missing connective tissue is a required **surface contract**:

1. A route or sub-surface declares a bounded critical manifest before reveal.
2. Shared resource records acquire/cache bytes and expose fetch/decode failure.
3. The actual consumer acknowledges composition and browser paint.
4. One owning boundary stays hidden and inert until every critical acknowledgement.
5. The boundary terminates only in `painted` or an explicit retryable `error` state.
6. Loading Lab displays the declaration and every unresolved participant.
7. Cold/throttled Chrome assertions sample visibility and interaction throughout the
   lifecycle, not merely the final screenshot.

Today those responsibilities are split among `main.tsx`, `coldReveal`, Suspense,
`useTransition`, `ArtRouteChrome`, local `loading` Booleans, `ThumbnailSurface`, and
`boardArtReady`. Because enrollment is optional, new or overlooked pixels—such as the
bootstrap font, HUD icons, account identity, or Studio cards—can bypass the boundary.

## Migration order

1. **Close P0 shell holes:** merge/verify PR #507; replace the generic cold Suspense
   fallback; include title-bar/account geometry; turn installed chrome into a painted
   shell participant.
2. **Make Play one surface:** unify campaign hydration, rail, visible derivatives,
   selected panel, gameplay HUD, level snapshot, and board compositors under declared
   Play manifests.
3. **Make the editor one surface:** remove timed readiness ambiguity; gate the durable
   document, first visible palette slice, board, controls, and chrome.
4. **Create the catalog image primitive:** migrate Studio and editor catalog cards;
   first viewport is critical, below-fold is opportunistic.
5. **Require route enrollment:** every `renderRoute` family declares a manifest and
   terminal surface token, including explicit empty/local manifests.
6. **Complete the instrument and CI matrix:** Loading Lab shows expected versus actual;
   cold Slow 4G journeys cover `/`, every Play selector mode, canonical `/play`, shared
   map/lobby, `/editor`, `/editor/level`, `/studio`, and direct lazy-tool loads.

## Definition of inventory completion

This inventory is complete as a static first pass: all router families, global shell
layers, ordinary player journeys, authoring surfaces, and specialized lazy tools are
represented. Migration is **not** complete. A row can move to PASS only with code-level
enrollment, explicit failure behavior, and cold/throttled visual evidence on its exact
route.
