---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md)"
  - "[ADR-0102](0102-runtime-buttons-use-registered-inner-chrome.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
---

# ADR-0554: The Controls panel wears the leaf material, and a portrait keeps its scene

## Context and Problem Statement

ADR-0433 gave the game a material hierarchy — cool stone is the structural field, `hybrid-wood-oak`
is the leaf — and rolled it out on the Run surface by naming the surface at each call site. The one
shell **Controls** panel never followed. On a Run Battle that put a wooden Sectio rail one screen
away from a Battle rail whose every trigger — the tab strip, the Board View toggles, the fifteen
command-card keys, the stepper keys, Reroll deployment, Undo, Retry, Abandon Run, Admin Controls —
was the same teal as the panel behind it, and the Level Editor's rail, which is that same component,
read the same way.

The Selected Unit seat and the roster thumbnails in that panel had a second problem: they showed a
bust on flat fill while the *same unit* in the Strategikon's Prosopography stood on its painted
scene. The scene was being resolved and passed; ADR-0082's guard against a local raw-CSS background
winning over installed chrome was stripping it back off every FRAMED portrait, and only the unframed
composition escaped.

## Decision Drivers

- The panel borrows controls it does not own — `Stepper`, `AdminControls`, the Run lifecycle buttons.
  Annotating call sites either misses them or reskins those same components on every other screen.
- ADR-0433 forbids a repeated leaf collection restarting its wood at the same origin, and ADR-0063
  forbids deriving that phase from DOM position.
- An `!important` role default that merely out-specifies a named surface is one selector edit away
  from silently swapping the two.
- A portrait's scene is installed catalog media, not decoration a feature painted on in CSS.

## Considered Options

- Name the surface at every call site in the panel, as the Run rollout did.
- Make `ChromeButton` emit the leaf surface for every registered button, everywhere.
- Record the material on the chrome-unit registry and have the panel adopt it.

## Decision Outcome

Chosen: **the registry carries the material, and the Controls panel adopts it.**

- `ChromeUnitSpec.material` is `'leaf' | 'structural'`. Concrete triggers — text button, toggle, tool
  square and its keys, asset swatch, dropdown — are leaves. `inner-box` and `inner-locked-rectangle`
  stay structural because they are containers and a template base, and `inner-list-row` stays
  structural because ADR-0433 already put operation rows in the structural class; a row's *actions*
  are the leaves, not the row.
- `chromeFamilyRuntime` emits one rule painting leaf units inside `[data-shell-controls-panel]` with
  `CHROME_LEAF_FILL_SURFACE`, from `chromeUnitMaterialSelectors('leaf')`. Both Controls panels are
  the same component, so the Battle rail and the Level Editor rail adopt the hierarchy together; no
  other surface changes.
- A control that names its own surface keeps it: leaf and role rules both exclude
  `[data-chrome-fill-surface]`, so a named surface is never in a specificity race it could lose.
- The phase index is one token pair, `--chrome-leaf-surface-index` and `--chrome-leaf-surface-pitch`,
  with one derivation of `--chrome-surface-position-y`. The two Run-scoped copies of that calc are
  deleted, and `leafSurfacePhase(index)` is the shared way a renderer states the index its data
  already has: the tab strip and the command card phase from their own `map` index, the Board View
  toggles from authored positions, and the stepper's − / + from the component that owns the pair.
- **A box carrying its own installed image is excluded from the role field, not painted over.** The
  ADR-0082 guard is split so it strips a raw-CSS background from `.inner-box:not(.has-backdrop)`
  while the frame still applies to every inner box, and `chromeFillCss` for the inner role skips
  backdrop and named-surface boxes for the same reason.
- `UnitPortrait` resolves the installed scene from its piece when no `backdrop` is passed, so the ONE
  portrait renderer owns it and a call site cannot forget; `backdrop={null}` is the deliberate opt
  out. The redundant explicit passes in the HUD and the Run army row are removed.
- The empty Selected Unit seat wears the leaf material. It is a terminal identity plate with no
  scene to stand in, and unpainted it read as a hole beside the portraits it alternates with.

Rejected — **make it the `ChromeButton` default**: it reskins Settings, the Studio and the menus in
one edit, which is the silent whole-app reskin ADR-0433 explicitly declined; the destination-at-a-time
rollout is that ADR's stated process. Rejected — **annotate every call site**: it cannot reach a
borrowed component without changing that component everywhere, which is the same problem wearing a
larger diff.

### Consequences

- Good: a control added to either Controls panel wears the right material by existing, and the
  material of a chrome unit is now a fact a wiped-context agent can read off the registry.
- Good: framed and unframed portraits of the same unit finally agree.
- Cost: the material lives in two vocabularies for now — the registry for units, and the named
  surface for one-off boxes that ask for it by name.
- Cost: `.run-roster-filters` still phases on its own `--run-roster-filter-index`; it was left alone
  rather than folded into the shared token in this pass.

## More Information

- [ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md) — the material hierarchy and
  the rollout process this destination follows.
- [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md) — the roles that own panel
  and control paint, now split into frame and field.
- [ADR-0063](0063-rail-tab-continuity-is-data-indexed-not-dom-positioned.md) — why the phase index is
  data-owned.
- Guards: `skirmishChromeHierarchy.test.ts` pins the registry material, the panel rule, the phase
  helpers, and the portrait scene; `runChromeHierarchy.test.ts` pins the single shared derivation.
