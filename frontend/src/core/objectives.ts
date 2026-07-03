// Per-objective win conditions (issue #44 Track 4). Pure + deterministic: maps a
// level's ObjectiveType + a small context into a Winner, replacing the core's
// hard-coded last-side-standing rule for levels that want richer goals. The
// store evaluates this after each resolved turn.

import type { BoardSize, GameState, Piece, Vec, Winner } from './types';
import type { ConditionSide, Level, ObjectiveType, VictoryCondition, VictoryRules } from './level';
import { livingPieces } from './rules';

/** The "royal" piece whose loss ends a capture-king / rival-kings objective. */
const ROYAL: Piece['type'] = 'king';

// Turn target for a `survive` level that doesn't author one: the schema field is
// `level.surviveTurns` (optional, ADR-0050); when absent the battle outlasts this
// many player turns, which keeps every pre-field survive level playing unchanged.
export const DEFAULT_SURVIVE_TURNS = 8;

/**
 * Owner-facing mode names (ADR-0050). THE single source of truth for mode labels —
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
   * which is exactly the pre-ADR-0050 behavior. */
  kingSide?: 'player' | 'enemy';
}

/** Does a single victory condition hold on this settled state? Pure. Recurses into `all`. */
function conditionHolds(state: GameState, cond: VictoryCondition, ctx: ObjectiveContext): boolean {
  switch (cond.kind) {
    case 'eliminate': {
      const alive = livingPieces(state.pieces, cond.side);
      const matching = cond.filter?.type ? alive.filter((p) => p.type === cond.filter!.type) : alive;
      return matching.length === 0;
    }
    case 'reach': {
      const cells = ctx.reachCells ?? [];
      if (!cells.length) return false;
      const onGoal = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
      // Pawn-only (the game's rule). A pawn that reaches a FAR-EDGE reach zone promotes to a
      // queen inside applyMove, so the settled board shows a queen on the goal — but `lastMove`
      // records the PRE-promotion type ('pawn', see rules.ts) and the destination, so the
      // arriving pawn still scores. lastMove is side-checked (an enemy reply never triggers a
      // player reach) and excludes a queen/knight that merely wandered onto the goal.
      const lm = state.lastMove;
      if (lm && lm.side === cond.side && lm.pieceType === 'pawn' && onGoal(lm.to.x, lm.to.y)) return true;
      // A pawn standing on the goal without a fresh promoting move (mid-board zones already
      // won earlier, or a pre-placed test fixture): still a pawn on the settled board.
      return livingPieces(state.pieces, cond.side).some((p) => p.type === 'pawn' && onGoal(p.x, p.y));
    }
    case 'turnLimit':
      return (ctx.turnsElapsed ?? 0) >= cond.turns;
    case 'all':
      return cond.of.length > 0 && cond.of.every((c) => conditionHolds(state, c, ctx));
    default:
      return false;
  }
}

/**
 * Resolve authored win/lose lists to a winner, or `null` while undecided. Pure. Defeat-first
 * (ADR-0054, MTG rule 104.3f): the LOSE list is checked before the WIN list and the first
 * matching condition ends the game — so a settled turn that trips both resolves as a loss (e.g.
 * Survive's clock reaches N on the very turn the last player piece is wiped → 'enemy').
 */
export function evaluateVictory(state: GameState, rules: VictoryRules, ctx: ObjectiveContext = {}): Winner {
  if (rules.lose.some((c) => conditionHolds(state, c, ctx))) return 'enemy';
  if (rules.win.some((c) => conditionHolds(state, c, ctx))) return 'player';
  return null;
}

const eliminate = (side: ConditionSide, type?: Piece['type']): VictoryCondition =>
  ({ kind: 'eliminate', side, ...(type ? { filter: { type } } : {}) });

/**
 * Expand a legacy `objective` preset into the two-list model (ADR-0054) — the ONLY place the 5
 * stored modes are defined in terms of conditions. `evaluateObjective` and the store both route
 * through it, so preset and authored levels share one evaluator. Reproduces the pre-ADR-0054
 * semantics exactly; the only theoretical shift is rival-kings' both-Kings-fall tie, which now
 * resolves defeat-first rather than win-first (unreachable — one move removes only one King).
 */
export function victoryRulesForObjective(objective: ObjectiveType, ctx: ObjectiveContext = {}): VictoryRules {
  switch (objective) {
    case 'capture-all':
      return { win: [eliminate('enemy')], lose: [eliminate('player')] };
    case 'capture-king':
      // Direction-aware: the King-holder loses when its King falls; the kingless side loses only
      // by wipe. ctx.kingSide defaults to 'enemy' (free skirmish / legacy = hunt the enemy King).
      return (ctx.kingSide ?? 'enemy') === 'player'
        ? { win: [eliminate('enemy')], lose: [eliminate('player', ROYAL)] }
        : { win: [eliminate('enemy', ROYAL)], lose: [eliminate('player')] };
    case 'rival-kings':
      return { win: [eliminate('enemy', ROYAL)], lose: [eliminate('player', ROYAL)] };
    case 'survive':
      return { win: [{ kind: 'turnLimit', turns: ctx.surviveTurns ?? 0 }], lose: [eliminate('player')] };
    case 'reach':
      return { win: [{ kind: 'reach', side: 'player' }], lose: [eliminate('player')] };
    default:
      return { win: [eliminate('enemy')], lose: [eliminate('player')] };
  }
}

/**
 * Resolve a level objective to a winner, or `null` while undecided. Pure. Thin wrapper over the
 * two-list model (ADR-0054): expands the preset, then evaluates it defeat-first. Kept as the
 * entry point for every preset (non-authored) game so existing call sites read unchanged.
 */
export function evaluateObjective(state: GameState, objective: ObjectiveType, ctx: ObjectiveContext = {}): Winner {
  return evaluateVictory(state, victoryRulesForObjective(objective, ctx), ctx);
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
