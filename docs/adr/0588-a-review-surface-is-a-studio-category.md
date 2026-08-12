---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0058](0058-every-route-is-click-reachable.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0588: A review surface is a Studio category, and the Studio's address cannot be borrowed

## Context

Six owner-review surfaces were their own screens hanging off the Studio's path:

```
/studio?brushIconReview=1        /studio?runSectioReview=1
/studio?menuIconReview=1         /studio?lipsanonReview=1
/studio?runProgressIconReview=1  /studio?terrainMarkReview=1
```

`App.tsx` matched each **before** the Studio rendered and returned its own `<main>`. So each one
took the Studio's address and none of the Studio:

- **No category rail.** The only way in was a URL someone handed you. That is exactly the failure
  [ADR-0058](0058-every-route-is-click-reachable.md) named — a Studio entry is not done until it
  is clickable — reintroduced through an address the guard did not cover.
- **No Controls panel.** Each grew a private screen shell (`*-review-screen`, `*-review-panel`) with
  its own grid, its own headings and its own responsive rules, so a page that reviews game chrome
  matched nothing else in the game.
- **A second scene participant.** Each called `useSceneParticipant('studio', …)` beside the Studio's
  own, holding the scene on a fetch the shell already covers.

The repo already had the right shape and had had it for a while: `actionmarks`, `adlectiomark` and
`runrailmarks` are Studio **categories**, built as `useX()` + `XCatalog` + `XControls` and registered
in one table. The bolt-on pattern survived anyway because it was *available* — every one of the six
was written by copying the last one.

A **seventh** — `/studio?commandCardMarkReview=1` — landed on `main` while these six were being
converted, written the same way. That is the argument for a gate rather than a cleanup: the pattern
reproduces itself faster than it can be removed by hand.

The owner's framing is the decision: **the system should not have allowed it.**

## Decision

**`/studio` routes the Studio, and nothing else. A review surface is a Studio category.**

- Each of the seven is now a category: `brushmark`, `menumarks`, `runprogressmarks`, `sectiowrap`,
  `lipsanonart`, `terrainmark`, `commandcardmarks`. Each supplies `main` and `controls` and appears in the category
  rail like any other, so it is reachable by clicking.
- Each dropped its screen shell, its `OuterChromeBox` header and its own `useSceneParticipant`. The
  Studio is the `'studio'` participant; a category inside its catalog body must not enrol a second
  time. `loadingArchitecture.test.ts` asserts this for all seven.
- The mounted proof does **not** change. A review is only worth the seat it mounts: the menu marks
  are still whole rails through `ApparatusRailColumn`/`ApparatusRailTab`, the brush is still in the
  registered editor toolbar, the Run marks are still in the real title-bar measure row, the Sectio
  wraps still wrap live card faces, and the terrain mark is still the real `EnchiridionSectionRail`
  with one seat swapped. Only the shell around them changed.
- **Old addresses keep working and canonicalise themselves.** The Studio's own route reader maps
  each legacy flag onto its category (`LEGACY_REVIEW_SCREEN_CATEGORY`), and the route writer, which
  rebuilds the query from scratch, drops the flag on the first write — the same way the
  `/nine-slice-editor` and `/studio/wall-candidates` path aliases already canonicalise. That table
  is the whole migration surface and does not grow.

**The rule is enforced, not documented.** `frontend/scripts/check-studio-surfaces.mjs` fails the
build when `App.tsx` pairs `path === '/studio'` with a query condition at all. It runs in both
`npm run build` and `npm run check`. A legacy address still resolves, but no new screen can take
the Studio's address, because the route branch that would do it cannot be written.

The guard keys on the **path pairing**, not on a list of flag names. Keying on names would only
have caught the six that already existed, which is the mistake that let the sixth — and, mid-flight,
the seventh — be written.

## A fitted mark's ink height belongs to its SEAT, not to the main menu

Installing the chosen terrain mark surfaced a second thing frozen where it should have been
parameterised. A mark packed to a rail's box is *resampled*, so it cannot claim native 1×; the
honest schema is [ADR-0560](0560-main-menu-marks-share-one-ink-box-and-one-centre.md)'s
`main-menu-mark-fitted-production-exception-v1`, which records the fit instead of denying it. But
that validator pinned the ink height at **52** globally, and the comment beside its slot list
already said the opposite of what the code did — that the list is *"every mark drawn into a FITTED
RAIL SEAT … not confined to the main menu's own five"*, and that a shared ink height is a property
of **the seat**.

The Enchiridion's section rail measures **40**. So a terrain mark could state 52 and be a lie, or
state 40 and be refused. `FITTED_MARK_INK_HEIGHT_BY_SLOT` now carries the height per slot, 52
stays the default, and the transform string is derived from it so the two cannot drift. Every
already-accepted row keeps validating against exactly what it stored, and the completeness
validator's `metadata.inkHeight` check moved the same way.

Without this, all 64 terrain candidates were **uninstallable** — acceptance would have failed at
the last click with `media_native_evidence_required`, which is the failure `runRailMarkOptions`
already filters candidates to avoid showing.

## Consequences

- A new review surface starts as a category and is reachable the day it lands. `main` and `controls`
  are arbitrary elements, so a category can hold anything a screen could — a long-form comparison
  (`sectiowrap`) as readily as a card grid.
- If a surface genuinely needs something a category cannot express, the fix is to grow the category
  contract in `TilePreview.tsx`, the way `ApparatusRailTab` grew props instead of tolerating
  lookalikes ([ADR-0558](0558-a-menu-language-rail-tab-is-the-primitive-or-it-fails-the-build.md), [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)).
- Roughly 260 lines of per-screen CSS went away with the shells. The categories reuse
  `tileset-studio-grid` and `StudioCatalogCard`, so re-skinning the Studio now re-skins them too.
- Owner proofs recorded from these surfaces still carry `surfaceUrl: window.location.href`, which is
  now a `/studio?cat=…` address. Proofs recorded before this change name the old address; they are
  historical records of where the owner actually stood and are not rewritten.
