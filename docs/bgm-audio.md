# Background music (BGM)

The game plays a continuously **shuffled** soundtrack. This doc covers the
current private-storage delivery contract and how to change the soundtrack. It
is derived from
[ADR-0199](adr/0199-bgm-is-private-storage-behind-app-owned-capability-routes.md).

## Architecture

The **private Blob container is the single source of truth.** The soundtrack is
the `.mp3` inventory in that container. Add or remove a track and the game
follows it after the short catalog cache expires; no manifest or application
deploy is involved.

```text
Browser ── GET /api/bgm ──▶ backend ── workload-identity LIST ──▶ private bgm container
   │
   └─ <audio src="/api/bgm/tracks/<opaque-id>">
          └─ GET/HEAD ──▶ backend validates current catalog id
                              └─ 302 no-store + short-lived read-only Blob SAS
                                    └─ Azure serves bytes and Range requests
```

- **Discovery** — `GET /api/bgm` lists the private container with
  `DefaultAzureCredential`, reads `title`/`artist`/`album` metadata, and returns
  `{tracks:[{id,title,artist?,album?,url}]}`. Each `url` is a relative app route.
  The response contains no storage host, container name, Blob name, SAS query,
  or credential.
- **Stable opaque identity** — a track id is the full lowercase SHA-256 of the
  domain-separated exact Blob name. The backend keeps the id-to-Blob mapping in
  its current/last-good catalog; the client cannot submit a path or Blob URL.
- **Playback capability** — anonymous `GET` or `HEAD` to a current playback route
  receives a fresh `302` redirect with `Cache-Control: no-store`. The SAS is
  scoped to one Blob, read-only, HTTPS-only, starts five minutes before issuance
  for clock skew, and expires two hours after issuance.
- **Delegation-key cache** — the workload identity requests a user delegation
  key, caches it in memory, refreshes it before it cannot cover a complete new
  SAS, coalesces concurrent refreshes, and retries after a failed refresh. No
  account key or long-lived SAS exists in app configuration.
- **Delivery** — the frontend depends only on app-owned discovery and playback
  routes. The backend authorizes a bounded Blob read, and Azure carries the
  media bytes, including Range traffic for seeking and resume.
- **Catalog availability** — successful lists are cached for five minutes. A
  listing failure retains one coherent last-good catalog for both playlist and
  playback resolution; without a last-good catalog, BGM degrades to an empty
  playlist. BGM remains non-critical chrome and never blocks scene readiness.
- **Titles** — `title`/`artist`/`album` Blob metadata is the editable display
  source of truth. A missing title falls back to a readable filename-derived
  title.
- **Player** (`frontend/src/bgm.js`) fetches `/api/bgm`, builds a Fisher-Yates
  shuffle, and plays with one `<audio preload="none">` element. It reshuffles
  each cycle without a back-to-back boundary repeat.
- **On-demand streaming** — only the selected track is fetched. Nothing is
  preloaded or bundled.
- **Autoplay-safe** — playback arms on the first permitted user gesture.
- **Mute control** — the one persistent title-bar control owns mute, now-playing,
  retry, and cross-tab ownership. It remains present but dimmed/inert when no
  tracks are available, as required by ADR-0044.

`npm run check` in `frontend/` runs `scripts/check-bgm-shuffle.mjs`, which guards
the shuffle invariants.

Anonymous playback is deliberate. A listener can retain bytes their browser is
authorized to play; this is private storage and bounded app-issued access, not
DRM. Do not add referer checks, browser fingerprinting, single-use tokens, or
client obfuscation.

## Changing the soundtrack

Everything happens in the **`bgm` container** in storage account
`chesstacticsmedia`. No Git commit, build, or deploy is required.

- **Add a song** — upload an `.mp3` through the Azure portal or Storage Explorer.
  It joins the catalog after the cache TTL. Run **Sync BGM metadata** to seed its
  ID3 title/artist/album, or set those metadata fields manually.
- **Remove a song** — an operator identity with explicit delete scope removes
  the Blob. The application and metadata-sync identities intentionally cannot
  delete. A successful catalog refresh removes both discovery and playback
  resolution.
- **Rename display metadata** — edit the Blob metadata. The sync tool is
  non-clobbering unless `--force` is explicitly supplied.

### Sync BGM metadata

`tools/bgm/sync-metadata.mjs` mirrors each track's embedded ID3 tag into Blob
metadata. It is optional convenience, not part of delivery.

- **From CI:** run **Sync BGM metadata**
  (`.github/workflows/sync-bgm-metadata.yml`). OIDC authenticates the CI service
  principal with the custom `Chess Tactics Immutable Media Writer` role scoped
  to the BGM container.
- **Locally:** run `az login`, then
  `npm --prefix tools/bgm install && node tools/bgm/sync-metadata.mjs [--force] [--dry-run]`.

The tool lists and range-reads every private Blob with
`DefaultAzureCredential`; it does not depend on an unsigned public URL.

## Storage and identity

Nothing audio-related is in Git or the app image (`*.mp3` is ignored, and there
is no committed manifest or fallback playlist). `tofu/storage.tf` owns:

- private storage account/container policy: no anonymous Blob read or list;
- container-scoped `Storage Blob Data Reader` for the app's catalog list/read;
- account-scoped `Storage Blob Delegator` for the app's one required
  `generateUserDelegationKey` action;
- the metadata-sync identity's container-scoped custom Blob read/write/add data
  role, without delete or container-policy permission.

`bgm.containerUrl` in `k8s/values.yaml` becomes backend-only
`BGM_CONTAINER_URL`. It is a private storage locator, not a public/frontend base.
Frontend code and build output contain no storage locator or credential.

No Blob CORS rule is needed for the current transport. The HTML media element
follows a no-cors cross-origin redirect for `GET`/`HEAD` and Range delivery;
application JavaScript does not read the Blob response.

## Testing and local development

`backend/bgmDelivery.test.js` injects time, catalog listing, SDK signing, and key
acquisition. It covers identity, public projection, removal after refresh,
last-good coherence, SAS scope/lifetime/protocol, key reuse, refresh,
concurrency, and failed-refresh recovery.

`backend/smoke-test.js` uses a `NODE_ENV=test`-only catalog and signer seam. Its
private-object stand-in validates the bounded capability and serves a real
`206 Partial Content` interval. Production has no static index, public-read
fallback, or injected signer.

Normal local development uses the full Vite-spawned backend and the established
Azure/application credential. It exercises the same `/api/bgm` and
`/api/bgm/tracks/:id` paths as production; the frontend has no BGM proxy or
storage configuration.

## Production cutover

Privatization must follow the order in ADR-0199:

1. deploy backend capability issuance and the same-origin playlist projection;
2. verify anonymous playback and Range/seek through the app routes;
3. confirm browsers no longer request permanent unsigned URLs;
4. apply the private-container policy;
5. verify unsigned direct Blob reads fail while app playback still succeeds.

Do not retain a permanent dual public/signed mode. The migration is complete
only after the old public URL, static-index, and Vite-proxy paths are absent.

> Historical note: the soundtrack originally used a Git media branch and an
> upload pipeline that wrote `index.json`; it later used public-read Blob URLs.
> Both delivery paths are retired. Git is not a media backup tier.
