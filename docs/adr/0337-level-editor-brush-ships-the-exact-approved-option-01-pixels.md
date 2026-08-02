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

# ADR-0337: Level Editor Brush ships the exact approved Option 01 pixels

## Context

The Level Editor action is named Brush throughout its interaction model, but a
chrome-unification pass had reused the Pencil icon as an asset shortcut. The
owner requested a dedicated paintbrush and selected PixelLab Option 01, SHA-256
`abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a`,
because its complete wide brush silhouette reads correctly. Subsequent attempts
to re-author it on an assumed 18×18 production canvas introduced artificial
transparent padding and repeatedly damaged or replaced the chosen silhouette.

The assumption was also wrong in the actual cascade: the generic `.le-ico`
rule is 18×18, but the more specific registered toolbar rule renders its glyph
box at 20×20. The re-authored 18px asset further inset its content to 14px,
making it visibly smaller without solving the owner's complaint.

## Decision

- The Brush uses the exact owner-selected Option 01 64×64 PNG bytes. No crop,
  regenerated approximation, or manufactured transparent padding may replace
  that image.
- Pencil remains available for edit actions; the Level Editor Brush resolves
  the dedicated live slot `ui/kit/icons/brush.png`.
- The existing registered toolbar renderer owns a 20×20 glyph box and uses
  `background-size: contain`. The browser scales the exact 64px source into
  that box.
- This is a closed owner-approved production exception to ADR-0076. It is
  restricted to slot `ui/kit/icons/brush.png` and the exact SHA-256 above;
  changing either requires a new decision.
- Typed evidence records schema
  `level-editor-brush-option-01-scaled-production-exception-v1`, decision
  `ADR-0337`, frame 64×64, draw box 20×20, and transform
  `css-background-size-contain-64-to-20`.
- Candidate and source pixels remain in live storage. Exact-byte proof occurs
  in the real Level Editor, and rejected native attempts remain private and
  cannot be promoted.

## Consequences

- The shipped icon is the brush the owner actually selected, not an agent-made
  reinterpretation.
- The exception is truthful about runtime resampling and cannot authorize any
  other UI-kit image.
- Future icon audits must resolve the winning CSS cascade before declaring a
  role-native footprint.
