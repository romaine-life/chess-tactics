---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0510](0510-held-cards-are-immutable-formations.md)'s retirement of The Paid Crossing"
supersedes:
  - "[ADR-0331](0331-run-lipsanon-replacements-use-owner-selected-material-motifs.md)"
partially_supersedes:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0198](0198-run-lipsanon-icons-are-installed-live-art-and-persistently-visible.md)"
  - "[ADR-0264](0264-run-lipsanon-identities-carry-anti-story-residue.md)"
---

# ADR-0332: Eight Run lipsanon icons ship the approved resized pixels

## Context and Problem Statement

ADR-0331 recorded eight owner-approved Run lipsanon compositions but kept their
64x64 transformed files in calibration status because the built-in generator
produced 1254x1254 sources. The owner subsequently decided that resizing is the
required production method for this specific set and approved the exact shown
pixels for installation. Requiring a visually approximate regeneration would
discard that decision without providing another available production path.

## Decision Outcome

Chosen: **accept the eight exact approved 64x64 transformed PNGs as a closed
production exception.**

The authorized mapping is immutable:

| Stable lipsanon id | Output SHA-256 |
| --- | --- |
| `congressional-approval` | `928f9ceb7a5612ff0d2216b70422b972b04492a4c9ed277e5122721b390c52d0` |
| `inspirational-record` | `b6d18510fcff3e374a1899421b2928fb16cd79c0108ad00179059cca539e309d` |
| `training-linens` | `e1349bd32f7bcaccbd706dbc55a6f97df8a0dd96533f309d1e2c0ea38aabf461` |
| `mercenarys-rifle` | `afe1a1f718a4406a60ae85adb002af846ef4a9c6000c20b97d67a0b57c06fa60` |
| `merchants-shopkey` | `c8e0e45f9b863e42401c8e72cf0c42364a3c70c0c8dfb7362978b79e9b5adfa0` |
| `occult-dagger` | `bc7984ccbabf45e39e672957d7ed1e2716c7e82e14b671fcbed38a7f82b9208d` |
| `deployment-vehicle` | `d004c0f5be36094ebc137a9cdbebfe69d847636a7c8ddaff50bac8b687aac0bc` |
| `mercenary-boat` | `9e5945cc9c200d1e3818e10f3f6e3494150ce83f30aa95c7e499daa4462ae1e8` |

Each accepted version must retain its archived 1254x1254 source version and
SHA-256, exact generation prompt, chroma-key cleanup, crop, nearest-neighbor
64x64 fit, 52px maximum subject footprint, alpha threshold, and resulting
output hash in live provenance. Its `nativeEvidence` uses schema
`run-lipsanon-resized-production-exception-v1`, names this ADR, and truthfully keeps
`native1x=false` plus `spatialResampling=true`.

The backend admits that schema only when the semantic slot and uploaded bytes
match the closed mapping above and the recorded transform is
`chroma-key-crop-nearest-neighbor-fit-52-alpha-threshold-96`. Other Run lipsana,
future replacement bytes, and every other raster family remain governed by the
ordinary ADR-0076 native-1x gate.

The existing `run-lipsanon-icons:v1` group remains atomic. The eight replacements
are reviewed and accepted with byte-identical candidates for the other eight
members of the original family. After installation, the eight
`replacementArtworkPending` guards are removed.

### Consequences

- Good: the exact art approved in the real lipsanon seat becomes the shipped art.
- Good: provenance remains truthful about the resize instead of relabeling the
  outputs as native.
- Good: the exception is mechanically closed to eight slots and eight hashes.
- Cost: these eight icons are a named exception to the project's ordinary
  native-pixel production rule.

## More Information

- Living generation contract:
  [`docs/asset-generation-contract.md`](../asset-generation-contract.md)
- Runtime media contract:
  [`docs/runtime-asset-contract.md`](../runtime-asset-contract.md)
