---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)'s cold-start arrangement, in which an ordered reveal existed only for the main menu and every other route revealed as one undifferentiated frame"
refines:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0042](0042-title-bar-is-an-invariant-screens-add-slots.md)"
---

# ADR-0367: One cold-load ladder builds background, then chrome, then scene

## Context and Problem Statement

Opening the Level Editor directly built the screen in the wrong order and showed the seam while
doing it. The first thing painted was an **unfinished title bar sitting on top of the loading
curtain** — brand and screen name drawn, its oak fill still transparent, three of its four cluster
icons still empty boxes — over a black rectangle that read "Loading…". Everything else (shared
backdrop, editor chrome, board, panels) then arrived together in a single frame when the curtain
dropped.

The main menu does the opposite, and does it well: curtain, then the vista, then the title bar,
then the buttons, each rung waiting on its own decoded art.

The difference was not effort spent on one screen. It was a **boundary error**. The application
has one loading system — director, `SceneBoundary`, participants, generations — and the
*persistent shell* sits outside it. Rather than bringing the shell inside, a second, parallel
mechanism had been built for it: `StartupSceneContext`, a hardcoded three-rung array in `App`, a
`prepareStartup = isMainMenuPath(initialPath)` route check, and readiness reported from inside
`MainMenu`'s own effect. Two systems for one concern, with only one screen ever enrolled in the
second — and enrolling another was opt-in work nothing prompted anyone to do.

Three concrete consequences, all measured on the live route:

- `prepareStartup` is main-menu-only, so no other route had a reveal order at all.
- `AppTitleBar` renders unconditionally outside `SceneBoundary` at `position: fixed; z-index:
  10000`, above the `z-index: 1000` bootstrap curtain. It is therefore *guaranteed* to be the
  first thing visible on every non-menu cold load, in whatever state it happens to be in.
- The bar's oak surface is referenced only from composed chrome CSS as a bare `url()`, so nothing
  requests it until the bar mounts. At first paint it cannot be loaded. `composeInstalledChromeCss`
  bakes the 9-slice *frames* into data URLs and `main.tsx` awaits it — the fill surface was the
  one image left outside that guarantee, inside the same function.

The manifests said otherwise. Six scene families declare `homepage-background` and `title-bar`
among their `critical` participants. Neither is registered by anything, and neither *can* be:
both are rendered by `App` outside the boundary, where `useSceneParticipant` cannot reach the
registration context. `manifest.critical` was passed to a `loadingMark` and never read again, so
the declaration had no way to fail.

## Decision Drivers

- One concern, one system. A second mechanism for the shell guarantees the two drift.
- The reveal order a screen gets must not depend on whether someone remembered to wire it.
- A declaration that is never checked becomes a comment. This repo has already paid for that
  once: `sceneSlots.ts` derives its projection from the scene graph precisely because a
  hand-maintained copy had silently lost an entry.
- Shell art is **invariant across scenes**. Modelling it as a per-navigation readiness contract
  pays a per-navigation cost for variance that does not exist.
- The curtain exists to hide an incomplete screen. Anything painting above it defeats it.

## Decision

### 1. Shell art is a startup precondition, not a runtime race

The persistent bar's art — the composed chrome surfaces, the brand shield, and the cluster icons —
is decoded **before `App` is imported**, alongside the fonts, catalogs, prop seats and chrome CSS
`main.tsx` already awaits.

`composeInstalledChromeCss()` becomes **complete**: it does not resolve until every image its own
generated CSS references is decoded. The rule is local and unforgettable — *the composed chrome CSS
is not ready until everything it references is drawable* — so no caller has to remember the fill
surface as a separate step, and no future surface can be added to that CSS and left outside the
guarantee.

An unfinished title bar therefore stops being something to gate against and becomes unreachable.

### 2. There is ONE cold-load lifecycle, and it is a three-rung ladder

`startup` and "prepare the initial scene" were mutually exclusive branches. They merge. Every cold
load — every route, no exceptions — walks the same ladder:

| rung | resolves when | reveals |
| --- | --- | --- |
| `background` | the scene's declared background is decoded and painted | the shared backdrop layer |
| `chrome` | the persistent bar's declared art is decoded | the title bar |
| `scene` | `SceneBoundary` reports its painted frame | the scene body |

The third rung is not a new mechanism: it is the existing `destination-painted` contract, and it
hands off to the existing `entering` phase and entrance transition. A scene whose manifest declares
a background other than `homepage` resolves rung one immediately, because there is no shared vista
beneath it.

This is deliberately **not** a per-scene configurable sequence. Every scene has the same shell, so
a per-scene reveal order would be configurability modelling variance that does not exist. What
varies is declared where it actually varies — `manifest.background`, and the scene's own
participants.

The main menu is no longer special. Its three former stages *are* these three rungs; its bespoke
readiness effect and the `isMainMenuPath` check in the loading path are deleted.

### 3. `manifest.critical` is enforced, and therefore must be true

`SceneBoundary` requires every id in `manifest.critical` to have registered **and** painted before
it reports a painted frame. A declared id that never registers is a scene failure, surfaced through
the existing error path rather than waited on forever.

That makes the declarations load-bearing, so they are corrected to the truth:

- `homepage-background` and `title-bar` are removed from every manifest. They are shell, not scene,
  and rungs one and two own them.
- The Level Editor registers the decomposition it already computes — `editorReady` → `document`,
  `editorTerrainPainted` → `board-compositors`, `editorScenePainted` → `visible-editor-chrome` —
  instead of collapsing all three into one participant.
- Every other manifest is trimmed to ids something actually registers.

A guard test cross-references every declared critical id against the `useSceneParticipant` call
sites, so a name cannot re-enter a manifest without a registrant.

### 4. The shell reads committed state, never the address

`titleBarConfig` took the raw location, so the bar adopted the destination's identity and grid the
moment the outgoing fade ended — announcing EDITOR over a fully-painted Main Menu for as long as
the editor took to prepare. It takes `scene.current`. The director remains the only thing that
reads `window.location`.

### 5. `reveal-pending` is inert as well as invisible

A `z-index: 10000` element at `opacity: 0` still takes clicks. The pending state carries
`pointer-events: none`.

## Consequences

- Every route now builds in the same order, and that order is a property of the director rather
  than of one screen's effect.
- The parallel startup mechanism is gone: `StartupSceneContext`'s menu-only wiring, `MainMenu`'s
  readiness effect, and the `isMainMenuPath` branch in the loading path no longer exist. The
  transport context remains, now driven by the director for all routes.
- Cold loads pay for the bar's art before first paint. It is small, immutable per deploy, and was
  already being fetched moments later.
- Manifests are smaller and true. Anything that wants a richer decomposition must register it,
  which is the point.
- `loadingArchitecture.test.ts` asserted the previous arrangement as exact source strings; it is
  rewritten to assert these invariants instead.
