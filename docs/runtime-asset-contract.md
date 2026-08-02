# Runtime Asset Contract

This is the living storage and delivery contract derived from
[ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md). It applies to
runtime, review, candidate, and source-media binaries: images, audio, fonts,
atlases, animation sheets, and other media consumed or judged by the application.

## Ownership

- Postgres owns stable semantic slots, candidate/version metadata, active
  pointers, accepted status, provenance, revisions, native-size evidence, and
  audit events.
- Private Blob Storage owns immutable content-addressed media bytes.
- The backend owns access-controlled reads and domain-authorized writes.
  Ordinary shared-catalog mutation remains admin-gated; Generation Reference,
  Raw Pipeline Source, creation-slot, and pre-drawn lineage authoring are
  owner-scoped under the current fenced Level Editor session.
- Git owns code, deterministic geometry and mask-generation logic, schemas,
  prompts, and text provenance. Git does not own media bytes, persisted raster
  masks, or accepted pointers.

The term **DB-backed asset** means the accepted pointer and lifecycle are
database-authoritative while the bytes are in backend-owned object storage. It
does not mean storing large media values in Postgres `bytea`.

## Stable identity

Game data and code refer to durable domain identities. Ordinary catalog media
uses stable semantic slots such as a terrain layer role or UI-kit part. Neither
ordinary nor pre-drawn content persists a candidate UUID, blob hash, generated
filename, repository path, temporary URL, browser-local key, or picker state.

Floating artwork placements persist the installed structure drawable's
stable logical id, never media bytes, a blob hash, repository filename, or
candidate URL. Directional structure views are media roles on that DB-owned
drawable (`back`/`front` for south/default and paired
`<direction>-back`/`<direction>-front` roles for additional views). The
placement's canonical projected-scene pixel center, rendered direction, and
source-composition scale are level data; the selected media still resolves
through the catalog.

Per
[ADR-0158](adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md),
a pre-drawn board is the narrow domain-version case. Per
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
its Level declaration persists an explicit Legacy/AI background mode separately
from a remembered exact AI selection. That selection names one generated or
warped raster version plus either one matching depth-aware occlusion-mask child
or an explicit no-mask state and, for schema-version-3 fitted surfaces, embeds
one exact cell-visual-footprint snapshot under the compatibility cyan
move-highlight profile name. The Postgres-owned raster and mask identities
resolve immutable Blob bytes, while the profile remains exact Level content;
neither mode nor selection is a transient candidate id, mutable semantic-slot
pointer, browser preference, or picker state. The raster version owns its frame
dimensions and world bounds; the Level projection may duplicate those immutable
values only when the backend validates an exact match, never as independently
mutable rendering state.

A Generation Reference is a separate immutable, non-settable media identity
captured from the canonical saved Level's active Legacy or AI background
through its saved generation frame. Its record binds exact bytes, hash,
dimensions, bounds, mode, selected AI raster when applicable, canonical Level
revision, geometry digest, semantic-packet identity, and provenance. A later
capture creates another reference; it never rewrites the first.

Per
[ADR-0166](adr/0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md),
and
[ADR-0168](adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
Postgres separately owns Generation Reference handoff provenance, immutable Raw
Pipeline Source identities, and Board Art creation-slot identities. Copying a
Generation Reference to the clipboard is a side-effect-free read of its exact
full-resolution PNG. Clipboard paste, direct `Ctrl+V`, or exact-PNG file
selection stages the returned AI-painted PNG as a local preview; the explicit
commit stores those exact unchanged bytes and their content hash as a Raw
Pipeline Source. An explicitly editor-mounted preexisting Codex result may be
imported through the same named raw-source ingress. The application records the
reference, canonical semantic request and hashes, returned bytes, request hash,
and actor/time without claiming the external conversation's model, prompt, or
generation parameters.

A Board Art creation slot then references exactly one content-complete
`kind='raw'` Raw Pipeline Source as its pre-modification input. It is immediately
ready for grid fitting and owns no second raw output stage. Applying an
owner-approved grid registration runs the versioned deterministic rasterizer
once and fills that slot's warped stage, preserving the selected raw parent and
recording exact registration, dimensions, world bounds, coordinate basis,
generator version, hashes, and lineage. The
rasterizer owns both pixel sampling and a versioned, byte-stable PNG encoding;
it does not delegate filtering or compression choices to the browser's canvas
encoder. Runtime does not store or interpret registration as a drawing
instruction. Occlusion is likewise a persisted immutable mask child whose
metadata binds its alpha/depth
planes to the exact raster parent, dimensions, coordinate basis, canonical
environment-geometry revision or hash, depth convention, generator version,
and content hash. Per
[ADR-0179](adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md),
creating a new mask child also requires a valid saved cyan profile bound to the
attempt's exact current warp. That profile is a review gate rather than mask
input; it does not change the mask bytes or immutable mask lineage. A mismatched
mask is unavailable, never approximately reused.

Per
[ADR-0180](adr/0180-predrawn-occlusion-selects-final-raster-pixels.md),
mask alpha is the owner's accepted selection over that exact warped parent.
Legacy tile, terrain, prop, doodad, and Scene Art pixels or silhouettes never
seed it. A revision-pinned browser-local SlimSAM worker may advise with three
positive/negative-point candidates, while explicit acceptance and the complete
brush/eraser/Reset/Undo/Redo path keep the owner authoritative even when the
model fails. The accepted alpha digest, exact model/revision/backend,
prompt/manual counts, and depth-assignment version are recorded provenance.

The deterministic depth encoder partitions accepted alpha into 8-connected
components. For each component and occupied source-image column, its bottom-most
selected pixel maps through the exact parent dimensions and world bounds to the
contact depth shared by that component's selected pixels above it in the same
column. Only explicit **Create board with occlusion mask** persists this immutable
child. Runtime consumes its exact alpha/depth bytes and never loads the model or
runs segmentation.

Before occlusion exists, a rejected current warp may be archived and detached
from its slot under the exact CAS workflow in ADR-0175; the replacement remains
another immutable version over the same raw input. Preview tuning and clipboard
contents are not runtime identity. Raw Pipeline Sources remain
distinct from `kind='source'` Generation References, while warped and
mask-bearing board versions remain deterministic outputs.

Per
[ADR-0181](adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
discarding a rejected current mask detaches the slot pointer rather than
mutating the immutable child. The same warp and cyan profile may produce a
replacement at a later processing revision. Canonical-referenced mask media
remains retained history; an unreferenced draft may be archived.

The compatibility-named cyan profile itself is not a runtime media asset. One
active attempt owns one fenced, revision-CAS mutable latest draft containing a
canonical sparse playable-cell map, its SHA-256, the exact warped-version id,
and the cover-independent environment-geometry digest. Saving a new draft
allocates no background-version row and no Blob. Discarding the bound warp
clears that draft.

`Set` copies the exact canonical profile into the Level's schema-version-3
pre-drawn surface alongside the exact warped background selection. The Level
snapshot does not follow later attempt edits. Runtime validates and renders only
that embedded snapshot. Per
[ADR-0185](adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md),
its fitted quadrilateral shapes every square-local visual highlight, including
runtime move, attack, threat, blocked, premove, selection, focus, hover,
drag/drop, and promotion paint and Level Editor zone, tactical, ring, region,
hover, and placement-preview paint.

The profile never owns logical geometry. Hit targets, cell and move selection,
movement, pathfinding, occupancy, placement validity, zone membership, grid and
fence hints, and solver state continue to use canonical cells. Non-cell-local
unit, object, arrow, and label presentation keeps its own geometry.

Historical schema-version-2 surfaces remain readable and use the complete
canonical diamond for every square-local highlight; a malformed
schema-version-3 profile fails closed rather than falling back to either the
attempt or schema-version-2 behavior. The established
`predrawn-move-highlight-profile-v1`, API/event, Level-field, and
`move_highlight_profile_*` database names remain compatibility vocabulary for
this broader visual role. No media, content, or database migration is required.

Per
[ADR-0171](adr/0171-local-predrawn-grid-correction-uses-a-shared-vertex-mesh.md),
the registration may be a canonical version-5 payload containing at most 1,024
sparse, row-major source-pixel overrides at interior shared logical grid
intersections. Boundary intersections and all outside-board scenery retain the
coarse map.
Its deterministic transform is identified by `grid-warp-v2` /
`shared-predrawn-rasterizer-v2`; the backend validates the canonical payload,
grid bounds, and non-folded shared mesh before accepting any bytes. Historical
v1-v4 registrations retain `grid-warp-v1` /
`shared-predrawn-rasterizer-v1` and their exact old evaluation. Registration
text, operation/processor version, output bytes, and hash together make the
derived asset reproducible and crossed version pairs are invalid.

Every existing background-version row with `kind=raw` projects as a Raw
Pipeline Source, not as a Generation Reference. Zero, one, or many creation
slots may reference the same exact raw version and Blob. The workspace-level
**New attempt** source chooser creates a slot that already references the
selected raw and allocates no media, upload, second raw output, or mutation of
any existing slot. Warped and mask-bearing board versions are ineligible inputs.
The exact reference pins the raw version and Blob through archive.

A migrated historical slot keeps its exact raw/derived bytes and lifecycle
state. Its missing Generation Reference or external-generation provenance is
never fabricated, but a content-complete, geometry-compatible retained Raw
Pipeline Source may be selected for a separate deterministic slot. That reuse
does not repair the historical record or create new model-generation evidence.

Per
[ADR-0169](adr/0169-historical-raw-contracts-bind-only-from-saved-level-proof.md),
a historical raw that predates required `coordinateBasis` and `viewingPane`
metadata remains byte-for-byte and metadata-for-metadata immutable. Its
effective raw contract may include one external immutable binding only when
fenced processing-attempt creation proves the exact saved Level's frame/world
bounds, legacy geometry, retained bytes, dimensions, and original provenance.
The binding cannot override contradictory metadata or make a different Level
eligible. New Raw Pipeline Sources always carry the complete contract directly.

List, picker, content, and observer reads never establish that binding. The
backend may project a historical source as provably bindable for the exact saved
Level, but the later fenced create transaction must repeat the proof and commit
the binding atomically with the slot. Failure creates neither. This repair does
not move, duplicate, or rewrite Blob bytes.

Creating or previewing a derivative does not move any canonical pointer. `Set`
records the exact selection, including its exact canonical cell-visual-footprint
snapshot under the compatibility profile name when present, only in the current
fenced editor working copy.
Private Save or official Review and publish/Publish is the separate transaction
that verifies the selected immutable Blob objects and hashes. Private Save
atomically pins the exact selection in the private canonical Level while its
ready versions remain owner/admin-readable, not public. Official Review and
publish/Publish atomically marks those exact version rows published with the
official Level reference. Explicit user-map Publish performs the same exact-
selection publication with the owner-free public-map snapshot. Only those
explicitly published selections become publicly readable. Blob bytes are never
moved or rewritten by any of these transactions.
Retained Generation References, Raw Pipeline Sources, creation slots, versions,
and objects remain resolvable even when hidden from ordinary chooser views or
archived. Per [ADR-0299](adr/0299-fence-review-choosers-exclude-retained-history.md),
fence review choosers expose only complete backend candidates and current accepted
kits; retained `legacy-bridge` and `archived` fence media remains backend history
and cannot become a chooser entry or a fallback for an unavailable review id. The
owner-facing Generation Reference instrument exposes the non-deterministic
typed-reference-to-raw handoff with clipboard, exact-PNG file fallback, and
explicitly mounted-result ingress. The **Board Art Pipeline** exposes the
workspace-level raw-source chooser, each slot's raw input and deterministic
outputs, working-copy mode and selection, and canonical state. Raw reuse, warp,
occlusion, installation, Save, and Publish require no agent or copied
registration packet.

Per [ADR-0159](adr/0159-predrawn-background-authoring-storage-is-bounded.md),
this retained lineage is bounded by the backend: 256 permanent version rows per
editor document, 1 GiB of distinct referenced background-version Blob bytes per
owner, and one in-flight raw upload body per document. Every status counts;
Archive organizes retained history and neither reclaims nor evades quota.
Aggregate byte validation is serialized with the content-binding transaction.
The browser is not quota authority.

Per
[ADR-0172](adr/0172-archiving-a-board-art-slot-forgets-only-dormant-legacy-selection.md),
archiving a slot may atomically forget its dormant remembered selection from
Legacy working and canonical Levels. It does not delete the slot's immutable
versions or Blob objects, reclaim quota, or affect the rendered Legacy
environment. Any matching AI-mode use or published output blocks archive.

Per [ADR-0159](adr/0159-predrawn-background-authoring-storage-is-bounded.md) and
ADR-0165, this retained lineage is bounded by the backend: one document may own
at most 256 background-version rows of every kind, including Generation
References, and 128 generation-attempt rows; one owner may retain at most 1 GiB
of distinct Blob bytes across those background versions; and one document
admits only the bounded in-flight media upload allowed by the contract. Every
status counts. Archive organizes retained history and neither reclaims nor
evades quota. Aggregate byte validation is serialized with the content-binding
transaction. The browser is not quota authority.

All consumers resolve the exact saved background mode. Legacy intentionally
uses the ordinary composed environment. AI resolves the remembered exact raster,
mask state, and schema-version-3 cell-visual-footprint snapshot when present;
missing or mismatched bytes, metadata, format, dimensions, profile digest,
geometry binding, or lineage fail closed. AI never falls back to Legacy,
another slot version, a mutable attempt profile, a runtime warp, browser-local
media, or a mask regenerated from canonical sprites.

An exact pre-drawn version resolves through
`/api/background-versions/<version-id>/content`, never through a mutable slot.
Ready/private content requires authorized owner or admin access and carries
private immutable caching. Only a version selected by an official publication
or explicit owner user-map publication transaction is anonymously readable with
public immutable caching. The response ETag/content hash is bound to that exact
version's immutable Blob object; the route never redirects through or consults
a mutable active pointer. The document-scoped content route exposes the same
bytes under editor authorization.

An exact Generation Reference is a `kind='source'` version and likewise
resolves through
`/api/editor-documents/<document-id>/background-versions/<version-id>/content`,
never through the currently rendered Level, a browser screenshot path, or a
mutable media pointer. Publishing a Level does not implicitly make unused
Generation References, Raw Pipeline Sources, or creation-slot inputs public.

The stable route `/assets/<slot>` is a backend route, not a filesystem path. The
backend resolves it through the current active pointer and redirects or serves
the immutable content-addressed object. A literal `/assets/...` string is valid
only as a semantic slot address; the same path must not exist under
`frontend/public`.

Executable Vite chunks are emitted under `/app-code/`, never `/assets/`. This
keeps deploy-owned code and live-storage-owned media in disjoint URL namespaces.

## Catalogs

One backend-owned media boundary supports typed domain projections. The generic
live-media substrate owns domains migrated from repository files; existing
domain-native stores such as Unit Art and BGM remain conforming because their
runtime bytes and pointers are already backend-resolved rather than Git-backed.
Per
[ADR-0200](adr/0200-bgm-is-private-storage-behind-app-owned-capability-routes.md),
BGM specifically uses a backend-listed private container, app-owned opaque
playback routes, and temporary per-Blob read capabilities; its browser-facing
catalog never exposes a permanent storage URL.
Each projection validates its own completeness and geometry before acceptance:

The logical drawable catalog above those media slots is the authority for installed
content membership, labels, ordering, behavior configuration, and named media roles.
Runtime and editor consumers query that projection; a stable semantic slot is no
longer sufficient authority for code to declare that an installed asset exists.
Selection defaults and every appearance-affecting behavior value are part of
that projection. Positional first-row selection and code-filled partial records
are prohibited: zero or multiple database defaults, an unknown requested id, or
an incomplete row is an availability failure.

- Unit Art: family, palette, direction, anchor, and native footprint.
- Terrain: top, side, animation, alpha ownership, projection, face semantics.
- Ground cover: every ground-cover media version declares its
  terrain/id, frame dimensions/count, base anchor, and content width in
  `versionMetadata.runtime.groundCover`. Browser boards and server thumbnails
  hydrate the same shared renderer projection from the applied catalog; frame
  geometry is not duplicated in a generated source module. The slot name is
  opaque to runtime semantics: neither terrain nor variant identity is inferred
  from its path. Installed identity and media membership come only from the
  drawable row and its named role assignment.
- UI kit: state/slice geometry and native roles. Run relic icons are exact
  64×64 PNGs with typed `run-relic-icon` metadata; installed
  `kind='run-relic'` drawable records, not slot filenames, bind those pixels to
  gameplay relic ids. Exact `/enchiridion/relics/<relic-id>` social unfurls use
  that drawable's immutable icon URL and native geometry together with the
  canonical relic name/effect; a missing or ambiguous targeted icon never
  substitutes the generic OG image (ADR-0261).
  The eight closed slot/hash pairs in ADR-0332 are the sole Run relic exception
  to native generation: their accepted evidence truthfully records the archived
  1254×1254 source and exact nearest-neighbor 64×64 transform. They still render
  1:1 from the accepted 64×64 output and cannot authorize different bytes.
  The Cacochymic unit-state icon currently uses the pre-cutover source slot
  `ui/run/card-status/plagued-v1.png`. Until that generated icon has an accepted
  live pointer, the shared card face reserves its final socket with a neutral
  DOM diamond. That owner-authorized placeholder is named temporary debt under
  ADR-0312, not a packaged media fallback, and must be removed when the accepted
  icon is installed.
  Run affected-card properties and their granted unit states use paired native
  64×64 transparent PNG roles. Property roles use component
  `card-property-icon` under `ui/kit/icons/card-properties/<property>.png`;
  state roles use component `unit-ability-icon` under
  `ui/kit/icons/game/<state>.png`. The closed pairs are
  Pestiferous/Cacochymic, Concinnous/Positioned, Tactical/Discipline, and
  Hieratic/Agminate. The installed Cacochymic source and Pestiferous roles occupy
  `ui/kit/icons/game/plagued.png` and
  `ui/kit/icons/card-properties/pestiferous.png`. Runtime code cannot infer a
  role from a slot path or substitute CSS, text, a generic glyph, or the other
  member of a pair. Agminate's owner-saved candidate and fitting remain under
  the pre-cutover source slot `ui/kit/icons/game/marshalled.png`; that locator
  and the persisted `marshalled` value are non-presentational storage identities
  until the coordinated paired-icon cutover (ADR-0342). The remaining pair cutover occurs atomically only after
  every required role has an accepted pointer and has been reviewed at its real
  card and unit-state sizes. Card Icon Fitting performs that review inside the
  canonical Studio Viewer: it selects exact candidate versions, owns
  per-property placement plus one shared unit-state placement, and saves only a
  non-publishing design draft until the owner explicitly approves the completed
  fit (ADR-0318, ADR-0338, ADR-0339, ADR-0340).
  Run-card frame variants use typed standalone native 1060×1484 PNG slots:
  `ui/run/card-prototypes/frame-v1.png`,
  `ui/run/card-prototypes/pestiferous-frame-v1.png`,
  `ui/run/card-prototypes/tactical-discipline-frame-v1.png`, and
  `ui/run/card-prototypes/concinnous-frame-v1.png`, and
  `ui/run/card-prototypes/hieratic-frame-v1.png`. The shared face selects the
  semantic slot from the persisted qualifier; no frame owns live title, art,
  price, type, ledger, property, or flavor pixels. Every variant clips the same
  accepted gold-coin pixels from
  `ui/run/card-prototypes/cost-coin-source-v1.png` and overlays the live integer,
    so a frame cannot silently introduce a private coin treatment (ADR-0283,
    ADR-0329).
  Concinnous resolves its accepted white frame. Hieratic resolves its distinct
  steel-armor frame and SHA-bound measured geometry while its gameplay mechanics
  remain deferred (ADR-0338); the two material identities never alias.
  The Run gold resource is likewise an exact native 64×64 PNG with typed
  `run-resource-icon` metadata; one installed `kind='run-resource'` drawable
  record binds `behavior.resourceId='gold'` to its `icon` media role.
  Strategikon's command-archive background is the exact closed hash named by
  ADR-0336. Its typed validator and owner proof record the 688×384 source plus
  approved cover presentation, while the required `app-ui` drawable role owns
  installed membership and normal routes resolve only its immutable URL.
- Props, walls, backgrounds, portraits, fonts, and OG media: their declared
  component and availability contracts.
- Structure source artwork: one drawable record owns installed membership and
  exactly eight paired directional roles. Each direction may reuse one full
  `flat-contact` raster for both named roles. `sourceOnly` records deliberately
  omit prop/doodad gameplay policy and remain excluded from those projections.
- SFX: recording bytes resolve from live media slots. The complete revisioned
  `sfx_profiles/default` document owns sound-set metadata/gains, all landable-
  terrain assignments, and arrival sample/gain/firing. Missing profile state is
  decorative silence and an unavailable editor, never a committed default.
- BGM: the backend lists the private Blob catalog and returns only opaque
  same-origin playback routes. Each current route mints a fresh read-only,
  HTTPS-only, short-lived user-delegation SAS and redirects without caching;
  Azure serves the bytes and ranges. BGM remains outside the generic candidate
  lifecycle (ADR-0200).

The browser, Studio, client image bakes, and server thumbnails must observe one
coherent catalog snapshot. Per ADR-0234, a catalog's global revision selects and
isolates that snapshot but does not become a dependency of every derived image;
server thumbnails fingerprint only the exact resolved plan and media they
consume. A critical catalog that cannot hydrate is an availability failure.
There is no committed or generic-art fallback.

## Candidate and acceptance lifecycle

1. A tool or Studio editor creates a candidate/version for a stable slot.
2. Media bytes upload to the backend and become content-addressed immutable
   objects.
3. The candidate records source dimensions, required runtime dimensions,
   provenance, allowed transforms, and review evidence.
4. A game-owned instrument renders those exact candidate bytes at the declared
   role. Native-pixel contracts also prove canonical 1× decode; placement assets
   additionally prove their real board-context transform and controls.
5. Admin acceptance validates the domain contract and atomically swaps the
   accepted pointer, archives the prior version, bumps the catalog revision, and
   writes an audit event.

Browser `localStorage`, a Git manifest, a contact sheet, or copying a file cannot
perform step 5.

### Implemented promotion coverage

Repository and runtime authority cutover is complete: every migrated runtime
slot resolves through a Postgres pointer and private Blob bytes, and every
domain can receive non-active candidates or private source archives. Typed
owner promotion is currently complete only where a domain-owned validator and
exact-byte review instrument exist:

| Projection | Runtime authority | Candidate ingress | Review and promotion |
| --- | --- | --- | --- |
| Board Unit Art | Unit Art Postgres catalog + private Blob | Unit Art APIs | Complete; atomic family acceptance after palette, direction, geometry, and native-pixel checks |
| Terrain surface tops | Shared live-media catalog + private Blob | Shared single/batch APIs | Complete; database-declared groups are reviewed on the canonical board and accepted atomically |
| Structure source-art turntables | Structure drawable catalog + shared live-media catalog/private Blob | Outside-repository batch manifest + canonical source archive client; one archived pack may supply multiple exact object-allowlisted Artwork groups | Complete; Studio validates all eight native 512×512 rasters, requires each exact direction to mount in the interactive board placement proof, records the typed owner group proof, accepts atomically, then installs the drawable record |
| Strategikon command-archive background | `app-ui` drawable + shared live-media catalog/private Blob | Shared candidate API under the exact typed semantic slot | Complete; the live Strategikon surface records the closed ADR-0336 cover exception and exact candidate/slot proof, acceptance swaps the pointer atomically, and the drawable installs the required runtime role |
| Authored SFX one-shots | Shared live-media catalog/private Blob + revisioned `sfx_profiles/default` | Shared candidate API under typed `sfx/<sound-set>/v<n>.<format>` slots | Complete; the SFX Viewer mounts a complete private source waveform, lets the owner trim and audition an exact range, saves an immutable hash-verified derived candidate with frame/time provenance, then exact-byte auditions, atomically accepts, and declares that set in the live profile |
| Other terrain and generic media domains | Shared live-media catalog + private Blob | Shared single/batch APIs | Deliberately blocked until that projection has a typed completeness validator, domain-owned exact-byte review instrument, backend proof validation, and atomic acceptance/rollback tests |
| BGM | Backend-listed private Blob container; app-owned discovery/playback routes; per-Blob user-delegation SAS | Blob administration | Range-streamed by Azure after a bounded no-store redirect; intentionally not the generic candidate lifecycle (ADR-0200) |

The remaining promotion docket is UI kit/Chrome; remaining terrain; props,
walls, rocks, and atlases; portraits, backgrounds, and social media; then fonts
and remaining domain-specific media. A generic proof payload or network helper is not a review instrument,
and must not be used to bypass a missing domain projection.

The SFX profile editor remains a configuration instrument rather than an audio
acceptance authority. Its candidate editor is the separate typed audio
instrument: an owner-supplied full source can be trimmed through visible
start/end controls and selection audition, but Save creates a new immutable
candidate instead of mutating the source. The derived candidate must then be
auditioned in full, approved, and atomically accepted before the sound set is
added to the optimistic-revision profile. Browser storage retains only an
unsaved profile draft, and changing a profile reference cannot make candidate
recording bytes public or production-eligible.

## Generation and editing

Generation tools may use temporary local files during an active run. Their
durable output is an uploaded candidate plus live provenance. They must not emit
accepted or review media into a committed directory. Source and rejected binary
attempts also go to private storage; only prompts and non-material deterministic
geometry may remain in Git.

`frontend/scripts/live-media-admin-client.mjs` is the command-line boundary for
non-browser tools. `archive-source` stores and verifies one exact private source;
`upload-candidate` stores one candidate; and `upload-candidate-batch` consumes an
outside-repository manifest, archives its declared sources first, then uploads
idempotent candidates whose provenance binds those archived version ids and
hashes. These commands deliberately cannot review, accept, or activate media.
Those judgment operations remain reachable only through the game-owned backend
review instrument.

An exact source larger than the request-body limit is archived as independently
verified opaque chunks and a canonical manifest at the requested source path.
`fetch-source` reconstructs the original bytes and verifies their full hash and
length before a render consumes them. The chunk layout is a storage
implementation detail, not a second source identity.

`frontend/scripts/build-groundcover.mjs` accepts only outside-repository source,
tile, and output workspaces. It emits one outside-repository
`live-media-candidate-batch-v1` manifest whose candidate records carry the typed
ground-cover runtime metadata, and can upload that same batch when given
`--api-base`. It never writes a runtime directory or generated TypeScript
catalog.

## Tests and development

- The backend is required; no offline media fallback is permitted.
- Local development resolves the one live catalog through the Vite-spawned
  backend by default. The app database and private media container remain the
  authoritative content data plane.
- The completed cutover and owner verification used unserved candidate pods
  against that same data plane, as decided by
  [ADR-0086](adr/0086-runtime-asset-cutover-uses-one-live-data-plane.md). A
  production-seeded test database is not a steady-state release gate.
- Automated tests may use transient databases and local object storage for
  generated fixtures. Optional preview tooling may project immutable public
  reads, but it cannot write, promote, or supply cutover evidence.
- Deployed validation slots copy the public Unit Art/media catalogs and the
  complete `prop_seats/default` document once into their throwaway Postgres and
  local object-store implementation. That read-only projection never runs in
  production, never writes back to the live data plane, and is not a second
  owner-facing content environment.
- Unit tests use generated/synthetic fixture bytes and injected catalog records.
  Production media is not committed as a test fixture.
- BGM tests inject a deterministic catalog and signer behind the production
  app-route contract; normal local development uses the full backend and
  established Azure credential. No static-index, public-read, or frontend-proxy
  path exists (ADR-0200).

## Repository enforcement

CI rejects:

- tracked media under `frontend/public` or another runtime delivery directory;
- tracked source/review/candidate media outside the narrow synthetic-fixture
  exception;
- generators or editor endpoints that write media into the repository;
- server thumbnail code that resolves semantic asset slots through the
  filesystem;
- static catalogs or manifest flags used as accepted-pointer authority;
- fallback selection of committed, cached prior, or generic art.

The one-time legacy importer completed the byte-exact cutover and was deleted;
it is not a seed path and there is no API for creating another bridge. Existing
runtime slots remain readable as `legacy-bridge`; source/review bytes are private
archives; and files that were only Chrome review candidates are non-active
candidate versions. Five historically installed Chrome parts are additionally
mapped to canonical `ui/chrome/...` bridge slots so generated candidate
filenames no longer select live art. The completed importer never marked a
version accepted and had no review or acceptance input. A bridge pointer is
named `active`, never `accepted`, and its catalog entry is explicitly
non-production-eligible; storage cutover cannot legitimize its pixels.

The one-time infrastructure ordering, bootstrap verifier, and manual image
approval gate were deleted after the cutover completed. Normal releases build
the merged `main` revision and deploy its digest as defined by
[ADR-0094](adr/0094-merge-builds-and-deploys-the-merged-image.md).
