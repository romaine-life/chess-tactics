---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0555](0555-the-controls-panel-wears-the-leaf-material-and-a-portrait-keeps-its-scene.md)"
---

# ADR-0556: A result screen wears the leaf material, and the role field excludes it

## Context and Problem Statement

ADR-0433 gave the game a material hierarchy — cool stone is the structural field, `hybrid-wood-oak`
is the leaf — and rolls it out one destination at a time. The screens a Battle or a Run **ends** on
were never a destination. The Run's board-visible **Victory** banner put a teal `Rewards ›` on the
grass; the aftermath report titled **VICTORY** put a teal **Continue** under a stone ledger; the won
War put a teal **Finish Run** on the vista; and the result cards beside them — the Run Battle's
Defeat/Draw actions, the campaign result, the netplay result — were teal for the same reason.

Chasing that exposed the larger problem. ADR-0555's panel rule paints leaves inside
`[data-shell-controls-panel]` at `(0,4,0) !important`, and it never *excluded* those leaves from the
inner role FIELD default — it won the tie on source order alone. [#881](https://github.com/romaine-life/chess-tactics/pull/881)
then added a third `:not()` to that field default to rescue the rail tabs, taking it to `(0,6,0)`,
and the Controls panel silently lost its oak one day after ADR-0555 shipped it: the tab strip, the
Board View toggles, the command keys, the Run lifecycle buttons, on both the Battle rail and the
Level Editor rail. Measured live, that leaf rule matches and is overruled by
`background-image: none !important` from the field.

The field rule's own comment has named this trap twice now — *exclude, do not out-specify* — and both
times the exclusion list was completed for the case at hand while leaving the next case winning on a
tie. A third destination adopting the material by out-specifying would have been the third instance.

## Decision Drivers

- A result screen borrows components it does not own (`RunBattleRetryButton`,
  `RunDeploymentRerollButton`, `RunBattleUndoButton`), so annotating call sites either misses them
  or reskins those components everywhere — the reason ADR-0555 chose host adoption.
- Every `:not()` added to the role field raises the field's own specificity, so any rule that must
  beat it by specificity is one edit from losing. Only exclusion is stable.
- ADR-0433 forbids a repeated leaf collection restarting its wood at the same origin, and ADR-0063
  forbids deriving that phase from DOM position.
- A host attribute per destination (`[data-shell-controls-panel]`, then one per result surface)
  would mean a matching `:not()` per destination in the field rule. That list has to stay one name.

## Considered Options

- Name the surface at each result-screen call site with `data-chrome-fill-surface`.
- Add a second host attribute for result surfaces and a second exclusion to the field default.
- Give host adoption ONE name, and exclude that one name from the field default.

## Decision Outcome

Chosen: **one host attribute for leaf adoption, excluded from the role field.**

- `data-chrome-leaf-surface` marks a surface that has adopted ADR-0433's hierarchy wholesale: its
  structural boxes keep the stone field, every registered leaf unit inside it wears the oak.
  `leafSurfaceHostCss()` replaces `controlsPanelLeafSurfaceCss()` and paints from that one attribute,
  so the Controls panel and every later destination share a single rule.
- The inner role field default gains `:not([data-chrome-leaf-surface] :is(<leaf selectors>))`, built
  from the same `chromeUnitMaterialSelectors('leaf')` the paint rule builds from. The field no longer
  *matches* an adopted leaf, so the two can never trade places on a specificity edit. This restores
  the oak #881 took off the Controls panel.
- The destination is the **result screens**, all of them, because they are one family the player
  meets in one moment and a half-adopted family reads as a bug the first time a Battle is lost: the
  Run Battle Victory banner, the Run Battle Defeat/Draw card, the campaign result card, the netplay
  result card and its persistent exit, plus the Run's aftermath and won-War scenes.
- The two Run scenes adopt from their **view**, not from a call site: `RunSceneViewport` stamps the
  attribute for `aftermath` and `victory`, which is the data the viewport already has (ADR-0063).
- Repeated action rows phase their wood from the action's authored seat in the row via
  `leafSurfacePhase(index)`. The three borrowed Run battle buttons gain a `style` pass-through for
  exactly that; they already forwarded `className`.
- `Finish Run` is given `justify-self: start`. The workspace lane stretches its grid children, which
  was inconspicuous under the flat field and reads as a wall the moment it wears a plank.

Rejected — **name the surface at each call site**: it cannot reach a borrowed component without
changing that component on every other screen. Rejected — **a second host attribute**: it makes the
field default's exclusion list grow once per destination, which is the maintenance shape that
produced this regression in the first place.

### Consequences

- Good: a button added to any adopted surface wears the right material by existing, and adoption is
  one attribute a wiped-context agent can grep for.
- Good: the Controls panel's oak is restored and is no longer holding on by source order.
- Cost: the field default now carries four `:not()`s. That is the price of exclusion over
  out-specification, and the alternative is the failure this ADR records.
- Cost: the material still lives in two vocabularies — the registry for units under an adopted host,
  and `data-chrome-fill-surface` for one-off boxes that ask by name. ADR-0555's cost, unchanged.

## More Information

- [ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md) — the material hierarchy and
  the destination-at-a-time rollout this follows.
- [ADR-0555](0555-the-controls-panel-wears-the-leaf-material-and-a-portrait-keeps-its-scene.md) — the
  registry material and the first host adoption, generalized here.
- [ADR-0063](0063-rail-tab-continuity-is-data-indexed-not-dom-positioned.md) — why the phase index
  and the scene's own adoption are data-owned.
- Guards: `chromeFamilyRuntime.test.ts` pins the field exclusion against the emitted CSS;
  `skirmishChromeHierarchy.test.ts` pins the shared host rule; `runChromeHierarchy.test.ts` pins the
  adopted result surfaces and their phase indices.
