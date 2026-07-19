# Loading contract

Derived from [ADR-0136](adr/0136-loading-is-manifest-driven-and-frame-acknowledged.md).

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
evidence, initiator, protocol, and duration. Manual lifecycle marks name a stable surface
and phase. The Loading Lab in Studio is the canonical inspection and JSON-export surface.

The required representative traces are cold and warm versions of:

1. Main menu shell and buttons.
2. Play menu with its initially visible thumbnails.
3. A canonical `/play` level through the board's first complete frame.
4. A canonical Level Editor document through its first complete frame.

## Migration order

1. Instrument without changing reveal behavior.
2. Make shell-critical chrome atomic.
3. Replace ordinary client-baked list thumbnails with immutable stored variants.
4. Introduce level-scoped manifests and a shared decoded-resource cache.
5. Move board/editor reveals to actual compositor acknowledgement.
6. Optimize redirects, backend/Blob delivery, compression, and cache budgets from traces.

## Implemented baseline

- Shell startup hydrates its required live authorities, layout font, and installed chrome
  before App's first commit. Critical failure stays on one explicit retry surface.
- Canonical level summaries project immutable Blob-backed list-thumbnail URLs. Missing or
  stale derivatives are generated server-side and published content-addressably; ordinary
  player lists never reconstruct boards in the browser. Derivative freshness is a pure
  version of the canonical level document plus its live prop-seat, unit, media, and drawable
  authority revisions; it never depends on mutable renderer-process state.
- Initially presented level cards are one surface: the list remains hidden and inert until
  every expected thumbnail has painted, or it presents one retryable error.
- Terrain and scene canvases share decoded image records and acknowledge their actual first
  composition to the board boundary. The board reveals only after terrain, barrier, and
  scene acknowledgements and a browser paint opportunity.
- Readiness timeouts were removed from menu, route, screen, and board boundaries. A failed
  critical resource is an error, never synthetic readiness.

The next architectural reduction is a bounded shell/level manifest so complete global
catalog projections no longer block every route. That optimization may reduce latency but
must not weaken the atomic frame rules above.

Surface manifests are delivery projections only. Postgres remains the installed-content
authority and Blob storage remains the media-byte authority under ADR-0106 and ADR-0085.

