# ADR-0545 — A level already knows its sides

**Status:** Accepted
**Date:** 2026-08-09

## The problem

A `Level` stores which **side** each piece plays on. `boardCode` stores which **colour** it wears.
They are different facts, and only one of them survived a trip through the Level Editor.

`EditorBoard`'s unit is `{ unitId, direction, faction }` — palette only, no side
(`ui/boardCode.ts`). So `levelToEditorBoard` dropped `layers.units[].side` on the floor, and when
the editor then asked "who are the sides on this board", `resolveDeclaredFactions` had nothing left
to read but paint:

```ts
const player = isUnitPalette(board.playerFaction)
  ? board.playerFaction
  : painted[0] ?? DEFAULT_DECLARED_FACTIONS.player;   // the first painted palette, catalog order
```

On a board painted in **one** colour, "the first painted palette" is the only palette there is — so
the opposition's own colour was named the player. The Run test Battle `Boxed in` fields five black
pieces, all `side: "enemy"`, and declares nothing. It opened as **Player 1 · Black · 5**, with
nothing on screen saying that pairing had been inferred rather than authored.

Two distinct failures followed from the same missing read:

- **Accepting what the panel showed inverted the level.** Every declaration edit writes both halves
  (ADR-0538), so authoring the displayed pair persisted `pf=black, ef=white`, and `sideForFaction`
  re-derived all five pieces as `side: "player"` on the next save. `Boxed in`'s working copy is in
  exactly that state: its Run snapshot has five enemies, its editor copy has five of the player's.
  A Battle built from it fields the Run roster **plus** five more player-sided pieces and no enemy
  at all — `setup.ts` reads `side` verbatim and `levelWithRunDeployment` appends rather than replaces.
- **A single-colour PLAYER army was demoted with no authoring at all.** With the declaration
  unrecovered, `playerFaction` stayed undefined and `sideForFaction` answers `enemy` for everything,
  so open-and-save silently handed the whole army to the opposition.

The no-`boardCode` fallback tried to address this and got it half right: it read
`units.some(side === 'player')` but then declared the hard-coded `SIDE_TO_FACTION.player`
(`navy-blue`) regardless of what the pieces actually wore.

## The decision

**A saved level's own units are the authority on its sides, and the editor reads them.**

`declaredFactionsFromLevelUnits(units)` derives the pair from `layers.units`: the palette worn by
the `player`-sided pieces names the player faction, the palette worn by the `enemy`-sided pieces
names the enemy. `levelToEditorBoard` fills either half the board did not declare, on both the
`boardCode` and legacy paths, and the hard-coded navy fallback is deleted.

- **An authored half always wins.** Recovery only speaks where the board was silent.
- **It is a fixed point.** A recovered half is written into the board code by the next save and read
  from there afterwards, so the projection cannot drift between reopens — which is also what keeps
  ADR-0304's read-only load intact: `normalizedLevelEditorSignature` and the live candidate both run
  through `levelToEditorBoard`, so a newly recovered half appears on both sides of the autosave
  comparison and cancels.
- **A colour worn by both sides names neither.** That is the pre-palette shape, where a unit had no
  colour of its own; `paletteOfLevelUnit` gives those pieces their side's historical colour
  (navy/crimson), so the pair comes from that rather than from a collision.
- **A declared enemy half is no longer available to the player's fallback.**
  `resolveDeclaredFactions` previously computed the player first and only then checked whether the
  authored enemy collided with it — so a level that declared only its opposition had that
  declaration silently discarded and handed back as the player. The enemy half now constrains the
  fallback, and the default pairing steps aside when the enemy already holds it.

`Boxed in` therefore opens as **Player 1 · White · 0** / **Enemy · Black · 5**, which is what it has
always meant and what its Run has always played.

## Consequences

- No format change, no migration, no `LEVEL_FORMAT_VERSION` or `RunSaveVersion` move. The
  information was never missing from the document; it was only unread.
- Levels whose working copy already carries an inverted declaration are not repaired by this — an
  authored declaration is authored, and this ADR deliberately does not overwrite one. **Discard
  changes** restores such a copy from canonical, which is where the correct sides still are.
- Per-unit `side` still does not ride the board code. A bare `?board=` link carries no level and no
  sides, so paint order remains its only answer — correct, because there is genuinely nothing else
  to read there.
- ADR-0538's "the player falls back to the first painted palette" is narrowed: it is now the
  fallback for a board with no authored sides *and no level behind it*, rather than for every level
  that predates the declaration.

## Verification

`frontend/src/core/levelSidesSurviveTheEditor.test.ts` reproduces `Boxed in` exactly (five black
enemy pieces, nothing declared), asserts the panel resolves it as Enemy · Black, and asserts that
authoring precisely what the panel shows leaves every piece on the side it started on. It also pins
the opposite direction (a single-colour player army stays the player's), the both-sides-one-colour
and pre-palette shapes, fixed-point reopening, and that an authored declaration is left alone.
Without the change, ten of its fourteen cases fail.
