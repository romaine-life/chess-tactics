---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0354](0354-a-run-link-crafts-the-state-it-opens.md)"
---

# ADR-0531: A craft link keeps its address and presents the Run

## Context

ADR-0354 made a crafted Run state hand-overable as `/run/craft/<id>`, a link that re-crafts on
every open. It also decided that the address was **spent on arrival**: the screen crafted, then
replaced the address with a clean `/run`, so that playing, reloading and navigating from there
could never re-craft. The reasoning was that a reload should not silently overwrite the Run in
progress.

That protection was aimed at the wrong thing. The owner is building the game, not playing it —
his active Run is disposable test state, and the repo already says so in as many words. What he
actually does with a craft link is press it over and over: open the state, find the bug, reload,
watch it again. Spending the address on arrival made the browser's own reload button stop being
the restart button after exactly one use. Getting back to the state meant going to find the link
again, in the transcript that handed it over — which is the errand the link exists to remove.

The `to=` form made it worse. A link that opens the Strategikon's Chartulary rewrote itself to
`/run/strategikon/chartulary`, so a reload there re-read the Run as it had since become rather
than re-crafting the state the workspace was supposed to be showing.

## Decision

- **A craft link keeps its own address.** Opening `/run/craft/<id>` crafts and stays there. The
  browser's reload button is the restart button, as many times as it is pressed.
- **The Run screen PRESENTS the Run address the link names**, rather than navigating to it.
  `presentedRunAddress(path, search)` maps a craft link to `/run` — or to the workspace `to=`
  names, consuming that parameter — and is the identity function on every other address. The
  scene graph, the persistent title bar and the Run screen all read it, so nothing downstream
  knows craft links exist and no href the screen writes can carry one.
- **Only opening the link crafts.** Staying on it does not: the one-craft-per-address guard is
  unchanged, so a phase change, a remount, or coming back from Settings shows the Run as it now
  stands. A reload is a fresh page, and therefore a fresh craft.
- **Navigating out of the link is an ordinary Run navigation.** Every Run control addresses
  `/run`, so the first click leaves the craft address behind — and the presented search is what
  it carries, never `to=`.
- **An address repair defers to a craft.** The screen repairs an absent Run's Strategikon
  address and an unavailable battle-review view; neither may fire while a craft is in flight or
  refused, because both would throw the link away before it had landed.

## Consequences

- Reloading a crafted Run re-crafts it, discarding whatever the Run has become. That is the
  intent, and it is the behaviour the owner asked for by name. It is safe for the same reason
  crafting was already safe: there is one active Run per account and it is test state.
- ADR-0354's "the craft address is spent on arrival" no longer holds. Its other decisions —
  the id-only address, the server-held spec, the admin gate, `?craft=` as a way to WRITE a spec
  that mints its own link — are unchanged.
- The address bar shows `/run/craft/<id>` for the whole visit, so a copied address from a
  crafted session is the craft link rather than a bare `/run`. That is the more useful thing to
  have copied.
- A refused craft now keeps its link on screen beside the refusal, so the spec can be fixed and
  the same address pressed again.
