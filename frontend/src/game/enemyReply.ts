// Resolving the enemy half-turn — the pure compute that answers the player's move. It lives in
// its OWN module (not the store) so it can run in a Web Worker (game/aiWorker) OFF the main
// thread. A node-bounded alpha-beta on a rich position is up to a couple of seconds of work; on
// the UI thread that FROZE the board — no clicks, no animation, no premoving — for the whole
// think. In a worker the board stays fully live during the opponent's turn (exactly what
// premoves need) with ZERO change to the search, so the reply stays deterministic — node/depth-
// bounded, no wall-clock budget — the way netplay lockstep, self-play, and replay all require.
//
// Pure: imports only the core (rules/ai/rng) + types. No store, no DOM, no localStorage, so the
// worker bundle stays lean and the same function runs inline in tests unchanged.

import type { GameEvent, GameState, Move } from '../core/types';
import { applyMove, enemyMove, gameEnv, recordPosition, type MoveEnv } from '../core/rules';
import { searchEnemyMove, type EvalWeights } from '../core/ai';
import { createRng, type Rng } from '../core/rng';
import type { ObjectiveType } from '../core/level';
import type { ObjectiveContext } from '../core/objectives';

// Live-play search budget: bounded by NODES + DEPTH, never wall-clock, so the reply is
// deterministic — the same (game, seed, tick) yields the same move on any machine. ~40k nodes
// lands well under a perceptible think on skirmish boards (see aibench); maxDepth caps the ceiling.
export const LIVE_SEARCH = { maxDepth: 6, maxNodes: 40_000 };

/** Everything needed to answer ONE player move, all structured-cloneable so it can cross the
 *  worker boundary (GameState is serializable by construction; weights/ctx are plain data). */
export interface EnemyReplyRequest {
  game: GameState;
  seed: number;
  tick: number;
  aiMode: 'search' | 'greedy';
  objective: ObjectiveType;
  ctx: ObjectiveContext;
  turnsElapsed: number;
  /** Resolved on the main thread (the adopted-weights cache) and passed in, so the worker needs
   *  no localStorage or module state — the reply is a pure function of this request. */
  weights: EvalWeights;
}

export interface EnemyReplyResult {
  game: GameState;
  tick: number;
  events: GameEvent[];
}

/** Resolve the enemy half-turn(s) until it is the player's move again. Deterministic on
 *  (game, seed, tick). Byte-for-byte the behaviour of the old store.resolveEnemy, just
 *  parameterised by aiMode + weights so it can run standalone in a worker or inline. */
export function resolveEnemyReply(req: EnemyReplyRequest): EnemyReplyResult {
  // Static env built once from the pre-reply game (terrain + fences + this ply's lastMove),
  // exactly as the store's envFor does.
  const env: MoveEnv = { ...gameEnv(req.game), lastMove: req.game.lastMove };
  const pick: (g: GameState, rng: Rng, e: MoveEnv) => { pieceId: string; move: Move } | null =
    req.aiMode === 'greedy'
      ? enemyMove
      : (g, rng, e) => searchEnemyMove(
          g, rng, e,
          { objective: req.objective, ctx: req.ctx, turnsElapsed: req.turnsElapsed },
          { ...LIVE_SEARCH, weights: req.weights },
        );

  let game = req.game;
  let tick = req.tick;
  const events: GameEvent[] = [];
  while (game.turn === 'enemy' && !game.winner) {
    const move = pick(game, createRng(req.seed + tick), env);
    tick += 1;
    if (!move) { game = { ...game, turn: 'player' }; break; }
    const res = applyMove(game, move.pieceId, move.move);
    // The committed enemy move joins the threefold table (no-op without the rule); the
    // key needs the POST-move lastMove, so rebuild that slice of the env.
    game = recordPosition(res.state, { ...env, lastMove: res.state.lastMove });
    events.push(...res.events);
  }
  return { game, tick, events };
}
