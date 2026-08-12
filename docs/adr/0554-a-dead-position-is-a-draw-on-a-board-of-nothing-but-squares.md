---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0072](0072-castling-and-chess-draw-rules-as-authored-events.md)"
  - "[ADR-0617](0617-victory-conditions-two-list-model.md)"
---

# ADR-0554: A dead position is a draw on a board of nothing but squares

## Context

ADR-0072 audited full chess parity as six items — castling, en passant, promotion with
underpromotion, stalemate as a draw, threefold repetition, and the 50-move rule — and shipped all
six. **The audit was one item short.** FIDE has a seventh terminal condition, and it is the only
one that needs no clock, no table, and no authoring: Article 5.2.2, the **dead position** — a
position from which checkmate cannot be delivered by any series of legal moves ends the game
immediately, as a draw.

Its absence was reachable. King against King, or King and one minor against King, is a position
neither side can ever win, and the engine had nothing to say about it: `adjudicateCommittedPosition`
resolved victory rules, then checkmate or stalemate for a side with no legal action, then the
level's authored 50-move and threefold rules. On the overwhelming majority of boards — every level
that never authored a **Chess draws** event, which is every Run Battle — none of those can fire in
a bare endgame, so the two Kings walk until somebody closes the tab. Stalemate is not the escape
hatch: two lone Kings on an open board always have a move.

The remaining question is the one the owner raised, and it is the reason this is an ADR rather than
a bug fix: **the material table is not a statement about material.** It is a statement about
material *on an empty rectangle*. Boards here carry impassable terrain, water, edge fences, and rock
obstacles, and every one of them takes escape squares away from the defending King. Stand a wall
next to him and a lone Bishop mates; a lone Knight mates. On a board with obstacles, "King and
Bishop against King" proves nothing at all.

## Decision

A dead position is a draw, adjudicated on the committed position like every other outcome, gated on
two conditions that are each necessary and neither of which is about material.

### The material — `rules.materialCannotMate`

FIDE's table exactly: King vs King; King and one minor vs King; King and Bishop vs King and Bishop
with both Bishops on the same square colour. Any Pawn, Rook, or Queen alive means a mate is still on
the board. **King and two Knights is deliberately not dead** — a helpmate exists, which is the exact
line FIDE draws, and the rules on the chess board must match chess exactly (ADR-0072). Nor is King
and two same-side Bishops, for the same reason of keeping strictly to the proven table.

One departure from chess is forced by this game rather than chosen: a side may field **more than
one King**, which `rival-kings` levels do. Two Kings mate a lone King, so the test requires exactly
one living King per side before it will call anything dead.

### The board — `rules.boardIsAllSquares`

No obstacle pieces, no edge fences, and no terrain a move can feel: nothing impassable, no water
(which halts travel), and a terrain layer sitting uniformly at elevation 0. Deliberately strict —
an authored cell raised above an unauthored one is a climb wall like any other, and a false "this
board is plain" is the only answer here that costs anything.

This is static for a whole match. Obstacles are authored at build and never appear, move, or clear
mid-game: level events trigger on `setup` or `unit-enters-zone` and can only spawn units, and the
`falling-rock` zone type is a placement pool, not a mechanic. So the answer computed once is good
for the whole game, and the check runs behind the material test, which is `O(pieces)` and returns
on the first Pawn — the board scan only ever executes in a bare endgame.

### The level — `stillDecidable`

**A dead position is a draw only where a mate is what the level is played for.** ADR-0072's standing
objection to an always-on draw rule was that a `survive` level is WON by outlasting a turn count, so
calling its bare-Kings endgame a draw takes the player's win away. That objection is answered here
by reading the rules actually in force (ADR-0064) rather than by hard-coding a mode:

- `turnLimit` keeps running whatever the material — so a Survive level never draws on a dead
  position, and finishes the way it was authored to.
- `eliminate` of a side's King, or of its whole force (which includes the King), can never complete.
  A King here IS capturable — a mate-in-1 by direct capture is a real solver terminal — but not in
  a dead position: two Kings can never stand adjacent, because stepping beside one is stepping into
  check, and the only other man on the board is a minor that by definition cannot mate, so its
  check can always be walked out of and the capture never lands. Unreachable.
- `eliminate` aimed at a Bishop or a Knight stays reachable — a King can walk up and take an
  undefended minor — so a level authored that way is still decidable and does not draw.
- `reach` is pawn-only, and a dead position holds no Pawn. Unreachable.

A rule fires only when all of its conditions hold, so a rule carrying any unreachable condition is
dead itself. The draw is called when no winner-declaring rule survives that test. Under the presets
that means `capture-all`, `capture-king`, `rival-kings` and `reach` draw, and `survive` does not.

### Placement

In `core/adjudication`, after checkmate/stalemate and before the authored chess draws — so the
precedence is now victory rules, then checkmate or stalemate, then the dead position, then the
50-move and threefold rules. Every consumer inherits it from the one adjudicator: live play, the
netplay relay, self-play, the AI's terminal scoring, and the solver's `terminalOutcome`.

It is **not** a `DrawRules` flag and there is nothing to author. The other two draws carry hidden
ledger state — a clock, a repetition table — which is why they are opt-in and why the board solver
refuses boards that author them (ADR-0072). A dead position is a pure function of the position on
the board, so it adds no ledger, needs no `positionKey` participation, changes no serialized field,
and leaves the solver's hidden-state refusal exactly where it was.

## Consequences

- Levels that could previously never end now end. Nothing that *could* be won is drawn: the gate
  above is the proof obligation, and every case it lets through is a position where neither side has
  a legal path to any authored win.
- `dead-position` joins the draw kinds on the wire (`LobbyGameResultReason`, and the backend's
  `LOBBY_DRAW_REASONS`), so a netplay result reports the specific reason like the others. Both seats
  compute it from the same committed position, so they cannot disagree.
- No state shape changed and no save moved. `GameState` gains no field, `halfmoveClock` and
  `positionCounts` are untouched, RunSaveVersion does not move, and a level without a **Chess draws**
  event is byte-identical in serialized state to before.
- Boards with obstacles keep exactly today's behaviour — stalemate, plus whatever the level
  authored. That is not a gap left open; on those boards the material genuinely does not prove the
  position is dead, and proving it there is a solver question, not a table lookup.
