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

## Minor decisions (no ADR)

Small, low-risk calls not worth a full record:

- **2026-06-26 — Drop the Settings content-pane heading.** Removed the visible
  "SETTINGS / General" heading: the brand lockup already shows the screen and the
  active nav button shows the section, and the concept has no such heading. Kept a
  visually-hidden `h2` for screen-reader structure.
