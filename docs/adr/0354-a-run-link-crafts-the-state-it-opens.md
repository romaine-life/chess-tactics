---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0338](0338-a-crafted-run-is-composed-from-real-transitions-not-authored-state.md)"
partially_superseded_by:
  - "[ADR-0531](0531-a-craft-link-keeps-its-address-and-presents-the-run.md)'s kept craft address, which the Run screen presents rather than navigating away from"
---

# ADR-0354: A Run link crafts the state it opens

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

- **A crafted Run is handed over as a link that crafts it.** Opening a craft link sets the
  account's active Run to the state it stands for and lands on the Run screen. Opening it again
  does the same thing, from whatever the Run has since become: the link is the restart button for
  the state, not a bookmark for one instance of it.
- **The link is an id — `/run/craft/<id>` — and the spec lives on the server** (`run_craft_links`,
  migration 50). An address that spells the spec out has to grow a parameter for every field the
  spec grows, and there is always a spec it cannot spell; an id has neither problem, stays intact
  through copy-paste and chat linkifiers, and reads as an address rather than a payload.
- **The id is the fingerprint of the spec's own canonical text.** The same requested state always
  mints the same link — in this session and in one a month from now — and re-minting is an insert
  that does nothing. There is no id allocator, no expiry, and no way for two links to disagree
  about what one state means.
- **The craft happens on the server, through admin-gated endpoints**, which is what lets the link
  work in a built app. The gate that protects a played Run is "the caller is an administrator",
  not "this is a development build" — a stronger guarantee than the build check it replaces, and
  one an address cannot forge. `POST /api/run-craft-links` mints; `POST /api/active-run/craft/:id`
  crafts from a minted link; `POST /api/active-run/craft` does both and is the one call an agent
  makes, answering with `url` (the craft link) and `runUrl` (the identity address, for pointing
  at a Run already in hand).
- **The readable `?craft=` grammar stays a way to WRITE a spec, never the link.** Typed into the
  browser it is minted into its permanent id and the address becomes that id, so a hand-authored
  one-off leaves a durable link behind instead of a spec in the address bar. There is exactly one
  thing a crafted state is handed over as.
- ~~**The craft address is spent on arrival.** The screen lands on a clean `/run`, so playing,
  reloading and navigating from there never re-craft; only returning to the link does. That
  separation is what makes the link safe to keep and safe to press.~~ **Superseded by
  [ADR-0531](0531-a-craft-link-keeps-its-address-and-presents-the-run.md):** the link keeps its
  address and the screen presents the Run address it names, so reloading re-crafts. Only
  *opening* the link crafts; staying on it still does not.
- **The crafted Run is adopted at the revision the server acknowledged**, not saved back from the
  browser. The server wrote the row; a second write could only race its own craft.
- **`run_craft_links` is not a schema-readiness requirement.** Craft links are a debugging
  instrument: a database not yet advanced to migration 50 loses craft links and says so, rather
  than failing the gate that stands in front of every other route.

## Consequences

- Handing over a bare `/run?run=<id>` for a state that was crafted is now a defect: it is the
  link that cannot reproduce what it shows. `CLAUDE.md` states the craft link as the required
  hand-off for Run work, including mid-troubleshooting.
- Pressing a craft link discards the Run in progress. That is the intent — an active Run is
  disposable test state. ADR-0531 follows that through: the address is kept in the address bar
  precisely so a reload spends it again.
- Crafting now needs the backend and an administrator sign-in, where the address form previously
  needed neither. A refusal says which, on the screen, and writes nothing.
- A craft link is meaningless to a server whose database was not the one that minted it. That is
  the cost of holding the spec server-side, and it is the right trade: the alternative is an
  address that must carry every field forever.
- ADR-0338's "the link says where you are, never what the Run contains" now holds in a stronger
  form than it did: the address carries an id and nothing else. What it stands for is a stored
  spec, which is why it can rebuild the state instead of merely naming it.
- "Is this the Run screen?" is asked by scene resolution, route prefetch, the title bar and the
  hydration effect. Adding a Run address that only some of them recognised would render the scene
  under the wrong shell, so the predicate is now one shared `isRunRoutePath`.
