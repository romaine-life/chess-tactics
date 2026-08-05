# Loading contract

Derived from [ADR-0136](adr/0136-loading-is-manifest-driven-and-frame-acknowledged.md)
and [ADR-0205](adr/0205-navigation-loads-atomic-scenes-through-one-director.md),
as refined by [ADR-0206](adr/0206-scenes-declare-persistent-visual-hosts.md).
Persistent host nesting is governed by
[ADR-0207](adr/0207-persistent-scene-hosts-form-a-nested-path.md).
Preserved-host interaction is governed by
[ADR-0208](adr/0208-preserved-host-controls-remain-interactive.md).
Authored identity and visible ownership are governed by
[ADR-0209](adr/0209-routes-request-authored-scene-instances.md).
Empty child-slot transitions are governed by
[ADR-0210](adr/0210-empty-scene-slots-commit-without-loading.md).
The enrollment rule for navigational UI is governed by
[ADR-0211](adr/0211-navigational-drawing-requires-an-authored-scene-slot.md).
Transition presentation capability is governed by
[ADR-0212](adr/0212-scene-transitioning-does-not-imply-loading-presentation.md).
Non-destructive Battle restart is governed by
[ADR-0235](adr/0235-battle-restart-is-not-a-board-destructive-operation.md).

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
one authored `ScenePath` whose instances own named slots and one `SceneManifest`;
`SceneBoundary` keeps the complete destination hidden and inert
until its required paint owner and every registered participant report a drawable
frame. Navigation retains the outgoing owner and follows:

`current → exiting → loading → destination-painted → entering → current`

Repeated navigation to the active destination is idempotent. A later destination
cancels the old generation. Failure terminates at one director-owned retry surface;
a React-tree failure terminates at one root retry surface rather than a blank page.

The graph derives whether a navigation changes the complete scene owner or changes a
selection inside one retained owner. This relationship is structural; a feature does
not select an animation mode. A `scene-replacement` keeps the complete outgoing scene
painted while its successor prepares, then crossfades those two scenes directly. A
`selection-change` may fade the selected region to the retained owner's real neutral
state, prepare its successor, and fade that successor in while the owner stays painted
(ADR-0445).

Manifests also declare a persistent visual host. During a selection change, the
director retains and locks its background, title, controls, and every region outside
the selected content without fading or remounting them. Only the declared destination
region deselects, prepares unrevealed, and enters after its own complete painted
acknowledgement. Sharing an ancestor does not turn a complete owner replacement into
a selection change.

Hosts form a registered path rather than a flat exception. The director preserves
the deepest shared host and scopes acquisition, inertness, paint acknowledgement,
failure, and entrance to its named destination region. The Play host is nested under
the main-menu host: Play navigation remains mounted while Skirmish, Levels, and
campaign content replace one another.

During a selection transition, inertness belongs only to the replaceable destination
region. Preserved ancestor controls remain interactive and may retarget the active
load; the latest accepted destination generation cancels stale acquisition and paint
acknowledgements. A complete scene replacement locks the complete outgoing hierarchy
even when its paths share a structural ancestor.

Every selection hierarchy declares one canonical transition target. The director retains
that exact DOM target through deselection, marks it hidden before committing the pending
selection, and permits React replacement only after that commit. Complete scene owners
instead render as two director-owned boundaries during their handoff. Layout-preserving
selection targets apply the same lifecycle to their direct visual children. Application
features cannot request either relationship or provide alternate transition CSS.

Ordinary state changes inside a committed scene remain immediate. Tabs, toggles,
selections, sliders, board overlays, inspectors, dialogs, and gameplay commands do not
enter the scene lifecycle unless they replace an authored navigable drawn region. One
control panel may therefore contain immediate local controls and explicit navigational
controls without opting the whole panel into or out of transition ownership.

Battle Restart and Retry Battle are canonical immediate gameplay commands. They replace
mutable match state with its starting state while preserving the mounted board, HUD,
camera, compositors, decoded resources, and existing painted acknowledgement. They do
not clear surface readiness, key or remount the board from a match/session epoch, hide
the Play surface, display Loading/Preparing copy, or reacquire unchanged visual
dependencies. In a Run, the shared reset transition first spends the canonical three-gold
retry cost and refuses an unaffordable attempt; this economy transaction does not change
the visual lifecycle. A genuinely different board, level, installed-art identity, or visual
contract is a board replacement or new-Battle operation and follows the painted-frame
acquisition lifecycle; it is not a restart.

A battlefield's opening camera is prepared state, not an activation effect. Each mounted
battlefield owns its own view store, measures its real viewport while hidden, and withholds
surface readiness until both the compositors and the canonical opening camera are ready.
Activation gates gameplay input, clocks, AI, and arrival motion only. Consequently an
incoming battlefield can prepare beside a retained outgoing battlefield without changing
the outgoing camera, and its first revealed frame already has its settled composition.
Run Deployment promotes that same mounted battlefield and view-store instance into Battle;
the promotion neither remounts nor reapplies the camera (ADR-0353).

The URL is intent, not visible authority. Each scene slot exposes its last committed
instance and its pending instance separately. Views render from the director-mounted
path and may not subscribe to history/navigation events to change visible selection.
The pending instance can fetch, decode, compose, and paint invisibly, but only the
director may commit and reveal its generation.

Transitioning does not itself imply loading. When a retained host's authored
destination slot becomes empty, the outgoing child exits and the empty slot commits
directly to `current`. There is no acquisition, loading minimum, entrance phase, or
Loading copy. Loading presentation begins only when the director is actually waiting
on or revealing prepared destination work, never during the exit phase alone.

Every navigational action that replaces a drawn region enrolls that region as an
authored scene slot. Route-owning views do not listen to navigation or derive visible
selection from `window.location`; only the director-mounted path selects the child.
Local component state is reserved for interaction inside a committed scene rather
than navigable region identity.

Enrollment is a rendering capability, not only a manifest convention. For the Run,
`RunSceneViewport` is the sole API that emits the viewport landmark, shell frame, and
artwork layer, and it requires a typed scene contribution. Feature code may render
ordinary React inside the granted content slot, but may not emit a competing Run
viewport, portal around the authority, or choose a screen-sized child from local state.
The discriminated workspace object in the committed `ScenePath` carries selected-unit
and provisional Bona-target identity, so ledger/profile and mat/target replacement are
director transitions. Build checks enforce the emitter boundary; manifest and live
transition tests enforce its identity and lifecycle (ADR-0383).

A visual that physically crosses from an outgoing scene owner to an incoming one
uses the director's inert continuity layer. `SceneContinuityPortal` is the sole
capability for that layer; it carries no interaction, state authority, viewport,
or navigation. The nearest semantic owner that spans the handoff keeps the landed
visual there while the incoming region paints its real owner beneath it. A retained
selection releases that carry when the director returns to `current`; a full replacement
releases it when the outgoing owner retires at the same completed boundary. The handoff
therefore occurs at one coordinate with no faded, duplicated, or blank frame. Feature
portals outside this capability remain forbidden (ADR-0385, ADR-0446).

Authored transition does not imply Loading presentation. A `transition-only`
destination still exits, mounts hidden, acknowledges paint, enters, and remains
cancellable, but has no Loading copy or artificial loading minimum. A `loading`
destination uses the same lifecycle plus explicit wait presentation and its minimum.
The distinction is declared by the destination manifest, never inferred from elapsed
time or cache luck.

After cold startup, wait presentation belongs to the persistent title bar rather
than the replaceable scene canvas. During full-scene replacement, the director keeps
the complete outgoing scene painted beneath the hidden, inert destination. Once the
destination acknowledges a complete painted frame, the two authored scenes crossfade;
only then may the outgoing DOM be destroyed. No blank intermediary or reconstructed
background is permitted. This treats composited boards and complete pre-drawn board
scenes identically. Center-screen `Loading...` exists only in the pre-React cold-start
  document, before the title bar is available. Retryable terminal failure remains a
  scene-canvas surface because it owns an action, not passive wait copy.

A direct full-scene crossfade is one transition to the prepared destination, not an
outgoing fade followed by a separate incoming fade. During `entering`, the outgoing
scene fades from opaque to transparent while the incoming scene fades from transparent
to opaque over the same interval. There is no fully transparent crossover at which an
unrelated fallback scene may appear. This applies to the reversible won-board/aftermath
review boundary as well as other complete Run scene replacements (ADR-0444, ADR-0445).
The lifecycle's `exiting` phase deactivates and freezes a complete outgoing owner but
does not lower its opacity; opacity exit during that phase belongs only to an authored
selection region or an intentionally emptied slot.

The homepage backdrop is mounted only while the current or pending scene declares the
`homepage` background. It may prepare behind an outgoing scene during a real transition
to the Main Menu, but it is neither mounted nor drawn beneath Run-to-Run transitions.
An unmatched address can still resolve explicitly to the Main Menu; that route fallback
does not make Main Menu artwork a universal visual floor for known routes (ADR-0444).

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
  player lists never reconstruct boards in the browser. Per ADR-0234, derivative freshness
  fingerprints the exact resolved render plan, consumed source hashes, and availability
  behavior. Global prop-seat, unit, media, and drawable revisions select one coherent
  projection but never invalidate a derivative that does not consume their changed member.
  The fingerprint never depends on mutable renderer-process state.
- Canonical read repair coalesces identical work and every thumbnail render passes through
  one bounded process-wide FIFO limiter. A genuinely changed visible derivative remains
  fail-closed until current pixels exist; unrelated authority changes are immediate cache
  hits, and below-fold acquisition remains opportunistic.
- Per ADR-0189, ADR-0201, ADR-0204, and ADR-0259, list derivatives are fixed
  288×216 renders in the canonical 4:3 board window and use the shared
  playable-board opening frame rather than opaque-pixel or full-generated-scene crops.
  Play frames the same 4:3 window as the largest drawable viewport inside its
  real-pixel playfield. Non-Play live board viewers retain the same 4:3 drawable
  shape inside their surrounding UI. A framing-policy change bumps the renderer revision: reads repair stale
  derivatives and save/publish prepares the current version without regenerating accepted
  board artwork.
- Initially presented level cards are one surface: the list remains hidden and inert until
  every expected thumbnail has painted, or it presents one retryable error.
- In-place `RunCardFace` changes retain the last complete face while the requested
  content/frame/art/unit generation mounts hidden and settles its actual image consumers.
  The complete layer promotes only after paint opportunities; a later selection cancels
  every stale acknowledgement, so card text and card pixels never expose different
  identities (ADR-0314).
- Persisted Campaign Editor rows consume the same immutable database-backed derivatives
  as player lists. Only a genuinely unsaved/new level without a canonical derivative may
  use the authoring-only client bake. The selected live-board preview separately waits for
  both terrain and scene compositor acknowledgements.
- The complete Play selector is one DOM surface: canonical hydration, rendered image
  consumers, and computed CSS image consumers settle before its columns reveal together.
- The top-level installed Play destination remains the compatibility selector
  root `/play/select` (ADR-0294). Opening it from the main menu preserves the
  already-painted homepage scene; it does not unmount the menu family or route
  through the bare `/play` battlefield while the selector loads. The root holds
  composition until canonical content and the Run document settle, then composes
  the complete Continue scene and replace-canonicalizes to the most recent
  available `/play/select/continue/<mode>` address, or bare Continue when there
  is **Nothing to continue**. This selection never launches gameplay.
- Terrain and scene canvases share decoded image records and acknowledge their actual first
  composition to the board boundary. The board reveals only after terrain, barrier, and
  scene acknowledgements and a browser paint opportunity. In a navigated Battle that readiness
  gate delegates its visible opacity entrance to the scene director, so the environment and board
  reveal as one prepared scene rather than as serialized fades. Ordinary units remain staged until
  activation and then arrive; an aftermath Back review instead paints its exact terminal units
  already settled because their entrance happened in the Battle being revisited. A crafted
  terminal landing is prepared the same way: its board, seated units, Victory acknowledgement,
  and Rewards action are present inside the director's one reveal, with no child opacity fade
  beginning after the scene becomes current (ADR-0442, ADR-0443).
- A playable board includes its first-frame HUD and title controls. The battle clock remains
  paused until board compositors and HUD resources have painted and the complete surface is
  revealed; network or asset latency is never charged as player thinking time.
- Readiness timeouts were removed from menu, route, screen, and board boundaries. A failed
  critical resource is an error, never synthetic readiness.
- Every route family resolves through `sceneManifest`; unmatched routes explicitly
  inherit the main-menu scene rather than escaping enrollment.
- Main Menu and Play resolve to an authored instance path
  (`main-menu → play → selected Play content`). Play renders only from the path mounted
  by the director; browser navigation cannot swap campaign/level imagery before the
  loading lifecycle begins.
- Settings resolves as `main-menu → settings → selected Settings content`. General,
  Audio, Gameplay, Creator Tools, and Audio Tracks share the persistent Settings rail
  and replace only `settings-content` through the director. The retired Settings-local
  navigation listener and crossfade no longer form a parallel lifecycle.
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
