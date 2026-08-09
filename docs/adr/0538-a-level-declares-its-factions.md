# ADR-0538 — A level declares its factions

**Status:** Accepted
**Date:** 2026-08-08

## The problem

The Level Editor had no place to say who is fighting. It had a **Player Faction** block that listed
whichever palettes happened to be painted on the board and let you tag one of them "Player" — so the
level's sides were *inferred from its pixels* rather than declared.

The Units page made that worse: its faction control was a **colour picker over all six palettes**.
Nothing stopped a board being painted in four colours. But the engine fields exactly **two sides** —
`sideForFaction` in `core/levelBoard.ts` returns `player` when a unit's palette equals the board's
`playerFaction` and `enemy` for **everything else** — so Golden, Emerald and Crimson pieces all
silently became the same enemy army, and `validatePlayability` only ever checked two sides. The
editor offered six choices for a question with two answers.

Two more symptoms of the same root cause:

- A board with no enemy pieces yet had **no enemy colour at all**. It was derived as "the first
  painted palette that is not the player", so it did not exist until you painted one.
- Several surfaces each re-derived the sides their own way (`sideDefaultFaction`, `victoryFactions`,
  `previewPlayerFaction`), so they could disagree with each other on the same board.

## The decision

**A level declares its factions, and colour follows from the declaration.**

The declaration is a **pair of roles** — `player` and `enemy` — because that is what the engine
fields. `FACTION_ROLES` in `core/pieces.ts` is the tuple, and `resolveDeclaredFactions()` is the one
function that answers "what factions does this level declare". Every faction-facing surface reads it.

- **Board → Declared Factions** is where the pair is named: one row per role, each with the colour it
  wears, its default facing, and its live unit count. Every level has values for it, always.
- **Changing a declared colour repaints that faction's pieces.** The declaration and the board move
  together, so they cannot disagree. Choosing the colour the other role holds **swaps the two sides**
  rather than merging them — two factions folding into one is a different act, and is not offered.
- **The Units page picks a faction, not a colour.** It offers exactly the declared roles; the colour
  is shown beside each as a consequence. An undeclared palette is unpaintable.
- **The declaration is persisted**, so it survives an empty board. `playerFaction` already rode the
  board code as `pf`; the enemy half is the new `ef` key. Both are optional, so a board that declares
  nothing encodes byte-identically to one written before this ADR.

### Resolution is read-only

`resolveDeclaredFactions()` is pure and never rewrites the document. An authored declaration wins; a
board that never authored one is *read* — the player falls back to the first painted palette and the
enemy to the first painted palette that is not the player, and only a blank board reaches the default
White/Black pairing. This matters because of ADR-0304: an untouched document load must stay
read-only, so opening an old level shows a resolved declaration without claiming a side for it or
triggering an autosave. The declaration reaches the document when the author edits it.

Writing either half writes both, so a level that declares one side never leaves the other implicit.

### Legacy three-plus-colour boards

Pieces wearing a colour no faction declares are surfaced, not hidden and not silently rewritten. The
panel names them ("2 Golden units belong to no declared faction. They play as Enemy.") and offers to
fold them into either declared faction. They already played as the enemy; the repair only makes the
board say what the level always meant.

## Consequences

- The **Control** dropdown (Player/CPU per painted colour) is gone. The role *is* the row, so there
  is nothing left to assign. `FactionControl` and `factionControlOptions` are deleted.
- The campaign save gate changed shape. It used to mean "no board faction has been assigned Player";
  a player faction is now always declared, so it means "the declared player faction fields no units".
- A third distinct enemy army remains unsupported — deliberately. Declaring one would be a lie about
  what the engine plays. ADR-0064's per-faction victory gate is already written to survive more
  factions; when the engine grows a third side, this declaration grows a third row, and every surface
  that reads `resolveDeclaredFactions()` follows.

## Verification

`frontend/src/core/declaredFactions.test.ts` pins resolution (authored wins, derived from painted,
never both roles on one colour), the board-code round-trip including the byte-identical no-op, and
the editor invariants — that the unit brush is a `HouseSelect<FactionRole>` rather than a
`PaletteSelect`, that it snaps back to a declared faction when the declaration moves under it, and
that both halves are written together.
