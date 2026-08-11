---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0556](0556-run-preparation-chooses-in-a-tab-column-of-one-line-rows.md)"
---

# ADR-0573: A game is read back without being taken back

## Context and Problem Statement

The owner, looking at the Event Log's score sheet: *"i need some kind of 'go back a move'
functionality. that'll take some consideration because it's not like the move is being undone; so
something has to track when you aren't on the current move anymore. but full move nav should be
possible; analysis controls is an established thing on chess.com and lichess."*

The board had exactly one way backwards, and it was the wrong one for this. **Undo** (the Run's paid
rewind) RESTORES an older position: it costs gold, it puts the clock back, it drops the plies it
took, and the board it lands on becomes the live one. Reading the game back is the opposite act.
Nothing is being taken back. The turn, the clock, the queued premove chain and the opponent's think
all have to keep running underneath while the battlefield shows a board from five half-moves ago,
and leaving the review has to hand back the live board exactly as it was left — because it was never
taken away.

That is the consideration the request names: **something has to say you are not on the current move
any more**, and it has to say it to the renderer without saying it to the rules.

Two things were also missing outright. There was no record of the positions a game had passed
through — `undoStack` holds one per *player* move, only inside a Run, only while the economy can pay
for it, and a failed capture wipes the whole stack. And the Event Log kept 24 rows, so the score
sheet a player would navigate BY forgot the opening around move twelve.

## Decision

**A review is a VIEW. It is held in one number, it is read only by the renderer, and the game
underneath never learns it happened.**

### The record

`game/moveReview.ts` owns the shape. A `PositionSnapshot` is the half of a `GameState` that a move
changes — `pieces`, `turn`, `winner`, `lastMove`, `halfmoveClock`, `positionCounts`. Everything else
(board size, terrain, fences, props, board code, the authored promotion / castle / draw rules) is
resolved when the match is built and never moves again, so it is not re-copied per ply. That is what
makes a board per half-move affordable both to hold for a long game and to write to storage; a naive
full-state history would have duplicated the terrain grid a hundred times.

The store carries `positions: RecordedPosition[]`, oldest first, each entry pairing a snapshot with
the **half-move count** at which the board stood there — 0 is the opening. The count is carried
rather than inferred from the array index because a history does not always begin at the opening: a
match saved before this existed resumes holding one board already deep into the game, and it has to
be able to say so instead of claiming to be move one.

One board is recorded per NOTATED half-move, at the three places a committed move is produced — the
player's own commit, the enemy reply, and the netplay relay's single apply path. A reply that
resolves several enemy moves contributes several, which is why `resolveEnemyReply` now returns a
snapshot per notated move: those intermediate boards exist only inside its loop, and a review that
could not step through them would jump a multi-move reply whole. A commit that notates nothing
records nothing — an admin position change is not a move and does not belong on a score sheet.

### The cursor

`reviewIndex: number | null` is the whole of "you are not on the current move". `null` is live, and
live is the only state the game itself reads. Two actions touch it and touch nothing else. The
guarantee is deliberately negative and total: **no rule runs, no clock moves, no premove is dropped,
and `game` is neither read nor written**, which is what makes looking back unable to cost a player
the game they are still playing.

Asking for the newest recorded position resolves to `null` rather than to a cursor pointing at the
same board — being at the end of the score sheet IS being live, and a cursor that merely happened to
agree would keep the battlefield read-only for no reason the player could see.

Two moments move the cursor on their own, and only two. A commit that DECIDES the game returns to
live, because a result has to land on the real board rather than under an older one (reviewing the
finished game is free from there, which is when a player most wants it). And a paid Undo, which
really did take moves back, truncates the history to the restored log's half-move count and clears
the cursor. Every other commit leaves the cursor exactly where it was: the score sheet grows
underneath the player, it does not yank them forward.

### The board

Review goes through the battlefield's existing passive-position seam — `SkirmishBoard`'s
`surfaceState`, the one Run Deployment already projects through — rather than a second path into the
renderer. The seam gains a `kind`: a `plan` is a position being built and never played, a `review`
is an earlier position of the same live match. Both are read-only and neither can select, drag,
premove or promote. They differ in what board chrome survives: a review keeps the facts no move can
change (the grid, the authored promotion cells) and loses everything derived from where the pieces
stand (legal moves, threat squares), because those describe the live board and would be a lie about
an older one. Ordering at the call site is fixed — a Deployment being built outranks a review of the
live match, and both outrank the live board — and both CI gates that pinned the old literal now pin
the new one, so a second projection path stays shut.

The review surface takes the SAME camera identity the live board computes for itself, so stepping
through the score sheet never reframes, refits or re-flies the camera, and it declares its units
`settled`, so a piece a step backwards brings back to life appears at its seat rather than playing
an entrance.

### The controls

Two homes, ONE component, so they cannot drift: a transport row (opening / back / forward / live)
under the Event Log, where it is findable and the score sheet it walks is right there, and the same
row on a plate over the battlefield while a review is open, so once you are reading you steer from
the board. The keyboard is the one every chess site uses — arrows to step, Home/End for the ends,
Escape to drop back to live, and Escape claimed ONLY while a review is open so it keeps meaning
whatever else it means the rest of the time. Arrows deliberately accept auto-repeat, unlike the
command card, because holding one is how a game gets scrubbed.

Every move row in the Event Log that has a recorded board is pressable and goes to it; the row being
shown is marked. The log's limit rises from 24 rows to 600, because the log is now the navigation
surface and a row that has fallen off the end is a move the player can no longer reach.

The plate says **Reviewing — the game underneath is still running**, and carries the way out. It is
seated inside `.skirmish-field` by a plain wrapper rather than by its own rule: the plate wears the
registered inner chrome frame, and that frame's `position: relative` wins over a class on the plate
later in the same stylesheet — the exact trap [ADR-0570](0570-a-board-anchored-callout-is-placed-in-screen-pixels-and-stays-inside-the-battlefield.md)
was written about. Shipped with the rule on the plate first, and the resulting in-flow box took a
grid row from `.skirmish-field` and shrank the board it was describing to half the field.

## Consequences

- Reading a game back cannot affect the game. Asserted directly: with a review open, the live
  `game` object is identical by reference, the turn and env are the live ones, a queued premove
  survives the round trip, and a move committed while reviewing grows the history without moving
  the cursor.
- **The clock keeps running while you read.** That is deliberate — pausing it would make reviewing a
  free think — and it is why the plate is unmissable rather than a quiet indicator.
- A match resumed from a save written before this exists has no earlier boards to offer. It resumes
  holding the one board it has, recorded at the half-move count its own log names, its transport
  disabled and its rows plain text. Nothing is lost and no save version changes: `positions` is an
  optional field on the persisted match.
- The paid Undo is untouched, and the two are now clearly separable at a glance: Undo costs gold and
  changes the game, review costs nothing and changes what you are looking at.
- A multi-move enemy reply's intermediate boards are the raw ones; only the last carries the settled,
  Run-transformed position. The final board of every commit is always the one the player is left
  facing.
- An admin position change records no board, so the score sheet stops describing the battlefield.
  Rather than let a review show a board the game has left behind, an admin change returns to live.

## More Information

- [ADR-0570](0570-a-board-anchored-callout-is-placed-in-screen-pixels-and-stays-inside-the-battlefield.md)
  — the chrome-frame `position` trap this hit again, and the seat that closes it.
- `frontend/src/game/moveReview.ts` — the record, the cursor arithmetic, and why a snapshot holds
  what it holds.
