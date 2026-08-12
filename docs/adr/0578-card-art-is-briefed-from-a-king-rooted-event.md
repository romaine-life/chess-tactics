---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0520](0520-card-art-is-keyed-to-the-formation-and-may-come-from-either-generator.md)'s (footprint, roster) art keying and its `arrangement` direction field"
refines:
  - "[ADR-0282](0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md)"
  - "[docs/lore/historical-anchors/README.md](../lore/historical-anchors/README.md)"
---

# ADR-0578: Card art is briefed from a king-rooted event, not from a background anchor

## Context and Problem Statement

The owner, looking at a Sectio row: *"i noticed these two cards have the same art, aren't we on a
reduced deck size? i thought all these cards would have unique art."*

Both true. [ADR-0520](0520-card-art-is-keyed-to-the-formation-and-may-come-from-either-generator.md)
keys art to `(footprint, roster)`, so **Escort of Lances** and **Lances at Opposite Corners** — the
same 2×2 square holding the same two knights and two pawns, differing only in which seat each sits
in — resolve to one illustration. And `DEFAULT_RUN_RULES.cardSpan = 2` narrows the 272-card catalog
to **69 dealable cards**, which draw on **36 illustrations**: 13 of those are shared, three of them
six ways. The 94-image batch was sized for all 272 and the default-rules narrowing never fed back
into it.

Then the real request: *"i want to be a little more deliberate about my cards… infuse some history
and life… right now they're total stabs in the dark, when i feel like the flavor text should be
writing itself better, and the art should depict **an event**, whereas right now it's just again a
blind attempt."*

### What the briefs measurably are

`docs/art/run-card-family-prompts-v2.json`, 94 families:

| | |
|---|---|
| contain the word "covered" | 46 |
| distinct opening sentences | 36 |
| set beside water | 30 |
| mention flowers | 21 |
| historical anchors, spanning 1,746 years | 4 |

Two structural faults and one root cause.

**The scene is keyed to the roster only**, so 94 briefs carry 36 scenes between them — every card
with the same pieces was handed the same sentence regardless of footprint. **The one field that
varies per card asks the painting to draw the footprint**: *"clustered around a corner rather than a
rank — 2 forward and 2 set back behind them."* The card face already prints its own formation on its
own board, exactly; the illustration was being spent on the one thing the interface does perfectly
and a picture does worst.

**And every brief ends by removing the significant thing from frame.** The five single-piece
briefs close on *"the sacred center is gone"*, *"no army is visible"*, *"there is no departure
spectacle and no audience"*, *"authority appears as arrangement and patience, not command"*,
*"observation has become another form of administration"*. That is not a bad roll of a generator. It
is an anti-event brief executed faithfully.

### Where the anti-event brief came from

All four anchors live in [`docs/lore/historical-anchors/`](../lore/historical-anchors/README.md),
whose README opens by scoping them — *"real historical anchors that can **drive background sets**"* —
and then states the rule:

> The tragedy happened, but the image does not show it directly. The image shows life continuing
> around its residue.

That rule is correct and stays. It was written for **places**: world and battle backdrops, where the
subject is ground and weather and the event is deliberately off-stage. It was then applied to
**cards**, where the subject is a named thing the player buys and puts on a board. The residue
vocabulary came with it verbatim — the anchor files list *"covered scrolls"*, *"covered baskets"*,
*"ruined wall with flowers"*, *"muddy roads"*, *"no battle scene"*, *"no visible bodies"* — and 46 of
94 card briefs came back saying "covered".

So this is not a lore change and not a re-roll. **It is a background contract applied to a surface
it was never written for.**

### The Kings fail differently

`docs/art/run-king-prompts-v2.json` is a much better manifest — a named monarch, a factual
administrative act, a real anchor, and a `medium` line putting pixel art first. Its flavour is the
best writing in the repo (*"Absent men are written in the same ink as present ones. Only the column
changes."*). The owner still called the art *"pretty cartoony and bad"*, and the cause is separable
and mechanical:

- **14 of 15 briefs contain the phrase "nearest the viewer and much the largest in frame."** That is
  hieratic scale — a real medieval convention — but handed to a modern generator it renders as a
  big-head hero, and the same brief bans *"heroic poster energy"* three lines above.
- **Every King is named for an administrative act, and in every brief that act is scenery**: a roll
  *"too far off to read"*, an inventory board *"leaning against the arcade behind him"*, a tally
  stick *"waiting under a canvas awning"*.
- **7 of 15 share the identical cast** (king + three commoners), so seven briefs went looking for the
  same kind of scene and found it: a survey, a muster, a boundary, a survey. **3 of 15 are the same
  anchor** (the Dissolution), **10 of 15 are English**, and the whole slate lives in **two realms**.

## Decision

### Card art gets its own contract

[`docs/art/card-art-brief-contract.md`](../art/card-art-brief-contract.md) is that contract and is
the file to read before writing any card brief. The anchor README keeps its scope and gains a note
saying so.

**Residue is a subject; absence is not.** "Show the repaired wall, the abandoned camp, the rusted
tool" names something to depict. "The sacred center is gone / no army is visible" instructs the
generator to depict nothing, and that is what it did.

**Every brief names one act and holds one instant of it** — Lessing's pregnant moment, the instant
most suggestive of what came before and what follows (*Laocoön*, 1766, ch. XVI). This is not a
licence for drama and does not touch [`docs/lore-anti-story.md`](../lore-anti-story.md)'s **War As
Residue**: a chalk mark going onto a stone before it is loaded is an event, and it is quieter than
anything currently in the set. Battle tableaux, charging forces and heroic poster energy stay
excluded.

### Kings are the roots

The owner set the structure: *"we use our strongest candidates out of the list of kings or events or
matches to cards, and just adjust however many wars are needed. there is no limit on the number of
wars, it's a function of card concept quality."*

- **The fifteen Kings are cast first**, because *"no kings can feel cheap."* Each is anchored to one
  documented act, chosen for strength rather than to fit a single war.
- **The number of theatres is unbounded** and is an output of card-concept quality, not a constraint
  on it. One war was considered and rejected: it starves the set, and 69 moments cannot be drawn
  honestly from one 208-day siege.
- **Every formation card rolls up to exactly one King's world**, so holding a King means the cards
  bought around him can come from the same place.
- Where an act is too thin to dress its share, it **takes a second event from the same reign** rather
  than being stretched.

The slate itself is carried as data in
[`docs/art/run-king-slate-v3.json`](../art/run-king-slate-v3.json) with a `status` field, and the
formation roll-up in [`docs/art/run-card-worlds-v3.json`](../art/run-card-worlds-v3.json). Both are
`proposed` until the owner signs the slate off; this ADR governs the contract, not the casting.

### Art is keyed per card

The `(footprint, roster)` family collapse is retired for the default-rules deck. **69 formation
illustrations and 15 King illustrations**, one per card. That is what ends the duplication the owner
reported, and it is only affordable because the deck is bounded at 69.

### What no longer reaches a brief

- **Price contributes nothing.** The owner: *"there's no hour system in the game. the price band
  really should have no relevance to what's being generated."* A calendar keyed to the price band was
  proposed and struck. Wage figures in the printed register come from **who is on the card**, never
  from what it costs.
- **`arrangement` is deleted from the brief schema.** The footprint may be echoed by a composition
  that can do it without posing anybody — a corner in the terrain, a line of carts, two men at
  opposite ends of a lane — and is dropped the instant it costs the scene. The owner: *"it's not the
  most critical… but it is nice to squeeze in"*, and on the field itself: *"agree, this is not
  relevant, and just makes it cartoony."*
- **Hieratic scale is deleted from the King briefs.** "Largest in frame" and "holding the centre"
  both go; the monarch is identified by regalia, by position in the action, and by what he is doing.
  **The eye exception stays** — it is a deliberate, documented departure from the facelessness rule
  and it is not what makes the cards cartoony.

### Three layers, and which surface each reaches

The three candidate systems workshopped are not alternatives. They compose along a boundary the repo
already enforces — `run-king-prompts-v2.json`'s monarch rule and the anchor README both say the
event is *"for us, not for the viewer to be able to identify from a caption"*:

| Layer | Source | Reaches |
|---|---|---|
| **The act** | one documented event per King, and its world | the brief only — never the card face |
| **The cast** | Jacobus de Cessolis, *Liber de moribus* (c. 1300; Caxton 1474) | what is drawn |
| **The voice** | the administrative register the fifteen Kings already print | the card name and flavour |

Cessolis is the correction to the obvious reading of the pieces. His pawns are not soldiers — they
are eight named trades with tools (labourer, smith, clerk, merchant, physician, taverner, guard,
ribald). His alphin is a **judge**, not a priest. His rook is the king's **legate**, a man carrying
the king's authority in a satchel, not a building.

## Consequences

- **All 84 illustrations are regenerated.** The 36 installed formation slots and 15 King slots are
  superseded. Nothing is overwritten in live media until a candidate is reviewed and accepted on a
  game surface, per the generated-art handoff rule.
- **The v2 manifests are left exactly as accepted**, as the historical record of what shipped, in the
  same way ADR-0520 left v1.
- **Six King anchors move**, taking the slate from two realms to nine: Hungary, Sweden, Denmark,
  Castile, Novgorod and Bohemia join England and France. Reims 1429 and Amiens 1329 are displaced
  intact to a bench and remain valid candidates.
- **The 51 roster-keyed slots and the 58 family slots outside the default-rules deck stay installed
  and unreferenced**, as before. A rules change that widens `cardSpan` past 2 re-exposes cards with no
  art under this contract; that is a known, bounded gap and the family art still resolves for them.
- **Not every day can be attested.** The Kings' anchors are factual and their manifest requires it.
  Formation-card days inside a documented world are authored moments — true in kind, not claims about
  a specific date. Since the anchor never reaches the card face, nothing a player sees asserts a
  false date. Making them all attested is a bounded reading pass on primary sources.
- The flavour on **Anointed Late** is missing a word (*"Whether the delay had was not asked aloud"*)
  and is corrected when that card is rewritten.
