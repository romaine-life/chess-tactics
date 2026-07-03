---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0055: Victory conditions are an if-then rule model

A gameplay-rules ADR in the ADR-0050 family: `victory` is the fifth optional rules
field on the `Level` schema (after `placement`/`roster`/`surviveTurns`/`timeControl`)
and follows their exact authoring, validation and back-compat patterns.

> **SUPERSEDED SHAPE (final decision).** This ADR was first written around a flat
> two-list `victory: { win: Condition[]; lose: Condition[] }`. In authoring it, the
> owner found the two buckets read as *state*, not *intent*, and asked for an
> "if-this-then-that" model. The shipped shape is therefore an **ordered list of
> if-then RULES**: `victory?: VictoryRule[]`, each `{ if: VictoryCondition[] (all
> ANDed), then: 'win' | 'lose' }` — the RTS-editor trigger model. `evaluateVictory`
> walks rules top-to-bottom and the FIRST whose conditions all hold decides, so
> precedence is **rule order**; presets seed lose rules above win rules, which
> reproduces the defeat-first default described below (now visible + reorderable).
> The `all` condition is gone — a rule's `if` array is the AND. The editor's
> condition "side" is a dropdown of the board's factions (mapping to player/enemy).
> The model is phase-ready: a future `then`/condition can move and read a phase with
> no reshape. The rest of this ADR describes the two-list origin; every "win-list /
> lose-list" reads as "win-rules / lose-rules" and "defeat-first check order" reads
> as "lose rules seeded above win rules." No prod migration (this ADR was unmerged
> when the shape changed).

## Context and Problem Statement

The owner's direction (2026-07-03): victory conditions were "very on-off" — one level
had exactly one way to win and one implied way to lose, fused into a single stored
`objective` enum. Real levels want **bespoke combinations**: *one or more ways to win,
one or more ways to lose*. Concrete asks: a Reach level should also be won by wiping out
the enemy; a Reach level that also fields a King should additionally be lost if that King
dies; sometimes there is a King and sometimes there is not — nothing should be implicit.
The owner wants the control an RTS map editor gives.

The pre-existing model (`core/objectives.ts`) was a single pure `evaluateObjective(state,
objective, ctx)` that switched on the enum, hard-coding one win test and one loss test per
mode with a universal "full player wipe is always a loss" short-circuit on top. King Assault
had already grown a `kingSide` context flag to bolt "protect your King" onto the same enum —
the smell that one enum was being asked to mean two things.

We researched how shipped games and authorable-condition systems resolve this (StarCraft /
Warcraft III trigger editors, Age of Empires win-condition toggles, Into the Breach, Fire
Emblem, Magic: The Gathering, board-game canon). Findings drove the decisions below.

## Decision Outcome

### Schema: `Level.victory`, two lists of conditions, absent = the preset

`victory?: { win: VictoryCondition[]; lose: VictoryCondition[] }` on `Level`
(`core/level.ts`). The player **wins the instant any `win` condition holds** and **loses the
instant any `lose` condition holds**. Absent means the legacy `objective` enum defines the
outcome (see the expander below) — every existing level keeps playing exactly as before, no
data migration, the same opt-in optional-field pattern as the other ADR-0050 rules fields.
When present, `victory` overrides the preset; `objective` stays required (it supplies the
mode label and the outcome-copy framing in the store).

A `VictoryCondition` is a small, pure, serializable predicate over a settled `GameState`:

- **`eliminate` `{ side, filter? }`** — `side` has no living piece matching `filter`. A
  `{type:'king'}` filter is a royal capture; an absent filter is a full wipe.
- **`reach` `{ side }`** — a **pawn** of `side` reaches the level's objective zone (see the
  pawn-only decision below).
- **`turnLimit` `{ turns }`** — player-turns elapsed ≥ `turns`. In the WIN list this reads
  "outlast N turns" (Survive); in the LOSE list it is a deadline. The condition is
  perspective-free — **the list it sits in assigns the valence.**
- **`all` `{ of }`** — every sub-condition holds (AND). Top-level lists are OR; `all` is the
  single nesting level for compound goals ("reach the zone AND survive N turns").

There are deliberately **no per-unit tags** (no "protect *this* rook"): the game has no
per-unit designation concept, so conditions filter by piece TYPE only.

### The 5 legacy modes become presets over this model

`victoryRulesForObjective(objective, ctx)` in `core/objectives.ts` is the ONE place the
stored modes are defined in terms of conditions, and `evaluateObjective` is now a thin
wrapper that expands the preset then evaluates it. Both the preset and authored paths route
through the same `evaluateVictory`, so there is a single evaluator.

| Preset (stored id) | `win` | `lose` |
|---|---|---|
| `capture-all` | `eliminate(enemy)` | `eliminate(player)` |
| `capture-king` (enemy's King) | `eliminate(enemy,{king})` | `eliminate(player)` |
| `capture-king` (your King) | `eliminate(enemy)` | `eliminate(player,{king})` |
| `rival-kings` | `eliminate(enemy,{king})` | `eliminate(player,{king})` |
| `survive` | `turnLimit(N)` | `eliminate(player)` |
| `reach` | `reach(player)` | `eliminate(player)` |

The expander reproduces the pre-ADR-0055 semantics exactly. The direction-aware `kingSide`
hack dissolves: hunt-the-King vs protect-the-King is simply which list the
`eliminate(_,{king})` sits in. The old "wipe is always a loss" special case dissolves too —
it is just the `eliminate(player)` entry every preset ships in its lose list.

### Precedence: defeat-first, one ordered pass per settled turn

When a single settled turn trips both a win and a lose condition, the **lose list is checked
before the win list** and the first match ends the game (`evaluateVictory`). This is the
named *priority-ordered rule list with first-match short-circuit*, and it matches Magic's
Comprehensive Rules 104.3f ("if a player would both win and lose, they lose"), Into the
Breach's grid-zero override, and Fire Emblem's Game-Over gate.

In this sequential one-move-per-turn game the collision is nearly unreachable — a win is
evaluated on the player's own move (before the enemy can reply) and a loss on the enemy's
move — so defeat-first bites in exactly one place: **Survive's clock reaching N on the same
turn the player's last piece is wiped resolves as a LOSS** (you must be standing *at* N to
have survived). The owner confirmed this reading. It also preserves the pre-ADR-0055
behavior, where the universal wipe check already ran before the Survive win. The only
theoretical shift is rival-kings' both-Kings-fall tie, which now resolves defeat-first rather
than win-first — unreachable, since one move only ever removes one King.

The battle clock (ADR-0053) stays a **separate real-time flag-fall loss**; it is wall-clock
milliseconds, not a turn condition, and is not folded into the lists.

### Reach is pawn-only; a promoting pawn still scores

The owner's rule: reach is *a pawn reaching the reach zone*. The pre-ADR-0055 code counted
ANY piece on the target (its own test won with a knight) — a latent looseness, now fixed. The
subtlety: a pawn reaching a far-edge reach zone (the default zone is the enemy back rank)
**promotes to a queen inside `applyMove`**, so the settled board shows a queen on the goal.
`reach` therefore reads `state.lastMove`, which records the **pre-promotion** type (`'pawn'`)
and the destination — so the arriving pawn scores, while a queen/knight that merely wandered
onto the goal does not, and an enemy reply never triggers a player reach. No store change was
needed; the store already evaluates on the settled state that carries `lastMove`.

### Validation follows the both-gates pattern

`validateLevel` (structural, `core/level.ts`, mirrored in the backend workspace PUT
`validateWorkspaceVictory`) recursively checks condition shape/enum/range when `victory` is
present. The gameplay rule — each authored list needs at least one condition (an empty win is
unwinnable; an empty lose is unlosable-by-wipe) — is `validatePlayability`'s **P6**
(`P6_VICTORY_NO_WIN` / `P6_VICTORY_NO_LOSE`), the editor's save gate, exactly as the owner
asked (the save-blocker owns "is this level actually losable", not a runtime injection).

## Consequences

- Authored `victory` flows level → save → skirmish. The store keeps the authored OVERRIDE only
  (`SkirmishState.victoryOverride: VictoryRules | null`) and derives the preset at eval time, so
  `objective`/`objectiveCtx` stay the single source of truth for preset games. It is part of the
  persisted match slice (`matchPersistence`) so a reload resumes an authored-victory level with
  its rules intact.
- The **authoring UI** is a "Victory conditions" card in the Level Editor RULES panel
  (`VictoryConditionsEditor`): a "Custom win/lose" toggle (off ⇒ preset) over two editable lists,
  seeded from the current mode when turned on. Leaf conditions (eliminate/reach/turnLimit) edit
  in place; a compound `all` renders read-only so a re-save never drops it.
- Outcome copy still keys off `objective` (`objectiveOutcomeCopy` in the store); an authored
  victory that diverges sharply from its preset may read slightly generic until the editor
  half revisits copy.
- Future extensions the shape already anticipates: per-side symmetric rules (both lists
  generalise to either side today), a named-zone `reach` target, hold-a-zone-for-N-turns, and
  an author-chosen precedence override — none built now.
