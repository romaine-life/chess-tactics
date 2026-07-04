---
status: "accepted"
date: 2026-07-02
deciders: Nelson, Claude
---

# ADR-0051: Light hops dissolve the outgoing chrome; entrances hold for readiness

Completes the navigation half of [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md)'s
choreography for the light-art routes of [ADR-0049](0049-route-surfaces-own-navigation-transitions.md).
Two defects shipped in the first cut and both were user-visible on the menu → Campaign hop:

## Context and Problem Statement

Verified live with frame-by-frame instrumentation (puppeteer timelines against the dev server):

1. **No exit.** A light→light navigation swapped the route in one React commit: the outgoing
   screen's chrome vanished in a single frame (opacity 1 → gone), then the incoming chrome
   played its 350ms entrance from 0. The player read the abrupt vanish + backdrop-only gap as
   a broken "fade out". Heavy routes have the veil's cover phase; light routes had nothing.
2. **Entrance over an empty frame.** The Campaign play screen starts fetching its content
   (`ensureCampaignsHydrated`) only after it mounts, and nothing sequenced the entrance fade
   after the data: the chrome faded in as a bare framed rail, and when hydration landed the
   campaign tabs + level panel mounted at full opacity in one frame — a hard pop. Only the
   first visit per page load shows it (the store stays hydrated), and severity scales with
   API latency (near-invisible on localhost, a real jolt at prod latency). This is exactly the
   reactive-to-load anti-pattern ADR-0046 C.1 names: readiness and reveal must be decoupled —
   "wait until content is ready, then play one deterministic reveal."

## Decision Outcome

### A. Light-hop exit dissolve — the veil-less cover phase

Leaving a **light-art screen** for a **different screen** (heavy ends keep the veil), App holds
the route swap while the outgoing enrolled chrome fades to 0, then swaps; the incoming screen
plays the normal ADR-0046 entrance. Sequential out → in, per ADR-0046 C.3.

- Mechanism: a module-scope exit store (`ui/shell/screenExit.ts`, the `coldReveal` shape);
  `ArtRouteChrome` — already the only enrollment point (ADR-0049) — wears `.screen-exit`
  while it is up. App times the swap (`SCREEN_EXIT_MS`), CSS owns the fade (`--route-exit-ms`,
  lockstep pair). Nothing else changes, so the ambience backdrop/rain stay continuous
  (ADR-0046 G) — only chrome dissolves.
- **Timing is route choreography, not the one-fade-speed law.** `--route-exit-ms: 200ms` joins
  the veil's bespoke family (explicitly out of ADR-0043's token scope, like
  `--route-veil-cover-ms`). Rationale: the canon (Material duration guidance, Apple HIG) has
  exits *shorter* than entrances — leaving matters less than arriving — and a 350ms exit +
  350ms entrance (700ms) would make a light hop slower than the heavy veil (600ms), inverting
  the weight hierarchy. Easing stays tokenized (`--ds-ease-linear`, the pure-opacity fade curve).
- **Same-screen sub-navigation never dissolves.** `routeScreenKey()` (routeSurfaces.ts, unit
  tested) groups paths that `renderRoute` resolves to one component — `/settings/*`,
  `/campaign/*`, `/lobbies/*`, the menu aliases. React preserves that instance across the swap
  and the screen runs its own inner transition (settings tab crossfade, campaign rail), so a
  chrome dissolve would blink an element that never remounts. Kept in sync with `renderRoute`
  by hand.
- **Interleavings** (adversarially reviewed + live-verified): ANY non-heavy nav landing
  mid-dissolve — light-art, light-plain, or same-key — **retargets the pending swap** (queued
  as the LAST target, ADR-0046 D; the armed timer must never fire a stale target over a later
  navigation). A heavy nav mid-dissolve cancels the timer and hands off to the veil, but the
  exit CLASS stays on until the field is opaque (the reveal gate clears it) — dropping it under
  a transparent cover snaps the half-faded chrome back. While the veil is COVERING, the field
  owns `pendingTarget` outright: a mid-cover nav retargets the held swap (or, once the cover
  has committed, swaps directly under the opaque field) and never arms exit machinery — an
  exit timer racing the cover timer for `pendingTarget` left the veil covering *forever*.
- The exit flag stays up **past the swap** until the incoming screen commits (`isPending`
  settles), so a cold lazy chunk can't flash the dissolved screen back; chrome that mounts
  while the flag is up (the incoming screen) skips the class. That post-swap hold is capped
  (`EXIT_HOLD_FAILSAFE_MS`, 4s): on a hover-less device a cold chunk would otherwise strand
  the player on a bare backdrop indefinitely — past the cap the old screen returns and the
  swap lands whenever the chunk does.
- `.screen-exit` is a keyframe **animation, not a transition**, on purpose: settled chrome
  still carries `.screen-enter`'s filled animation, and Chrome does not start a transition off
  an animation removed in the same style change (verified live — the transition variant froze
  settled chrome at opacity 1 for the whole exit window). The exit animation out-cascades
  `.screen-enter`'s `!important` fill by source order, and `ArtRouteChrome` stamps
  `--screen-exit-from` (the current computed opacity, read inside the store's synchronous emit
  BEFORE the class lands) so an exit interrupting a mid-flight entrance fades from wherever the
  entrance had reached.

### B. Entrances hold for readiness (`ready` prop)

`useScreenEntrance(ready = true)` becomes a hold → fade → settled machine, surfaced as
`ArtRouteChrome`'s optional `ready` prop. While un-ready the chrome sits invisible **and inert**
(`.screen-enter-hold`, ADR-0046 D); when the screen reports ready the one deterministic fade
plays — always over real content. A 4s failsafe force-starts the fade so a dead fetch can never
strand an invisible screen (the `coldReveal` posture). The inert-lock timer now starts when the
fade *starts*, not at mount.

- **Campaign** is the founding consumer: `ready` = campaign-store hydration settled
  (`ensureCampaignsHydrated` resolves even on failure — the consumer chains `.catch` first, and
  `hydrate.ts` never caches a rejected promise). Already-hydrated visits are ready at mount —
  nothing holds, nothing re-fades. **CampaignEditor** is the second consumer: its bespoke
  workspace load previously faded in over a *false* "No campaigns yet." (an assertion, not a
  loading state — so the placeholder carve-out below did not apply) with rows popping in after.
- The hold also applies on **cold loads** (a cold-loaded `/campaign` is as empty as a
  navigated-to one); a *ready* cold mount still skips the fade — the menu's cold-load reveal
  owns the first paint (unchanged ADR-0046 behavior).
- **A designed in-chrome loading state satisfies C.1 equally.** The skirmish map picker
  ("Loading maps.") and Lobbies (toolbar renders immediately) mount with real content and do
  NOT need `ready` — the defect is specifically *empty chrome fading with content popping in
  after*. Don't blanket-wire `ready` where a placeholder already carries the entrance.
- **Data prefetch on intent:** `prefetchRoute` (the hover/focus delegate) now also warms route
  *data* — `/campaign*` and `/skirmish` kick `ensureCampaignsHydrated()` (self-deduping) — so
  by click time readiness is usually already true and the hold is ~0ms in practice.

### Consequences

- Good: both directions of a light hop now read as one calm dissolve (out 200ms → in 350ms,
  lighter than the heavy veil); the Campaign first-visit reveal shows a populated screen;
  the empty-frame + pop anti-pattern has a named, reusable fix (`ready`) for any future
  async-content screen.
- Cost: two hand-synced pairs (`SCREEN_EXIT_MS` ↔ `--route-exit-ms`; `routeScreenKey` ↔
  `renderRoute` — including the FALLBACK row: any unmatched path keys `'menu'` because
  `renderRoute` defaults to MainMenu, and the legacy menu aliases are classified light-art so
  leaving them dissolves too), both commented at each site. An exit that is *retargeted back
  to the same screen* mid-dissolve (history nav inside the 200ms window) reappears without a
  fade — accepted as an unreachable-in-practice edge.

## More Information

- Sits on: [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md) (choreography),
  [ADR-0049](0049-route-surfaces-own-navigation-transitions.md) (surface registry),
  [ADR-0043](0043-ui-motion-system.md) (tokens; the exit duration extends its route-choreography
  carve-out).
- Implementation: `ui/shell/screenExit.ts`, `ui/shell/useScreenEntrance.ts`,
  `ui/shell/ArtRouteChrome.tsx`, `ui/App.tsx` (nav handler + prefetch), `routeScreenKey` in
  `ui/routeSurfaces.ts`, `.screen-exit`/`.screen-enter-hold`/`--route-exit-ms` in `style.css`.
- Canon: exits shorter than entrances, accelerate out / decelerate in —
  [Material 3: Easing & duration](https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration),
  [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
