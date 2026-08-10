---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0369](0369-one-cold-load-ladder-builds-background-then-chrome-then-scene.md)"
  - "[ADR-0558](0558-a-menu-language-rail-tab-is-the-primitive-or-it-fails-the-build.md)"
---

# ADR-0561: A rail tab marks what it opened, on the press

## Context

Three rails in the app expand a panel beside themselves rather than leaving for another screen:
the main menu's mode buttons (Play, Editor, Lobbies, Enchiridion, Settings, which fill the shell's
second column), the Enchiridion's section rail, and the Strategikon's. All three are the one
`ApparatusRailTab` primitive (ADR-0558), and all three said which panel was open with the same
thing: a cyan inset ring on the tab, `.settings-tab.is-active`.

The ring is bound to the **committed** scene. `App`'s `path` advances only when the director
accepts `exit-finished`, which for a destination that crossfades is after its exit transition has
run — measured here at 383–1441ms behind the click, depending on the pair of scenes involved.
ADR-0369 wants exactly that for chrome that makes a claim about what is on screen: the title bar
"wears the COMMITTED scene's identity, never the browser's intent", because binding it to intent
made it announce a destination over a screen that was still the previous one.

But a rail button is not making a claim about the screen. It is answering *"which one did I just
press?"* — and for the length of a crossfade it was answering with the tab the player had just
pressed away from, or, on a second press that collapses the open panel, still insisting the panel
was open. Nothing was wrong with the fade; the button was simply mute for the part of the
interaction where the player was still looking at the button.

## Decision

A rail tab that opens a panel wears a **`›` open mark** at its trailing edge, and the mark is
bound to the **intended** address, not the committed one. It appears on the press, before
anything has faded, and nothing about the transition changes: the destination still commits,
fades and paints on the schedule it always did, and the active ring still lights on the committed
address.

The two are deliberately separate props on the primitive — `active` for the ring, `expanded` for
the mark — because they answer different questions on different clocks. Only a tab that actually
opens something takes `expanded`; a mode that navigates away to a full screen has no panel to be
open, so it never wears one.

The intent is read from the **address**, not from a remembered click. `navigateApp` pushes the new
address synchronously in the click handler, so a live read of `window.location` through
`subscribeAppLocation` — the one subscription path for location intent — IS the pressed tab, and
it arrives with three behaviours a remembered click would each have to reimplement: browser Back
moves the mark, a navigation a blocker refuses never moves it (blockers run before `pushState`),
and a deep link arrives with the right tab already marked.

`shared/railOpenIntent.ts` states the rule once for all three rails:

- while the address stays **inside the rail's own family**, the mark follows it — including an
  address that opens no tab at all, which is what a collapsing second press navigates to;
- when the address leaves the family entirely (a Run taken from the Play destination, a Battle
  left for from the Strategikon), the rail keeps wearing what is **committed**, so its marks do
  not blink out over the fade the player is watching it leave through.

A rail whose tabs are siblings under one root derives its family from the very hrefs its host
hands it (`siblingRailAddresses`), because the Enchiridion's section rail mounts under two
ancestries — `/enchiridion/…` on the main menu and `/run|/play/strategikon/enchiridion/…` inside
the Strategikon — and one rule has to serve both without naming a prefix it may not own.

The mark is the same menu lettering as the label beside it, at the same stroke, and it is taken
**out of flow**: gaining it must not move a tab's icon or label by a pixel. It cannot be a grid
item — an explicitly placed one does not stack under the auto-placed label, it evicts it, which
dropped the label of every marked tab onto a second row the first time this was built.

## Consequences

- Pressed on a settled rail, the mark moves in the same animation frame as the address, every
  time: verified with real clicks on all three rails at 0ms after the press, against an active
  ring 383–1441ms behind it, with the director's full `current → exiting → loading → entering`
  cycle intact underneath.
- On the main menu's *first* open from home the two coincide, because that navigation commits its
  address immediately (`scene-empty-slot-origin-committed`). The mark earns its keep on the
  presses that swap an open panel for another and on the press that collapses one.
- Chrome bound to intent is now a thing that exists, so ADR-0369's rule has to be stated with its
  reason rather than as a blanket: chrome that makes a claim about *what is on screen* wears the
  committed scene; a control that answers *what did I just press* may wear the intent. Anything
  that would announce the destination over the outgoing screen still belongs to the committed
  address.
- Settings' rail and the Campaign Editor's rail pass no `expanded` and are unchanged. Either can
  opt in by resolving its own family through the same helper; neither may hand-roll a mark, which
  a source guard enforces alongside the primitive guard from ADR-0558.
