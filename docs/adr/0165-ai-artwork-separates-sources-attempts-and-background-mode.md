---
status: accepted
date: 2026-07-22
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)"
  - "[ADR-0167](0167-raw-pipeline-sources-can-seed-new-attempts.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
  - "[ADR-0176](0176-placed-art-and-level-artwork-are-separate-editor-destinations.md)"
supersedes: "[ADR-0161](0161-predrawn-artwork-is-a-linear-shell-workspace.md)"
partially_supersedes:
  - "[ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md)'s canonical legacy render as the only permitted image source"
  - "[ADR-0125](0125-predrawn-preparation-self-validates-before-generation.md)'s requirement to recapture the current canonical reference for every run"
  - "[ADR-0142](0142-owner-authored-frame-defines-predrawn-generation-reference.md)'s single current reference as generation authority"
  - "[ADR-0159](0159-predrawn-background-authoring-storage-is-bounded.md)'s background-version-only row and byte accounting"
  - "[ADR-0164](0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md)'s unqualified stale-selection Save rejection"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md)"
  - "[ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md)"
---

# ADR-0165: AI artwork separates sources, creation attempts, and background mode

## Context

ADR-0161 put the complete board-art pipeline into one center workspace and
presented every immutable background row as a flat sequence of generated,
warped, and occlusion-ready artifacts. Merely choosing the AI Artwork control
page hid and disabled the board. The storage lineage was honest, but the
owner-facing model was not: unrelated retries and alternative transforms could
accumulate beside one another without a durable attempt boundary, while the
source image supplied to AI generation was not itself a saved first-class
object.

The Level also treated the presence of a selected pre-drawn surface as both
the selected AI result and the active rendering mode. Returning to the legacy
tileset therefore required discarding that selection. That made a fundamental
saved Level choice look like a temporary preview toggle and prevented the
owner from deliberately using either the tiled scene or a selected AI scene as
the source for another generation.

The owner needs three concepts that remain distinct:

1. the saved image supplied to AI generation;
2. one bounded attempt to turn that source into an installable result; and
3. the Level's saved choice between its legacy rendered environment and its
   selected AI background.

## Decision

### Persistent Level background mode

A Level persists an explicit **background mode**, `legacy` or `ai`, separately
from its remembered exact AI-background selection.

- `legacy` renders the ordinary composed tileset environment from canonical
  board data.
- `ai` renders the exact selected immutable raster and matching mask state
  under ADR-0158 and suppresses the ordinary baked environment families.

Changing this mode is a real fenced working-copy mutation. Autosave preserves
it, Save or Publish makes it canonical, and editor, gameplay, read-only
viewers, browser thumbnails, and server thumbnails all render that saved mode.
It is not local preview state.

Switching to `legacy` never clears, archives, replaces, or otherwise mutates
the remembered AI selection. Switching back to `ai` resolves that same exact
selection. A missing, mismatched, or stale AI selection is an explicit
unavailable AI state and never falls back to legacy pixels. A remembered AI
selection may become stale while inactive legacy geometry is edited. That
dormant staleness does not block autosave, recovery, Source Artwork capture, or
canonical Save in `legacy` mode; it does block activating, deriving from,
saving, or publishing that selection in `ai` mode until matching art is
selected.

The selected AI raster's art bounds govern ADR-0121 zoom and pan limits only
while `ai` mode is active. Merely remembering a selection in `legacy` mode does
not change legacy board camera behavior.

### Source Artwork

A **Source Artwork** is one immutable, owner-scoped, live-storage-backed image
that is supplied to AI generation. It is not an AI output, a settable board
background, a browser screenshot, a temporary URL, or an alias for the
currently selected background version. One Level may retain many Source
Artworks.

The Source Artwork workspace captures from the canonical saved Level through
its saved owner-authored 16:9 generation frame. The Level's saved background
mode determines the captured environment pixels:

- in `legacy` mode, the source contains the ordinary composed legacy
  environment, including authored terrain, linear features, scenery, barriers,
  props, doodads, walls, and only explicitly authored visible Subterrain; and
- in `ai` mode, the source contains the exact selected AI raster pixels. Its
  mask does not add pixels and has no live subject to clip in this capture.

Both forms are deterministic generation inputs. They contain no units, live
ground cover, grid, selection, movement or threat overlays, zones, objectives,
other tactical presentation, editor chrome, labels, or application UI. Ground
cover remains a live final-composition layer under ADR-0162 and is never baked
into Source Artwork.

Creating a Source Artwork records its immutable bytes and content hash,
dimensions, coordinate basis and world bounds, saved frame, source background
mode, exact selected AI raster identity when applicable, canonical
Level/document revision, environment-geometry digest, semantic-packet identity,
and actor/time provenance. Later Level edits, background-mode changes, or AI
selection changes never rewrite that source. A new capture creates another
Source Artwork. A source referenced by an attempt remains resolvable through
archive.

ADR-0109's authority split remains: the attempt's canonical semantic packet
owns gameplay topology and meaning. The chosen Source Artwork owns the visible
appearance presented to the model and may be either legacy-rendered or
AI-rendered. An AI-derived source is explicitly non-isolated provenance; it
cannot masquerade as evidence that a legacy-only isolated run succeeded.

### Creation Attempts

An **AI creation attempt** is a server-owned, immutable-identity container
bound to exactly one Source Artwork and its validated semantic request. A
Level may retain many attempts. Each attempt has one linear set of committed
stage slots:

1. one AI-generated artwork raster;
2. at most one deterministic warped raster derived from that generated raster;
   and
3. at most one occlusion-ready result whose attached depth data is bound to
   that warped raster.

Stages commit in order. The backend owns the attempt identity and enforces at
most one committed result per stage; client grouping, labels, provenance JSON,
or array order are not authority. Idempotent retries return the already
committed result and cannot allocate a duplicate. Cross-attempt,
cross-source, cross-document, or out-of-order parents fail closed.

Before commitment, the owner may tune and inspect generation settings, grid
registration, warp output, and occlusion before/after evidence through live
previews. Preview state is not a second committed candidate and is never
runtime authority. Once a stage is committed, changing its source, generation,
warp, or occlusion result requires a new creation attempt. The prior attempt
and every immutable media result remain unchanged.

The occlusion-ready stage stays one owner-facing artifact. Its exact raster
and depth-map identifiers remain normalized internally under ADR-0158; there
is no independent mask selector. Setting an artifact changes the remembered
AI selection in the fenced working copy. The explicit background-mode control
determines whether that remembered selection or the legacy environment is
currently the Level's rendered and saved background. Set remains distinct from
Save and Publish.

### Level Editor surfaces

**AI Artwork** is a normal Level Editor control page in the right rail. Merely
selecting it leaves the board visible, mounted, and operable. Its side controls
show the saved/working background mode, the remembered AI selection and
validity, and explicit navigation buttons for:

- **Source Artwork**, which opens the source framing, capture, inspection, and
  retained-source manager; and
- **AI Generation Pipeline**, which opens the creation-attempt manager.

Each destination is URL-addressable and replaces the board only while that
process workspace is open. The board remains mounted but inert and
inaccessible beneath the shared shell workspace, preserving camera and editor
state exactly as Events does under ADR-0144. Closing the workspace returns to
the visible board and AI Artwork side controls. The workspaces use the shared
shell fill primitive and do not introduce dialogs, duplicate outer frames, or
another narrow copy of the full instrument in the rail.

### Cover and baked-environment authoring

ADR-0162 remains unchanged. Explicit ground cover stays visible and editable
over an active AI background, keeps its canonical animation and depth
relationship with units, and remains excluded from Source Artwork and the
background geometry digest. A cover-only edit does not stale sources,
attempts, or the selected AI artifact.

While `ai` mode is active, ordinary baked-environment tools remain locked and
their pixels remain suppressed. Switching the Level to `legacy` mode restores
ordinary environment rendering and authoring. Those edits may make the
remembered AI selection stale without losing it, and the saved legacy result
can then be captured as another Source Artwork.

### Storage bounds

ADR-0159's server-owned limits extend to the new entities:

- the existing per-document limit of 256 retained media-artifact rows counts
  Source Artwork rows together with raw/generated, warped, and occlusion rows;
- the existing one-GiB per-owner distinct-Blob accounting includes Source
  Artwork bytes as well as background-version bytes;
- one document may retain at most 128 creation-attempt rows; and
- archived source, media-artifact, and attempt rows remain retained and count
  toward their limits. Archive never reclaims or evades quota.

Source capture/upload shares the existing bounded request-size, pixel-count,
and per-document in-flight media-upload protection. Quota checks and
idempotency are backend transactions; the browser is not authority.

### Migration

Existing source-less background lineages are preserved as explicit
**historical legacy attempts**. Migration creates one attempt for each existing
complete or partial raw-to-warp-to-occlusion path. Where old branching requires
several attempts, those attempts may reference the same immutable historical
stage row; media bytes are not cloned or rewritten.

Migration never fabricates the unavailable image that originally entered the
AI model. A historical attempt records an explicit `missing-historical-source`
state, displays **Source unavailable — historical attempt**, and cannot rerun
generation or claim isolated-pipeline provenance. Its existing generated,
warped, and occlusion-ready artifacts retain their exact hashes, lineage,
settable status, publication state, and audit history. Every newly created
attempt requires one real saved Source Artwork.

After migration, the flat unscoped lineage manager and the inference that a
raw generated raster is itself Source Artwork are removed. Historical
missing-source state is a first-class migrated record, not a fallback path for
new work.

## Consequences

- The Level's rendered background is an explicit saved content decision rather
  than an accidental consequence of retaining an AI selection.
- Either the authored legacy scene or an accepted AI scene can become a
  reproducible, unit-free source for later AI work.
- Alternatives are understandable at the attempt level instead of accumulating
  as ambiguous sibling warps and masks.
- Immutable media and deterministic processing remain exactly attributable,
  while tuning stays owner-operable before each one-time stage commitment.
- Existing art is preserved without inventing provenance that was never
  captured.

## Verification

Contract-complete implementation proves that:

- the AI Artwork control page leaves the board visible, while both process
  workspaces round-trip through URL state and restore the same board camera;
- Legacy/AI mode and the remembered AI selection persist independently through
  autosave, reload, recovery, Save, Publish, gameplay, viewers, and both
  thumbnail renderers;
- Legacy capture contains the saved composed environment, AI capture contains
  the exact selected raster, and both captures omit units, cover, grid,
  tactical overlays, and UI;
- a saved Source Artwork remains byte-identical after later Level or mode
  changes and cannot cross owner, document, or Level scope;
- many sources and attempts remain independently selectable, while one attempt
  accepts no second committed generated, warped, or occlusion stage;
- out-of-order, stale, missing-source, and mismatched-lineage operations fail
  closed, and idempotent retries do not duplicate results;
- artifact detail previews remain unit-free while an installed board renders
  its live units;
- Cover remains editable and non-staling in AI mode, every other ordinary
  environment family remains suppressed there, and Legacy mode restores normal
  environment rendering and authoring;
- stale remembered AI art neither blocks Legacy Save nor becomes an implicit
  AI fallback, and cannot cross an AI canonical boundary until repaired; and
- source/media rows, attempts, Blob bytes, archives, permissions, fencing, and
  observer non-mutation obey their server-owned limits and audit contracts.
