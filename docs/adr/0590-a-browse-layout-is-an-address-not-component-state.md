---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)"
  - "[ADR-0256](0256-individual-lipsana-are-routable-from-the-main-menu-enchiridion.md)"
  - "[ADR-0510](0510-enchiridion-cards-filters-rarity-on-structural-teal.md)"
---

# ADR-0590: A browse layout is an address, not component state

## Context and Problem Statement

The Lipsana reference browses its records two ways — named **Rows** and a **Grouped** case of seats —
and which way was `useState` inside `LipsanaCodex`. Every address that could reach the section landed
on Rows, so the only way to see Grouped was to press its tab.

That surfaced as a handoff failure, in the owner's words: *"i shouldn't have to press grouped if you
want me to look at grouped, why not add a route?"* The repo already says this is a defect rather than
a limitation — *"When a surface you need is not addressable, that is worth fixing — an unlinkable
review surface costs him a navigation every single time it comes up"* — and the cost is paid on every
single review of that view, forever.

The precedent was already in the same module and had already answered the same question for the
neighbouring gallery: ADR-0510 keeps card filters as ephemeral *view* state and addresses them anyway,
because a filtered view is a thing worth linking someone to. A browse layout is the same kind of thing.

## Decision Outcome

Chosen: **the layout is a query param on the section, read and validated by the route module.**

- `?browse=rows|grouped` on the Lipsana section. `rows` is the DEFAULT and is *removed* rather than
  written, so the bare address stays the bare address and there is one canonical URL per view.
- The vocabulary, the reader and the writer live in `enchiridionRoute` beside the card filters,
  because **the address is what validates them**: a query carries whatever a reader typed, so an
  absent, empty, repeated, wrongly-cased or prototype-shaped value (`?browse=constructor`) reads as
  rows rather than throwing or erasing the address.
- `withLipsanaBrowseMode(search, mode)` preserves **every other param the host was carrying**. That is
  what lets the Strategikon put this on an address whose other parameters it does not own, and it is
  why the section rail — which already appends `search` — carries the layout across a section change
  without knowing the param exists.
- A tab is the **same `ReferenceTrigger` the records are** (ADR-0256): a `NavButton` to that address
  under a host that supplies one, a plain selection button under a host that does not. Both transports
  keep working, and the Battle-hosted reference keeps its RECORD selection ephemeral while addressing
  the layout — the record is a thing you page through, the layout is a thing you link to.
- Picking a relic keeps the layout it was picked in, exactly as picking a card face keeps the filters
  it was found under.
- Scene identity is unchanged, because it is derived from the PATH: switching layout does not re-run a
  section transition.

## Consequences

- The grouped case is linkable from both hosts, including through a crafted Run:
  `/run/craft/<id>?to=/run/strategikon/lipsanotheca%3Fbrowse%3Dgrouped`.
- The two tabs are now navigation, so browser Back moves between layouts. That is the same behaviour
  the card filters already have and is correct for a view worth addressing.
- One more param in the Strategikon's query. It is carried, never interpreted, by everything else
  there.
- The general rule this leaves behind: a view state a handoff link would want to name belongs in the
  address, and the route module owns its vocabulary so the query cannot be believed unchecked.

## More Information

- [CLAUDE.md](../../CLAUDE.md) — the deep-link inventory this is recorded in
