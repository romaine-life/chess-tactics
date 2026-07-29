---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0085
  - ADR-0044
---

# ADR-0200: BGM is private storage behind app-owned discovery and capability routes

## Context and Problem Statement

The soundtrack is intentionally available to anonymous visitors, but the prior
transport made every known Blob URL permanently anonymous-readable. The backend
listed the soundtrack with workload identity and returned those public URLs from
`GET /api/bgm`, while Terraform configured anonymous Blob read. This contradicted
the living runtime-asset contract's description of BGM as private storage and
made the browser-facing playlist escape the application's delivery boundary.

BGM must remain non-critical, shuffled, range-streamed, and live-container-backed
without putting audio bytes in Git, Postgres, the frontend bundle, or the
application pod's normal byte path.

## Decision Drivers

- Anonymous players must receive the same basic soundtrack transport as signed-in players.
- The app must own catalog discovery and decide which current tracks can receive read capability.
- Blob Storage, not Express, must carry normal audio bytes, Range requests, seeking, and long-lived streams.
- A playlist may remain open longer than a short-lived capability, so capabilities cannot be minted during listing.
- Storage account keys, long-lived container SAS values, permanent public URLs, and client storage configuration are prohibited.
- The frontend contract must survive a later CDN or media-domain change.
- BGM remains decorative and cannot become a scene-readiness dependency.

## Considered Options

- Keep anonymous public Blob reads and permanent track URLs.
- Proxy every audio byte and Range response through Express.
- Put short-lived SAS URLs directly in the playlist.
- Require sign-in for the soundtrack.
- Return stable app routes that mint per-Blob user-delegation SAS redirects when played.

## Decision Outcome

Chosen: **private Blob storage plus stable app-owned playback routes that mint
fresh per-Blob user-delegation SAS redirects**, because it keeps discovery and
capability issuance inside the application while leaving bulk delivery to the
object store.

`GET /api/bgm` lists the private `bgm` container through
`DefaultAzureCredential`, retains the current/last-good internal catalog for five
minutes, and returns deterministic display metadata in Blob-name order. Every
public entry has a full opaque id:

```text
sha256("chess-tactics:bgm-track:v1\0" + exactBlobName)
```

and a relative route:

```text
/api/bgm/tracks/<64-lowercase-hex-id>
```

The public playlist contains no storage host, container name, Blob name, SAS
query, or storage credential. The backend retains the id-to-exact-Blob mapping
only in its cached catalog, rejects a collision, and resolves playback only
through the current or last-good catalog. Malformed, unknown, non-MP3, and
successfully refreshed-away tracks receive the same `404`.

Anonymous `GET` and `HEAD` requests to a current playback route mint a new
Blob-specific user-delegation SAS with read-only permission, HTTPS-only
protocol, a five-minute negative start skew, and a two-hour expiry, then return
`302` with `Cache-Control: no-store`. The browser follows the redirect and Azure
serves bytes and ranges. A capability is minted at playback time—not playlist
time—so shuffled or Settings-selected tracks cannot expire while waiting unused.
The frontend remains dependent only on the two app routes even though the
browser subsequently streams from Azure.

The delegation key is acquired with the existing workload identity, cached in
memory, refreshed before it cannot cover a complete new two-hour SAS, and
coalesced across concurrent refreshes. A failed refresh is discarded so a later
request can retry. The key request uses a 24-hour desired validity window; no
minted SAS may outlive the returned key.

The app retains container-scoped `Storage Blob Data Reader` for list/read. Azure
requires `generateUserDelegationKey` at storage-account scope or above, so the
identity also receives account-scoped `Storage Blob Delegator`. That built-in
role contains only the delegation-key action; it grants no Blob write, delete,
or ACL authority. The metadata-sync identity keeps its separate container-scoped
immutable-media data role and reads ID3 ranges through authenticated SDK calls.

The storage account and `bgm` container deny anonymous public access. No CORS
rule is added: the HTML media element follows a cross-origin no-cors redirect
for `GET`/`HEAD` and Range delivery, while application JavaScript does not read
the Blob response. If a future browser feature requires readable cross-origin
responses, its exact origins, methods, and headers require a separate decision
and verification.

Local development runs the required full backend against the same
`/api/bgm`/playback-route contract using the established Azure credential. The
retired Vite-only deployed-playlist proxy and static-index runtime branch are
deleted. Credential-free tests inject a `NODE_ENV=test`-only catalog and bounded
signer; their private-object stand-in validates capabilities and serves real
Range responses.

Operational logs expose catalog refresh outcome/latency and last-good use,
delegation-key refresh outcome/latency, aggregate capability success/failure and
latency, and aggregate unknown-track counts. They never include track names,
ids, Blob names, delegation keys, SAS queries, or redirect locations.

This decision **refines rather than supersedes ADR-0085's BGM exception**.
BGM still uses a backend-resolved, domain-native Blob-index/range-streaming
projection outside the generic candidate lifecycle. ADR-0200 specifies the
previously ambiguous access and delivery boundary. It also preserves ADR-0044's
single persistent mute control and player ownership model; no second player or
control is introduced.

### Consequences

- Good: the container is private and storage no longer publishes permanent anonymous URLs.
- Good: anonymous playback remains normal, while discovery and capability issuance are app-controlled.
- Good: Azure carries audio bandwidth, Range correctness, seeking, retry, and backpressure.
- Good: playlist identity remains stable across capability expiry and a future storage/CDN implementation change.
- Cost: playback now depends on workload-identity delegation-key permission and a small signing operation per selected track.
- Cost: network inspection still reveals a temporary bearer capability and the selected Blob URL; this is access delegation, not DRM.
- Cost: privatizing storage must be deployed only after the backend route and frontend projection are live and verified.

## Pros and Cons of the Options

### Keep public Blob reads

- Good: no signing path.
- Bad: every known track URL is permanently anonymous-readable and bypasses app policy.

### Proxy audio through Express

- Good: storage never appears in the browser.
- Bad: the pod owns all bytes, Range semantics, long connections, cancellation, scaling, and another availability bottleneck.

### Put SAS URLs in the playlist

- Good: one fewer app request when a track starts.
- Bad: shuffled tracks may remain unused until their capability expires.

### Require sign-in

- Good: capabilities could be account-gated.
- Bad: contradicts the public-play contract and owner intent; authenticated listeners can still retain delivered bytes.

### App route with playback-time redirect

- Good: stable player contract, current-catalog validation, narrow capability, and storage-native delivery.
- Bad: requires correct delegation-key caching, RBAC, redirect cache policy, and deployment ordering.

## Deployment and Verification

The production cutover is ordered:

1. deploy capability issuance and the app-owned playlist/playback projection;
2. verify anonymous playback, Settings playback, Range/seek, pause/resume,
   long-open-tab selection, cross-tab ownership, and bounded redirects;
3. confirm browsers no longer request permanent unsigned URLs;
4. apply private container/account policy;
5. verify unsigned Blob reads fail while in-app anonymous playback succeeds.

The migration is not complete while any public-read, permanent-URL,
`BGM_BASE_URL`, `BGM_READ_URL`, Vite BGM proxy, or static-index branch remains.

## More Information

- Living contract: [`../bgm-audio.md`](../bgm-audio.md)
- Runtime media boundary: [`../runtime-asset-contract.md`](../runtime-asset-contract.md)
- Persistence/auth boundary: [`../persistence.md`](../persistence.md)
- Refines: [ADR-0085](0085-runtime-assets-are-live-storage-backed.md)
- Preserves: [ADR-0044](0044-persistent-mute-control-in-the-trailing-cluster.md)
- Migration policy: [`../migration-policy.md`](../migration-policy.md)
