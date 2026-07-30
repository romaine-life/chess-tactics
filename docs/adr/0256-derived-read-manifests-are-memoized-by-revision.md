# Derived read manifests are memoized by revision; derivation runs on change, never per read

- Status: accepted
- Date: 2026-07-30

## Context

Level thumbnails are derived artifacts: content-addressed PNGs whose derivative rows
(`level_thumbnail_derivatives`) are keyed by an exact dependency fingerprint
([ADR precision established by PR #545]) so that a thumbnail re-renders only when its
level or the specific art it references actually changes. That write-side design is
correct and is not changed by this record.

The read side had no equivalent. `GET /api/official-campaigns/:id` and
`GET /api/campaign-workspace` assembled their `thumbnail_urls` manifest by re-deriving
every level's fingerprint from first principles on every request: load the full
renderer snapshot, project a complete render plan per level inside one synchronous
critical section, hash it, and compare against the stored derivative. Verification
cost the same as the work it guarded. Measured in production on 2026-07-30 (40
official levels, 100m CPU limit): 26.8s and 35.3s per request against a 15s gateway
timeout. The endpoint could never answer through the gateway, and because the
per-level loop never yielded, every concurrent request — artwork, static files, the
index page — froze behind it and returned 504. The visible symptom was the scene
error screen ("Play content could not be reached") on Play and on artwork-heavy
screens.

Every input to that computation is already revision-tracked: the officials portfolio
and each user workspace carry a document `revision`; the media, drawable, and unit
catalogs and the prop-seats document each maintain a revision that bumps only on
mutation; the renderer contributes `BOARD_THUMBNAIL_RENDER_REVISION` and the
dependency schema version. The assembled manifest is a pure function of that tuple.

## Decision

1. **Reads consult a revision-keyed memo** (`backend/revisionMemo.js`, instantiated
   in `server.js` as the thumbnail-manifest memo). The memo key is the authority
   (`official:<id>` / `user:<email>`); the validity check is the document revision
   plus one string that concatenates all catalog/renderer revisions, fetched with a
   single cheap UNION query. Tuple unchanged → serve the retained manifest with zero
   per-level work.
2. **Stale-while-revalidate within the same document revision.** If only catalog
   revisions moved, the level set is identical and every retained URL is
   content-addressed and immutable, so the previous manifest is served immediately
   while a single-flight background pass recomputes. A changed *document* revision
   (levels added/edited/removed) computes inline instead — never serve a manifest
   from a different level set than the body beside it.
3. **Partial manifests never settle.** If any level lacks a current derivative
   (e.g. a render failed), the result is retained but marked unsettled, served
   fast, and re-attempted in the background on subsequent reads — preserving the
   pre-existing self-heal behavior without re-imposing the per-read cost.
4. **The per-level plan/fingerprint pass yields.** `prepareLevelThumbnailEntries`
   awaits back to the event loop between levels (still inside the render critical
   section, which other render users already queue on), so a cold pass can never
   again starve unrelated requests.
5. **The officials manifest warms itself.** After the database becomes ready at
   boot, the server computes the officials manifest in the background so the first
   reader after a deploy does not pay the cold pass.
6. **Slow requests are visible.** Any request slower than `SLOW_REQUEST_LOG_MS`
   (default 2000ms) logs method, path (never the query string — editor URLs carry
   private document ids), status, and duration. A 27-second endpoint must scream in
   the pod log before a person finds it.
7. **The pod gets honest resources.** `k8s/templates/deployment.yaml` raises the
   CPU request to 100m and the limit to 1000m (the node ran ~16% actual CPU with
   this workload throttled in 80% of scheduler periods), and the liveness probe
   timeout rises from 1s to 5s so a busy-but-alive process is not killed mid-use.

## Consequences

- Steady-state reads of Play/officials/workspace content cost one document read,
  one revision query, and response serialization. The 40-level derivation runs only
  after an actual content mutation (officials publish, art acceptance, catalog
  edit, renderer bump) or on the first read of a never-memoized workspace.
- Thumbnails may briefly (one background pass) reflect the previous art version
  after a catalog mutation. They can never mismatch the level set, because
  document-revision changes compute inline.
- The memo is in-memory and single-replica, which is a standing invariant of this
  deployment (the netplay relay already requires `replicas: 1`). A restart empties
  it; boot warmup restores officials before players notice, and user workspaces
  warm on their owner's first read.
- `predrawnArchiveUpgradePath.test.js` and `thumbnailAvailability.test.js` assert
  on `server.js` source structure around the touched functions; the memo wraps
  `storedLevelThumbnailUrls` rather than replacing it, and `revisionMemo.test.js`
  pins the route wiring the same way so it cannot silently un-wire.
