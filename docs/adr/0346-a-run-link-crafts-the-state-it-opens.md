---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0338](0338-a-crafted-run-is-composed-from-real-transitions-not-authored-state.md)"
---

# ADR-0346: A Run link crafts the state it opens

## Context

ADR-0338 gave an agent a way to put the owner on an exact Run screen: craft the state, then hand
over `/run?run=<id>`, an address that names the Run without describing it. That link is correct
exactly once. The owner opens it, plays two moves, finds a bug — and now has no way back to the
state the bug was found in. The Run has moved on, and the only route to the starting position is
to ask the agent to craft it again.

That is the loop this instrument existed to remove, and it reappeared one step later. Reproducing
a bug is not a second favour to ask for; it is the first thing anyone does after finding one.

The address form `/run?craft=<phase>&…` was already re-runnable in shape, but it crafted in the
browser and was gated on `import.meta.env.DEV` — so it was not the link an agent could hand over,
and the identity link was.

## Decision

- **A crafted Run is handed over as a link that crafts it.** Opening a craft address sets the
  account's active Run to the state the address names and lands on the Run screen. Opening it
  again does the same thing, from whatever the Run has since become: the link is the restart
  button for the state, not a bookmark for one instance of it. The reply to
  `POST /api/active-run/craft` returns that link as `url`; the identity address survives as
  `runUrl` for pointing at a Run already in hand.
- **The craft happens on the server, through the same admin-gated endpoint**, which is what lets
  the link work in a built app. The gate that protects a played Run is "the caller is an
  administrator", not "this is a development build" — a stronger guarantee than the build check
  it replaces, and one an address cannot forge. The Run screen posts the address it was opened
  at, so there is one crafter, one grammar and one set of refusal messages.
- **The craft parameters are spent on arrival.** The screen lands on a clean `/run`, so playing,
  reloading and navigating from there never re-craft; only returning to the link does. That
  separation is what makes the link safe to keep and safe to press.
- **Every craft is expressible as a link.** The readable grammar covers what it can spell, so a
  link can be read and edited by hand. A spec it cannot spell — today, units carrying abilities —
  is carried as an opaque `?spec=`, the same JSON the endpoint takes. A craft with no link would
  be a state that cannot be returned to, which is the failure this ADR is about.
- **The crafted Run is adopted at the revision the server acknowledged**, not saved back from the
  browser. The server wrote the row; a second write could only race its own craft.

## Consequences

- Handing over a bare `/run?run=<id>` for a state that was crafted is now a defect: it is the
  link that cannot reproduce what it shows. `CLAUDE.md` states the craft link as the required
  hand-off for Run work, including mid-troubleshooting.
- Pressing a craft link discards the Run in progress. That is the intent — an active Run is
  disposable test state — and it is why the craft address is dropped on arrival rather than kept
  in the address bar where a reload would spend it.
- Crafting now needs the backend and an administrator sign-in, where the address form previously
  needed neither. A refusal says which, on the screen, and writes nothing.
- The link is a spec, so it says what the Run contains. ADR-0338's "the link says where you are,
  never what the Run contains" held only for the identity address; for the crafting address the
  contents *are* the address, which is precisely what makes it reproducible.
