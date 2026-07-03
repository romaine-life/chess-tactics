---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0053: The battle clock — a per-level chess time control for the player only

A gameplay-rules ADR in the ADR-0050 family: `timeControl` is the fourth optional
rules field on the `Level` schema (after `placement`/`roster`/`surviveTurns`) and
follows their exact authoring, validation and back-compat patterns.

## Context and Problem Statement

The owner's direction (2026-07-03): add timer support with **normal chess timer
rules** — a countdown clock with **increments allowed**, authored **in the Level
Editor**, displayed **in the center of the title bar** (the existing center chips
move to its left and right). **The opponent needs no timer**, and the player's time
must not drain on the opponent's turn.

Nothing timing-related existed: no clock state, no countdown UI, no authoring
field. The only timers in the game loop were UI pacing (the 520ms staged enemy
reply).

## Decision Outcome

### Schema: `Level.timeControl`, whole seconds, absent = untimed

`timeControl?: { initialSeconds: number; incrementSeconds: number }` on `Level`
(`core/level.ts`), mirrored on `LevelMeta` (`core/levelBoard.ts`) so the editor's
RULES panel writes it through `editorBoardToLevel` like the other ADR-0050 fields.
Absent means untimed — every existing level keeps playing exactly as before; no
data migration. It does NOT ride in `boardCode` (none of the rules fields do; the
board code encodes the board, the Level document carries the rules), but it DOES
fold into the editor's dirty-flag `levelSignature`.

Validation follows the P4 both-gates pattern: `validateLevel` (structural,
frontend + mirrored in the backend workspace PUT) requires integer
`initialSeconds >= 1` and integer `incrementSeconds >= 0`; `validatePlayability`
repeats it as **P5_TIME_CONTROL** so the editor's violation list is complete on
its own.

### Clock semantics: player-only Fischer clock, deadline-based

State lives in the skirmish store (`game/store.ts`, `ClockState`): armed by
`newSkirmish` from `level.timeControl`, running from the first beat (it is the
player's move), **paused the instant a legal player move applies** — banking the
Fischer increment — and resumed when the enemy reply hands the turn back. The
enemy is untimed and the clock never drains outside the player's live turn.

The truth is a wall-clock **deadline**, not a decremented counter: a 100ms ticker
re-derives the remainder, so a throttled background tab cannot stretch the
player's time, and navigating away mid-turn honestly keeps the clock running (the
store is a module singleton, same as the staged enemy reply). State only carries a
display-quantized remainder (whole seconds; tenths under 10s) so subscribers
re-render about once a second. Flag fall = `winner: 'enemy'`, `turn: 'done'`,
"Defeat — your clock ran out." — a defeat like any other.

### Display: a center chip between the existing two

The skirmish title-bar center (ADR-0042 center slot) orders **turn plate · clock
chip · objective** — the owner's "current displays move to the left and right of
the timer". The chip is the shared `.skirmish-status-chip` kit frame (ADR-0032);
readout `m:ss`, gaining tenths under ten seconds (`core/clock.ts formatClockMs`,
rounding a started second UP like OTB digital clocks); the final 20 seconds turn
the readout `--threat` red. Untimed games render no chip — the bar reads exactly
as before.

### Authoring: RULES panel "Battle clock" card, ladder steppers

A Toggle ("Timed battle") plus two kit Steppers when on: starting time walks the
standard chess ladder (30s…60m, default 5:00) and increment walks 0…30s — rungs,
not free-typed seconds (`core/clock.ts` `CLOCK_INITIAL_SECONDS` /
`CLOCK_INCREMENT_SECONDS` / `stepLadder`; off-ladder hand-edited values snap to
the nearest rung). `Stepper` now accepts a pre-formatted string readout for the
`m:ss` display.

## Consequences

- Timed levels flow editor → save → skirmish with zero new plumbing beyond the
  meta field; free skirmishes and legacy levels stay untimed.
- The pause concept remains deliberately absent (no menu/tab-hidden freeze): the
  deadline model treats walking away as thinking time, which is the honest chess
  reading. If a pause UX is ever wanted it must reset the deadline on resume.
- The enemy clock, per-move (byo-yomi style) limits, and campaign star coupling
  are all out of scope; the schema leaves room (a second TimeControl field) if an
  enemy clock is ever wanted.
