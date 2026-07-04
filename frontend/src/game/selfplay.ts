// Headless self-play: play an authored Level to completion with the search AI on
// BOTH sides, recording every move. This is the Game Lab's engine room and the
// substrate rung 2 (value fitting) will train on. Pure and deterministic per
// seed — no store, no DOM, no timers — so it runs identically in a web worker,
// a test, or a node script.
//
// The loop mirrors the store's turn resolution exactly (player move → objective
// check → enemy phase → round tick → objective check), so a self-play result is
// what a live game of the same moves would produce.

import { createFromLevel } from './setup';
import { searchBestAction, type SearchOptions } from '../core/ai';
import { evaluateObjective, kingSideOf, objectiveContextForLevel, type ObjectiveContext } from '../core/objectives';
import type { Level, ObjectiveType } from '../core/level';
import { applyMove, legalMoves, livingPieces, sideInCheck, type MoveEnv } from '../core/rules';
import { buildTerrainIndex } from '../core/terrain';
import { createRng } from '../core/rng';
import type { GameState, Move, PieceType, Side, Vec, Winner } from '../core/types';

/** One committed action: enough to replay through applyMove and to compute
 * activity flags without re-simulating. */
export interface RecordedMove {
  pieceId: string;
  side: Side;
  from: Vec;
  /** The Move handed to applyMove — target square + capture/enPassant markers. */
  move: Move;
}

/** Per-piece service record across one game (computed once at the end). */
export interface PieceActivity {
  id: string;
  side: Side;
  /** Type at game START (a promoted pawn still reads as the pawn it was fielded as). */
  type: PieceType;
  moves: number;
  captures: number;
  survived: boolean;
}

export interface GameRecord {
  seed: number;
  winner: Winner;
  plies: number;
  turnsElapsed: number;
  moves: RecordedMove[];
  pieces: PieceActivity[];
  /** Mean completed search depth across all decisions (both sides). */
  avgDepth: number;
  /** Total nodes searched across the game — the honest cost of the run. */
  nodes: number;
}

export interface SelfPlayOptions {
  seed: number;
  /** Search settings applied to BOTH sides (equal-strength self-play). */
  search?: SearchOptions;
  /** Per-side search settings (champion-vs-challenger). When provided for a side,
   * it overrides `search` for that side; the gym passes different eval weights per
   * side here so one config plays another. Absent side falls back to `search`. */
  searchForSide?: Partial<Record<'player' | 'enemy', SearchOptions>>;
  /** Hard game-length cap; hitting it scores a draw. */
  maxPlies?: number;
  /** Opening plies (from an opening book) applied via applyMove from the seeded
   * start BEFORE the search loop, so self-play continues from a book position
   * instead of the level's fixed start. Additive: callers that omit this play
   * from the start exactly as before. These plies are NOT recorded in the
   * result's `moves` (they are the fixed opening, not decisions of this game). */
  openingMoves?: RecordedMove[];
}

const DEFAULT_MAX_PLIES = 300;

/** Play one full game of `level` and return the complete record. */
export function playLevelGame(level: Level, opts: SelfPlayOptions): GameRecord {
  const seed = opts.seed;
  const maxPlies = opts.maxPlies ?? DEFAULT_MAX_PLIES;
  const objective: ObjectiveType = level.objective;

  let game: GameState = createFromLevel(level, seed);
  const ctx: ObjectiveContext = { ...objectiveContextForLevel(level), kingSide: kingSideOf(game.pieces) };

  // Opening book: fast-forward through the fixed opening plies (if any) BEFORE the
  // search loop. applyMove advances turn parity, so self-play resumes from the book
  // position with the correct side to move. Stop early if an opening move already
  // decides the game (degenerate books) so we never search a finished board.
  for (const om of opts.openingMoves ?? []) {
    if (game.turn !== 'player' && game.turn !== 'enemy') break;
    game = applyMove(game, om.pieceId, om.move).state;
  }
  const terrain = game.terrain ? buildTerrainIndex(game.terrain) : undefined;
  const startPieces = game.pieces.map((p) => ({ id: p.id, side: p.side, type: p.type }));

  const moves: RecordedMove[] = [];
  let turnsElapsed = 0;
  let plies = 0;
  let tick = 0;
  let depthSum = 0;
  let nodes = 0;

  // Start-of-game resolution, mirroring the store's newSkirmish order: first a
  // stuck check (a player with no legal move at the start is a stalemate/checkmate,
  // exactly as resolveIfPlayerStuck decides it), then the objective, so a degenerate
  // level (e.g. a runner authored on a reach cell) is recorded as a zero-move game.
  const startEnv: MoveEnv = { terrain, lastMove: game.lastMove };
  const playerHasMove = livingPieces(game.pieces, 'player').some(
    (p) => legalMoves(p, game.pieces, game.size, startEnv).length > 0,
  );
  if (game.turn === 'player' && !playerHasMove) {
    const winner: Winner = sideInCheck(game, 'player', startEnv) ? 'enemy' : 'draw';
    game = { ...game, winner, turn: 'done' };
  }
  if (!game.winner) {
    const preWinner = evaluateObjective(game, objective, { ...ctx, turnsElapsed });
    if (preWinner) game = { ...game, winner: preWinner, turn: 'done' };
  }

  while (!game.winner && plies < maxPlies && (game.turn === 'player' || game.turn === 'enemy')) {
    const side: Side = game.turn;
    const env: MoveEnv = { terrain, lastMove: game.lastMove };
    // Champion-vs-challenger: each side may search with its own eval weights.
    const sideSearch = opts.searchForSide?.[side] ?? opts.search;
    const chosen = searchBestAction(game, env, { objective, ctx, turnsElapsed }, createRng(seed + tick), sideSearch);
    tick += 1;
    if (!chosen) {
      // No legal action: checkmate if the stuck side's King is attacked (a loss
      // for that side), else stalemate — the store's terminalIfStuck semantics.
      const winner: Winner = sideInCheck(game, side, env) ? (side === 'player' ? 'enemy' : 'player') : 'draw';
      game = { ...game, winner, turn: 'done' };
      break;
    }

    const mover = game.pieces.find((p) => p.id === chosen.pieceId);
    const from: Vec = mover ? { x: mover.x, y: mover.y } : { x: chosen.move.x, y: chosen.move.y };
    const prevTurn = game.turn;
    const res = applyMove(game, chosen.pieceId, chosen.move);
    game = res.state;
    plies += 1;
    depthSum += chosen.depth;
    nodes += chosen.nodes;
    moves.push({ pieceId: chosen.pieceId, side, from, move: chosen.move });

    // A full player→enemy round completes when the enemy's move ends its half —
    // the moment the store advances the survive clock. Count it even when that move
    // decides the game (turn goes to 'done', not 'player'), so the recorded round
    // count matches what the live store reports for an enemy-decided game.
    if (prevTurn === 'enemy' && game.turn !== 'enemy') turnsElapsed += 1;

    if (!game.winner) {
      const winner = evaluateObjective(game, objective, { ...ctx, turnsElapsed });
      if (winner) game = { ...game, winner, turn: 'done' };
    }
  }

  // Ply cap reached with no decision: call it a draw rather than lie with null.
  if (!game.winner) game = { ...game, winner: 'draw', turn: 'done' };

  const captureCounts = new Map<string, number>();
  const moveCounts = new Map<string, number>();
  for (const m of moves) {
    moveCounts.set(m.pieceId, (moveCounts.get(m.pieceId) ?? 0) + 1);
    if (m.move.capture) captureCounts.set(m.pieceId, (captureCounts.get(m.pieceId) ?? 0) + 1);
  }
  const finalById = new Map(game.pieces.map((p) => [p.id, p]));
  const pieces: PieceActivity[] = startPieces
    .filter((p) => p.side === 'player' || p.side === 'enemy')
    .map((p) => ({
      id: p.id,
      side: p.side,
      type: p.type,
      moves: moveCounts.get(p.id) ?? 0,
      captures: captureCounts.get(p.id) ?? 0,
      survived: finalById.get(p.id)?.alive ?? false,
    }));

  return {
    seed,
    winner: game.winner,
    plies,
    turnsElapsed,
    moves,
    pieces,
    avgDepth: plies ? depthSum / plies : 0,
    nodes,
  };
}

/**
 * Reconstruct the board state after each recorded move by replaying through the
 * real applyMove — the replay viewer's data source. Index 0 is the starting
 * position; index i is the board after moves[i-1].
 */
export function replayStates(level: Level, record: GameRecord): GameState[] {
  let game = createFromLevel(level, record.seed);
  const states: GameState[] = [game];
  for (const m of record.moves) {
    game = applyMove(game, m.pieceId, m.move).state;
    states.push(game);
  }
  return states;
}

/** Aggregate view of a set of games — the Lab's headline numbers. */
export interface RunAggregate {
  games: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  playerWinRate: number;
  /** Half-width of the 95% normal-approximation interval on the win rate. */
  winRateError: number;
  avgPlies: number;
  avgDepth: number;
}

export function aggregateRecords(records: readonly GameRecord[]): RunAggregate {
  const games = records.length;
  const playerWins = records.filter((r) => r.winner === 'player').length;
  const enemyWins = records.filter((r) => r.winner === 'enemy').length;
  const draws = games - playerWins - enemyWins;
  const p = games ? playerWins / games : 0;
  return {
    games,
    playerWins,
    enemyWins,
    draws,
    playerWinRate: p,
    winRateError: games ? 1.96 * Math.sqrt((p * (1 - p)) / games) : 0,
    avgPlies: games ? records.reduce((s, r) => s + r.plies, 0) / games : 0,
    avgDepth: games ? records.reduce((s, r) => s + r.avgDepth, 0) / games : 0,
  };
}
