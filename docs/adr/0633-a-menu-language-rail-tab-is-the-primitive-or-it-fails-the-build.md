---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0631](0631-run-preparation-chooses-in-a-tab-column-of-one-line-rows.md)"
---

# ADR-0633: A menu-language rail tab is the primitive, or it fails the build

## Context

`ApparatusRailColumn` / `ApparatusRailTab` already existed and already worked: mount a tab and the
column owns width, gap, placement and material, while the tab owns seat, mark canvas, label
fitting, active state and its slice of the continuous stone. Nobody writes CSS to add one.

Four surfaces hand-assembled their own anyway — Settings' section tabs, the Campaign Editor's
campaign tabs, its editor collection tabs, and Run preparation's Current Run / Start New Run —
each from `chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab', …)` plus a
`--tab-index` style prop plus a hand-built icon span. Every one of them looked right in isolation,
which is the failure mode: a lookalike is only visibly wrong beside the thing it copies.

Run's is the worked example. Same width, same left inset, same first-row top — and then a gap of
`10px` against the rail's `clamp(9px, 0.8vw, 13px)`, and a `min-height: 61px` seat the `clamp()`ed
copy grew past (55.83px at 1280vw, 61.86px at 1920vw) against the tab's flat `block-size: 61px`.
2.76px out by the second row at 1600×900, 5.4px at 1280×800, and equal only near 1250vw by
coincidence. ADR-0556 closed that instance by pointing the list at the rail's own gap variable —
one edit, which the next lookalike would not inherit.

ADR-0059 already says reuse the canonical primitive. Availability is not enforcement.

## Decision

- Every menu-language rail button in the app is `ApparatusRailTab`, and every rail column is
  `ApparatusRailColumn`. All four hand-assembled tabs are converted.
- `frontend/scripts/check-rail-tab-primitive.mjs` fails the build on any module other than the
  primitive that names `settings-tab`, `main-menu-mode-tab` or `apparatus-rail-column` in markup.
  It runs in `npm run check` and in `npm run build`. **There are no exemptions.**
- What a surface needs, the primitive grows. `disabled`, `locked`, `trailing`, `onSelect`,
  `ariaLabel` and a non-navigating host all arrived by converting a lookalike back in, and each
  is now available to every rail rather than to the one screen that built it.
- The non-navigating host is a HOST choice, not a second tab: a `role="button"` element with
  identical classes, seat, mark, copy and states, for the two tabs that cannot use the nav
  control — the Campaign Editor seats an interactive favourite at its trailing edge, which
  cannot nest inside a button, and the collection tabs select without an address.
- The dressing rooms (`PagesLibraryStudio`, `SurfaceDressingRoom`) stay owners: they generate CSS
  that TARGETS these classes for retuning, which is naming the rule rather than building a tab.

## Consequences

- Run's two destinations are rail tabs, so they carry marks like every other destination —
  Current Run wears the Run's Battle mark, Start New Run the Ataraxia emblem the title bar and
  the Enchiridion already use (ADR-0059, ADR-0363).
- Measured identical to the rail beside them — top, height, width and pitch equal at 1280, 1600
  and 1920. Not by agreement between two stacks, but because there is one stack.
- The Run-specific geometry deletes: `.play-run-choice-col`, its gap override, `.play-choice-row`
  and its seat, and `--play-choice-row-surface-pitch` with its own derivation of
  `--chrome-surface-position-y`. The plank is the rail's single `--settings-tab-surface-pitch`.
- `settingsRailContinuity.test.ts` now expects ZERO direct `.settings-tab` renderers outside the
  primitive; its ADR-0063 index wiring is stated once.
- A fifth lookalike is a build failure with a message naming the primitive, not a review catch.
