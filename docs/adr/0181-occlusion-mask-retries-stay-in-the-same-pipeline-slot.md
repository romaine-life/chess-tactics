---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
refines:
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0175](0175-rejected-warp-retries-stay-in-the-same-pipeline-slot.md)"
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
  - "[ADR-0180](0180-predrawn-occlusion-selects-final-raster-pixels.md)"
---

# ADR-0181: Occlusion-mask retries stay in the same pipeline slot

## Context

The Board Art Pipeline permits one current occlusion child per creation slot.
ADR-0180 correctly makes that child immutable once created, but the first
implementation confused immutable media with an irrevocable slot pointer. A
mask the owner rejected could neither be removed from the slot nor replaced.
Its presence also blocked retrying the warped stage, leaving the owner with an
otherwise valid Raw Pipeline Source, warp, grid fit, and cyan calibration that
could not continue.

The owner needs the same ordinary reject-and-retry workflow already established
for warped boards by ADR-0175. A rejected mask must not force a new slot or the
loss of approved upstream work.

The label **Occlusion-ready board** also describes implementation readiness
rather than owner-visible state. The artifact already carries a mask; the UI
should say so directly.

## Decision

### The owner-facing stage is Board with occlusion mask

The final pipeline stage and its creation action use **Board with occlusion
mask** and **Create board with occlusion mask** in owner-facing UI, help,
feedback, and current living contracts. The storage kind `occlusion`, API field
`occlusion_version_id`, and internal stage identifier `occlusion-ready` remain
stable technical identifiers and are not migrated merely to rename the UI.

### One slot may retry its current mask

The current **Board with occlusion mask** exposes **Discard mask & edit again**.
After explicit confirmation, one fenced transaction:

1. verifies the exact active slot, current occlusion child, attempt revision,
   working-document revision, and writer fence;
2. detaches only that exact `occlusion_version_id` from the slot;
3. preserves the slot, Raw Pipeline Source, warped artifact, fitted
   registration, and saved cyan move-highlight profile;
4. advances the attempt processing revision so replacement creation has a
   distinct deterministic identity;
5. records attributable background-version and attempt events; and
6. returns the slot to mask authoring over the same exact warped pixels.

The UI mounts the acknowledged response, selects the preserved warp, and opens
the mask editor. The action always has colocated confirmation, progress,
success, or concrete failure feedback. A disabled or failed action never
silently does nothing.

### Immutable history remains immutable

Discarding does not rewrite mask bytes, provenance, hashes, dimensions, depth,
or lineage. A rejected draft mask that is not referenced by the canonical Level
is archived as immutable retained history. If the canonical Level still
references that mask, the row remains retained at its existing status while the
slot pointer is detached. The retained historical result is not presented as
the slot's current mask and does not prevent creating a replacement.

A repeated request carrying the same exact discard intent is idempotent: it
returns the already-detached result and current acknowledged document instead
of detaching another result or advancing either revision twice. A stale
attempt, document, version, or session fence fails closed.

### Working selection falls back; canonical content does not move

If the cloud working Level references the discarded mask, the same transaction
replaces that selection with its exact warped background without an occlusion
identifier. Background mode, schema-version-3 cyan profile, gameplay data, and
every other Level field remain unchanged. This is an ordinary working-copy
revision and is returned for immediate mounting.

The operation never rewrites or republishes the canonical Level. A canonical
AI or dormant Legacy selection may therefore continue to reference retained
historical mask media until the owner performs the ordinary Save or Publish
boundary. This preserves the project's working-copy/canonical separation while
still making the active slot usable immediately.

## Consequences

- A poor mask can be retried in place without another creation slot.
- Approved grid and cyan work survive exactly.
- Current UI describes the artifact's actual state instead of vague readiness.
- Canonical levels and published history never change as a side effect of a
  pipeline retry.
- A canonical reference can keep an old immutable mask row retained after it is
  no longer the slot's current result.

## Verification

Contract-complete implementation proves that:

- only the exact current mask can be detached under attempt, document, and
  writer compare-and-swap fences;
- retry replay is idempotent and stale or cross-scope requests fail closed;
- the warp, registration, cyan profile, source, and slot identity survive;
- a matching working selection becomes the same warp without a mask while all
  unrelated Level fields and background mode remain unchanged;
- a canonical reference is not rewritten and prevents archival of the media it
  still needs;
- an unreferenced rejected mask is archived without changing its bytes or
  provenance;
- a replacement mask can be created in the same slot at the next processing
  revision; and
- the owner can reach the action, receives visible progress and failure
  feedback, and returns directly to the full mask editor.
