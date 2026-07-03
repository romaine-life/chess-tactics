---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0058: Every route is reachable by clicking — the Studio catalog is the in-app launcher

A page is not shipped until you can get to it by **clicking through the running
app**. A route reachable only by typing its URL is an unfinished route, and
wiring that click-path is part of building the page — never a follow-up, never a
question put to the owner.

## Context and Problem Statement

The Game Lab (`/game-lab`, ADR-adjacent to #25's AI work) shipped — built,
reviewed, merged — while it was reachable **only** by typing its URL. Its entry
in the Studio "Pages" catalog was a stub that *iframed a preview* of the page but
offered no way to open the real thing, and the Studio itself has no menu link
(the sole in-app path to it is a conditional "‹ Catalog" back-button in the Level
Editor). So the tool existed but no sequence of clicks reached it.

Worse than the miss was the recovery: the agent asked the owner *where* to put the
navigation, as if a shipped surface being reachable were a discretionary favor.
It is not. The owner's words: *"this is an ADR violation. if it's not in an ADR,
it needs to be. I cannot be asking agents like they're doing me a favor to make it
so i can navigate to their studio entries."*

The hole is systemic, not one-off: the Pages catalog listed several routes and
**none** of its cards navigated to their live route — every one was a preview
only. "Reachable" was never enforced.

## Decision Outcome

Chosen: **every route must be click-reachable, and the Studio's Pages catalog is
the in-app launcher that guarantees it for standalone dev/app routes.**

1. **No URL-only routes.** Adding a route to `renderRoute` (App.tsx) obligates
   you, in the same change, to provide a click-path to it from the running app.
   A route you can only reach by typing its address is incomplete — treat it like
   a page with no way in.

2. **The Studio catalog is the dev launcher.** The Studio (`/tileset-studio`) is
   the accepted URL/bookmark entry point for dev tooling
   ([studio is "just a web page"](../../CLAUDE.md); ADR-0006 product-UI tier). From
   there, every dev/app surface MUST be one click away. A dev route reachable only
   by typing *its own* URL — not via the launcher — is the violation this ADR names.

3. **Every Pages-catalog entry is openable.** A Pages entry (`pagesCatalog.ts`)
   MUST carry a real navigation action to its live route — a `NavButton`
   (ADR-0052) that leaves the Studio for the actual page — in addition to any
   in-Studio preview/tuning Viewer. The preview is for auditing chrome; the open
   action is for *using* the page. `PageOpenAction` in `PagesLibraryStudio.tsx`
   supplies this for all Pages viewers; it is not optional per page.

4. **Reachability is the builder's job, never the owner's decision.** The agent
   adding a surface wires its click-path as part of the work and verifies it by
   clicking to it. Placement follows the established mechanism (the Pages catalog
   for standalone routes; a catalog category's "View Selected" for in-Studio
   surfaces, ADR-0029). It is never surfaced to the owner as a "where should this
   go?" question — the mechanism already answers that.

### Consequences

- Good: a shipped-but-unreachable route is now a named ADR violation caught in
  review; the Pages catalog becomes a working launcher instead of a preview wall;
  the Game Lab (this ADR's trigger) is reachable Studio → Pages → *Open*.
- Cost: the Studio itself remains URL/bookmark-reached by design (it is the dev
  entry point, not a player surface — [studio-out-of-scope-chrome]). This ADR
  makes everything reachable *from* the launcher; it does not add the launcher to
  player-facing menus, which stays out of scope per ADR-0006.

## More Information

- Related: [ADR-0029](0029-catalog-category-requirements.md) (catalog category
  contract — the in-Studio "View Selected" destination), [ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)
  (NavButton is the in-app nav control), [ADR-0006](0006-ui-decision-criteria.md)
  (dev/product-UI tier). Mechanism: `pagesCatalog.ts`, `PagesLibraryStudio.tsx`
  (`PageOpenAction`), `App.tsx` `renderRoute`.
