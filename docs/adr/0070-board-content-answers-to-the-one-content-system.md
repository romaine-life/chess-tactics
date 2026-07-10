---
status: "accepted"
date: 2026-07-08
deciders: Nelson, Claude
---

# ADR-0070: Board content answers to the one content system — no compiled-in boards, no item-less viewer states

Every board a surface offers the owner is **content in the one content system** —
authored in the level editor, persisted and served like all content, listed by
catalogs. A `Level` object compiled into the bundle and offered through the UI is a
**shadow content system** and a defect, whatever its purpose. A viewer opens **on a
selected item**; an item-less viewer state filled with fallback content must not
exist. Extends [ADR-0058](0058-every-route-is-click-reachable.md) from routes to
*states*, and is an instance of [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
applied to content.

## Context and Problem Statement

The Board Solver shipped with three "demo boards" — `Level` objects constructed in
TypeScript (`ui/solver/demoBoards.ts`), compiled into the bundle, offered through a
`<select>` in the viewer rail, and used to fill a viewer state that had no level
loaded. The stated purpose was legitimate: the exact solver's learning experience
needs tiny, hand-checkable boards, and no authored level is small enough.

The owner's reaction, on discovering them, defines this ADR's problem statement:

> "you have some system in the background that stores just these three, and is
> somehow summoned in a way you know how to summon them. its INSTANTLY a point
> where i have to figure out how to get control of my system back. where'd you put
> them? how do i get to them? what if i want to change them?"

Every question had a bad answer. The boards lived in source code — not in the
database, not in any campaign. They were reachable through exactly one dropdown —
no catalog listed them, the level editor could not open them, no other surface knew
they existed. Changing them meant editing TypeScript. And because they were
compiled in, they would keep rendering — the surface looking healthy — with the
backend dead, cutting against the repo's hard-won loud-backend-failure principle
(`CLAUDE.md`, the `npm run dev` hard-dependency work).

An ADR audit then confirmed the sharper problem: **all of this was legal.**
ADR-0058 ruled the entry click-reachable, ADR-0059's reviewer read the dropdown as
a config-preset control, ADR-0029 has no clause about viewer-rail pickers. The
owner's design intent — content answers to the owner; surfaces don't carry
ungoverned data — existed only in his head. This ADR writes it down.

The owner also named the correct shape in passing:

> "might have made sense if it was like, you categorized boards somehow, so i could
> pick scenario, unfiltered, or demo. but instead, ALL I SEE is test boards."

## Decision Outcome

Chosen: **one content system, no fallback states**, concretely:

1. **No compiled-in boards behind UI.** Any board/level a player or the owner can
   reach through the app is a `Level` document in the content system (DB-served,
   editor-openable). Code-constructed `Level` objects are legal **only** where they
   never render in the app: tests, fixtures, scripts. The moment one is offered by
   a surface, it must become authored content instead.

2. **Teaching/demo boards are authored levels in a labeled tier.** Pedagogical
   boards (the solver's hand-checkable K+Q-vs-K class) are real levels, tagged as
   demo-tier content the way official campaign content is tiered (ADR-0038), so
   catalogs can offer the owner's own sketch: *scenario / unfiltered / demo* as a
   filter axis (ADR-0029's taxonomy-filter clause then applies for free). They are
   thereby editable in the level editor, listed in catalogs, and owned like
   everything else.

3. **A viewer opens on a selected item — no item-less states.** Candidate
   selection is the catalog's job (ADR-0058's Game Lab shape: catalog → pick →
   Open). A viewer reached without its item does not render a fallback; it lands on
   the catalog shelf. Fallback content standing in for an empty selection is the
   defect this ADR is named for.

4. **Deep links reach only states clicking can produce.** ADR-0058 bans URL-only
   *routes*; this extends the ban to URL-only *states*. A param combination the
   app's own navigation can never produce is not a shipped state — links handed to
   the owner, written to the URL bar, or published anywhere must all canonicalize
   into click-producible states.

5. **Backend failure stays loud.** Because content renders only through the same
   data path as all content, a dead backend looks dead on every surface. No
   compiled-in data may keep a surface looking healthy when its data source is
   down.

### Consequences

- Good: the owner's three questions always have good answers — content is *in the
  editor*, *in the catalog*, *changeable like everything else*. Data provenance is
  legible; there is nothing in the app only an agent knows how to summon.
- Good: the demo/scenario filter falls out of the tiering, instead of a bespoke
  picker.
- **Named debt (this ADR ships in violation):** the Board Solver's
  `ui/solver/demoBoards.ts` + rail `<select>` + item-less viewer state stand in
  violation of rules 1–3. The rework (demos become demo-tier levels; the dropdown
  dies; `vk=solver` without `slvl` lands on the shelf) is pending and directed by
  the owner.
- Cost: demo-tier content needs a home in the officials/tier model (seeding path,
  read-only flags) — one-time plumbing.

## More Information

Extends [ADR-0058](0058-every-route-is-click-reachable.md) (routes → states);
instance of [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
(the content system is the canonical primitive; a compiled-in board list is the
bespoke parallel); leans on [ADR-0038](0038-campaigns-are-tiered-game-content.md)
(tiered content) and [ADR-0029](0029-catalog-category-requirements.md) (filter
axes). Trigger incident: the Board Solver demo boards, 2026-07-08 session.
