---
status: "accepted"
date: 2026-07-04
deciders: Nelson, Claude
---

# ADR-0063: The homepage backdrop is one continuous instance

Closes the gap left open by [ADR-0046 §G](0046-screen-and-control-transitions-are-orchestrated.md)
and [ADR-0049](0049-route-surfaces-own-navigation-transitions.md). Those ADRs declared the
homepage backdrop — *the animated menu scene **and** the synced rain* — a single continuous layer
that must never re-fade or blink across navigation. The rain honored it; the **scene** never did.
This ADR makes the whole backdrop one owned instance and locks it so drift can't recur.

## Context and Problem Statement

Navigating **Main Menu → Editor** visibly "re-adjusted" the background art. Two defects, both a
"bolted-on parallel" of the kind [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
forbids:

1. **The scene re-mounted on every hop.** Each homepage-family screen (main menu, campaign,
   campaign editor, lobbies, party, settings, skirmish picker) rendered its *own*
   `<SceneBackdrop/> + <AmbienceBackground/>` pair — 7 call sites. Only the rain was actually
   continuous: `AmbienceBackground` kept its canvases as module singletons and re-parented them
   across route swaps. The scene had no such mechanism, so React unmounted the old
   `SceneBackdrop` and mounted a fresh one on every navigation — its `container-type: size`
   cover-crop recomputed and its reveal opacity could replay. That recompute is the "re-adjust,"
   and it directly violated ADR-0046 §G ("must NOT re-fade or blink," marked non-negotiable).
2. **The level editor showed a different background entirely.** `/edit` painted
   `.skirmish-screen::before` with the daytime battlefield world (`DEFAULT_BACKGROUND_SET.world`),
   never the shared night scene. A separate implementation, so navigating into it swapped the art
   wholesale.

The invariant already existed in the ADRs; only the scene half of the implementation was missing.
The skirmish *picker* was the precedent — it had already been migrated off its bespoke `::before`
onto the shared scene (ADR-0049) — the level editor was simply never brought in line.

## Decision Drivers

- ADR-0046 §G / ADR-0049: the menu scene **and** rain are app-continuous — one shared layer, never
  a per-screen copy, never re-fading on navigation.
- A reported UI inconsistency is fixed at the shared source of truth, plus a guard test and this
  record — a "never again" structural lock, not a one-off patch.
- Screen-relative layer order must be preserved: scene (`z1`) under rain field (`z2`) under screen
  UI (`z3`) under the near rain overlay (`z5`, drops crossing in front of the UI).
- Every homepage-family surface — **including the level editor** (a tool in the menu family) —
  shows this one backdrop. Only actual gameplay (`/play`) keeps the battlefield world; it is the
  game setting, not a homepage surface.

## Decision Outcome

Chosen: **one owner, `ui/HomepageBackdrop.tsx`, rendered by every homepage-family surface.** It owns
three module singletons in a single `display:contents` host — the scene node, the rain field
canvas, the rain overlay canvas — created once and **re-parented into whichever screen currently
mounts it** (extending the rain's proven mechanism to the scene). A moved node keeps its computed
cover-crop, animation state, and draw loop, so the whole backdrop stays put across navigation.

- The scene is built as plain DOM (`buildSceneBackdropNode` in `ui/SceneBackdrop.tsx`, from the
  same `SCENE_ANIMS` data, identical class names so `style.css` applies unchanged). The React
  `SceneBackdrop` component survives ONLY as a thin wrapper over that builder, used by the studio
  inspector (`SceneAnimLab`'s Animated Scenes picker) to render a standalone calibration scene with
  region boxes — never by a navigation screen.
- Nodes re-parent **into the mounting screen**, not up to the app shell — that keeps the overlay's
  in-front-of-UI layer, which a single shell layer behind the routed screen would break.
- The level editor renders `<HomepageBackdrop/>` as a **sibling of its faded chrome**
  (`.level-editor-root` wraps the `ArtRouteChrome`), so the backdrop sits outside the entrance fade
  (ADR-0046 §B/G) and its own `::before` battlefield is dropped so the shared scene shows through.
  `.level-editor-root` is an isolated stacking context reproducing the menu's layer order — scene
  `z1` < rain field `z2` < editor chrome `z3` (dropped from the inherited `.skirmish-screen` `z5`)
  < near rain overlay `z5`, so the promoted drops cross **in front of** the editor UI. Rain (and
  that overlay) exist only where this shared backdrop is shown; `/play` keeps
  `.skirmish-screen::before` (the battlefield world) and has no rain.
- Guard: `scripts/check-light-art-chrome.mjs` fails if any file reintroduces `AmbienceBackground`,
  or renders the `SceneBackdrop` component outside the owner and the one allowlisted studio inspector
  (`SceneAnimLab`), and still requires HomepageBackdrop routes to enroll chrome through
  `ArtRouteChrome`/`LightArtRouteShell`.

### Consequences

- Good: menu → editor (and every homepage hop) no longer re-crops or blinks the art; the scene is
  as continuous as the rain always claimed to be.
- Good: the level editor is consistent with the rest of the menu family; one component, one line,
  per screen.
- Good: the guard makes the omission class that caused this un-shippable.
- Cost: the scene is now imperative DOM rather than JSX; a new animated region is edited as
  `SCENE_ANIMS` data (unchanged) but rendered by the builder, not React.
- Constraint carried forward: the overlay's in-front-of-UI layer depends on the nodes living inside
  the mounting screen's stacking context — any future move to a shell-level layer must re-solve it.

## More Information

- Code: `frontend/src/ui/HomepageBackdrop.tsx`, `frontend/src/ui/SceneBackdrop.tsx`,
  `frontend/src/ui/LevelEditor.tsx`, `frontend/scripts/check-light-art-chrome.mjs`,
  `frontend/src/style.css` (`.level-editor-root`, `.level-editor-screen::before`).
- Builds on: [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md),
  [ADR-0049](0049-route-surfaces-own-navigation-transitions.md),
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
