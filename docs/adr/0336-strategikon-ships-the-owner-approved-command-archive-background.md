---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0297](0297-shell-workspaces-own-attached-bodies-and-inset-content-lanes.md)"
---

# ADR-0336: Strategikon ships the owner-approved command-archive background

## Context and Problem Statement

A private 688x384 PixelLab command-archive candidate was placed behind the real
Strategikon at a 1440x900 review viewport. The owner approved that exact view
and requested immediate installation. Its successful composition depends on
`object-fit: cover`, so production use cannot be described as native 1:1
presentation under ADR-0076 even though the stored source PNG itself remains
unresampled.

## Decision Outcome

Chosen: **ship the exact approved bytes through a closed one-asset cover-scaling
exception**.

- The sole authorized content hash is
  `8084f009cae79d3eaaa64bb2c0f5df6e26fc8dfe7d9f0547f24135102d41ffe7`.
  It remains a 688x384 PNG and retains the original PixelLab prompt, model, job,
  seed, source candidate, and dimensions in live provenance.
- The accepted semantic slot is `ui/workspaces/strategikon/background.png` with
  typed `strategikon-background` runtime metadata. The backend validator rejects
  every other slot, hash, size, role, or presentation state under this exception.
- Owner review proof names this ADR, the exact candidate and slot revisions, the
  1440x900 gameplay review surface, and the approved `cover`, pixelated, 0.68
  opacity treatment. Acceptance remains a revision-checked backend transaction.
- The DB-owned `app-ui` drawable installs the slot as required role
  `ui-workspaces-strategikon-background-png`. Normal Strategikon routes resolve
  that immutable accepted URL; they never fetch a candidate or admin catalog.
- `ShellWorkspace` still owns clipping and layer geometry. Strategikon supplies
  only the installed decorative image and cannot recreate shell attachment.
- The query-gated candidate component and its review slot are retired from
  runtime code. The earlier candidate remains private audit history.
- This is a closed exception to ADR-0076 for one exact presentation and hash. It
  does not authorize cover scaling, resizing, or non-native acceptance for any
  replacement or other asset.

### Consequences

- The exact composition approved in the live workspace appears everywhere the
  Strategikon is viewed.
- Runtime membership and bytes remain database/Blob authoritative rather than
  repository-owned.
- Replacing the art requires a new candidate, typed proof, owner approval, and a
  new decision if it still needs non-native presentation.
