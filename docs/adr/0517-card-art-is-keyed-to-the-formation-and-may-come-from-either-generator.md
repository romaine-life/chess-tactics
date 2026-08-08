---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0282](0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md)'s roster keying, 49-card identity set, single generator, and atomic acceptance group"
extends:
  - "[ADR-0516](0516-the-run-opens-with-a-formation-card-grant-on-a-band-deep-enough-to-turn.md)"
---

# ADR-0517: Card art is keyed to the formation and may come from either generator

## Context

[ADR-0282](0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md) made Units-card art one
PixelLab set of 49 roster slots, accepted atomically. That keying means one illustration serves
every shape a roster can make: 272 live cards drew on 34 images, and the picture could not answer
the arrangement even though the arrangement is what the card is about.

The owner asked for art per card identity and for Codex to carry part of the batch. Both are
refused by the server, which enforces ADR-0282 as a typed projection: a frozen 49-id allowlist,
`pixellab-pixflux` as the only permitted model, and a proof that mounts all 49 at once.

## Decision

- **Art is keyed to `(footprint, roster)`.** 272 cards collapse to 94 families; 178 cards are a
  re-seating of another and share their family's illustration, which is the axis an illustration
  cannot depict anyway. Every distinct footprint and every distinct roster survives.
- **The identity set is derived from the live deck, not restated.** A frozen list is what made the
  roster set impossible to extend without editing the server.
- **Either generator may produce a family.** `pixellab-pixflux` renders natively at 400x280;
  `codex-image-gen` renders far above the card window and is downsampled to it. That is spatial
  resampling and is recorded as such under an owner-approved exception naming the source raster
  and the exact transform — never claimed as native.
- **A family is promoted on its own.** The atomic group existed so the roster set could not go
  half-old; a family illustration is complete by itself, and its owner proof mounts its own native
  raster at canonical 1x on Studio Card Prompts.
- **Evidence strength is unchanged**: exact prompt, its SHA-256, scene and unit direction, and a
  job identifier — the PixelLab job id, or the Codex rollout thread whose log carries the
  `image_generation` marker that proves an image model produced the bytes.

The v1 prompt manifest is left exactly as accepted. It is the historical record of the shipped 49,
including the eye-concealment rule ADR-0282 retired; the family direction states its own subject,
unit roles, and historical anchors rather than rewriting that record.

## Consequences

- 94 illustrations replace 34. The 51 roster-keyed slots remain installed but unreferenced.
- Two generators means two looks in one catalog: PixelLab's half is palette-locked to the existing
  art, Codex's half is richer and softer for having been downsampled. That seam is accepted.
- A known defect ships: 47 of the PixelLab illustrations average 44.7% single-colour backdrop,
  because `create_image_pixflux` treats a thin scene as a sprite plate and no prompt overrode it.
  The owner accepted these as good enough for now; re-rolling them through Codex remains open.
