// Rung-1 game AI (issue #25): iterative-deepening alpha-beta search over the pure
// rules engine, scored by an authored, objective-aware evaluation.
//
// Design constraints, in order:
// - The opponent must visibly play the MODE: hunt the King in King Assault, rush
//   the player in Survive, garrison the zone in Reach. Objective terms in the
//   eval do that; search makes the play tactically sound.
// - Deterministic per seed: the only randomness is the seeded near-best pick at
//   the root (moves within `epsilon` of the best score), so self-play runs are
//   reproducible and live games replay from their seed.
// - Every weight lives in EvalWeights so a future tuning pass (Texel/SPSA — the
//   ladder's rung 2) can fit them from self-play instead of hand-guessing.
//
// Search only discovers value inside its horizon; everything longer-range must be
// an eval term. Keep terms cheap: eval runs at every leaf.

import type { GameState, Move, Piece, PieceType, Side, Vec, Winner } from './types';
import type { MoveEnv } from './rules';
import { applyMove, attackedSquares, legalMoves, livingPieces, sideInCheck } from './rules';
import { evaluateObjective, type ObjectiveContext } from './objectives';
import type { ObjectiveType } from './level';
import type { Rng } from './rng';

/**
 * Every number the evaluation uses. Hand-seeded defaults; the whole point of the
 * indirection is that a tuner (or a curious owner) can refit them per board.
 */
export interface EvalWeights {
  /** Fighting worth per piece type. The King is a piece here, NOT infinity — royal
   * loss is terminal via the objective, so material only prices his sword arm. */
  pieceValues: Record<PieceType, number>;
  /** Fraction of a piece's value lost by standing attacked and undefended. */
  hangingUndefended: number;
  /** Fraction lost when attacked but defended (a trade threat, not a gift). */
  hangingDefended: number;
  /** Per-square pull toward each side's aggression target. */
  advance: number;
  /** Per-square pull keeping the King-holder's pieces near their King. */
  guard: number;
  /** Per-square value of the best runner's progress toward a reach cell. */
  reachProgress: number;
  /** Per-square pull keeping enemies garrisoned near the reach zone. */
  reachGarrison: number;
  /** Enemy aggression in `survive` — the attacker is racing the clock. */
  surviveUrgency: number;
  /** Player-side value of each survive round already banked. */
  surviveClock: number;
}

export const DEFAULT_EVAL_WEIGHTS: EvalWeights = {
  pieceValues: {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 4,
    rock: 0,
    'random-rock': 0,
  },
  // Near-zero since quiescence search now resolves exchanges EXACTLY at the leaf:
  // these static terms were a horizon-blind approximation of what q-search computes,
  // and keeping them high double-counts (the engine flees pieces it can see are
  // safe). A small `undefended` residual still covers a threat that needs a quiet
  // preparatory move, which is beyond q-search's capture-only horizon. NOTE: this
  // changes DEFAULT_EVAL_WEIGHTS — the vector the SPSA trainer perturbs and the
  // resolver's fallback — so the tuner fits the POST-quiescence engine.
  hangingUndefended: 0.05,
  hangingDefended: 0.0,
  advance: 0.05,
  guard: 0.04,
  reachProgress: 0.25,
  reachGarrison: 0.08,
  surviveUrgency: 0.12,
  surviveClock: 0.3,
};

/** Objective framing the search needs beyond the raw state. */
export interface SearchContext {
  objective: ObjectiveType;
  /** Static objective context (survive clock target, reach cells, kingSide). */
  ctx: ObjectiveContext;
  /** Player→enemy rounds already elapsed (the survive clock's current reading). */
  turnsElapsed: number;
}

export interface SearchOptions {
  /** Iterative-deepening ceiling (plies). */
  maxDepth?: number;
  /** Soft wall-clock think budget; the deepest COMPLETED depth's result is used.
   * OMIT for reproducible search (self-play, the Lab, tests): with no time budget
   * the search is bounded purely by maxDepth + maxNodes, both deterministic, so a
   * seed replays identically on any machine. Live play passes a budget for
   * responsiveness (a live game persists its moves, so its replay is exact
   * regardless). */
  timeBudgetMs?: number;
  /** Hard node ceiling — the deterministic backstop that bounds work with no time
   * budget, and caps a single exploding depth. */
  maxNodes?: number;
  /** Root near-best window: moves scoring within epsilon of best form the pick pool. */
  epsilon?: number;
  weights?: EvalWeights;
}

const DEFAULT_MAX_DEPTH = 6;
// Quiescence search SHARES this budget — q-nodes count against it — so at the
// default the main search completes a slightly shallower depth than pre-q but plays
// it more soundly (no throughput regression for default callers). It's only a
// backstop: live play and the trainer each pass their own maxNodes (live also a
// time budget), so this default governs nothing performance-critical. The trainer
// picks its search budget explicitly, trading depth against self-play volume.
const DEFAULT_MAX_NODES = 200_000;
const DEFAULT_EPSILON = 0.25;
// Hard ply cap on the capture-only quiescence recursion, so a long forced exchange
// can't recurse unbounded (the node budget is the other, global, backstop).
const QUIESCE_MAX_PLY = 8;

/** Terminal score magnitude; ply-adjusted so faster wins (and later losses) rank higher. */
const WIN_SCORE = 10_000;

export interface ChosenAction {
  pieceId: string;
  move: Move;
  /** Player-positive score of the chosen line at the deepest completed depth. */
  score: number;
  /** Deepest fully completed search depth. */
  depth: number;
  /** Nodes expanded across all completed depths. */
  nodes: number;
}

// Octile distance: Chebyshev plus a fractional off-axis component. Pure Chebyshev
// is gradient-blind for a piece approaching on the long axis (a rook sliding
// toward a diagonal target never changes max(dx, dy)); the 0.41·min term keeps
// every approach move worth something.
const cheb = (a: Vec, b: Vec): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
};

const isCombatant = (p: Piece): boolean => p.alive && (p.side === 'player' || p.side === 'enemy');

/** Union of squares a side attacks, keyed "x,y" — the eval's danger map.
 * Terrain-aware when `env` is given (a slider's threat stops at walls/water). */
function attackMap(pieces: readonly Piece[], side: Side, size: GameState['size'], env?: MoveEnv): Set<string> {
  const map = new Set<string>();
  for (const p of pieces) {
    if (!p.alive || p.side !== side || p.type === 'rock' || p.type === 'random-rock') continue;
    for (const sq of attackedSquares(p, pieces, size, env)) map.add(`${sq.x},${sq.y}`);
  }
  return map;
}

function nearestDistance(from: Piece, targets: readonly Piece[]): number {
  let best = Infinity;
  for (const t of targets) {
    const d = cheb(from, t);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best;
}

function nearestCellDistance(from: Piece, cells: readonly Vec[]): number {
  let best = Infinity;
  for (const c of cells) {
    const d = cheb(from, c);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best;
}

/**
 * Authored evaluation, from the PLAYER's perspective (positive = good for the
 * player). Material + hanging-piece safety + objective-shaped distance terms.
 */
export function evaluateGameState(state: GameState, sctx: SearchContext, weights: EvalWeights = DEFAULT_EVAL_WEIGHTS, env?: MoveEnv): number {
  const players = livingPieces(state.pieces, 'player');
  const enemies = livingPieces(state.pieces, 'enemy');
  const values = weights.pieceValues;

  let score = 0;
  for (const p of players) score += values[p.type];
  for (const e of enemies) score -= values[e.type];

  // Safety: a piece parked on an attacked square bleeds a fraction of its value —
  // the term that stops horizon-blind piece gifts at the leaves.
  const playerAttacks = attackMap(state.pieces, 'player', state.size, env);
  const enemyAttacks = attackMap(state.pieces, 'enemy', state.size, env);
  for (const p of players) {
    if (!enemyAttacks.has(`${p.x},${p.y}`)) continue;
    const defended = playerAttacks.has(`${p.x},${p.y}`);
    score -= values[p.type] * (defended ? weights.hangingDefended : weights.hangingUndefended);
  }
  for (const e of enemies) {
    if (!playerAttacks.has(`${e.x},${e.y}`)) continue;
    const defended = enemyAttacks.has(`${e.x},${e.y}`);
    score += values[e.type] * (defended ? weights.hangingDefended : weights.hangingUndefended);
  }

  // Objective terms: distance gradients that point each side at what the MODE
  // says matters. These are what make the opponent visibly play the objective.
  const { objective, ctx } = sctx;
  const playerKing = players.find((p) => p.type === 'king');
  const enemyKing = enemies.find((p) => p.type === 'king');

  if (objective === 'capture-king') {
    if ((ctx.kingSide ?? 'enemy') === 'enemy') {
      // Player hunts the enemy King; the enemy guards him.
      if (enemyKing) {
        for (const p of players) score -= weights.advance * cheb(p, enemyKing);
        for (const e of enemies) {
          if (e !== enemyKing) score += weights.guard * cheb(e, enemyKing);
        }
      }
    } else if (playerKing) {
      // Mirrored: enemy hunts the player's King; the player guards him.
      for (const e of enemies) score += weights.advance * cheb(e, playerKing);
      for (const p of players) {
        if (p !== playerKing) score -= weights.guard * cheb(p, playerKing);
      }
    }
  } else if (objective === 'rival-kings') {
    if (enemyKing) for (const p of players) score -= weights.advance * cheb(p, enemyKing);
    if (playerKing) for (const e of enemies) score += weights.advance * cheb(e, playerKing);
  } else if (objective === 'survive') {
    // The enemy is the one racing the clock: strong pull onto the player's force.
    for (const e of enemies) score += weights.surviveUrgency * nearestDistance(e, players);
    // Each banked round is worth something even before the clock terminates.
    score += weights.surviveClock * Math.min(sctx.turnsElapsed, ctx.surviveTurns ?? sctx.turnsElapsed);
  } else if (objective === 'reach') {
    const cells = ctx.reachCells ?? [];
    if (cells.length) {
      // Only the best runner's progress counts — the mode is one breakthrough.
      let runner = Infinity;
      for (const p of players) runner = Math.min(runner, nearestCellDistance(p, cells));
      if (runner !== Infinity) score -= weights.reachProgress * runner;
      // Garrison: enemies want to stand between the runner and the zone.
      for (const e of enemies) score += weights.reachGarrison * nearestCellDistance(e, cells);
    }
    for (const e of enemies) score += 0.5 * weights.advance * nearestDistance(e, players);
  } else {
    // capture-all (and the default): mutual aggression — close distance, force trades.
    for (const p of players) score -= weights.advance * nearestDistance(p, enemies);
    for (const e of enemies) score += weights.advance * nearestDistance(e, players);
  }

  return score;
}

interface RootEntry {
  piece: Piece;
  move: Move;
  score: number;
}

interface SearchState {
  nodes: number;
  deadline: number;
  maxNodes: number;
  aborted: boolean;
  weights: EvalWeights;
  terrainEnv: MoveEnv['terrain'];
  fences: MoveEnv['fences'];
  sctx: SearchContext;
}

function outOfBudget(s: SearchState): boolean {
  if (s.nodes >= s.maxNodes || ((s.nodes & 1023) === 0 && Date.now() > s.deadline)) {
    s.aborted = true;
    return true;
  }
  return false;
}

function terminalScore(winner: Winner, ply: number): number {
  if (winner === 'player') return WIN_SCORE - ply;
  if (winner === 'enemy') return -(WIN_SCORE - ply);
  return 0; // draw
}

function captureValue(move: Move, pieces: readonly Piece[], values: Record<PieceType, number>): number {
  if (!move.capture) return -1;
  const target = pieces.find((p) => p.id === move.capture);
  return target ? values[target.type] : -1;
}

/**
 * Quiescence search at the leaf: keep searching CAPTURES (only) until the position
 * is "quiet", so a leaf is never scored mid-exchange. Without this, negamax scores
 * a position one ply before a recapture and happily gifts pieces past the horizon —
 * the classic horizon effect. Standard shape (chessprogramming.org "Quiescence
 * Search"): budget/terminal check, a stand-pat lower bound (not capturing is always
 * an option), a hard ply cap, then delta-pruned captures in MVV order.
 *
 * Returns a side-to-move-positive value, the SAME convention as negamax's leaf, so
 * it drops in at `depth === 0`. Adds NO randomness and reuses the exact `captureValue`
 * ordering + `legalMoves` generation negamax uses, so seeds still replay identically.
 */
function quiesce(
  s: SearchState,
  state: GameState,
  lastMove: GameState['lastMove'],
  ply: number,
  alpha: number,
  beta: number,
  turnsElapsed: number,
  qDepth: number,
): number {
  if (outOfBudget(s)) return 0;
  const color = state.turn === 'player' ? 1 : -1;
  const env: MoveEnv = { terrain: s.terrainEnv, lastMove };

  // Same terminal check as negamax, BEFORE stand-pat: a King capture inside the
  // exchange must resolve as a mate via the objective, not as a bag of material.
  const winner = state.winner ?? evaluateObjective(state, s.sctx.objective, { ...s.sctx.ctx, turnsElapsed });
  if (winner) return color * terminalScore(winner, ply);

  // Stand-pat: declining all captures is a legal option in a quiet search, so the
  // static eval is a lower bound. Fail-high if it already beats beta.
  const standPat = color * evaluateGameState(state, { ...s.sctx, turnsElapsed }, s.weights, env);
  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;
  if (qDepth <= 0) return standPat; // hard cap on a long forced exchange

  const side = state.turn as Side;
  // Capture-only extension: reuse legalMoves (inherits the king-safety filter and
  // en-passant for free) and keep only capturing moves. The wasted non-capture
  // generation is the measured perf cost; a captures-only generator is the Phase-2
  // lever if the benchmark warrants it.
  const caps: { piece: Piece; move: Move }[] = [];
  for (const piece of livingPieces(state.pieces, side)) {
    for (const move of legalMoves(piece, state.pieces, state.size, env)) {
      if (move.capture != null) caps.push({ piece, move });
    }
  }
  if (!caps.length) return standPat; // quiet node — the recursion's base case

  caps.sort(
    (a, b) => captureValue(b.move, state.pieces, s.weights.pieceValues) - captureValue(a.move, state.pieces, s.weights.pieceValues),
  );

  // Delta pruning: skip a capture that can't lift alpha even if the victim were
  // free — but never inside a forced-mate line (standPat already a mate score).
  const notMate = Math.abs(standPat) < WIN_SCORE - 1000;
  const deltaMargin = s.weights.pieceValues.pawn * 2;
  for (const cap of caps) {
    if (notMate) {
      const gain = captureValue(cap.move, state.pieces, s.weights.pieceValues);
      if (standPat + gain + deltaMargin < alpha) continue;
    }
    s.nodes += 1;
    const res = applyMove(state, cap.piece.id, cap.move);
    const roundDone = state.turn === 'enemy' && res.state.turn === 'player';
    const v = -quiesce(s, res.state, res.state.lastMove, ply + 1, -beta, -alpha, turnsElapsed + (roundDone ? 1 : 0), qDepth - 1);
    if (s.aborted) return 0;
    if (v > alpha) {
      alpha = v;
      if (alpha >= beta) return alpha;
    }
  }
  return alpha;
}

/**
 * Negamax with alpha-beta. Returns the state's value from the PLAYER perspective
 * times the side-to-move color, per negamax convention. `turnsElapsed` advances
 * when a move hands the turn from enemy back to player (a full round), which is
 * exactly when the store's survive clock ticks.
 */
function negamax(
  s: SearchState,
  state: GameState,
  lastMove: GameState['lastMove'],
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  turnsElapsed: number,
): number {
  if (outOfBudget(s)) return 0;
  const color = state.turn === 'player' ? 1 : -1;

  const env: MoveEnv = { terrain: s.terrainEnv, fences: s.fences, lastMove };
  const winner = state.winner ?? evaluateObjective(state, s.sctx.objective, { ...s.sctx.ctx, turnsElapsed });
  if (winner) return color * terminalScore(winner, ply);
  if (depth === 0) return quiesce(s, state, lastMove, ply, alpha, beta, turnsElapsed, QUIESCE_MAX_PLY);

  const side = state.turn as Side;
  const entries: { piece: Piece; move: Move }[] = [];
  for (const piece of livingPieces(state.pieces, side)) {
    for (const move of legalMoves(piece, state.pieces, state.size, env)) entries.push({ piece, move });
  }
  if (!entries.length) {
    // No legal action: checkmate if the stuck side's King is attacked (a loss
    // for that side), else stalemate — mirroring the store's terminalIfStuck.
    if (sideInCheck(state, side, env)) {
      const mated: Winner = side === 'player' ? 'enemy' : 'player';
      return color * terminalScore(mated, ply);
    }
    return 0;
  }
  entries.sort(
    (a, b) => captureValue(b.move, state.pieces, s.weights.pieceValues) - captureValue(a.move, state.pieces, s.weights.pieceValues),
  );

  let best = -Infinity;
  for (const entry of entries) {
    s.nodes += 1;
    const res = applyMove(state, entry.piece.id, entry.move);
    const roundDone = state.turn === 'enemy' && res.state.turn === 'player';
    const v = -negamax(s, res.state, res.state.lastMove, depth - 1, ply + 1, -beta, -alpha, turnsElapsed + (roundDone ? 1 : 0));
    if (s.aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Pick the side-to-move's action: iterative-deepening alpha-beta, then a seeded
 * pick among root moves within `epsilon` of the best score (pass `rng: null` for
 * strict argmax). Returns null when the side to move has no legal action.
 *
 * Root moves are each searched with a full window so near-best scores are exact —
 * that costs the root-level cutoff but keeps the epsilon pool honest.
 */
export function searchBestAction(
  state: GameState,
  env: MoveEnv,
  sctx: SearchContext,
  rng: Rng | null,
  opts: SearchOptions = {},
): ChosenAction | null {
  if (state.turn !== 'player' && state.turn !== 'enemy') return null;
  const weights = opts.weights ?? DEFAULT_EVAL_WEIGHTS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const epsilon = opts.epsilon ?? DEFAULT_EPSILON;
  const side = state.turn as Side;

  let roots: RootEntry[] = [];
  for (const piece of livingPieces(state.pieces, side)) {
    for (const move of legalMoves(piece, state.pieces, state.size, env)) {
      roots.push({ piece, move, score: captureValue(move, state.pieces, weights.pieceValues) });
    }
  }
  if (!roots.length) return null;

  const s: SearchState = {
    nodes: 0,
    // No time budget ⇒ Infinity deadline: search is bounded by maxDepth + maxNodes
    // only, which is deterministic (so a seed replays identically). A finite budget
    // is a live-play responsiveness cap; frozen-clock tests leave it out.
    deadline: opts.timeBudgetMs != null ? Date.now() + opts.timeBudgetMs : Infinity,
    maxNodes: opts.maxNodes ?? DEFAULT_MAX_NODES,
    aborted: false,
    weights,
    terrainEnv: env.terrain,
    fences: env.fences,
    sctx,
  };

  let completed: RootEntry[] | null = null;
  let completedDepth = 0;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    // Previous depth's scores order this one (stable: score desc, then position).
    roots = [...roots].sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x || a.piece.id.localeCompare(b.piece.id));
    const scored: RootEntry[] = [];
    for (const root of roots) {
      s.nodes += 1;
      const res = applyMove(state, root.piece.id, root.move);
      const roundDone = state.turn === 'enemy' && res.state.turn === 'player';
      const v = -negamax(s, res.state, res.state.lastMove, depth - 1, 1, -Infinity, Infinity, sctx.turnsElapsed + (roundDone ? 1 : 0));
      if (s.aborted) break;
      scored.push({ ...root, score: v });
    }
    if (s.aborted || scored.length !== roots.length) break;
    roots = scored;
    completed = scored;
    completedDepth = depth;
  }

  if (!completed) {
    // Budget too tight for even depth 1: fall back to the ordering heuristic.
    completed = roots;
    completedDepth = 0;
  }

  const pool = [...completed].sort(
    (a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x || a.piece.id.localeCompare(b.piece.id),
  );
  const best = pool[0];
  // Scores are side-to-move-positive at the root; normalize the report to
  // player-positive so callers read one convention.
  const near = pool.filter((e) => best.score - e.score <= epsilon);
  const picked = rng && near.length > 1 ? rng.pick(near) : near[0];
  const playerPositive = side === 'player' ? picked.score : -picked.score;
  return { pieceId: picked.piece.id, move: picked.move, score: playerPositive, depth: completedDepth, nodes: s.nodes };
}

/**
 * Drop-in replacement for the store's greedy `enemyMove`: same call shape plus
 * the objective framing. Deterministic per rng seed.
 */
export function searchEnemyMove(
  state: GameState,
  rng: Rng,
  env: MoveEnv,
  sctx: SearchContext,
  opts?: SearchOptions,
): { pieceId: string; move: Move } | null {
  const chosen = searchBestAction(state, env, sctx, rng, opts);
  return chosen ? { pieceId: chosen.pieceId, move: chosen.move } : null;
}
