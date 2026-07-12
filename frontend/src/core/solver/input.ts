// Board solver — the fixed frame for a level (ADR-0069 Phase 1). Bridges an
// authored `Level` to the solver's working state, reusing `createFromLevel` so the
// start is byte-identical to self-play / the store. Everything that never changes
// across a game's plies (terrain env, victory rule set, the per-piece slot map, the
// passable-cell list) is materialised ONCE here; the sweeps operate on dense
// ordinals and the retrograde loop reuses this frame per position.
//
// Correctness anchors (see the plan's Repo-verified facts):
//  - F1: victory rules = `level.victory ?? victoryRulesForObjective(objective, ctx)`,
//        and terminality routes through `resolveVictory`, never `evaluateObjective`.
//  - F2: `ctx = { ...objectiveContextForLevel(level), kingSide: kingSideOf(pieces) }`
//        (the spread is mandatory — objectiveContextForLevel alone omits kingSide).
//        `turnsElapsed` is threaded per-position by the solver, never stored here.

import type { GameState, Piece, PieceType, Side, Vec, Winner } from '../types';
import type { Level, VictoryRules } from '../level';
import type { MoveEnv } from '../rules';
import type { ObjectiveContext } from '../objectives';
import { gameEnv } from '../rules';
import { kingSideOf, objectiveContextForLevel, victoryRulesForLevel } from '../objectives';
import { adjudicateCommittedPosition } from '../adjudication';
import { isPassableTerrain } from '../terrain';
import { createFromLevel } from '../../game/setup';

/** A stable per-piece descriptor. One slot per non-neutral, non-obstacle piece; the
 * `index` is this piece's lane in the packed position key (assigned in id order so
 * enumeration/retrograde are deterministic across runs). */
export interface PieceSlot {
  index: number;
  /** The createFromLevel id, for decode → GameState. */
  id: string;
  side: Side;
  /** Type at start; only 'pawn' can change (→ 'queen'). */
  origType: PieceType;
  canPromote: boolean;
  isRoyal: boolean;
  pawnForward?: Piece['pawnForward'];
  facing?: Piece['facing'];
  startX: number;
  startY: number;
}

export interface SolverInput {
  level: Level;
  /** createFromLevel(level, seed) — the canonical start position. */
  start: GameState;
  /** gameEnv(start): static terrain + fences, reused per ply. NO lastMove (F6). */
  env: MoveEnv;
  /** { ...objectiveContextForLevel(level), kingSide: kingSideOf(start.pieces) } (F2). */
  ctx: ObjectiveContext;
  /** level.victory ?? victoryRulesForObjective(level.objective, ctx) (F1). */
  victoryRules: VictoryRules;
  /** True when terminality reads the clock (survive / turnLimit-bearing objectives) so
   * `turnsElapsed` must be folded into the position key. Inert for capture-* / rival-kings. */
  clockMatters: boolean;
  /** The number of DISTINCT clock values the key must represent (the clock digit radix). It is
   * `max(surviveTurns, every authored turnLimit condition's turns) + 1` so 0..ceil-1 are all
   * representable — deriving it from surviveTurns alone collapses distinct real clocks to one key
   * (and thus false game-value proofs) on a turnLimit override or a non-survive objective. Always
   * ≥ 1 (1 = no clock digit when clockMatters is false). */
  clockCeil: number;
  /** Stable per-piece descriptor list; index = bit lane. */
  slots: PieceSlot[];
  /** Squares a piece may legally occupy (in-bounds, passable terrain, not permanently
   * blocked by a rock/obstacle), row-major. Index into this list is packed per slot. */
  passableCells: Vec[];
  /** Permanent obstacle pieces (neutral rocks / random-rocks) reattached on every
   * decoded position — they never move or die but they block movement and rays. */
  obstacles: Piece[];
  /** True when the board can trigger en passant (BOTH sides field a pawn), so the decoded
   * lastMove-free move graph (F6) would diverge from live rules — a retrograde STRONG solve is
   * UNSOUND. Feasibility downgrades such a board to at best `hard` (search mode), and the search
   * runner's retrograde draw-proof fallback must NOT emit a proven value on it (the same refusal,
   * enforced at both places from this single flag). See §"En passant". */
  enPassantUnsound: boolean;
  /** True when the level authors castle or chess-draws events (ADR-0072): those rules make
   * value depend on a HIDDEN LEDGER the solver's position keys cannot see — Piece.hasMoved
   * (castling rights), the halfmove clock (50-move), and committed-position repetition counts.
   * Two positions with identical piece placement but different ledgers can have different true
   * values, so keys would conflate them: retrograde strong solves AND search-mode proofs are
   * both unsound. Same refusal path as enPassantUnsound, same two enforcement sites. */
  hiddenStateUnsound: boolean;
}

const isObstacleType = (t: PieceType): boolean => t === 'rock' || t === 'random-rock';

/**
 * Whether the board can trigger en passant (F6 — soundness-critical). Pawns move around freely, so
 * ANY two opposing pawns can, through ordinary advances, reach an EP-triggering relative position
 * regardless of facing; we therefore refuse whenever BOTH sides field a pawn. Sound for every facing
 * (never misses a real EP board); over-refuses only in the documented-safe direction (a board that
 * can't actually EP falls to search but is still solved correctly, just not strong-solved). A single
 * pawn (or none) can never be en-passant-captured. Pure function of the start position — the ONE
 * source of truth shared by feasibility (verdict downgrade) and the search draw-proof fallback (the
 * retrograde fold-in is EP-blind, so it must be skipped here too, not just at the feasibility gate). */
export function canTriggerEnPassant(start: GameState): boolean {
  const pawns = start.pieces.filter((p) => p.alive && p.type === 'pawn' && (p.side === 'player' || p.side === 'enemy'));
  if (pawns.length < 2) return false;
  const hasPlayerPawn = pawns.some((p) => p.side === 'player');
  const hasEnemyPawn = pawns.some((p) => p.side === 'enemy');
  return hasPlayerPawn && hasEnemyPawn;
}

/**
 * Whether the level authors any ADR-0072 hidden-ledger rule (castle or chess-draws events).
 * Those rules make legality/terminality depend on state the solver's position encoding does
 * not carry (hasMoved, halfmoveClock, positionCounts), so ANY proof keyed on placement alone
 * is unsound. Pure function of the authored level — the single source both feasibility and
 * the search prover consume. Detection is by EVENT (authored intent), not resolved GameState,
 * so a castle event whose squares never resolve still refuses (over-refusal is the safe side).
 */
export function hasHiddenLedgerEvents(level: Level): boolean {
  for (const event of level.events ?? []) {
    for (const action of event.do ?? []) {
      if (action.kind === 'castle' || action.kind === 'chess-draws') return true;
    }
  }
  return false;
}

/**
 * Whether the objective makes terminality clock-dependent. `survive` counts turns; a
 * `turnLimit` victory condition reads `turnsElapsed`. Everything else (capture-all /
 * capture-king / rival-kings / reach) settles purely on the board, so the clock is
 * inert and stays out of the position key (§position key contract clause 3).
 */
function objectiveNeedsClock(level: Level, victoryRules: VictoryRules): boolean {
  if (level.objective === 'survive') return true;
  // An authored override may carry a turnLimit condition on any objective.
  for (const rule of victoryRules) {
    for (const cond of rule.if) {
      if (cond.kind === 'turnLimit') return true;
    }
  }
  return false;
}

/**
 * The clock-digit radix: how many DISTINCT `turnsElapsed` values the position key must
 * separate. A `turnLimit turns: T` win fires at `turnsElapsed >= T`, so non-terminal clocks
 * span 0..T-1 and T is the first terminal value ⇒ we need 0..T representable = T+1 slots. The
 * ceiling is the MAX threshold across every clock source — `surviveTurns` AND every authored
 * `turnLimit` condition — plus one. Deriving it from `surviveTurns` alone (which is undefined on
 * a non-survive turnLimit override, and which ignores a survive board's authored override) clamps
 * two positions with different real clocks to one key, a false game-value proof. Returns 1 (no
 * clock digit) when the clock is inert.
 */
function clockCeilFor(clockMatters: boolean, ctx: ObjectiveContext, victoryRules: VictoryRules): number {
  if (!clockMatters) return 1;
  let maxTurns = ctx.surviveTurns ?? 0;
  for (const rule of victoryRules) {
    for (const cond of rule.if) {
      if (cond.kind === 'turnLimit' && cond.turns > maxTurns) maxTurns = cond.turns;
    }
  }
  return Math.max(maxTurns + 1, 2);
}

/**
 * Materialise the fixed frame for a level. Deterministic per seed. `createFromLevel`
 * gives the canonical start (so the solver's root is byte-identical to what the store
 * would play); everything static is computed once.
 */
export function toSolverInput(level: Level, seed = 0): SolverInput {
  const start = createFromLevel(level, seed);
  const env = gameEnv(start); // no lastMove — added per ply by callers that need it (F6)

  const ctx: ObjectiveContext = { ...objectiveContextForLevel(level), kingSide: kingSideOf(start.pieces) };
  const victoryRules: VictoryRules = victoryRulesForLevel(level, ctx);
  const clockMatters = objectiveNeedsClock(level, victoryRules);
  const clockCeil = clockCeilFor(clockMatters, ctx, victoryRules);

  // One slot per non-neutral, non-obstacle piece (player/enemy playable units). Sort by
  // id so slot indices are stable and deterministic across runs.
  const units = start.pieces
    .filter((p) => (p.side === 'player' || p.side === 'enemy') && !isObstacleType(p.type))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const slots: PieceSlot[] = units.map((p, index) => ({
    index,
    id: p.id,
    side: p.side,
    origType: p.type,
    canPromote: p.type === 'pawn',
    isRoyal: p.type === 'king',
    pawnForward: p.pawnForward,
    facing: p.facing,
    startX: p.startX ?? p.x,
    startY: p.startY,
  }));

  // Permanent obstacles: neutral rocks (from props / authored) that never move or die.
  const obstacles = start.pieces.filter((p) => isObstacleType(p.type));
  const rockCells = new Set(obstacles.map((p) => `${p.x},${p.y}`));

  // Passable cells: in-bounds, passable terrain (water passable), not permanently
  // occupied by a rock/obstacle. Row-major for determinism.
  const terrainByCell = new Map<string, boolean>();
  for (const c of start.terrain ?? []) terrainByCell.set(`${c.x},${c.y}`, isPassableTerrain(c.terrain));
  const passableCells: Vec[] = [];
  for (let y = 0; y < start.size.rows; y += 1) {
    for (let x = 0; x < start.size.cols; x += 1) {
      const key = `${x},${y}`;
      if (rockCells.has(key)) continue;
      // Unauthored cells default to open ground (matches canTraverse's "no cell ⇒ open").
      const passable = terrainByCell.has(key) ? terrainByCell.get(key)! : true;
      if (!passable) continue;
      passableCells.push({ x, y });
    }
  }

  const enPassantUnsound = canTriggerEnPassant(start);
  const hiddenStateUnsound = hasHiddenLedgerEvents(level);

  return { level, start, env, ctx, victoryRules, clockMatters, clockCeil, slots, passableCells, obstacles, enPassantUnsound, hiddenStateUnsound };
}

/**
 * The canonical live/AI/self-play committed-position decision (F1), reproduced
 * by calling the shared adjudicator with the solver's exact resolved rule list.
 * Returns the Winner: a side, 'draw', or null while undecided. Pure.
 */
export function terminalOutcome(state: GameState, input: SolverInput, turnsElapsed: number): Winner {
  if (state.winner) return state.winner;
  return adjudicateCommittedPosition(state, {
    victoryRules: input.victoryRules,
    ctx: input.ctx,
    turnsElapsed,
    // En-passant/hidden-ledger boards are refused upstream; decoded retrograde
    // states intentionally have no dynamic lastMove, which the adjudicator keeps.
    env: input.env,
  })?.winner ?? null;
}
