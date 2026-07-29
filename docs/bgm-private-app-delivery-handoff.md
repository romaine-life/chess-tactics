# BGM Private, App-Driven Delivery — Implementation Handoff

## Read this first

This is a self-contained handoff for an agent implementing background-music
delivery. It is intentionally separate from the scene/loading-system work so
that the loading work can continue without carrying the BGM infrastructure
discussion in its context.

Before changing code:

1. Read repository-root `AGENTS.md` and `CLAUDE.md` completely.
2. Start with `git status --short --branch`; preserve every pre-existing edit.
3. Fetch and compare with current `origin/main` before making repository-wide
   claims.
4. Read:
   - `docs/bgm-audio.md`
   - `docs/runtime-asset-contract.md`
   - `docs/persistence.md`
   - `docs/adr/0085-runtime-assets-are-live-storage-backed.md`
   - `docs/adr/0044-persistent-mute-control-in-the-trailing-cluster.md`
   - the BGM entries in `docs/adr/decision-log.md`
5. Inspect the current implementations rather than assuming this handoff still
   matches line numbers:
   - `backend/server.js`
   - `backend/smoke-test.js`
   - `frontend/src/bgm.js`
   - `frontend/src/ui/Settings.tsx`
   - `frontend/vite.config.js`
   - `tofu/storage.tf`
   - `k8s/values.yaml`
   - `k8s/templates/deployment.yaml`
   - `tools/bgm/sync-metadata.mjs`
   - `.github/workflows/sync-bgm-metadata.yml`

This is a significant delivery/security decision. Record it in a new accepted
ADR, add it to `docs/adr/decision-log.md`, and update the living contracts as
part of the implementation. Do not silently mutate the decision text of an
accepted ADR. Determine whether the new ADR refines the BGM exception in
ADR-0085 or supersedes a specific clause, and record that relationship
accurately.

---

## Owner intent

The soundtrack should be **app-deliverable**, including to visitors who are not
signed in.

That means:

- the app/backend decides what tracks exist and which track bytes a browser may
  request;
- the Blob container is private;
- the frontend is not configured with a storage base URL;
- the browser does not enumerate storage;
- the repository and frontend bundle contain no music bytes or fallback
  playlist;
- anonymous users can listen normally;
- authenticated users do not get a different basic playback transport merely
  because they are authenticated;
- Azure Blob Storage, not the application pod, carries normal audio byte
  delivery and range traffic;
- the design must leave room for a CDN/custom media domain later without
  changing the frontend player contract.

“Private” here does **not** mean DRM or secrecy from a listener. Any browser that
can play audio can capture the delivered bytes. The objective is private storage
and app-controlled discovery/capability issuance, not impossible protection
against an authorized listener copying audio.

---

## Current state and the architectural mismatch

The current production path is approximately:

```text
Browser
  │
  ├── GET /api/bgm
  │      │
  │      └── Backend lists Blob with workload identity
  │
  └── <audio src="https://...blob.core.windows.net/bgm/file.mp3">
         │
         └── Anonymous public-read Blob delivery
```

Current facts to verify in the code:

- `BGM_BASE_URL` is configured in Kubernetes.
- The backend uses its workload identity to list the container and read track
  metadata.
- `GET /api/bgm` returns absolute permanent Blob URLs.
- The browser streams those URLs directly.
- `tofu/storage.tf` provisions the `bgm` container with anonymous blob-read
  access (`container_access_type = "blob"`).
- The container is not anonymously listable, but any known Blob URL is
  permanently readable.
- The frontend already treats `/api/bgm` as the app-owned playlist contract, but
  the returned track URL escapes that boundary.
- Local development has historical special handling which may proxy the
  deployed `/api/bgm`; inspect current `frontend/vite.config.js` before deciding
  what remains necessary.

This is why a frontend BGM base URL ever appeared necessary: the browser was
made responsible for constructing or consuming permanent public Blob URLs.
That is the part to retire.

The current living documentation is internally tense:

- `docs/runtime-asset-contract.md` describes BGM as a backend-listed **private**
  Blob container with an existing range-streaming projection.
- `docs/bgm-audio.md`, `backend/server.js`, Terraform, and Kubernetes describe
  and implement a **public-read** container.

The implementation agent must resolve this discrepancy explicitly in the ADR
and update the stale documents. Do not preserve both interpretations.

---

## Required target architecture

Use a private Azure Blob container plus an anonymous, app-owned playback route
that issues a narrowly scoped, short-lived read capability and redirects the
browser to Blob Storage.

```text
                         authenticated infrastructure calls
                        ┌────────────────────────────────────┐
                        │                                    ▼
Browser ── GET /api/bgm ──▶ Chess Tactics backend ── LIST ──▶ Private BGM container
   │                            │
   │ playlist contains         │
   │ same-origin playback URL  │ validate current track
   │                            │ mint short-lived read-only SAS
   ▼                            │
<audio src="/api/bgm/tracks/<opaque-track-id>">
   │                            │
   └──────── GET/Range ────────▶│ 302/307 Location: short-lived Blob SAS URL
                                │
                                └───────────────▶ Azure Blob serves bytes/ranges
```

Properties:

- Playlist discovery remains `GET /api/bgm`.
- Playlist entries expose app-owned playback URLs, not storage URLs.
- The playback URL is same-origin and stable for the lifetime of that playlist
  identity.
- The backend validates that the opaque track ID belongs to the current
  backend-listed BGM catalog.
- On each playback-route request, the backend creates a fresh, blob-specific,
  read-only, short-lived SAS URL and redirects.
- The browser follows the redirect and Azure streams the bytes, including range
  requests.
- The container denies anonymous Blob reads and anonymous listing.
- No frontend environment variable contains the Blob base.
- No Front Door dependency is required.

### Why the playlist must not contain already-minted SAS URLs

The player shuffles tracks and loads only one track at a time. A URL included in
the initial playlist may sit unused for a long time and expire before playback.
That would create a delayed, order-dependent failure.

The playlist should therefore contain a stable route such as:

```json
{
  "tracks": [
    {
      "id": "opaque-stable-track-id",
      "title": "Track title",
      "artist": "Optional artist",
      "album": "Optional album",
      "url": "/api/bgm/tracks/opaque-stable-track-id"
    }
  ]
}
```

The route creates the SAS at request time, when the audio element actually needs
the track.

### Why the backend should redirect rather than proxy the bytes

A backend byte proxy can satisfy the product semantics, but it makes the app
pod carry:

- every byte of every stream;
- HTTP Range parsing and partial-response correctness;
- long-lived client connections;
- retry, cancellation, and backpressure behavior;
- pod bandwidth and scaling cost;
- another availability bottleneck.

The redirect keeps policy and discovery in the application while leaving bulk
byte delivery to object storage. That is the desired responsibility split.

---

## Public behavior and security boundary

### Anonymous playback is intentional

The app has anonymous visitors, so the playback route must not require an
account session. Authentication is not the security boundary here.

The boundary is:

- only a track currently present in the BGM catalog can receive a capability;
- the capability grants read access to exactly one Blob;
- it cannot list the container;
- it cannot write, overwrite, set metadata, change ACLs, or delete;
- it expires;
- it is HTTPS-only;
- the storage container itself remains private.

An anonymous person can call the app route after learning it. That is expected:
the application intentionally offers music to anonymous visitors. The
improvement is that the application owns issuance and storage no longer exposes
permanent anonymous URLs.

### Do not claim this is DRM

Do not add referer checks, browser fingerprinting, obfuscated JavaScript,
single-use tokens, or other brittle theater. Referer headers are neither a
reliable authorization boundary nor necessary for the stated intent. A user who
can listen can retain the bytes.

### Track identifiers

Do not use a raw filesystem path or allow an arbitrary Blob name in the route.
Use an opaque deterministic ID derived from the exact Blob identity—for example,
a full SHA-256 digest of a domain-separated Blob name:

```text
sha256("chess-tactics:bgm-track:v1\0" + blobName)
```

Requirements:

- no truncation unless the collision analysis is documented;
- no client-supplied name is concatenated into a Blob path;
- the ID resolves only through the backend’s current catalog/cache;
- unknown IDs return `404`;
- deleted tracks stop resolving after the catalog refresh window;
- two distinct Blob names cannot silently resolve to the same entry.

The ID is opacity and safe routing, not authorization. The short-lived SAS is
the storage capability.

---

## SAS and Azure identity requirements

Use a **user delegation SAS** minted with the backend workload identity. Do not
put a storage account key or long-lived container SAS in Kubernetes, GitHub
secrets, application settings, logs, or frontend output.

The implementation must:

- use the existing `DefaultAzureCredential`/workload-identity model;
- request or cache a user delegation key appropriately;
- generate a service SAS scoped to one Blob;
- allow read only;
- require HTTPS;
- give the validity window a small negative start-time skew to tolerate clock
  differences;
- set an expiry long enough for a track and browser range behavior, but not
  permanent;
- never log the complete redirect URL or query string.

A reasonable starting policy is:

- SAS valid from 5 minutes before issuance;
- SAS expires 2 hours after issuance;
- permission: read only;
- protocol: HTTPS only.

Treat these values as named backend constants with comments and tests. If the
actual soundtrack contains a track or browser behavior that makes two hours
insufficient, choose and document a duration from measured requirements rather
than guessing.

### RBAC warning

The current `Storage Blob Data Reader` assignment is sufficient for listing and
reading Blob data but may not grant the storage-account action required to
obtain a user delegation key. Verify the current Azure role definitions rather
than assuming.

Prefer the least-privilege solution:

1. retain data-plane Blob list/read access scoped as narrowly as Azure permits;
2. add only the account-level user-delegation-key action required for SAS
   issuance, using a purpose-built custom role if a built-in role grants
   unnecessary write/delete authority;
3. document why the role must be scoped at the storage-account level if Azure
   requires that scope;
4. add no application write or delete permission to BGM.

Terraform must own this configuration. Do not make an undocumented portal-only
role assignment.

### Delegation-key cache

Do not request a new delegation key for every audio request.

Implement a bounded in-memory cache that:

- contains the current delegation key and its expiry;
- refreshes before expiry;
- coalesces concurrent refreshes into one request;
- discards a failed in-flight refresh so a later request can retry;
- never serves a newly minted SAS beyond the delegation key’s validity;
- has focused unit tests for reuse, refresh, concurrency, and failure recovery.

Keep this primitive discoverable and testable. If the repository already has an
analogous credential or expiring-capability cache, reuse it.

---

## Backend contract

### `GET /api/bgm`

Purpose: return the current app-owned playlist and display metadata.

Expected response:

```json
{
  "tracks": [
    {
      "id": "full-opaque-id",
      "title": "Human title",
      "artist": "Optional",
      "album": "Optional",
      "url": "/api/bgm/tracks/full-opaque-id"
    }
  ]
}
```

Requirements:

- preserve the current title/artist/album behavior;
- preserve deterministic backend ordering; the player owns shuffle;
- return relative, same-origin playback URLs;
- return no Blob hostname, container name, Blob name, or SAS query;
- retain the existing short playlist-cache concept;
- on a listing failure, serve the last known good catalog if present;
- otherwise return an empty playlist if the existing BGM non-critical contract
  remains the accepted decision;
- set an explicit cache policy appropriate for catalog freshness;
- do not mint SAS URLs while producing the playlist.

The cached representation should retain the internal Blob identity needed by
the playback resolver while projecting only public metadata and app URLs to the
client.

### `GET`/`HEAD /api/bgm/tracks/:trackId`

Purpose: resolve a current track to a fresh storage read capability.

Requirements:

- accept `GET`; support `HEAD` if browser behavior or tests show it is needed;
- validate the entire ID grammar before lookup;
- resolve only against the current/last-good backend catalog;
- return `404` for malformed, unknown, removed, or non-MP3 IDs without revealing
  whether another Blob exists;
- mint a Blob-specific read-only user-delegation SAS;
- redirect to the SAS URL;
- set `Cache-Control: no-store` on the redirect so an intermediary does not hold
  an expired capability;
- do not place the SAS URL in JSON;
- do not log the `Location` value;
- do not accept a Blob name, URL, or container from the client;
- have a deliberate error response when capability issuance fails.

Use the redirect status based on verified browser/media behavior. `302` is
widely supported for media GET requests; `307` preserves the method explicitly.
Test the chosen status with the real `<audio>` element and range requests rather
than deciding only from semantics.

### Range behavior

The application route does not itself need to parse `Range` if it redirects
before serving bytes. Verify end to end that:

- the browser follows the redirect;
- Azure returns `206 Partial Content` for a valid byte range;
- seeking works;
- pausing/resuming works;
- a track does not restart unexpectedly;
- the SAS lifetime covers ongoing playback;
- expired capabilities recover on a subsequent player attempt.

Do not report completion from a successful whole-file `curl` alone.

---

## Frontend behavior

The existing player should continue to consume the app-owned playlist and set
the chosen track URL on its one `<audio>` element. Ideally the transport change
is invisible to its shuffle, mute, ownership, autoplay, and now-playing logic.

Required checks:

- `frontend/src/bgm.js` uses only the returned relative playback URL;
- Settings → Audio → track listing/play controls use the same contract;
- no frontend code reads `BGM_BASE_URL`, a Blob hostname, container name, SAS
  parameter, or storage credential;
- the persistent title-bar mute control remains one shared control as required
  by ADR-0044;
- cross-tab audio ownership remains intact;
- playlist loading does not become a scene-level blocking dependency;
- unavailable BGM remains graceful and does not interfere with critical scene
  readiness;
- token expiry or one track’s failure advances/retries according to the existing
  bounded player policy rather than creating an infinite loop.

Do not opportunistically redesign the loading/scene system in this task. BGM is
non-critical chrome and this handoff exists specifically to keep that work
separate.

---

## Local development design

Local development must exercise the same browser-facing contract:

```text
/api/bgm
/api/bgm/tracks/:trackId
```

It must not require the frontend to know the deployed Blob base URL.

The preferred local model is:

- the full local backend runs, as required by `CLAUDE.md`;
- the backend can list the live private BGM container using the worktree’s
  established Azure/application credentials if that is already supported;
- playback requests go through the local backend route and receive short-lived
  redirects;
- a deterministic mock object source remains available for smoke tests without
  Azure.

Retire any Vite-only proxy that exists solely because the old frontend needed
public production URLs, unless a still-valid test purpose requires it. Do not
keep parallel production and local playlist contracts.

For credential-free CI/smoke tests, keep a local fake that models:

- catalog listing/index input;
- stable opaque IDs;
- the app-owned playback route;
- redirect/capability behavior, or an injected signer seam;
- range-capable byte delivery where an end-to-end range assertion is needed.

Do not weaken production by adding a public-read fallback when Azure credentials
are absent. A missing backend/storage dependency should be diagnosed according
to `CLAUDE.md`.

---

## Infrastructure changes

Expected infrastructure work:

1. Change the BGM container from anonymous Blob read to private.
2. Preserve the backend workload identity’s ability to list/read BGM metadata.
3. Add the least privilege needed to request user delegation keys.
4. Ensure the metadata-sync CI identity retains only its intended immutable
   media write/read/metadata permissions; do not accidentally grant delete or
   ACL control.
5. Keep the storage base/container locator as a **backend** deployment concern.
   It may remain a backend environment value, but rename it if `BGM_BASE_URL`
   misleadingly implies a client/public base.
6. Update Kubernetes comments and values to say the container is private and
   the backend owns both listing and capability issuance.
7. Update Terraform outputs that currently call the URL “public.”
8. Confirm storage CORS settings allow the actual redirected media behavior
   needed by the audio element. Configure only required origins/methods/headers;
   do not use permissive CORS as a substitute for testing.

### Deployment ordering

Avoid an outage caused by making the container private before a deployed
backend can issue capabilities.

Use an explicit cutover plan, for example:

1. deploy backend support for app playback routes and SAS issuance while the
   old read policy still exists;
2. verify production capability issuance and range playback;
3. deploy frontend/playlist projection using app routes;
4. verify browsers no longer request permanent public Blob URLs;
5. change the container to private;
6. verify anonymous direct Blob URLs now fail while in-app anonymous playback
   succeeds;
7. remove retired compatibility code and configuration in the same migration
   sequence permitted by the repository’s migration policy.

Because this repository requires migrations to delete retired paths end to end,
do not leave a permanent dual-mode `public URL or signed URL` branch. If a
temporary staged deployment is unavoidable, name it as temporary migration
state, bound its removal, and do not present the work as complete until it is
gone.

---

## Testing requirements

### Focused backend tests

Add tests for at least:

- deterministic track ID generation;
- distinct Blob names produce distinct IDs;
- playlist returns only same-origin app playback URLs;
- playlist response contains no storage hostname or SAS query;
- valid current ID redirects;
- redirect SAS is Blob-specific, read-only, HTTPS-only, and bounded in time;
- malformed ID returns `404`;
- unknown ID returns `404`;
- deleted/non-current track stops resolving after catalog refresh;
- signer/delegation-key failure does not leak credentials;
- redirect has `Cache-Control: no-store`;
- concurrent playback requests do not stampede delegation-key acquisition;
- delegation-key refresh and failed-refresh recovery;
- playlist last-good fallback remains coherent with playback resolution.

Use dependency injection around time, catalog access, and SAS signing so these
tests do not require Azure.

### Smoke tests

Update `backend/smoke-test.js` so it no longer asserts that `/api/bgm` returns a
public base URL. It should assert the new contract end to end:

1. playlist returns two tracks with app-owned URLs;
2. each URL resolves only through the backend route;
3. a known track redirects to a bounded mock capability;
4. an unknown track does not;
5. range playback against the mock byte service returns the expected byte
   interval;
6. no storage secret or permanent public URL appears in the playlist.

### Frontend checks

Preserve and run:

- BGM shuffle invariant checks;
- frontend type/check/build commands;
- any Settings audio tests;
- a real browser playback check from both the persistent title-bar control and
  Settings → Audio.

### Infrastructure checks

Run formatting and validation for the repository’s OpenTofu and Kubernetes
workflows. Confirm the plan shows:

- BGM container access becoming private;
- only the intended role changes;
- no storage account recreation;
- no Blob deletion;
- no unrelated container policy changes.

Treat any destructive storage plan as a blocker.

---

## Manual acceptance matrix

The implementation is not complete until the owner verifies the real
application. Before handoff, the agent must verify all of the following itself
and then provide the exact development URL for owner verification.

| Scenario | Expected result |
| --- | --- |
| Signed-out first visit | App loads normally; BGM remains non-blocking |
| Signed-out user gesture | Music begins when browser autoplay policy permits |
| Signed-in user | Same playback behavior; no special storage credential in browser |
| Main menu navigation | Music and persistent mute control survive scene transitions |
| Settings → Audio | Track list loads and selected track plays |
| Cross-tab ownership | Only the elected tab plays, matching existing behavior |
| Pause/resume | Continues without a broken/expired URL |
| Seek within track | Range request succeeds and playback seeks correctly |
| Long-open tab | A track first selected well after playlist load still plays |
| Removed track | Leaves playlist after cache refresh and no longer resolves |
| Blob service/list failure | Last-good playlist or documented graceful empty state |
| SAS issuance failure | No credential leak; bounded unavailable/retry behavior |
| Direct unsigned Blob URL | Fails after private-container cutover |
| App playback URL | Produces a fresh bounded redirect and plays |
| Browser network inspection | No permanent public Blob URL; no account key/container SAS |

Inspect network requests in the real browser. A UI that appears to play is not
enough to prove that the old public path is gone.

---

## Observability

Add useful, non-sensitive operational signals:

- playlist listing success/failure and last-good fallback use;
- count of playback-capability issuance success/failure;
- delegation-key refresh success/failure;
- unknown-track requests as a counter, not verbose attacker-controlled logs;
- latency for catalog refresh and capability issuance.

Never log:

- SAS query strings;
- redirect `Location` headers;
- authorization headers;
- delegation keys;
- account keys;
- complete credential-bearing URLs.

Keep track names out of high-volume request logs if they are no longer part of
the public route.

---

## Documentation that must change

At minimum, reconcile:

- `docs/bgm-audio.md`
- `docs/runtime-asset-contract.md`
- `docs/persistence.md` if its BGM wording implies the old projection
- a new ADR plus `docs/adr/decision-log.md`
- comments in `backend/server.js`
- comments/values in `k8s/values.yaml`
- comments in `k8s/templates/deployment.yaml`
- comments/outputs in `tofu/storage.tf`
- BGM workflow/tool documentation if it assumes public reads

The final documentation should clearly distinguish:

- backend storage locator/configuration;
- public app playlist API;
- public app playback route;
- private storage object;
- temporary per-Blob read capability.

Do not use “the frontend never talks to Azure” if the browser follows a redirect
and streams from Azure. The accurate statement is:

> The frontend depends only on app-owned discovery and playback routes. The
> backend authorizes a bounded Blob read, and Azure carries the media bytes.

---

## Explicit non-goals

Do not add any of the following unless a new owner decision expands scope:

- Azure Front Door;
- a CDN migration;
- DRM;
- authenticated-only soundtrack access;
- per-user music entitlements;
- storing MP3 bytes in Postgres;
- proxying all audio bytes through Express;
- importing BGM into the generic candidate/acceptance lifecycle;
- committing MP3 files or a fallback manifest to Git;
- a new music player or a duplicate mute control;
- unrelated scene/loading-system changes;
- speculative preloading of the whole soundtrack.

The existing on-demand model remains desirable: load playlist metadata, then
stream only the selected track.

---

## Definition of done

This task is ready for owner verification only when:

- the governing ADR is accepted and indexed;
- living contracts match the implementation;
- the BGM Blob container is declared private in Terraform;
- the browser-facing playlist exposes only app-owned relative playback URLs;
- the playback route validates a current opaque track ID;
- the backend mints fresh, blob-specific, read-only, short-lived user-delegation
  SAS URLs;
- Azure, not the backend pod, serves normal audio bytes and ranges;
- anonymous app playback works;
- unsigned direct Blob reads fail;
- no permanent public compatibility path remains;
- local development exercises the same frontend contract;
- smoke, focused, frontend, build, and infrastructure checks pass;
- real-browser playback, seeking, long-open-tab behavior, Settings playback,
  persistent controls, and cross-tab ownership have been verified;
- the agent provides the exact live development URL and marks the result
  **ready for verification**, not complete;
- the owner explicitly verifies it before the feature is called complete.

---

## Short implementation brief

If context is tight, preserve this:

> Make BGM anonymous but app-deliverable. Keep the Azure `bgm` container private.
> `/api/bgm` lists tracks through workload identity and returns metadata plus
> stable relative URLs such as `/api/bgm/tracks/<opaque-id>`. The playback route
> validates the ID against the current backend catalog, mints a fresh
> blob-specific read-only HTTPS user-delegation SAS, and redirects with
> `Cache-Control: no-store`; Azure serves ranges and bytes. Do not return SAS
> URLs in the playlist because shuffled tracks may not be selected until after
> they expire. Do not proxy audio bytes, add Front Door, require user auth, or
> retain a public-read fallback. Update the ADR/contracts, Terraform, Kubernetes,
> backend, frontend consumers, local path, smoke tests, and docs. Prove anonymous
> playback works and unsigned direct Blob reads fail.
