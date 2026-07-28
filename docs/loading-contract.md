# Loading contract

Derived from [ADR-0136](adr/0136-loading-is-manifest-driven-and-frame-acknowledged.md)
and [ADR-0193](adr/0193-navigation-loads-atomic-scenes-through-one-director.md).

## Readiness vocabulary

- **Discovered:** the stable resource identity is known.
- **Fetched:** bytes reached the browser; cache provenance remains visible.
- **Decoded:** bytes can be consumed as pixels or structured data.
- **Composed:** the actual surface renderer consumed every critical resource.
- **Painted:** the browser presented the compositor's complete frame.
- **Revealed:** the owning transition boundary exposes that painted frame.

Only `painted` can satisfy surface readiness. A timeout is `degraded`, not `painted`.

## Resource tiers

| Tier | Examples | Required behavior |
| --- | --- | --- |
| Shell-critical | installed chrome, layout fonts, primary navigation icons, initial backdrop frame | Known before shell reveal; globally reusable |
| Surface-critical | visible thumbnails, selected level data and a bounded projection of database-owned drawable/media records, route-specific chrome | Loaded in parallel before the surface reveal |
| Opportunistic | below-fold thumbnails, next campaign level, likely alternate assets | Scheduled after the complete first frame |

## Instrumentation

All loading phases use the shared `loadingTimeline` primitive and the browser's monotonic
performance clock. Network observations include transfer and decoded sizes, cache-hit
evidence, initiator, protocol, duration, and the scene that owned the request at its
start time. Every same-origin API request and runtime asset/font/code resource is
eligible evidence; the Lab never labels a request count that silently excludes data
authorities. Manual lifecycle marks name a stable surface and phase, including
superseded-generation cancellation and retry generation. The Loading Lab in Studio is
the canonical inspection and JSON-export surface.

The required representative traces are cold and warm versions of:

1. Main menu shell and buttons.
2. Play menu with its initially visible thumbnails.
3. A canonical `/play` level through the board's first complete frame.
4. A canonical Level Editor document through its first complete frame.

The canonical capture tool distinguishes these modes explicitly: `--cold` disables
the browser cache, while `--warm` first completes the same route in the same browser
and then reloads it with that populated HTTP cache. A fresh default browser process
is not accepted as evidence of a warm journey.

## Scene lifecycle

`SceneDirector` is the only route-level transition authority. A destination declares
one `SceneManifest`; `SceneBoundary` keeps the complete destination hidden and inert
until its required paint owner and every registered participant report a drawable
frame. Navigation retains the outgoing background and follows:

`current → exiting → loading → destination-painted → entering → current`

Repeated navigation to the active destination is idempotent. A later destination
cancels the old generation. Failure terminates at one director-owned retry surface;
a React-tree failure terminates at one root retry surface rather than a blank page.

Title-bar contributions discover targets inside their own committed scene. DOM-node
refs are never lifted into the director, because portal attachment must not mutate the
route lifecycle during the same React commit.

## Migration order

1. Instrument without changing reveal behavior.
2. Make shell-critical chrome atomic.
3. Replace ordinary client-baked list thumbnails with immutable stored variants.
4. Introduce level-scoped manifests and a shared decoded-resource cache.
5. Move board/editor reveals to actual compositor acknowledgement.
6. Optimize redirects, backend/Blob delivery, compression, and cache budgets from traces.

## Implemented system

- Cold startup owns a static loading presentation in the initial HTML, before the
  application module graph. That document requests and verifies the final layout font
  before exposing `Loading...`; React adopts and removes the same node instead of
  replacing it, so neither a blank interval nor fallback-font flash can occur.
- The initial document also requests one bounded database projection for the homepage
  scene. That projection identifies the live immutable background without hydrating the
  global catalogs, and starts its high-priority fetch and decode before the application
  module. App reuses that acquisition while it hydrates the remaining live authorities
  and installed chrome. Critical failure stays on one explicit retry surface.
- The SceneDirector reducer also owns the cold-home startup ladder. Its `startup` phase
  accepts background, title, and controls readiness acknowledgements in any arrival
  order but reveals them only in that order with the required fade and beat. It cannot
  report `current` until the controls fade finishes. Startup failure and retry advance
  the same generation authority; there is no independent cold-reveal store.
- The homepage background acknowledges its real CSS consumer after two browser paint
  opportunities. Retry explicitly re-arms that consumer, because a recovered image
  decode does not by itself repaint a background declaration whose first request failed.
- Canonical level summaries project immutable Blob-backed list-thumbnail URLs. Missing or
  stale derivatives are generated server-side and published content-addressably; ordinary
  player lists never reconstruct boards in the browser. Derivative freshness is a pure
  version of the canonical level document plus its live prop-seat, unit, media, and drawable
  authority revisions; it never depends on mutable renderer-process state.
- Per ADR-0193, list derivatives are fixed 3:2 renders of the shared playable-board opening
  frame rather than opaque-pixel or full-generated-scene crops. A framing-policy change bumps
  the renderer revision: reads repair stale derivatives and save/publish prepares the current
  version without regenerating accepted board artwork.
- Initially presented level cards are one surface: the list remains hidden and inert until
  every expected thumbnail has painted, or it presents one retryable error.
- Persisted Campaign Editor rows consume the same immutable database-backed derivatives
  as player lists. Only a genuinely unsaved/new level without a canonical derivative may
  use the authoring-only client bake. The selected live-board preview separately waits for
  both terrain and scene compositor acknowledgements.
- The complete Play selector is one DOM surface: canonical hydration, rendered image
  consumers, and computed CSS image consumers settle before its columns reveal together.
- The top-level installed Play destination is `/play/select/skirmish`. Opening it from
  the main menu preserves the already-painted homepage scene; it does not unmount the
  menu family or route through the bare `/play` battlefield while the selector loads.
- Terrain and scene canvases share decoded image records and acknowledge their actual first
  composition to the board boundary. The board reveals only after terrain, barrier, and
  scene acknowledgements and a browser paint opportunity.
- A playable board includes its first-frame HUD and title controls. The battle clock remains
  paused until board compositors and HUD resources have painted and the complete surface is
  revealed; network or asset latency is never charged as player thinking time.
- Readiness timeouts were removed from menu, route, screen, and board boundaries. A failed
  critical resource is an error, never synthetic readiness.
- Every route family resolves through `sceneManifest`; unmatched routes explicitly
  inherit the main-menu scene rather than escaping enrollment.
- Data-backed Studio viewers enroll their own initial authorities. Game Lab waits for
  campaign hydration plus account/run metadata; Gym waits for campaign hydration,
  opening-book authority, and worker readiness; the Solver waits for campaign hydration
  and, on its Run tab, the initial server run list.
- Campaign Editor waits for official/private hydration and visible recent drafts.
  Level Editor waits for its durable document, both board compositors, scene canvas,
  visible chrome, and the first palette viewport. Lobbies wait for identity, the
  initial list, and the visible level-thumbnail group. Studio, portrait, and
  pre-drawn reference routes publish named paint owners.
- Private account thumbnails retain owner-only delivery while accepting the same
  account-local level-ID grammar as the workspace. The client accepts only strict
  same-origin public-media or owner-scoped immutable derivative identities.
- The initial viewport is critical. Canonical thumbnails begin unloaded, acquire on
  proximity, and only rows actually intersecting the clipped scroll viewport participate
  in the selector frame. The 200px proximity window remains opportunistic prefetch; it is
  never promoted into a critical requirement that a clipped row cannot satisfy. Below-fold
  cards retain fixed geometry and remain opportunistic.
- Loading Lab shows the active scene lifecycle, manifest tiers, participants, resource
  timings, cache evidence, cancellations, retries, failures, generation identity, and
  painted acknowledgement.
- Canonical application captures fail closed until the director reaches `current` or a
  deliberately allowed coherent `error` state. A plain screenshot can no longer turn a
  still-loading frame into completion evidence.

The homepage now has a bounded bootstrap projection, but render-module installation still
requires complete global catalogs. The next architectural reduction is to extend bounded
shell/level manifests beyond that first background so complete projections no longer block
every route. That optimization may reduce latency but must not weaken the atomic frame
rules above.

Surface manifests are delivery projections only. Postgres remains the installed-content
authority and Blob storage remains the media-byte authority under ADR-0106 and ADR-0085.

