# Decision Log

A one-row summary of every ADR in this folder. See each record for full context.

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-use-adrs-for-decisions.md) | Use ADRs (MADR) for decisions; contracts become the derived current-state view | accepted | 2026-06-25 |
| [0002](0002-nine-slice-border-image-for-pixel-art-chrome.md) | Render chrome via 9-slice `border-image` of a source PNG (not live atom composition) | accepted | 2026-06-25 |
| [0003](0003-single-shared-brand-lockup.md) | One shared brand lockup everywhere; hero treatment only on the main menu | accepted | 2026-06-25 |
| [0004](0004-standard-app-title-bar.md) | One shared, full-bleed app title bar at a standard height token | accepted | 2026-06-25 |
| [0005](0005-artwork-compare-fidelity-surface.md) | A permanent in-app art-vs-live compare surface for checking art fidelity | accepted | 2026-06-25 |
| [0006](0006-ui-decision-criteria.md) | Criteria + surface-based tie-break for weighing game-UI vs product-UI | accepted | 2026-06-25 |
| [0007](0007-brand-shield-baseline-size-and-placement.md) | Keep the brand shield at baseline size; heraldic rook placement is intentional | accepted | 2026-06-25 |
| [0008](0008-brand-lockup-typography.md) | Brand lockup typography: app-header framing (screen name leads, real descriptor) | accepted | 2026-06-25 |
| [0009](0009-mode-button-from-atoms.md) | Settings mode buttons assembled from atoms (symmetric); retire extracted tab crops | accepted | 2026-06-26 |
| [0010](0010-settings-header-buttons.md) | Header buttons unified to bracket frames (cyan/gold); header content centered | accepted | 2026-06-26 |
| [0011](0011-chrome-art-generated-not-extracted.md) | Chrome art is generated (codex, method-verified) or atom-assembled — not extracted/redrawn | accepted | 2026-06-26 |
| [0012](0012-nine-slice-frames-are-atom-assembled.md) | Scalable 9-slice chrome frames are atom-assembled (corner mirrored → symmetric); whole-frame generation retired for chrome | accepted | 2026-06-26 |
| [0013](0013-transparency-chroma-key-via-subscription.md) | Generated-chrome transparency = chroma-key + despill via the subscription codex; native paid-API path rejected on cost | accepted | 2026-06-26 |
| [0014](0014-ui-chrome-low-fidelity-aesthetic.md) | UI chrome targets the concept's low-fidelity element aesthetic (~few-hundred colors, chunky); forges specify shape + fidelity per ui-chrome-vocabulary.md; never "soft anti-aliased" | accepted | 2026-06-26 |
| [0015](0015-doodads-frame-units-not-bury-them.md) | Doodads frame the unit, not bury it: shin-height foliage that covers feet only; solids aren't stand-inside props; terrain-gated | accepted | 2026-06-27 |
| [0016](0016-single-source-nine-slice-registry.md) | Single-source nine-slice registry: one JSON declares each frame; bake, editor, and catalog all read it | accepted | 2026-06-27 |
| [0017](0017-per-asset-flipsides-handedness.md) | Per-asset `flipSides` handedness so one assembler serves both flat keylines and beveled rails | accepted | 2026-06-27 |
| [0018](0018-variant-states-are-whole-frame-palette-swaps.md) | Active/selected frame states are whole-frame palette swaps (body + border, not just the accent) | accepted | 2026-06-27 |
| [0019](0019-dev-only-nine-slice-editor-save.md) | Dev-only in-app 9-slice editor that saves to disk through the shared bake (serve-only endpoint) | accepted | 2026-06-27 |
| [0020](0020-settings-body-typography-role-scale.md) | Settings body text maps to the role→token type scale (eyebrow 2xs · description xs · value/label sm · row title md); the off-scale stepper readout fixed to sm | accepted | 2026-06-27 |
| [0021](0021-settings-button-label-sizing.md) | Settings ACTION buttons (header + panel pills) share ONE body-tier (sm) label, grouped by role not frame; kept below titles; box hugs the label at a 40px desktop height (not the 44-48px touch floor — mouse game); emphasis via color/fill | accepted | 2026-06-27 |
| [0022](0022-settings-nav-tabs-typography.md) | Settings rail tabs are a NAVIGATION component (governed apart from action buttons); sized at the content row-title tier (md), never above the rows they lead to; SETTINGS stays lg as the hierarchy top; supersedes the undocumented 1.25rem tab size from #148 | accepted | 2026-06-27 |
| [0023](0023-app-title-bar-layout-and-controls.md) | App title bars: centered three-section layout + labeled controls on the kit frame (never bare icons; icon+label in-game, text in menus); generalizes ADR-0010 | accepted | 2026-06-27 |
| [0024](0024-ui-typography-system.md) | UI typography is one tokenized system: --ds-font-* families (Jersey 10 dropped) + the --ds-text-* size scale + weight/tracking tokens, mandatory; raw font literals disallowed; migration is staged screen-by-screen | proposed | 2026-06-27 |

## Minor decisions (no ADR)

Small, low-risk calls not worth a full record:

- **2026-06-26 — Drop the Settings content-pane heading.** Removed the visible
  "SETTINGS / General" heading: the brand lockup already shows the screen and the
  active nav button shows the section, and the concept has no such heading. Kept a
  visually-hidden `h2` for screen-reader structure.
