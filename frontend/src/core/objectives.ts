// Per-objective win conditions (issue #44 Track 4). Pure + deterministic: maps a
// level's ObjectiveType + a small context into a Winner, replacing the core's
// hard-coded last-side-standing rule for levels that want richer goals. The
// store evaluates this after each resolved turn.

import type { BoardSize, GameState, Piece, Vec, Winner } from './types';
import type { ConditionSide, Level, ObjectiveType, VictoryAction, VictoryCondition, VictoryRule, VictoryRules } from './level';
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

/** Does a single victory condition hold on this settled state? Pure. */
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
    default:
      return false;
  }
}

/** Player↔enemy — the other side. Used to resolve a `lose` action (side loses ⇒ the other wins). */
const OTHER: Record<ConditionSide, Winner> = { player: 'enemy', enemy: 'player' };

/** The Winner a fired rule declares — from its first win/lose action (`win(side)` ⇒ that side wins,
 * `lose(side)` ⇒ the other side wins). Null when the rule has no win/lose action. Exported for the
 * per-faction save gate (validatePlayability P6). Pure. */
export function ruleOutcome(rule: VictoryRule): Winner {
  const act = rule.do.find((a) => a.kind === 'win' || a.kind === 'lose');
  if (!act) return null;
  return act.kind === 'win' ? act.side : OTHER[act.side];
}

/**
 * Resolve authored event rules to the FIRST rule that decides the game, plus the winner it declares —
 * or `{ winner: null, rule: null }` while undecided. Pure. Rules are checked in ORDER, top-to-bottom
 * (ADR-0064): the first rule whose conditions ALL hold wins. Presets seed lose rules above win rules,
 * so a settled turn that trips both resolves as a loss (defeat-first — e.g. Survive's clock reaches N
 * on the turn the last player piece is wiped). The fired rule is returned so the result screen / log
 * can name the exact condition that ended the battle (its authored `name`) instead of the mode label.
 */
export function resolveVictory(state: GameState, rules: VictoryRules, ctx: ObjectiveContext = {}): { winner: Winner; rule: VictoryRule | null } {
  for (const rule of rules) {
    if (rule.if.every((c) => conditionHolds(state, c, ctx))) {
      const winner = ruleOutcome(rule);
      if (winner) return { winner, rule };
    }
  }
  return { winner: null, rule: null };
}

/** The winner authored event rules declare, or `null` while undecided. Pure. Thin wrapper over
 * `resolveVictory` for the many call sites that only need the outcome, not the rule that caused it. */
export function evaluateVictory(state: GameState, rules: VictoryRules, ctx: ObjectiveContext = {}): Winner {
  return resolveVictory(state, rules, ctx).winner;
}

const eliminate = (side: ConditionSide, type?: Piece['type']): VictoryCondition =>
  ({ kind: 'eliminate', side, ...(type ? { filter: { type } } : {}) });
const act = (kind: VictoryAction['kind'], side: ConditionSide): VictoryAction => ({ kind, side });
// Preset rules are authored from the PLAYER's perspective (win/lose for 'player'); in the 2-player
// game that implies the mirror for the enemy, which is what satisfies the per-faction save gate.
const loseRule = (name: string, ...conds: VictoryCondition[]): VictoryRule => ({ name, if: conds, do: [act('lose', 'player')] });
const winRule = (name: string, ...conds: VictoryCondition[]): VictoryRule => ({ name, if: conds, do: [act('win', 'player')] });

/**
 * Expand a legacy `objective` preset into the if-then rule model (ADR-0064) — the ONLY place the 5
 * stored modes are defined in terms of rules. `evaluateObjective` and the store both route through
 * it, so preset and authored levels share one evaluator. Lose rules are seeded ABOVE win rules so
 * first-match ordering reproduces the pre-ADR-0064 defeat-first semantics exactly (the only
 * theoretical shift is rival-kings' both-Kings-fall tie → loss, unreachable since one move removes
 * only one King).
 */
export function victoryRulesForObjective(objective: ObjectiveType, ctx: ObjectiveContext = {}): VictoryRules {
  switch (objective) {
    case 'capture-all':
      return [loseRule('Your force is wiped out', eliminate('player')), winRule('Enemy is wiped out', eliminate('enemy'))];
    case 'capture-king':
      // Direction-aware: the King-holder loses when its King falls; the kingless side loses only
      // by wipe. ctx.kingSide defaults to 'enemy' (free skirmish / legacy = hunt the enemy King).
      return (ctx.kingSide ?? 'enemy') === 'player'
        ? [loseRule('Your King is captured', eliminate('player', ROYAL)), winRule('Enemy is wiped out', eliminate('enemy'))]
        : [loseRule('Your force is wiped out', eliminate('player')), winRule('Enemy King is captured', eliminate('enemy', ROYAL))];
    case 'rival-kings':
      return [loseRule('Your King is captured', eliminate('player', ROYAL)), winRule('Enemy King is captured', eliminate('enemy', ROYAL))];
    case 'survive':
      return [loseRule('Your force is wiped out', eliminate('player')), winRule('You outlast the assault', { kind: 'turnLimit', turns: ctx.surviveTurns ?? 0 })];
    case 'reach':
      return [loseRule('Your force is wiped out', eliminate('player')), winRule('A pawn reaches the goal', { kind: 'reach', side: 'player' })];
    default:
      return [loseRule('Your force is wiped out', eliminate('player')), winRule('Enemy is wiped out', eliminate('enemy'))];
  }
}

/**
 * Resolve a level objective to a winner, or `null` while undecided. Pure. Thin wrapper over the
 * two-list model (ADR-0064): expands the preset, then evaluates it defeat-first. Kept as the
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
