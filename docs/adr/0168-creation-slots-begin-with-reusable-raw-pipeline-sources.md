---
status: accepted
date: 2026-07-24
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0175](0175-rejected-warp-retries-stay-in-the-same-pipeline-slot.md)"
supersedes: "[ADR-0167](0167-raw-pipeline-sources-can-seed-new-attempts.md)"
partially_supersedes:
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s creation-attempt ownership of an AI-generated raster stage"
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s combined Generation-Reference handoff and deterministic-processing attempt"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s distinction between Generation References and Raw Pipeline Sources"
---

# ADR-0168: Creation slots begin with reusable Raw Pipeline Sources

## Context

ADR-0166 correctly distinguished the Generation Reference supplied to an image
model from the Raw Pipeline Source returned by that model. ADR-0167 nevertheless
treated an existing Raw Pipeline Source as another model input: its action
created a waiting attempt, copied that raw image back to the model, and expected
a second Raw Pipeline Source as the result.

That is not the creation-slot workflow. The Raw Pipeline Source shown before any
grid adjustment is the slot's input. The warp and occlusion operations modify or
derive from it; model generation has already ended. Reusing the same
pre-modification image for another registration or occlusion attempt should not
require another model call, clipboard round trip, upload, or raw result.

The image's storage history also must not become its owner-facing location. A
Raw Pipeline Source may first appear with one slot, but provenance does not make
that slot the only place from which another slot can begin.

## Decision

### Generation handoff and deterministic creation slots are separate

A **Generation Reference** is the exact image supplied to the external image
model. The manual Copy/Paste or file handoff produces and stores one immutable
**Raw Pipeline Source**. That handoff records the reference, canonical semantic
request, returned bytes, hashes, attribution, and available external-generation
provenance. It is not a Board Art creation slot.

A **Board Art creation slot** begins only after one Raw Pipeline Source exists.
It contains:

1. exactly one immutable Raw Pipeline Source input;
2. at most one deterministic warped raster derived from that input; and
3. at most one occlusion-ready result bound to that warped raster.

The raw image is not the slot's generated output or a once-fillable raw output
stage. It is the pre-modification seed for the slot's deterministic work. A
newly returned AI-painted PNG may create a new Raw Pipeline Source and then
start a slot from it, but those remain two distinct state transitions.

### Raw Pipeline Sources are reusable inputs

A content-complete `kind='raw'` Raw Pipeline Source is a level-scoped immutable
media identity. Zero, one, or many creation slots may reference the same exact
version and Blob. Reusing it:

- does not allocate, upload, crop, resize, transcode, or rewrite media;
- does not reclassify it as a Generation Reference;
- does not mutate any existing slot or derivative;
- does not create a second raw output; and
- does not make the slot in which it first appeared the source's owner.

The source retains its exact generation or import provenance. A slot records
the exact raw version and content hash plus the compatible canonical geometry
and processing context required by its deterministic operations. It may retain
where the raw was first introduced as descriptive provenance, but that
relationship is neither ownership nor processing parentage.

Reusing an already generated raw image for another deterministic branch is not
a new model run. It therefore does not independently change or replace the raw
source's isolation evidence. Derived results inherit the source's available
generation provenance and add their own deterministic operation provenance.

### New attempt is a workspace-level source choice

**New attempt** is a persistent Board Art Pipeline action available whether
there are zero, one, or many existing slots. It opens the pipeline-source
choice, where the owner may select any eligible retained Raw Pipeline Source for
the current Level, including the exact pre-modification input already used by
another slot.

Selecting an existing source creates a new slot that immediately references
that raw input and is ready for grid fitting. It does not enter a
waiting-for-generated-artwork state and does not present **Copy pipeline
source**, **Paste AI-painted board**, or **Use this board** as another model
handoff. The existing source may be identified by immutable image identity and
provenance, but the owner never has to navigate into its first slot to start the
new one.

If no Raw Pipeline Source exists, the source choice directs the owner to the
Generation Reference/manual generation handoff or accepts a new exact PNG
through the named Raw Pipeline Source import path. An empty slot is never
required merely to make source creation reachable.

Warped and occlusion-ready artifacts are results, not slot inputs, and remain
ineligible for this source choice.

### Deterministic lineage and migration

The backend owns slot identity and enforces one raw input, at most one warp, and
at most one occlusion-ready result. The warp's raster parent is the selected raw
version even when another slot references that same raw. The occlusion-ready
result remains bound to that slot's exact warped raster. Idempotent retries
return the already committed deterministic result; a different committed warp
or occlusion result requires another slot.

A migrated historical slot remains an honest record of the lineage that was
retained. Its missing Generation Reference, prompt, model, or parameters are
never fabricated. Its exact content-complete Raw Pipeline Source may still be
selected as the input of a new deterministic slot when its stored geometry
binding is compatible. The new slot neither repairs the historical record nor
claims new model-generation evidence.

## Consequences

- The owner can start another registration or occlusion attempt from the same
  pre-modification image without involving Codex or the filesystem.
- The UI follows the task: start a new slot, choose its input, then perform
  deterministic processing.
- One immutable raw image can support several attributable processing branches
  without duplicate bytes or ambiguous output ownership.
- Generation provenance and deterministic-transform provenance remain separate
  and honest.

## Verification

Contract-complete implementation proves that:

- **New attempt** remains reachable with zero existing slots and opens a
  Raw-Pipeline-Source choice;
- selecting Slot 1's exact pre-modification input creates a separate slot whose
  raw input identity and hash are byte-for-byte identical;
- the new slot begins at grid fitting and never asks for another model result or
  raw commit;
- no source card inside Slot 1 is the only entrance to this operation;
- the source version, Blob, existing slots, hashes, statuses, and provenance
  remain unchanged and no media allocation occurs;
- several slots may reference one raw input while each owns only its own warped
  and occlusion-ready results;
- a compatible historical raw may be selected without fabricating its missing
  generation provenance; and
- cross-owner, cross-document, cross-Level, wrong-kind, missing-content,
  incompatible-geometry, stale-writer, and idempotency mismatches fail closed.
