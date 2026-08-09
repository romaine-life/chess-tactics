# ADR-0545 — The sides a level fields have their own page

**Status:** Accepted
**Date:** 2026-08-09

## The problem

ADR-0538 gave a level a declaration — the pair of roles `player`/`enemy`, each wearing a colour —
and put it on the **Board** page, under a card headed **Level Settings**, below a Rule/Difficulty
readout, below the board-size steppers, the grid nudge, the plate placement and the scenic-terrain
rectangle. It was the last thing on the longest page in the editor.

That placement gets the importance backwards. Everything else on Board changes how the level
*looks* or how big it is. The declaration changes **who the human plays as**: `sideForFaction` in
`core/levelBoard.ts` resolves every unit wearing the declared player colour to `side: 'player'` and
everything else to `side: 'enemy'`, and that mapping is baked into the saved Level and carried into
play. Naming the wrong colour hands the player the army the level meant them to fight.

Which is not hypothetical, because **an unauthored declaration is READ off the pixels**.
ADR-0538 made resolution deliberately pure — the player half falls back to the first painted palette
in catalog order (`navy-blue, crimson, golden, emerald, black, white`) and the enemy to the first
painted palette that is not it. So a level painted only in Black opens showing **Player 1 · Black**,
because Black is the only palette there, and the panel presents that read exactly as it presents a
choice somebody made. Nothing on the page says which army the player will command, and nothing says
the pairing was inferred rather than declared.

The controls made it worse. Each role's row was a colour dropdown and a square holding one or two
compass letters, side by side, both unlabelled:

```
● Player 1                    5
[ Black          ▾ ] [ S ]
```

`S` is not a word. The square had an `aria-label` and no `title`, so a pointer got nothing at all,
and the panel offered no clue that it opens a compass or that it sets a *default facing for newly
painted units of that faction*. The same control on the Units page has been labelled since it
shipped — `Default facing`, in a `.le-ctrlrow` — so the editor was already answering this question
correctly one page over.

## The decision

**The declaration is its own layer, `factions`, labelled Factions**, sitting immediately after Board
in the layer order and addressable as `/editor/level?layer=factions`. It is a non-painting layer, so
it opens on the pointer.

- **Board keeps the rule readout and loses every faction control.** `Level Settings` is Rule and
  Difficulty. The whole `le-faction-control` block — both role rows, Swap sides, the undeclared-colour
  repair, and the "fields no units" warning — moves to Factions unchanged in behaviour.
- **Every control rides a labelled row**, the `.le-ctrlrow` / `.le-ctrllabel` shape the unit brush
  already uses: `Colour` over the palette select, `Default facing` over the compass square. The role
  name and its live unit count stay above the pair, so a row reads as *this side, this colour, this
  facing* rather than as two anonymous widgets.
- **The compass square carries a tooltip**, and it is the component's job rather than each call
  site's: `DirectionPopover` takes an optional `describe` and always appends the current value, so
  the pointer gets *"The way a newly painted Player 1 unit stands. Currently facing south."* The
  Units page gets the same tooltip from the same change.
- **The page says which side the human commands.** One line under the heading: *"Player 1 is the
  army the human commands in play. Every other piece fights it."* That is the sentence that turns a
  derived pairing from a fact about colours into a claim an author can check.
- **A blocked save lands here.** `needsPlayerFaction` sent the author to Board with
  "Open Board > Level Settings…"; it now sets `layer` to `factions` and says
  "Open Factions, then paint at least one unit for the player faction."

Nothing about resolution, persistence, repainting or the board code changes. `resolveDeclaredFactions()`
remains the single pure answer, an untouched load still writes nothing (ADR-0304), and `pf`/`ef` are
untouched, so this ADR moves a surface and adds no state.

## Consequences

- ADR-0538's "**Board → Declared Factions** is where the pair is named" is the one clause this
  supersedes. Its model — the role pair, colour-follows-declaration, swap-not-merge, the unpaintable
  undeclared palette — is intact.
- `.le-faction-fields` is gone; the two-column grid it defined is what the labelled rows replace.
- Material-by-faction stays on **Status**. It is a readout of the board, not a control over the
  declaration, and it sits beside the other whole-board tallies.
- Whether the editor should *say* a declaration was derived rather than authored is left open. The
  sentence about who the player commands makes a wrong pairing legible, which is what the surface
  owed; marking derived-vs-declared would change what ADR-0538 deliberately keeps silent, and is a
  decision of its own.

## Verification

`frontend/src/ui/levelEditorFactionsPanel.test.ts` pins the route (the layer key, the pointer tool,
the layer option), the move (Factions owns the declaration and Board carries none of it), the
labelled rows, the sentence naming the commanded side, the save-gate destination, and the compass
tooltip at the component and at both call sites.
