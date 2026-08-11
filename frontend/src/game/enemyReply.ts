// Resolving the enemy half-turn — the pure compute that answers the player's move. It lives in
// its OWN module (not the store) so it can run in a Web Worker (game/aiWorker) OFF the main
// thread. A node-bounded alpha-beta on a rich position is up to a couple of seconds of work; on
// the UI thread that FROZE the board — no clicks, no animation, no premoving — for the whole
// think. In a worker the board stays fully live during the opponent's turn (exactly what
// premoves need) with ZERO change to the search, so the reply stays deterministic — node/depth-
// bounded, no wall-clock budget — the way netplay lockstep, self-play, and replay all require.
//
// Pure: imports only the core (rules/ai/rng) + types + the notation primitive. No store, no DOM,
// no localStorage, so the worker bundle stays lean and the same function runs inline in tests
// unchanged.

import type { GameEvent, GameState, Move } from '../core/types';
import { applyMove, enemyMove, gameEnv, recordPosition, type MoveEnv } from '../core/rules';
import { sanForMove } from './sanNotation';
import { snapshotOf, type PositionSnapshot } from './moveReview';
import { searchEnemyMove, type EvalWeights } from '../core/ai';
import { createRng, type Rng } from '../core/rng';
import type { ObjectiveType, VictoryRules } from '../core/level';
import type { ObjectiveContext } from '../core/objectives';

// Live-play search budget: bounded by NODES + DEPTH, never wall-clock, so the reply is
// deterministic — the same (game, seed, tick) yields the same move on any machine.
//
// MEASURED COST (scripts/bench-live-search.mjs). On a real skirmish or Run board the search
// ALWAYS exhausts the node budget rather than the depth one: it spends all 40k nodes and
// completes only depth 3-5 of the requested 6. So this is a fixed ~40k-node tree per reply,
// and the think is a straight function of per-node cost — not "well under a perceptible
// think", which is what this comment used to claim. It is a real, visible pause; that is why
// the module runs in a worker (see the header) so the board stays live through it.
//
// Because the bound is NODES, per-node optimisation is behaviour-preserving: the same 40k
// nodes are expanded in the same order and the same move is chosen, just sooner. Raising or
// lowering maxNodes is the opposite — it changes how strong the opponent plays and breaks the
// determinism contract above, so it is an AI-strength decision, not a performance lever.
export const LIVE_SEARCH = { maxDepth: 6, maxNodes: 40_000 };

/** Everything needed to answer ONE player move, all structured-cloneable so it can cross the
 *  worker boundary (GameState is serializable by construction; weights/ctx are plain data). */
export interface EnemyReplyRequest {
  game: GameState;
  seed: number;
  tick: number;
  aiMode: 'search' | 'greedy';
  objective: ObjectiveType;
  /** Exact authored override or expanded preset. Required so search cannot silently
   * plan against a different terminal game than the live match adjudicates. */
  victoryRules: VictoryRules;
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
  /**
   * Chess notation for each half-move of this reply, in the order played. Notated HERE
   * because only this loop holds the position each half-move was played from — a reply
   * that resolves several enemy moves collapses those intermediate boards before it
   * returns, and the Event Log's score sheet needs one token per move, not per reply.
   */
  notation: string[];
  /**
   * The board after each notated half-move, in the same order — one entry per `notation` row.
   * Recorded HERE for the same reason the notation is: the intermediate boards of a
   * multi-move reply exist only inside this loop, and move review has to be able to step
   * through them one at a time rather than jump the whole reply at once.
   */
  snapshots: PositionSnapshot[];
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
          {
            objective: req.objective,
            victoryRules: req.victoryRules,
            ctx: req.ctx,
            turnsElapsed: req.turnsElapsed,
          },
          { ...LIVE_SEARCH, weights: req.weights },
        );

  let game = req.game;
  let tick = req.tick;
  const events: GameEvent[] = [];
  const notation: string[] = [];
  const snapshots: PositionSnapshot[] = [];
  while (game.turn === 'enemy' && !game.winner) {
    const move = pick(game, createRng(req.seed + tick), env);
    tick += 1;
    if (!move) { game = { ...game, turn: 'player' }; break; }
    const mover = game.pieces.find((p) => p.id === move.pieceId);
    const before = game;
    const res = applyMove(game, move.pieceId, move.move);
    // The committed enemy move joins the threefold table (no-op without the rule); the
    // key needs the POST-move lastMove, so rebuild that slice of the env.
    game = recordPosition(res.state, { ...env, lastMove: res.state.lastMove });
    events.push(...res.events);
    if (mover) {
      notation.push(sanForMove(before, game, {
        pieceId: mover.id,
        side: mover.side,
        from: { x: mover.x, y: mover.y },
        move: move.move,
      }));
      snapshots.push(snapshotOf(game));
    }
  }
  return { game, tick, events, notation, snapshots };
}
