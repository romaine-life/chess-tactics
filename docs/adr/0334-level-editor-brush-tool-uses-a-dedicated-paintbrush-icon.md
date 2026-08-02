---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0026](0026-ui-kit-icon-canvas.md)"
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md)"
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
---

# ADR-0334: Level Editor Brush uses a dedicated paintbrush icon

## Context

The Level Editor action is named Brush throughout its interaction model, route
state, accessible label, palette copy, and registered Chrome unit. A July 2026
Chrome-unification pass replaced the editor's local tool tiles with shared
UI-kit glyphs and mapped `.ic-brush` to the already available Pencil icon. No
product or art-direction decision preferred a pencil; the mapping was an asset-
reuse shortcut. Pencil also continues to mean Edit board in the Campaign
Editor, while Studio already uses a paintbrush to mean arm this asset as the
board brush.

## Decision

- The Level Editor Brush tool uses a dedicated standalone paintbrush glyph. It
  does not reuse Pencil; Pencil remains available for edit actions.
- The stable private candidate slot is `ui/kit/icons/brush.png`, with domain
  `ui-kit` and role `icon`. Candidate and source pixels remain in live storage;
  Git owns only the prompt, contract, review UI, and text provenance.
- Exploration begins as one native 64x64 PixelLab family derived from the
  installed UI-kit glyph language. The icon must remain immediately readable as
  a paintbrush and must not resemble a pencil, pen, quill, wand, or broom.
- Owner review happens at `/studio?brushIconReview=1`. Every current candidate
  renders in the registered `inner-brush-tool` button at the existing 18px
  display calibration and at its exact native 64x64 source size, beside the
  installed Pencil baseline. Selecting an option changes only the review
  preview.
- The 18px presentation is calibration under ADR-0076, not production
  acceptance of a downscaled 64px source. After the owner chooses a motif, the
  chosen opaque footprint and tool-button draw rect become the brief for a
  role-native production candidate. Acceptance must consume those final pixels
  1:1 and use the typed UI-kit promotion path; the generic candidate endpoint
  cannot activate them.
- Until that owner selection, role-native pass, and typed acceptance succeed,
  `.ic-brush` continues resolving the installed Pencil. No review route or
  local choice may substitute or promote a candidate.

## Consequences

- The tool's glyph matches its painting and stamping interaction instead of
  overloading the edit-pencil metaphor.
- The owner compares silhouettes in the exact toolbar context before any
  runtime pointer changes.
- One additional native-size pass is required after motif selection; the review
  family cannot be mislabeled as production merely because it looks acceptable
  when scaled down.
- UI-kit promotion remains fail-closed until its typed validator, exact-byte
  owner proof, and atomic acceptance transaction cover this role.
