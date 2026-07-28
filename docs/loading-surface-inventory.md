# Loading surface inventory

Status: re-audited 2026-07-28 against the ADR-0189 scene system in this worktree.

This is the live migration ledger. A route is enrolled only when it declares a
manifest, names its paint owner, has an explicit terminal failure, and cannot expose
interactive or partial first-frame content.

## System inventory

| Surface | Authority and first-frame rule | Status |
| --- | --- | --- |
| Startup | Initial HTML owns a final-font static loading presentation and requests a bounded database projection of the live homepage background before the application module and global catalogs. React adopts that presentation while remaining authorities and installed chrome settle. The SceneDirector then owns one explicit `startup` phase and reveals painted background, beat, title, beat, controls before it may report `current`; failure/retry uses the same generation authority. | Enrolled |
| Navigation | One reducer owns generation, cancellation, exit, load, paint, entrance, retry, and current state. Duplicate destination intents are idempotent. | Enrolled |
| Background | The outgoing background remains painted until the complete incoming scene enters over it. Homepage destinations are raised above retained battlefield/tool backgrounds so both transition directions use destination-over-source layering. | Enrolled |
| Title bar | One structural title bar belongs to the scene. Typed contributions portal into scene-local targets without mutating the director during ref commits. | Enrolled |
| DOM scenes | `SceneBoundary` inventories first-viewport `<img>` and CSS image consumers, decodes them through the shared cache, and waits two paint opportunities. | Enrolled |
| Canvas scenes | Terrain, barriers, scene art, gameplay HUD, and Level Editor canvases publish actual compositor acknowledgement. | Enrolled |
| Failure | Critical failure becomes one coherent director retry surface. An unexpected React failure becomes one root retry surface, never an empty root. | Enrolled |
| Diagnostics | Loading Lab records scene phases/generations, manifest tiers, participants, all same-origin API/runtime resources with owning-scene attribution, sizes/cache provenance, acknowledgement, cancellation, retry, and errors. | Enrolled |
| Global catalog payload | Startup still hydrates complete database-owned media and drawable projections because render modules derive installed inventories at import time. | Correct but over-broad; performance reduction remains |

## Route-family inventory

| Route family | Required owner / critical composition | Status |
| --- | --- | --- |
| `/`, `/main-menu`, `/menu-next` | DOM: homepage background, final-font title bar, main controls | Enrolled |
| `/play/select/*` and menu Play destination | `play-selector`: official/private workspace authority, selector chrome, first-viewport immutable thumbnails | Enrolled |
| `/play` canonical level | `gameplay-hud`: level snapshot, terrain/barrier/scene compositors, visible units/overlays, HUD and title controls | Enrolled |
| `/editor`, campaign aliases | `campaign-editor`: official/private campaign authority and visible draft cards | Enrolled |
| `/editor/level` and aliases | `level-editor`: durable document, terrain/scene compositor frames, visible editor chrome and palette viewport | Enrolled |
| `/lobbies/*` | `lobbies`, plus nested visible picker: identity, first lobby list, visible controls and thumbnails | Enrolled |
| `/studio*` and tool aliases | `studio`: tool chrome, selected viewer, visible catalog slice; data-backed deep links additionally wait for campaign/account/run authorities and worker readiness; below-fold catalog is opportunistic | Enrolled |
| `/predrawn-reference` | `predrawn-reference`: selected artwork/capture frame and tool chrome | Enrolled |
| `/portrait-editor` | `portrait-editor`: selected artwork/canvas and tool chrome | Enrolled |
| `/settings/*`, `/party` | Explicit DOM manifest with stable local controls; user-requested secondary fetches remain progressive inside the complete scene | Enrolled |
| Unknown route | Explicitly resolves to the main-menu manifest and renderer | Enrolled |

## Thumbnail delivery audit

- Official derivatives use immutable public `/api/media/<sha256>` identities.
- Private derivatives use authenticated
  `/api/campaign-workspace/level-thumbnails/<account-local-level-id>/<sha256>.png`
  identities and re-prove current ownership, content version, and Blob hash.
- Runtime list thumbnails never fall back to a client board bake. Missing canonical
  derivatives fail the owning surface.
- Persisted Campaign Editor rows also use canonical derivatives. Its local bake path is
  limited to new/unsaved levels for which no derivative exists.
- First-viewport thumbnails are critical. Below-fold derivatives acquire on proximity
  and keep reserved geometry.
- Authoring-only unsaved previews may still bake locally; their owning authoring
  surface decides whether a visible preview is critical.

## Remaining performance work

Correctness no longer depends on this reduction. The bounded homepage bootstrap projection
now starts the live 2.58 MB background before the application module and roughly 20 seconds
before complete catalogs in the throttled regression trace. Initial startup still transfers
complete media and drawable catalogs (roughly 1.3 MB and 0.9 MB uncompressed in the current
development dataset) before importing render modules. The next design step is to extend
bounded shell/route projections with stable revision keys, followed by deferred catalog
expansion and evidence-led media compression. It must preserve Postgres/Blob authority and
the exact atomic-scene rules; it is not permission to reveal partial UI sooner.

## Regression matrix

The required release journeys are:

1. Cold and warm main menu, including final-font and ordered startup assertions.
2. Main-menu click into each Play selector mode with background continuity.
3. Authenticated selector with private and official first-viewport derivatives.
4. Canonical gameplay through complete board plus HUD paint.
5. Canonical Level Editor document through complete board/chrome paint.
6. Studio Loading Lab with declared manifest and terminal acknowledgement.
7. Injected critical failure and retry generation.
8. Retarget/back navigation while a destination is acquiring.

The terminal-scene visual matrix additionally covers every renderer family and
deep-link alias: main-menu fallbacks, Settings and Tracks, Party, Campaign Editor,
Lobbies, gameplay, Level Editor, pre-drawn reference, Portrait Editor, Studio,
Tileset Studio, Unit Studio, nine-slice, prop seat, tile compare, surface tiles,
scene animation, doodad editor, artwork compare, standalone drawable/wall tools,
and the data-backed Game Lab, Gym, Solver, and Loading Lab viewers. Each application
capture now waits for `current` (or an explicitly requested coherent `error`) before
pixels can count as evidence.

Feature completion still requires owner verification in the running application.
