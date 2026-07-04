---
status: "accepted"
date: 2026-07-04
deciders: owner (Nelson) + Claude
---

# ADR-0062: The settings-twin rail is placed by ONE shared rule — no per-surface offset

A concrete instance of [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
(reuse the canonical primitive; a bespoke parallel is a defect) for the button rail that the
home menu, Settings, and Campaign all share. Builds on the tuner contract in
`frontend/src/ui/dressing/mmLive.ts` (`MM_LIVE`) + its rot-guard `mmLive.test.ts` (ADR-0057).

## Context and Problem Statement

The home menu, Settings, and Campaign are **one chrome family** — a "settings-twin": a left rail
of tab buttons placed by the shared selectors `.settings-shell` / `.settings-rail-frame` /
`.settings-tab`. This sharing is deliberate and load-bearing: the menu is the **alignment
reference** for the Settings rows, so the Settings rail tabs must sit exactly where the menu
buttons do (the CSS says so, and `mmLive.test.ts` fails CI if the baked geometry drifts). The
rail's on-screen left edge is the shell's centring margin **minus 230px** — the tuner's
`MM_LIVE.btnX` leftward pull (`.settings-rail-frame { transform: translate(-230px, …) }`).

PR #339 fixed a real bug — at narrow viewports the centring margin shrinks while the `-230px`
pull stays put, so below ~1700px CSS width the rail crosses `x=0` and the button labels shear
off the left edge (a 1920 display at 125%/150% Windows scaling has a ~1280–1536 CSS viewport,
squarely in the clip zone; it shipped to production). But it fixed it with a **home-menu-only
override** — `.main-menu-home .settings-shell { margin-inline-start: max(270px, …) }` — floored
at a *different* value (270) than Settings and Campaign got (unfloored). So it **desynced the
home rail from the very rails it must line up with**: below ~1780px vw the home buttons sat
10–190px further right than the Settings rows (measured: at 1760px home railLeft `40` vs
settings `30`; at 1600px home `40` vs settings `-50`). The owner saw the home buttons as "too
indented" versus Settings — the exact drift the family was built to prevent.

The root cause is not the floor value; it is that a **per-surface positional override** existed
at all. A surface in this family may not place its rail differently from its siblings.

## Decision Drivers

- The family exists **so the rails line up**; a per-surface rail offset defeats its whole point.
  Consistency is a feature the owner relies on (ADR-0059).
- The #339 anti-clip fix is real and must be **kept** — the rail must never cross the screen edge
  on any surface.
- "Settings is right": the fix should move the *home* rail onto the Settings rail, not the other
  way, and must not disturb Settings where it already renders correctly.
- A single knob: if the rail's placement ever changes, it changes **once**, for all three
  surfaces, in the tuner-baked shared selectors — never per screen (ADR-0057 / ADR-0059).

## Considered Options

- **Revert #339** — deletes the fork, restoring identity, but reintroduces the production clip on
  every narrow-viewport load.
- **Keep the home-only fork** (status quo) — the rails stay desynced below ~1780px vw.
- **Move the anti-clip floor onto the ONE shared `.settings-shell` rule** so all three surfaces
  floor identically.

## Decision Outcome

Chosen: **the settings-twin rail is placed by exactly one shared rule, and the anti-clip floor
lives on that shared rule.** Concretely:

1. The `.settings-shell` centring margin is floored at **230px** — the exact magnitude of the
   rail's leftward pull (`MM_LIVE.btnX`), so the rail's left edge can never fall below `x=0`:
   `margin-inline-start: max(230px, calc((var(--layout-vw,100vw) - var(--settings-shell-w)) / 2))`.
   Because this is the **shared** shell rule, the home menu, Settings, and Campaign are placed
   identically at every width. Above ~1700px vw ((2 × 230) + 1240) the centred value already
   clears 230, so wide
   layouts stay byte-identical to the tuned placement; below it, all three floor together.
2. The home-only `.main-menu-home .settings-shell` override and its `main-menu-home` class are
   **deleted** (the class had no other consumer).
3. **No surface in this family may add a rail-position override** (a `margin` / `transform` /
   offset scoped to a specific surface's `.settings-shell` or `.settings-rail-frame`). If the
   rail must move, it moves in the tuner-baked shared selectors (`mmLive.ts` `MM_LIVE` +
   `style.css`) for all of them. A per-surface rail offset is an ADR-0059 / ADR-0062 violation.

The floor at `230` (not #339's `270`) is what honors "settings is right": the unified position
is `max(0, centred − 230)`, so Settings is unchanged wherever it was not already clipping, and
the home rail simply drops left onto it. Verified live across 1280–1920px: home == Settings ==
Campaign, delta **0px**, at every width.

Enforcement: a test (`mmLive.test.ts`) fails if any selector other than the bare `.settings-shell`
sets `margin-inline-start` — so the #339 class of per-surface rail fork cannot silently return.

### Consequences

- Good: the three rails are locked identical at every width; the home rail lines up with the
  Settings rows again; the rail never clips on any surface; the fix is one shared rule, not a
  fork, and a test guards against reintroducing a fork.
- Good: at the owner's operating widths (≳1680px) Settings and Campaign are visually unchanged
  (288px+ of panel headroom); only the home rail moved (left, onto Settings).
- Cost / knock-on (resolved): flooring the **shared** shell margin also nudges the Settings/Campaign
  shell right at narrow desktop widths, so the fixed-width (931px) rows panel's right edge would run
  past the viewport below ~1410px vw (it was already broken there before this change — the *rail*
  clipped ~150px off the left instead; the settings-twin fundamentally needs ~1418px = 487 rail +
  931 rows). Fixed in the same change by giving the panel a responsive ceiling
  (`.settings-main-frame { max-width: calc(var(--layout-vw,100vw) - 478px) }`, reset to `none` in the
  ≤960px mobile block): the panel shrinks to keep a ~20px right gutter below ~1410px and is
  byte-identical (full 931px) above, so the tuned wide look and the owner's operating widths are
  untouched. This is a panel-only concern — the rail placement (the subject of this ADR) is
  unaffected and stays identical across all three surfaces.

## Pros and Cons of the Options

### Revert #339
- Good: restores rail identity with zero new mechanism.
- Bad: reintroduces the production label-shearing clip on narrow viewports.

### Keep the home-only fork
- Good: no work.
- Bad: the home rail stays 10–190px off the Settings rail below ~1780px vw — the reported bug.

### Shared floor (chosen)
- Good: identity + anti-clip together, one knob, tuner-clean (the margin line is not a
  tuner-baked value, so `MM_LIVE` and its rot-guard are untouched).
- Bad: the narrow-desktop rows-panel edge above (documented, pre-existing, deferred).

## More Information

- Instance of [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md); relates to
  the rail↔rows alignment intent of [ADR-0028](0028-settings-row-symmetric-side-padding.md) /
  [ADR-0031](0031-ui-spacing-system.md) and the reset-to-baseline discipline of
  [ADR-0057](0057-studio-tuning-surfaces-reset-to-committed-baseline.md).
- Tuner contract: `frontend/src/ui/dressing/mmLive.ts` (`MM_LIVE`) + `mmLive.test.ts`.
- Shared rule: `.settings-shell` in `frontend/src/style.css`; consumers `MainMenu.tsx`,
  `Settings.tsx`, `Campaign.tsx`.
