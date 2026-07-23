---
status: "accepted"
date: 2026-07-20
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0151](0151-predrawn-backgrounds-retain-live-ground-cover.md)"
supersedes:
  - "[ADR-0122](0122-predrawn-occlusion-derives-from-canonical-raised-geometry.md)"
  - "[ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md)"
partially_supersedes:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)'s no-resampling/native-regeneration rule for whole-board pre-drawn scenes"
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)'s unqualified semantic-slot-only Level identity and public-read/admin-write access clauses for pre-drawn lineages"
  - "[ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md)'s regeneration-only production clause"
  - "[ADR-0111](0111-predrawn-refit-target-dimensions-are-owner-configurable.md)'s regeneration-only production clause"
  - "[ADR-0115](0115-predrawn-registration-handoff-is-a-compact-copy-packet.md)'s required owner-to-agent installation handoff"
  - "[ADR-0116](0116-registered-predrawn-candidates-activate-the-locked-editor.md)'s additive-environment and temporary-source activation clauses"
  - "[ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)'s runtime-transformed source-polygon boundary calculation"
  - "[ADR-0134](0134-predrawn-candidate-review-uses-exact-board-plane-registration.md)'s development-only production-registration clause"
  - "[ADR-0135](0135-predrawn-registration-is-owner-picked-source-geometry.md)'s non-persisted production-alignment clause"
---

# ADR-0147: Immutable pre-drawn background versions own derived raster and occlusion

## Context

The pre-drawn review instrument already lets the owner place a grid over a raw
generated PNG. Production nevertheless stores that registration as Level data
and asks every renderer to repeat the warp at runtime. It also reconstructs
occlusion at runtime from ordinary raised board sprites. Installing the result
therefore still depends on an owner-to-agent copy packet, and the accepted
visual result is not one independently inspectable immutable artifact.

Those boundaries make a deterministic image operation feel like agent work.
They also keep ordinary environment rendering involved after a complete scene
has replaced it: doodads and cover remain visible, and a runtime mask can change
when canonical sprite art changes even though the selected painting does not.

The owner needs a direct, understandable pipeline: upload a PNG, derive any
registered raster and occlusion artifacts, inspect their lineage, and choose
the exact result for the Level. Choosing it in an editing session must remain
separate from saving or publishing canonical content.

## Decision

### Immutable typed lineage

Pre-drawn background media is a live-storage-backed lineage of immutable typed
versions. Postgres owns version identities, types, parent edges, content hashes,
dimensions, derivation parameters, status, ownership, and audit events. Private
Blob Storage owns the immutable bytes. Git and browser-local storage own none of
those media bytes or accepted pointers. Once a version's PNG is accepted, its
bytes, type, lineage, bounds, operation, and provenance are immutable; only its
audited lifecycle status may advance or archive. Archive never deletes or makes
the immutable content unresolvable. A working-copy, canonical, mask-lineage, or
other retained reference pins the exact version metadata and Blob object against
hard deletion. Raw and derived versions remain owner/admin-readable while they
are draft or ready, including when a private canonical Level pins a ready
version. Only an explicit public transaction—official Review and publish/Publish
or owner-invoked public-map Publish—makes its exact selected versions publicly
readable.

The lineage supports these operations:

- Uploading a PNG creates an immutable **raw raster** root. Its exact uploaded
  pixels, actual dimensions, declared world bounds, and coordinate basis remain
  available, and the raw raster is itself settable as a Level background.
- Applying an owner grid registration creates a new immutable **registered
  raster** child. A versioned deterministic rasterizer applies the complete
  row/column guide map and four-corner transform once and writes the transformed
  full scene as new raster bytes. It records the exact raster parent,
  registration, rasterizer version, output dimensions, world bounds, coordinate
  basis, and output hash. It never mutates or replaces its parent. Runtime
  renderers do not interpret registration data or repeat this warp.
- Creating occlusion for a raster creates an immutable **depth-aware occlusion
  mask** child tied to that exact raster version. Its versioned format stores the
  alpha coverage and scene depth needed to compare each live unit draw against
  painted foreground geometry. It records the exact raster parent, dimensions,
  coordinate basis, canonical environment-geometry revision or content hash,
  depth convention, generator version, and mask hash. A mask for another raster,
  geometry revision, size, or depth convention is invalid rather than
  approximately reusable.

A settable background selection names one exact raster version and either one
exact matching occlusion-mask child or an explicit **no occlusion mask** state.
The selection is a durable domain version reference, not a candidate UUID, blob
hash, temporary URL, generated filename, browser-local key, mutable media-slot
pointer, or picker state. Derivation parameters remain lineage and audit data;
they are not runtime rendering instructions. The raster version owns its frame
dimensions and world bounds. A working or canonical Level projection may carry
validated copies of those values for self-contained rendering, but they must
exactly match the selected version and are never independent authoring knobs.

### Owner-operated installation

The Level Editor owns the complete instrument. It lets the owner upload or
choose a raw PNG, adjust and preview the grid, create a registered raster child,
create and inspect a depth-aware mask child, browse the immutable parent/child
lineage, and select the exact raster-plus-mask state. Each derivation reports
its input version, output version, status, and failure. No Codex handoff,
address-bar state, copied registration packet, filesystem transform, or agent
judgment is required to create or install a deterministic derivative. A compact
handoff export may remain only as a side-effect-free diagnostic or provenance
aid.

`Set` applies the selected background version to the current fenced Level
Editor working copy through the normal compare-and-swap/autosave boundary. The
UI must identify the version now set in the working copy and whether its mask is
ready or explicitly absent. `Set` does not Save, Review, Publish, mutate an
official Level, move a global accepted pointer, or imply any of those actions.

The existing canonical persistence boundary remains explicit. `Save` commits a
private Level's working copy to its canonical account workspace. `Review and
publish`/`Publish` commits an official Level through its ordinary review and
publication transaction. Both paths verify the exact selection and its already-
immutable Blob objects and hashes. Private Save atomically writes and pins the
private canonical Level reference while keeping ready artifacts owner-scoped; it
does not make media public. Official Review and publish/Publish atomically marks
the exact selected version rows published and writes the official Level
reference.

The separately labeled user-map Publish action and `POST /api/maps/publish`
likewise verify the private canonical Level's exact selection, then atomically
mark those version rows published with the owner-free public-map snapshot. It is
not `Set`, private Save, or a link-copy side effect. Failure changes neither
database state. None of these transactions moves or rewrites Blob bytes.
Creating, previewing, or setting a version never crosses a canonical or public
boundary by itself.

### Runtime composition

When a generated pre-drawn background selection is active, its exact selected
raster is the sole source of environment pixels. Every ordinary environment
draw is suppressed, including terrain tops, Subterrain, roads, rivers and other
linear features, macrotiles and generated regions, props and scenery, fences
and posts, walls and wall art, doodads, ground cover, environmental shadows,
lighting effects, animation, and particles.

Only live units/pieces and their unit-owned presentation, tactical overlays
such as the optional grid, selection, movement, threat, zone, and objective
indicators, and application/editor UI remain composited above the background.
If a matching mask is selected, its stored alpha and depth clip only live-unit
pixels where painted environmental pixels are nearer. Tactical overlays and UI
remain readable above the environment unless another named contract explicitly
places one beneath it. An explicit no-mask selection performs no environment
occlusion; the runtime never invents one.

Editor, read-only viewer, gameplay, browser thumbnail, and server thumbnail all
resolve the same selected raster and matching mask state. A missing raster,
missing selected mask, mismatched lineage, invalid dimensions, or unsupported
format is an availability failure. Consumers fail closed and surface that
failure; they never fall back to composed environment pixels, a mutable slot's
latest version, a runtime image warp, or a mask reconstructed from canonical
sprites.

The selected raster version's persisted frame dimensions and world bounds—not a
runtime-transformed source polygon—define its art boundary for the shared
viewport-cover zoom floor and pan clamp. ADR-0121's centered floor, real-art-edge
pan stop, and resize/zoom reclamp behavior remain; only its boundary source moves
to the immutable version.

## Migration

Cutover is a one-time materialization, not a compatibility mode. Each existing
pre-drawn Level's accepted source bytes and saved alignment are converted into
an immutable raw root and, when the alignment is non-identity, a deterministic
registered-raster child. Its runtime-derived occlusion state is materialized as
a matching persisted mask child or recorded explicitly as no mask. The Level is
then rewritten to the exact background selection and read back through every
renderer.

After successful migration, remove the legacy independently authoritative Level
slot, source-dimension, and alignment fields, browser-local installation
authority, runtime registration warp, runtime canonical-sprite mask derivation,
and ordinary-environment overlay exceptions end to end. Version-matched frame
dimensions and world-bound integrity copies may remain as authorized above.
There is no steady-state dual read, synthetic default, or fallback to the retired
path.

## Consequences

- A grid adjustment and occlusion build are routine deterministic owner actions,
  not agent-operated installation work.
- Raw input, every transformed raster, and every mask remain immutable and
  independently attributable; deriving a replacement never destroys an earlier
  choice.
- The Level's working copy and canonical saved/published state can point at
  different exact versions without ambiguity, and the UI can name both.
- Accepted rendering is stable against later changes to registration code,
  canonical environment sprites, or mutable media pointers.
- Rasterization intentionally changes pixels in a registered child, superseding
  ADR-0123's runtime-only warp and unchanged-accepted-pixel requirement. The raw
  parent still preserves the uploaded bytes exactly.
- Persisted depth-aware masks intentionally supersede ADR-0122's storage-free
  runtime mask derivation.

## Verification

Contract-complete implementation proves that:

- uploading and setting a raw raster preserves its exact bytes;
- the same parent, registration, dimensions, world bounds, coordinate basis, and
  rasterizer version produce the same registered-raster hash, while a new
  derivation never mutates its parent;
- a mask is accepted only for its exact raster, geometry revision, dimensions,
  depth convention, and format, and any Level-projected dimensions or bounds
  exactly match the selected raster version;
- `Set` changes only the fenced working copy, while Save and Publish are the only
  applicable canonical transitions;
- private Save pins the exact selection without enabling anonymous content
  reads, while official Publish or explicitly invoked user public-map Publish
  makes only its exact selected versions public;
- working, canonical, and lineage references remain resolvable through archive
  and reject any cleanup that would delete their metadata or Blob objects;
- every named environment family is absent in generated-background mode and only
  units, tactical overlays, and UI remain;
- every renderer resolves the same raster-plus-mask selection and fails closed
  on missing or mismatched artifacts; and
- the owner can complete, inspect, set, save, and publish the workflow from the
  application without an agent or copied handoff packet.
