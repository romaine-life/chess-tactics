---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0058: A dev surface is a Studio category, reachable by clicking — never a URL-only route

A page is not shipped until you can get to it by **clicking through the running
app**. For a dev/inspector surface that means it is added the way
`docs/studio-control-architecture.md` §"Adding to the studio" already
prescribes — a **Studio catalog category** — so it is reachable by its tab **by
construction**. Wiring that click-path is part of building the surface. It is
never deferred, and it is never a question put to the owner.

## Context and Problem Statement

The Game Lab shipped — built, reviewed, merged — as a standalone `/game-lab`
route with its own full-page layout, reachable **only** by typing the URL. To
paper over that, it got a stub card in the Studio "Pages" catalog and a bolted-on
"Open" button, and then an ADR to justify the reachability problem the wrong build
had created.

All of that was avoidable, because the architecture already answers it. The
Studio is **one tool**; `docs/studio-control-architecture.md` states plainly:

> A new thing … is a new **category** in Catalog, plus its non-catalog
> destination — a **Lab surface** … if it's board-placeable, or nothing extra if
> it's read-only (it inherits the shared **Viewer** for free). It inherits the
> topbar, breadcrumb, right panel, and content-only main automatically. **If
> adding it requires a new layout, the architecture (not the new thing) is
> wrong.**

The Game Lab ignored every clause: a new layout, a new route, a bolt-on
launcher. And worse than the miss was the recovery — the agent asked the owner
*where* to put the navigation, as if a shipped surface being reachable were a
discretionary favor. His words: *"this is an ADR violation. if it's not in an
ADR, it needs to be. I cannot be asking agents like they're doing me a favor to
make it so i can navigate to their studio entries."*

## Decision Outcome

Chosen: **a dev surface is added to the Studio as a catalog category, reachable
by its tab by construction; a standalone route that isn't reachable through the
Studio is the violation.**

1. **Add via the registry, not a route.** A new dev/inspector surface is one
   `catalogCategories` entry in `TilePreview.tsx` — its `main` (a grid) and its
   `controls` (the rail) — and, if it's an operated tool rather than a read-only
   item, a Viewer **kind** hosting it (like the embedded Portrait / 9-Slice
   editors; the Game Lab is the `gamelab` kind). You get the selector tab, the
   topbar/breadcrumb/frame, and reachability for free. No new route, no new
   layout. If it seems to need its own page, the fit is wrong — rework it into the
   frame (ADR-0029, `studio-control-architecture.md`), don't route around it.

2. **No URL-only routes.** A surface reachable only by typing its address is
   incomplete. If a deep-link alias is genuinely wanted (like `/unit-studio`), it
   canonicalises INTO the Studio and the surface is still reachable by clicking
   without it.

3. **Reachability is the builder's job, verified by clicking — never the
   owner's decision.** The agent adding a surface wires the click-path and
   confirms it by navigating to it through the UI. Placement is already answered
   by the mechanism (a category tab); it is never surfaced to the owner as a
   "where should this go?" question.

### Consequences

- Good: a shipped-but-unreachable dev surface, or one built as a bespoke route
  with its own layout, is a named violation caught in review. The Game Lab (this
  ADR's trigger) is now a Studio category, reachable Studio → Game Lab tab → pick
  a level → Open.
- Cost/scope: the Studio itself stays URL/bookmark-reached by design — it is the
  dev entry point, not a player surface (ADR-0006 dev tier,
  [studio-out-of-scope-chrome]). This ADR governs surfaces *inside* the Studio;
  it does not add the Studio to player-facing menus.

## More Information

- Authoritative spec: `docs/studio-control-architecture.md` (§"Adding to the
  studio", the registry mechanism). Related: [ADR-0029](0029-catalog-category-requirements.md)
  (catalog category contract), [ADR-0006](0006-ui-decision-criteria.md) (dev vs
  product-UI tier), [ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)
  (NavButton). Mechanism: `catalogCategories` in `TilePreview.tsx`; the Game Lab
  is `GameLabCatalog` + `GameLabViewer` in `GameLab.tsx`.
