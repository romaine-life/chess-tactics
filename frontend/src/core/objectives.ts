// Per-objective win conditions (issue #44 Track 4). Pure + deterministic: maps a
// level's ObjectiveType + a small context into a Winner, replacing the core's
// hard-coded last-side-standing rule for levels that want richer goals. The
// store evaluates this after each resolved turn.

import type { BoardSize, GameState, Piece, Vec, Winner } from './types';
import type { Level, ObjectiveType } from './level';
import { livingPieces } from './rules';

/** The "royal" piece whose loss ends a capture-king / rival-kings objective. */
const ROYAL: Piece['type'] = 'king';

// Turn target for a `survive` level that doesn't author one: the schema field is
// `level.surviveTurns` (optional, ADR-0048); when absent the battle outlasts this
// many player turns, which keeps every pre-field survive level playing unchanged.
export const DEFAULT_SURVIVE_TURNS = 8;

/**
 * Owner-facing mode names (ADR-0048). THE single source of truth for mode labels —
 * stored ids stay the legacy objective ids deliberately (renaming would force a prod
 * data migration for zero player-visible gain), and every UI that shows a mode must
 * read these rather than re-hardcoding strings.
 */
export const MODE_NAME: Record<ObjectiveType, string> = {
  'capture-all': 'Last Man Standing',
  'capture-king': 'King Assault',
  'rival-kings': 'Rival Kings',
  survive: 'Survive',
  reach: 'Reach',
};

/** Short, player-facing summary of each objective (HUD / level select). Static map —
 * for the direction-aware capture-king copy use `objectiveSummary` instead. */
export const OBJECTIVE_LABEL: Record<ObjectiveType, string> = {
  'capture-all': 'Defeat every enemy piece',
  'capture-king': 'Capture the enemy King',
  'rival-kings': 'Capture the rival King',
  survive: 'Outlast the assault',
  reach: 'Reach the objective',
};

/**
 * Which side "owns" the King for a direction-aware `capture-king` game: the side
 * fielding a living King. Defaults to 'enemy' when BOTH sides field one (that's
 * rival-kings territory, and the classic hunt-the-enemy-King reading is the safe
 * one) or NEITHER does (a free skirmish always gives the enemy the King, so the
 * default keeps today's behavior). Computed once at game start from the initial
 * pieces and carried in ObjectiveContext.
 */
export function kingSideOf(pieces: Piece[]): 'player' | 'enemy' {
  const playerKing = pieces.some((p) => p.alive && p.side === 'player' && p.type === ROYAL);
  const enemyKing = pieces.some((p) => p.alive && p.side === 'enemy' && p.type === ROYAL);
  return playerKing && !enemyKing ? 'player' : 'enemy';
}

/**
 * The one-line goal copy for the HUD / intro log / result flow. Direction-aware
 * where the static OBJECTIVE_LABEL can't be: King Assault reads "Capture the enemy
 * King" when the enemy fields the King, "Protect your King" when the player does.
 */
export function objectiveSummary(objective: ObjectiveType, kingSide: 'player' | 'enemy' = 'enemy'): string {
  if (objective === 'capture-king' && kingSide === 'player') return 'Protect your King';
  return OBJECTIVE_LABEL[objective];
}

export interface ObjectiveContext {
  /** `survive`: number of player turns that must elapse to win. */
  surviveTurns?: number;
  /** `survive`: player turns elapsed so far. */
  turnsElapsed?: number;
  /** `reach`: destination cells a living player piece must stand on. */
  reachCells?: readonly Vec[];
  /** `capture-king`: the side fielding THE King (see kingSideOf). Absent ⇒ 'enemy',
   * which is exactly the pre-ADR-0048 behavior. */
  kingSide?: 'player' | 'enemy';
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
    case 'capture-king': {
      // Direction-aware (ADR-0048): the King-holding side loses the MOMENT its King
      // falls; the kingless side loses only by wipe. ctx.kingSide defaults to 'enemy'
      // (free skirmish / legacy levels), which is the classic hunt-the-King reading.
      if ((ctx.kingSide ?? 'enemy') === 'player') {
        if (!players.some((p) => p.type === ROYAL)) return 'enemy';
        return enemies.length ? null : 'player';
      }
      return enemies.some((p) => p.type === ROYAL) ? null : 'player';
    }
    case 'rival-kings':
      // Both sides field one King; the first King captured decides (capture, not
      // checkmate — check is unimplemented). One move can only remove one King, so
      // the order of these tests never actually ties.
      if (!enemies.some((p) => p.type === ROYAL)) return 'player';
      if (!players.some((p) => p.type === ROYAL)) return 'enemy';
      return null;
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

/** With no objective zone authored, `reach` defaults to the enemy's back rank. */
function defaultReachCells(board: BoardSize): Vec[] {
  const cells: Vec[] = [];
  for (let x = 0; x < board.cols; x += 1) cells.push({ x, y: 0 });
  return cells;
}

/**
 * The static objective context a level implies — the `survive` clock and the
 * `reach` destination cells. Pure; the live `turnsElapsed` is layered on by the
 * store. `reach` uses the authored objective zone when present, else falls back to
 * breaking through to the enemy's back rank.
 */
export function objectiveContextForLevel(level: Level): ObjectiveContext {
  if (level.objective === 'survive') return { surviveTurns: level.surviveTurns ?? DEFAULT_SURVIVE_TURNS };
  if (level.objective === 'reach') {
    const authored = level.layers.zones
      .filter((zone) => zone.type === 'objective')
      .flatMap((zone) => zone.tiles.map(([x, y]) => ({ x, y })));
    return { reachCells: authored.length ? authored : defaultReachCells(level.board) };
  }
  return {};
}
