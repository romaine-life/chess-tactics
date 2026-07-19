# Visual delivery audit

Status: current-path audit, 2026-07-19. This is an implementation evidence map, not
the target loading design. The governing target is
[ADR-0107](adr/0107-loading-is-manifest-driven-and-frame-acknowledged.md).

## Remediation status

The P0 behavior described by this baseline has now been changed in the working
implementation:

- startup waits for the critical font and installed chrome before App's first commit;
- the main-menu background and controls resolve one hydrated immutable identity and fail
  explicitly instead of counting decode failure as readiness;
- canonical level saves/publishes maintain a versioned `level_thumbnail_derivatives`
  projection backed by `media_blobs`, and level summaries return immutable thumbnail URLs;
- player-facing `LevelThumbnail` consumes those rasters, while client board baking is
  restricted to explicitly named authoring previews;
- Play's card surfaces reveal atomically after their complete thumbnail set paints;
- terrain and scene canvases use one retryable decoded-image resource manager;
- board readiness comes from the terrain, barrier, and scene compositors themselves, with
  no elapsed-time escape hatch; and
- route/menu/screen readiness failures produce deliberate retry states.

The classification table below remains the before-state evidence that motivated the
change. Its remaining work—especially bounded shell/level manifests, world/HUD/unit paint
acknowledgement, and removing global catalog fan-out—must be evaluated from cold/warm
Loading Lab traces rather than assumed complete.

## Executive finding

The application does not have one runtime visual-delivery system. It now has canonical
database-backed live-media and drawable authorities, but they remain surrounded by
several independent consumption systems:

- stable semantic `/assets/...` URLs that redirect through the backend;
- immutable `/api/media/<sha>` URLs projected from the full catalog;
- ordinary DOM/CSS image loading;
- two canvas image caches plus uncached local Image loaders;
- client-side thumbnail and chrome raster assembly;
- route-specific preloaders and reveal directors;
- database-backed drawable and unit catalogs plus live configuration documents loaded
  before App import.

The user-visible defects are therefore systemic. They cannot be retired by changing
fade timing. The runtime must first stop using authoring/review composition paths for
ordinary presentation and stop treating independent resource consumers as one frame.

## Repository and live-snapshot evidence

The public startup catalog currently contains 1,609 active slots and serializes to
approximately 1.13 MB of JSON. It describes roughly 228 MB of media even though startup
does not download those media bytes. Of those slots, 1,336 are marked critical and 273
decorative. The largest projections are:

| Domain | Slots | Active media represented |
| --- | ---: | ---: |
| Terrain | 904 | 77.80 MiB |
| UI kit | 475 | 69.20 MiB |
| Background | 15 | 35.85 MiB |
| Portrait | 132 | 23.17 MiB |
| Review media | 10 | 17.86 MiB |
| Unit art in generic catalog | 16 | 2.91 MiB |

The separate unit catalog adds about 71 KB of JSON. After PR #499, runtime source still
contains 246 literal `/assets/...` references across 49 files; 181 are UI paths and 25
are tile paths. These are semantic live-slot URLs, not Git-backed media bytes or
code-owned installed drawable records, so their presence does not violate ADR-0106.
The browser has 13 separate `new Image()` loader sites and multiple canvas/data-URL or
object-URL producers. These counts establish fragmentation; they are not performance
budgets.

PR #499 therefore retired a major ownership problem: installed terrain, feature,
barrier, prop, cover, and related drawable records now come from Postgres, while their
media bytes remain in Blob storage. The remaining findings below concern projection
scope, delivery identity, decoding, composition, and reveal—not a request to restore or
replace a Git-backed asset inventory.

## Path classification

Severity means UX/architecture priority, not estimated implementation effort.

| Surface / consumer | Current production-to-paint path | Classification | Severity | Required target |
| --- | --- | --- | --- | --- |
| Application bootstrap | Fetches the complete generic media, drawable, and unit catalogs in parallel, then prop seats, then SFX profile, validates chrome, initializes unit sizing, imports App, and only then renders the real shell ([main.tsx](../frontend/src/main.tsx)) | Canonical database projections used as one global bootstrap manifest; unnecessary startup dependency fan-out | P0 | A bounded shell manifest containing only shell-critical slots/configuration; route/domain projections hydrate independently before their consumers mount |
| Installed chrome | Five immutable live sources are loaded after App mount; `chromeFamilyRuntime` draws rails/atoms into several canvases, encodes data URLs, generates CSS, and installs it from a React effect ([useInstalledChromeCss.ts](../frontend/src/ui/useInstalledChromeCss.ts), [chromeFamilyRuntime.ts](../frontend/src/ui/chromeFamilyRuntime.ts)) | Authoring/calibration assembly leaking into every runtime start; post-render reskin | P0 | Promote a runtime-ready installed chrome derivative/family description; resolve immutable sources before shell exposure; no startup canvas encoding |
| Main-menu buttons | Hard-coded stable semantic icon/surface URLs render through CSS/DOM while a second set of temporary Images decodes the same art for the reveal director ([MainMenu.tsx](../frontend/src/ui/MainMenu.tsx)) | Duplicated consumer/preloader; stable redirect path; reveal proxy is not paint acknowledgement | P0 | Shell manifest pins immutable URLs; the real button/image consumers acknowledge one complete shell frame |
| Menu backdrop | `main.tsx` preloads one stable AVIF URL; CSS declares AVIF/WebP/PNG stable alternatives; `SceneBackdrop` separately resolves six immutable animation sheets; a singleton DOM tree preserves route continuity ([main.tsx](../frontend/src/main.tsx), [style.css](../frontend/src/style.css), [SceneBackdrop.tsx](../frontend/src/ui/SceneBackdrop.tsx)) | Mixed stable/immutable identities and competing discovery paths; singleton continuity itself is canonical | P1 | One shell/background manifest pins the chosen still format and sheets; retain the singleton and one frame acknowledgement |
| Rain ambience | Homepage initialization injects vendored JS/WASM totaling about 3.6 MB and starts a continuous decorative canvas client ([HomepageBackdrop.tsx](../frontend/src/ui/HomepageBackdrop.tsx), `frontend/public/ambience`) | Separate executable runtime, eager on homepage family, intentionally fail-soft; not coordinated with surface readiness | P2 | Keep decorative and non-blocking; explicitly schedule after the shell frame and expose degraded/absent state only in diagnostics |
| Fonts | CSS references stable `/assets/fonts/...` URLs. They resolve through the backend redirect path independently of catalog hydration and layout readiness ([style.css](../frontend/src/style.css)) | CSS-owned late dependency; fallback-font/layout-change risk; backend-start race in development | P0 | Shell manifest or server-emitted startup CSS pins immutable font URLs; await layout-critical faces before shell frame, leave noncritical faces opportunistic |
| Level-list thumbnails | `LevelThumbnail` observes proximity, reconstructs the complete board, loads all board sources, canvas-renders, PNG-encodes, creates a temporary object URL, then mounts another lazy Image. Cache is in-memory/refcounted and is revoked after consumers leave ([LevelThumbnail.tsx](../frontend/src/render/LevelThumbnail.tsx), [bakeBoardThumbnail.ts](../frontend/src/render/bakeBoardThumbnail.ts)) | Authoring/full-render pipeline leaking into runtime; double lazy gate; nonpersistent derivative | P0 | Persist immutable size/DPR thumbnail derivatives at canonical save/publish; initial viewport loads those exact rasters; below-fold rows load opportunistically |
| Existing server thumbnails | Backend already renders `/assets/level-thumb/<id>.png` on demand into a 24 MiB memory cache, but only supports official IDs/public map IDs and ordinary in-app lists do not use it ([server.js](../backend/server.js)) | Parallel unused delivery path; on-demand generation is not durable derivative publication | P0 | Reuse the canonical server render plan at mutation time, store content-addressed variants, return immutable URLs in level summaries; retire ordinary client baking and the redundant on-demand-only path |
| Selected-level preview | `LevelPreviewColumn` mounts a full live `StudioReadOnlyBoard` with pan/zoom and separate terrain/scene canvas lifecycles ([LevelPreviewColumn.tsx](../frontend/src/ui/LevelPreviewColumn.tsx)) | Full renderer is justified by interactivity, but it has no unified manifest/frame gate | P1 | Selected-level manifest + shared decoded resources + one preview compositor acknowledgement; keep live interaction |
| Board preload gate | `collectBoardArt` discovers resources only after the concrete board is built and mounted. `useBoardArtReveal` decodes them in temporary Image objects and releases the route veil when those proxies settle ([SkirmishBoard.tsx](../frontend/src/render/SkirmishBoard.tsx), [boardArtReady.ts](../frontend/src/render/boardArtReady.ts)) | Late discovery; duplicated loader; false readiness boundary | P0 | Resolve a level-scoped manifest before renderer mount; actual renderers consume the same resource records; veil waits for the board compositor |
| Terrain canvas | `BoardTerrainLayer` maintains its own uncached Image lifecycle per signature and paints after `Promise.all` ([BoardTerrainLayer.tsx](../frontend/src/render/BoardTerrainLayer.tsx)) | Independent cache and readiness; races DOM overlays and preload proxy | P0 | Shared decoded-image resource manager; canvas reports composition into the owning board/preview frame boundary |
| Scene/prop/cover canvas | `BoardCanvasLayer` has a module cache of Image promises and paints independently of terrain ([BoardCanvasLayer.tsx](../frontend/src/render/BoardCanvasLayer.tsx)) | Better local reuse, but parallel cache and compositor with no aggregate readiness | P0 | Same shared resource manager and board compositor; no independent reveal authority |
| Units | A separate required unit catalog supplies accepted sprite URLs and geometry. Unit Images render through DOM while terrain/scene use canvases. Only units present in the mounted board are collected by the late board gate ([unitCatalog.ts](../frontend/src/ui/unitCatalog.ts), [SkirmishBoard.tsx](../frontend/src/render/SkirmishBoard.tsx)) | Valid typed authority, fragmented composition/readiness | P1 | Retain typed unit authority; include present-unit immutable URLs in the pre-mount level manifest and aggregate their real paint acknowledgement |
| HUD portraits/backdrops | Once a board exists, `Skirmish` creates temporary Images to warm all roster portrait masters and backdrop images before the first focus; actual HUD Images mount later ([preload.ts](../frontend/src/art/preload.ts), [Skirmish.tsx](../frontend/src/ui/Skirmish.tsx)) | Duplicated preloader/consumer; discovery occurs after gameplay mount; stable semantic URLs | P1 | Include current-roster portrait pack as surface-critical or post-board intent-critical resources in the level manifest/cache; actual HUD uses the same records |
| World backgrounds | Static registry returns stable semantic URLs; gameplay sets the world background through CSS ([backgroundSets.ts](../packages/board-render/src/art/backgroundSets.ts), [Skirmish.tsx](../frontend/src/ui/Skirmish.tsx)) | CSS consumer outside renderer acknowledgement; route-late discovery | P1 | Level manifest pins the selected immutable world raster and includes it in battlefield frame readiness |
| Terrain/feature/wall drawable projection | Postgres owns installed drawable records and the startup drawable catalog projects them into deterministic render geometry with immutable media URLs ([drawableCatalog.ts](../packages/board-render/src/art/drawableCatalog.ts), [tileset.ts](../packages/board-render/src/art/tileset.ts)) | Canonical ownership and immutable identity are now correct; the projection is still globally loaded and its consumers do not share one decoded-resource/compositor boundary | P1 | Preserve the database authority; derive bounded level manifests from the same catalog revision and share their resource records through composition and reveal |
| Props/doodads/seats | Complete prop-seat configuration blocks global startup because definitions derive raster dimensions at module/import time; actual images then load in board/preview consumers ([propSeats.ts](../frontend/src/net/propSeats.ts), [main.tsx](../frontend/src/main.tsx)) | Domain configuration coupled to global module initialization | P1 | Make prop definitions accept an explicit hydrated domain projection; load seats with surfaces that can contain props, not before every shell |
| Editor palette thumbnails/icons | Numerous square runtime derivatives are addressed through stable paths and ordinary Images; editor itself is held by document hydration rather than a complete chrome/palette/board frame | Many independent late consumers | P1 | Editor manifest separates initial viewport/palette assets from opportunistic catalog art; one editor compositor gates initial reveal |
| Studio catalogs/review assets | Catalog grids largely use immutable URLs and browser lazy loading. Candidate/private media intentionally uses noncacheable authenticated URLs. Several Labs use local Image/canvas composition because they are calibration instruments | Mostly canonical for an authoring instrument; not appropriate as a runtime model | P2 | Preserve explicit authoring loaders inside Studio, but prevent their reuse by player-facing primitives; initial visible catalog cards still need a viewport readiness policy |
| Audio | BGM streams on demand with `preload="none"`; SFX initializes on gesture and media is live-catalog-backed | Correctly non-blocking in principle; generic catalog metadata still makes audio slots part of global authority hydration | P2 | Keep media fetching non-blocking; move profile/slot projection outside shell-critical startup |
| Immutable media delivery | Public immutable reads query metadata, fetch the whole Blob through the app backend on cache miss, verify SHA-256, retain up to 32 MiB in an in-process LRU, then send a year-cacheable response ([server.js](../backend/server.js)) | Correct immutable semantics; expensive proxy/cache topology may churn, but this is secondary to path correctness | P2 | Preserve content identity; evaluate CDN/direct controlled delivery or larger/shared cache only after manifests eliminate unnecessary requests |
| Stable semantic delivery | Every `/assets/<slot>` request performs backend slot resolution and a no-cache 302 to the immutable URL ([server.js](../backend/server.js)) | Correct mutable entry point, inappropriate inside a pinned multi-resource frame | P1 | Use stable URLs for entry/discovery only; manifests and composed frames use immutable URLs from one revision |
| Failure handling | Preload failures often resolve as success; board and entrance failsafes silently reveal after timeouts; some decorative domains omit honestly while critical startup has one coarse global error | Missing resource can become partial frame; degraded is conflated with ready | P0 | Critical manifest failure produces one deliberate surface-level error/retry state; failsafe is explicitly degraded and never a painted-frame acknowledgement |

## What is canonical and should be preserved

The audit is not a mandate to replace everything:

- Postgres active pointers plus immutable content-addressed media are the correct authority.
- Stable semantic slots are correct discovery identities.
- Deterministic geometry and render plans belong in code.
- The shared homepage backdrop singleton correctly preserves continuity.
- The typed unit catalog correctly owns unit-specific completeness and geometry.
- `BoardCanvasLayer`'s promise cache demonstrates the right reuse shape, but it must become
  the shared primitive rather than one of several caches.
- Studio calibration tools are allowed to compose client-side because composition is their
  purpose; player-facing surfaces may not inherit that cost/path.

## Required architecture

```text
semantic content + active pointers
                │
                ▼
       bounded surface manifest
  immutable URLs · dimensions · byte sizes
  tier · required/optional · renderer role
                │
                ▼
       shared resource manager
 fetch promise · decode promise · failure state
 browser HTTP cache remains byte authority
                │
                ▼
       actual surface compositors
 shell · thumbnail image · board · editor
                │
                ▼
       complete-frame acknowledgement
                │
                ▼
        one atomic reveal boundary
```

There are three bounded manifest families:

1. **Shell manifest:** layout fonts, installed chrome derivatives, navigation icons, and
   the selected initial backdrop frame/sheets.
2. **Level summary manifest:** immutable 1x/2x list thumbnail URLs plus level summary data.
3. **Level surface manifest:** selected level data, world background, unique terrain faces,
   features, barriers, props, cover, present units, and initial HUD portrait resources.

Studio/admin manifests remain domain-specific because they include candidates and review
metadata that players must never download.

## Migration order and exit gates

### 1. Shell and menu

- Stop importing/rendering the real App behind the complete generic media, drawable,
  and unit projections.
- Stop canvas/data-URL chrome composition during ordinary startup.
- Pin shell resources to one manifest revision and reveal after the actual shell frame.
- Gate: no fallback font, unskinned button, icon pop, or background adjustment is visible.

### 2. Level lists and thumbnails

- Publish immutable thumbnail variants at canonical save/publish.
- Add their URLs to official, personal, draft-authorized, lobby, Gym, Game Lab, and Solver
  summary projections according to each content authority.
- Retire `LevelThumbnail` client baking from ordinary lists; retain an explicitly named
  authoring preview primitive where unsaved local pixels genuinely require it.
- Gate: every initially visible row has a complete raster before list reveal; scrolling does
  not invoke a board renderer.

### 3. Gameplay board and selected previews

- Introduce the level surface manifest and shared decoded-resource manager.
- Resolve all stable terrain/feature/barrier identities to immutable URLs once.
- Make terrain, scene, unit, overlay, and world layers report to one compositor boundary.
- Delete the proxy Image preload gate after consumers use the shared records.
- Gate: no overlay or unit can appear before terrain; no board resource is first discovered
  after reveal; missing critical media yields one deliberate board error.

### 4. Editor

- Reuse the level manifest/resource manager and add editor chrome/palette tiers.
- Preserve unsaved live authoring but separate its preview derivatives from canonical list
  thumbnails.
- Gate: editor chrome, initial palette, and board appear as one coherent operated surface.

### 5. Secondary cleanup

- Move SFX/profile, prop seats, and non-shell domain projections out of global startup.
- Normalize CSS/font/background consumers onto manifest-pinned immutable identities.
- Tune backend/CDN/cache topology only after request membership is correct.

## Decisions needed before implementation

The audit finds no need to change ADR-0085's storage authority. Implementation does require
ADR-0107 to specify that a canonical runtime path includes a bounded manifest and that
authoring composition may not serve ordinary presentation. Thumbnail persistence also needs
one explicit mutation/versioning decision covering official levels, user canonical levels,
authorized working-copy cards, and public maps. Those decisions should be recorded before
the P0 migrations rather than embedded silently in endpoints.

