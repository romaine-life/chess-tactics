# Card Art Brief Contract

Read this before writing any Run card brief. It governs the 69 default-rules formation cards and
the 15 King cards. It does **not** govern world or battle backgrounds — those keep
[`../lore/historical-anchors/README.md`](../lore/historical-anchors/README.md), and confusing the two
is what produced the set this contract replaces. See
[ADR-0578](../adr/0578-card-art-is-briefed-from-a-king-rooted-event.md).

## The one rule

**A card brief names one act and holds one instant of it.**

The instant is Lessing's *pregnant moment* (*Laocoön*, 1766, ch. XVI): the one most suggestive of
what came just before and what follows. Not the climax, and not the aftermath.

This is not a licence for drama. [`../lore-anti-story.md`](../lore-anti-story.md)'s **War As Residue**
still holds in full — no battle tableaux, no charging forces, no heroic poster energy. A chalk mark
going onto a stone before it is loaded is an event, and it is quieter than anything in the set this
replaces.

> **Residue is a subject. Absence is not.**
>
> "The repaired wall, the abandoned camp, the rusted tool" names something to depict.
> "The sacred center is gone / no army is visible / there is no departure spectacle" instructs the
> generator to depict nothing, and it will comply.

## Three layers

| Layer | Where it comes from | Where it reaches |
|---|---|---|
| **The act** | one documented event, belonging to one King's world | the brief only — **never** the card face |
| **The cast** | the roster, read through Cessolis | what is drawn |
| **The voice** | the administrative register | the card name and flavour |

The act never reaching the face is an existing rule, not a new one:
`run-king-prompts-v2.json`'s monarch rule and the anchor README both state that the historical event
is *"for us, not for the viewer to be able to identify from a caption"*. No dates, place-names or
monarchs on a card face.

### The act

Every card belongs to exactly one King's world (`run-card-worlds-v3.json`). Kings are cast first and
each is anchored to one documented act; the number of theatres is unbounded and follows from card
quality. Where a King's act is too thin to dress its share of cards, it takes a second event from the
same reign rather than being stretched.

Which act a card gets is chosen by **cast fit** — what these particular people can plausibly be in
the middle of. Nothing else selects it.

### The cast

From Jacobus de Cessolis, *Liber de moribus hominum et officiis nobilium super ludo scacchorum*
(c. 1300), printed in English by Caxton as *The Game and Playe of the Chesse* (1474). The most-copied
book of the Middle Ages after the Bible, and it does exactly this job: the board as a whole society,
each piece an estate with duties, attributes and a short anecdote attached.

| Piece | Cessolis | Not |
|---|---|---|
| Pawn | one of **eight named trades**: labourer (spade and rod), smith (hammer), clerk/notary (shears and pen), merchant/changer (scales), physician (book), taverner (loaf and cup), guard/tollkeeper (keys), ribald/messenger (purse) | a soldier |
| Knight | the chevalier: sworn, mounted, and *tested* before he is trusted | a generic horseman |
| Bishop | the **alphin — a judge**, an assessor of the law | a priest |
| Rook | the king's **legate or vicar**, carrying the king's authority in a satchel | a tower |
| Queen | mercy and intercession, done in public or not at all | a warrior |
| King | justice and governance; named for an administrative act | a hero |

Pawns cycle the eight trades across the deck so that no two cards field the same men. A three-pawn
card is three different trades, and which three is a property of the card, not of the roster.

### The voice

The administrative register the fifteen Kings already print — *"Absent men are written in the same
ink as present ones. Only the column changes."* Names are acts and entries, not geometry. Wage
figures, where used, come from **who is on the card** (knight 2s a day, man-at-arms 12d, mounted
archer 6d, foot archer 3d, page 3d), never from what the card costs.

## Struck — do not put these in a brief

- **Price.** A card's gold contributes nothing to its picture. There is no hour system in the game
  and a market number has no business reaching an illustration. A calendar keyed to the price band
  was proposed and rejected by the owner.
- **`arrangement`.** Deleted from the schema. A composition **may** echo the formation if it can do
  so without posing anybody — a corner in the terrain, a line of carts, two men at opposite ends of a
  lane — and it is dropped the instant it costs the scene. It is never the subject. The card face
  already prints the footprint on its own board, exactly.
- **Hieratic scale**, on King cards. "Nearest the viewer and much the largest in frame" appeared in
  14 of the 15 King briefs and is the reason they render as big-head heroes. The monarch is
  identified by regalia, by his position in the action, and by what he is doing.
- **The residue vocabulary of the background anchors**, as a default: covered things, wet grass,
  flowers on a ruin, a figure beside a road with nothing happening. Any of these is fine when the act
  puts it there and wrong as the fallback subject.

## Kept, on King cards

**The eye exception stays.** A named monarch meets the viewer's eye while everyone around him keeps
the usual reticence. It is a deliberate, documented departure from the facelessness rule in
`../lore-anti-story.md` — the monarch is the one figure in this game who is whole, because he has a
reign, a record and a death. It is not what makes the current King art cartoony; the scale is.

## Writing one

```
act        one documented event, its realm and its date — brief only, never printed
cast       who these people are, read through Cessolis, with their tools
moment     the single instant, stated as something happening — a verb, not a tableau
world      period, place, weather, material — inherited from the King's world
medium     pixel art, stated FIRST (a medium buried late reads as a mood and renders as a painting)
```

Stated as a test: **if you can remove the last clause of the moment and the picture is unchanged,
the moment is a group portrait and has to be rewritten.**

## Where the content lives

- [`run-king-slate-v3.json`](run-king-slate-v3.json) — the fifteen King slots, their fixed casts,
  their acts, and the bench of strong acts with no cast free for them.
- [`run-card-worlds-v3.json`](run-card-worlds-v3.json) — all 69 default-rules formation cards,
  authored across the three layers, with the seats and the shared-art count each carries today.
- `run-card-family-prompts-v2.json` and `run-king-prompts-v2.json` — left exactly as accepted, as
  the record of what shipped. Do not brief from them.

The workshop these came out of was reviewed as two pages, kept here for provenance:
[the 84-card roll](https://claude.ai/code/artifact/5e5e5dfd-513f-486f-8d66-a3dae0cc1c72) and
[the king slate](https://claude.ai/code/artifact/60c83aa3-d93b-4ba8-906c-d4ff7fadfd13). They are
owner-private and may not outlive the work; the JSON is the durable copy.
