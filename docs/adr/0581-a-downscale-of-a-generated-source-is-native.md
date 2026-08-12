---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
extends:
  - "[ADR-0578](0578-supersampled-render-downscale-is-native-generation.md)"
refines:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
---

# ADR-0581: A downscale of a generated source is native, and needs no exception

## Context and Problem Statement

Card art is being regenerated against [ADR-0579](0579-card-art-is-briefed-from-a-king-rooted-event.md),
all of it through `codex-image-gen`, which renders far above the 400x280 card window and comes down
to it. Under the policy as written that made every one of the 84 images an *exception*: `native1x:
false`, `spatialResampling: true`, `status: 'owner-approved-production-exception'`, and a branch in
`nativeMediaEvidenceIssue` pinning its own slots and bytes.

There were already six such branches — ADR-0332 resized lipsanon icons, ADR-0360, ADR-0414 starter
derivatives, ADR-0506 the gold-tier divider, ADR-0520 resampled card art, ADR-0560 fitted marks.
Each exists because the general form did not, so each new downscale had to buy its own door. The
ADR-0520 door was also cut to the shape of the thing it first admitted: its slot pattern is
`^ui/run/card-art/[0-9]+-[pkbrq]+/illustration\.png$`, the *family* grammar, which under per-card
slots refuses `f-011011-bpr`, `b` and `k-sole-surviving-issue` alike. The next batch could not have
been accepted at all.

The owner, on being shown that: *"we can just turn that off… like permanently, i don't want that
anymore. downscaling was biting me elsewhere, but i get it now."*

What was biting him elsewhere is ADR-0075/0076: a **recapture**, where an already-accepted 512px
sprite was shrunk and the shrunk copy accepted. That is circular, and it is a different operation
from the one being blocked here. [ADR-0578](0578-supersampled-render-downscale-is-native-generation.md)
already drew the line for 3D renders three days earlier and stated it exactly: *"The line is what
the resampler was handed."*

## Decision

**A downscale of a source is native generation. It carries typed evidence, not an exception.**

`supersampled-native-v1` is that evidence, and it is general — no decision id, no owner-approved
status, no slot allowlist, nothing per-batch:

| field | rule |
|---|---|
| `sourceKind` | `generation` or `render`. A closed set. |
| `native1x` / `spatialResampling` | `true` / `false` — a supersampled downscale **is** native |
| `sourceWidth` / `sourceHeight` | strictly larger than the output in at least one axis, never smaller in either |
| `outputWidth` / `outputHeight` | equal to the uploaded image dimensions |
| `transform` | named, non-empty |
| `sourceSha256` | the raster it came down from |
| `outputSha256` | equal to the uploaded content hash |

**Recapture stays forbidden, and stays unsayable.** `sourceKind` is a closed set precisely so that
finished delivery art cannot be declared as the thing that was downscaled: there is no
`accepted-asset` value to write. ADR-0076 §C and the `accepted-sprite-recapture` block are untouched.
The distinction is not a matter of degree — it is whether the resampler was handed a source or an
output.

**The six existing exception branches stay exactly as they are.** Accepted rows cannot be patched,
and each of those branches authorizes bytes already in the catalog. They are now legacy doors that
nothing new needs, not a pattern to copy. A seventh should never be written; if a downscale does not
fit `supersampled-native-v1`, that is a signal it is a recapture.

## Consequences

- The 84-image card-art batch installs as **native**, with no per-image exception and no owner
  approval gate on the resampling question. The owner still accepts or refuses every candidate on a
  game surface — that gate is about the art, and it is unchanged.
- Any future generator that renders above delivery size gets the same door without an ADR. That is
  the point: six branches existed because there was no general form.
- The claim "native" now means *the pixels were decided at or above delivery size by the thing that
  made them*, rather than *the file was born at exactly this size*. That is a real widening, and it
  is the one ADR-0578 already made for renders — this extends it to generated rasters.
- `spatialResampling: true` no longer marks "downscaled". It now marks only the legacy exception
  rows. Nothing reads it as a quality signal.
- No migration. `native_evidence` is a JSON column and this adds an accepted shape to it.
