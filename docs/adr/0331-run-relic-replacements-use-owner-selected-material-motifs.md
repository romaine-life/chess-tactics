---
status: superseded by ADR-0332
date: 2026-08-01
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0332](0332-eight-run-relic-icons-ship-the-approved-resized-pixels.md)"
refines:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0198](0198-run-relic-icons-are-installed-live-art-and-persistently-visible.md)"
  - "[ADR-0264](0264-run-relic-identities-carry-anti-story-residue.md)"
---

# ADR-0331: Run relic replacements use owner-selected material motifs

## Context and Problem Statement

ADR-0264 deliberately hid eight icons whose installed pixels illustrated
superseded relic names. A new eight-icon calibration family was generated and
shown together in the Studio Run Relic Art Review at each icon's exact 64x64
seat. The owner approved all eight visual directions, but the reviewed files
were reduced from larger generation outputs and therefore cannot be accepted as
native production art under ADR-0076.

## Decision Outcome

Chosen: **preserve the approved compositions as calibration references and
regenerate them natively for production.**

The approved visual directions are:

| Stable relic id | Accepted name | Approved material motif | Calibration version |
| --- | --- | --- | --- |
| `congressional-approval` | Sealed Valuation | A sealed appraisal parchment, nested brass vessel weights, and red wax | `8208e17f-cf61-473a-bfc3-76fa82f3656b` |
| `inspirational-record` | Dawn Register | An open departure ledger with a blue ribbon | `02c883e2-89da-4d2f-818d-203706e23d6e` |
| `training-linens` | Field Linens | Folded off-white field linens tied with cord beside a plain wooden peg | `956b9e9e-bcff-4095-95f2-44a2eb632440` |
| `mercenarys-rifle` | Returned Rifle | An unloaded worn service rifle with a blank return tag | `80be336a-0e50-457e-abb0-3a5e08a6070f` |
| `merchants-shopkey` | After-Hours Key | A heavy worn iron key with an oxblood leather tag | `1cb4bae2-f59b-4791-8729-ecc308e5b44e` |
| `occult-dagger` | Unclaimed Dagger | A plain worn utility dagger with a blank inventory tag | `cff24c7d-1f37-4490-afe3-4ce1b0c90535` |
| `deployment-vehicle` | The Waiting Cart | An empty weathered two-wheel handcart with a tied canvas bundle | `33e6ce76-1a4c-4f27-9692-a15d12fe795d` |
| `mercenary-boat` | The Paid Crossing | An empty ferry skiff with rope and dull toll coins | `71edb00f-3c9d-4ab2-9e2f-4d5574b55992` |

The family remains object-first, materially ordinary, and free of people,
readable writing, runes, magic effects, or heroic presentation. Blank tags and
records imply inventory and administration without explaining a plot.

The listed live-media versions remain calibration-only candidates with
`productionEligible=false`, `native1x=false`, and
`spatialResampling=true`. Owner approval selects their iconography and
composition; it does not authorize those bytes for acceptance or runtime use.
Their immutable generation sources and exact prompts remain in live-media
provenance.

Production replacements must be newly generated native 64x64 transparent
PixelLab PNGs that preserve these directions without spatial resampling. The
existing `run-relic-icons:v1` sixteen-slot review and acceptance group remains
in force: the eight replacements and byte-identical candidate copies of the
eight unchanged family members must be mounted and reviewed together before an
atomic pointer swap. Only after that accepted installation may code remove the
eight `replacementArtworkPending` guards.

### Consequences

- Good: the approved visual vocabulary is durable even though the calibration
  files cannot ship.
- Good: no resized asset can be mistaken for native production art or silently
  replace the superseded icons.
- Good: the original sixteen-icon family's atomic review contract remains
  intact.
- Cost: the public Enchiridion continues to say **Art not generated** until the
  native PixelLab pass, grouped review, installation, and explicit code change
  are complete.

## More Information

- Living thematic contract: [`docs/lore-anti-story.md`](../lore-anti-story.md)
- Runtime asset lifecycle: [`docs/runtime-asset-contract.md`](../runtime-asset-contract.md)
