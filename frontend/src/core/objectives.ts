// Per-objective win conditions (issue #44 Track 4). Pure + deterministic: maps a
// level's ObjectiveType + a small context into a Winner, replacing the core's
// hard-coded last-side-standing rule for levels that want richer goals. The
// store evaluates this after each resolved turn.

import type { GameState, Piece, Vec, Winner } from './types';
import type { ObjectiveType } from './level';
import { livingPieces } from './rules';

/** The "royal" piece whose loss ends a capture-king objective. */
const ROYAL: Piece['type'] = 'queen';

export interface ObjectiveContext {
  /** `survive`: number of player turns that must elapse to win. */
  surviveTurns?: number;
  /** `survive`: player turns elapsed so far. */
  turnsElapsed?: number;
  /** `reach`: destination cells a living player piece must stand on. */
  reachCells?: readonly Vec[];
}

/**
 * Resolve a level objective to a winner, or `null` while undecided. Pure.
 * A full player wipe is always a loss regardless of objective; otherwise each
 * objective defines the player's win.
 */
export function evaluateObjective(state: GameState, objective: ObjectiveType, ctx: ObjectiveContext = {}): Winner {
  const players = livingPieces(state.pieces, 'player');
  if (!players.length) return 'enemy';
  const enemies = livingPieces(state.pieces, 'enemy');

  switch (objective) {
    case 'capture-all':
      return enemies.length ? null : 'player';
    case 'capture-king':
      // Won once the enemy has no royal piece left standing.
      return enemies.some((p) => p.type === ROYAL) ? null : 'player';
    case 'survive':
      return (ctx.turnsElapsed ?? 0) >= (ctx.surviveTurns ?? 0) ? 'player' : null;
    case 'reach': {
      const cells = ctx.reachCells ?? [];
      return players.some((p) => cells.some((c) => c.x === p.x && c.y === p.y)) ? 'player' : null;
    }
    default:
      return enemies.length ? null : 'player';
  }
}
