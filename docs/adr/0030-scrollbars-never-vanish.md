---
status: "accepted"
date: 2026-06-27
deciders: Nelson, Claude
---

# ADR-0030: Scrollbars never vanish — always-visible bare rail, skinned grip thumb

Codifies the scrollbar policy that was researched at length (a multi-source pass on
always-visible vs conditional/overlay scrollbars, the discoverability evidence, and a
grip bake-off) but never written down. The catalog side is governed by
[ADR-0029](0029-catalog-category-requirements.md); this governs how a scrollbar
*behaves and renders* in the app.

## Context and Problem Statement

Scroll regions need one consistent treatment. The default web habit — `overflow: auto`
(conditional) or OS overlay scrollbars — makes the bar **appear and disappear**, which
(a) reflows the layout as content crosses the scrollable threshold and (b) hides the
fact that content is scrollable at all. The usability evidence is one-sided: NN/g and
Baymard find auto-hidden / vanishing scrollbars cause users to miss scrollable content
and even abandon tasks. The studio's own `studio-control-architecture.md` already states
the **"frame never moves"** rule for exactly this reason.

A first implementation skinned the level-editor palette with the chosen grip, but the
bare track was colored nearly the panel's own shade — so with no thumb it *read as
vanished*. That is the failure this ADR rules out.

## Decision Outcome

Chosen: **scrollbars never vanish.** Concretely:

1. **Always-visible rail.** A skinned scroll region uses `overflow-y: scroll` (the track
   is always rendered) — never `overflow: auto` (conditional) and never hidden-until-hover
   / OS overlay. With nothing to scroll, the **bare rail stays** and must read as a
   visibly recessed groove, distinct from the panel behind it — not a near-invisible line.

2. **No thumb when empty (honest negative affordance).** The thumb appears **only** when
   content overflows. A thumb with nothing to scroll is a *false affordance* — it promises
   more content and frustrates a drag that does nothing (NN/g; affordance theory). So:
   **bare rail when empty, the carved grip thumb when scrollable.** This is the inert state
   the catalog Viewer already shows.

3. **The frame never moves.** The rail's space is permanently reserved
   (`overflow: scroll` + `scrollbar-gutter: stable`), so adding or removing scrollable
   content never reflows the panel.

4. **Render — native scrollbar, skinned with the chosen grip, via one shared `.kit-scroll`
   primitive.** Skin the browser's native scrollbar (`::-webkit-scrollbar`; the app targets
   Chrome) with the catalog's **preferred grip** (currently PixelLab oak — ADR-0029): the
   thumb is the grip, the track is the bare rail. Two hard rules:
   - **Reset** `scrollbar-color` / `scrollbar-width` to `auto` on the element. A non-auto
     value — *even inherited from a parent rail like `.skirmish-hud`* — makes Chrome silently
     drop the entire `::-webkit-scrollbar` skin.
   - Any **rounded** scroll container clips its bar (an `overflow: hidden` rounded wrapper)
     so the bar can't square off the corner.
   Firefox falls back to a themed thin bar via `@supports not selector(::-webkit-scrollbar)`.

5. **Accessibility.** The active thumb meets WCAG 1.4.11 (≥3:1 thumb/track contrast) and
   2.5.x target size; the inert rail is exempt (not interactive) but must still read as a
   recessed groove.

### Consequences

- Good: every scrollbar is present, discoverable, and on-theme; the layout never jumps;
  one primitive (`.kit-scroll`) carries the policy so panels inherit it.
- Cost: the skin is Chrome-only (Firefox degrades gracefully, an accepted target call).
  The grip is a sprite stretched to the thumb, so it squishes when the thumb is short — a
  future refinement 9-slices it (caps fixed, shaft tiled) so it holds shape at any height.

## More Information

- Catalog of grips + the requirements that hold them: [ADR-0029](0029-catalog-category-requirements.md).
- Spec it sits in: `docs/studio-control-architecture.md` (the "frame never moves" rule).
- Implementation: the `.kit-scroll` primitive in `frontend/src/style.css`; the chosen grip
  at `public/assets/ui/scrollbars/oak-pixellab.png`.
