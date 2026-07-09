// The level / campaign document schema — the durable, serializable format the
// editors write and the game reads. Custom (Tiled/LDtk can't express isometric +
// elevation + gameplay zones); LDtk-inspired structure (defs/instances spirit,
// world/levels model, typed fields). Persisted as a validated JSONB body.

import type { BoardSize, PieceType, PromotionPieceType, Side, TerrainCell, TerrainType, UnitFacing, Vec } from './types';
import { PROMOTION_PIECE_TYPES } from './types';
import type { PlacedProp } from './props';
import { isPlayablePieceType } from './pieces';
import { parseEdgeKey, isOrthogonalPair } from './featureAutotile';

// Terrain vocabulary now lives in the foundational type module so the editor's
// `Level` and the live `GameState` share one definition; re-exported here so
// existing `from './level'` importers are unaffected.
export type { TerrainType, TerrainCell };

export const LEVEL_FORMAT_VERSION = 1;
export const CAMPAIGN_FORMAT_VERSION = 1;

// Structural bounds only. The old 4×4 floor was an arbitrary guardrail with no technical
// basis (ADR-0050); tiny boards (1×2) are legitimate for several modes. What actually makes
// a board saveable is `validatePlayability` (core/playability.ts) — the editor's save gate.
export const BOARD_COLS = { min: 1, max: 48 } as const;
export const BOARD_ROWS = { min: 1, max: 48 } as const;

export type ZoneType = 'region' | 'player-spawn' | 'enemy-spawn' | 'enemy-threat' | 'objective' | 'falling-rock' | 'pawn-promotion';
export const ZONE_TYPES = ['region', 'player-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock', 'pawn-promotion'] as const satisfies readonly ZoneType[];
export type ZoneColor = 'teal' | 'blue' | 'red' | 'gold' | 'violet' | 'slate' | 'amber';
export const ZONE_COLORS = ['teal', 'blue', 'red', 'gold', 'violet', 'slate', 'amber'] as const satisfies readonly ZoneColor[];

// The win-rule MODE ids (ADR-0050). Stored ids stay the legacy objective ids deliberately —
// they exist in the live DB, and `capture-all` ≡ Last Man
// Standing / `capture-king` ≡ King Assault semantically, so a rename would buy nothing but
// a prod data migration. Players only ever see the display names (MODE_NAME in objectives.ts).
export type ObjectiveType = 'capture-all' | 'capture-king' | 'rival-kings' | 'survive' | 'reach';
export const OBJECTIVE_TYPES = ['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach'] as const satisfies readonly ObjectiveType[];

// ---- Victory conditions (ADR-0064) -----------------------------------------------------------
// An ORDERED list of if-then RULES (the RTS-editor trigger model): each rule is `IF <conditions>
// THEN <win|lose>`. Rules are checked top-to-bottom and the FIRST whose conditions all hold decides
// the game — so precedence is rule ORDER (presets seed lose rules above win rules, which gives
// defeat-first). The 5 modes above are PRESETS that expand into rule lists (`victoryRulesForObjective`
// in core/objectives.ts); `Level.victory` overrides them. Phase-ready: a future `then` can move a
// phase and a future condition can gate on it, with no reshape.

/** The side a victory/defeat condition refers to (neutral pieces never own an outcome). The editor
 * surfaces this as a dropdown of the board's factions, each mapping to its side. */
export type ConditionSide = 'player' | 'enemy';

/** Narrows which of a side's pieces a condition counts. Piece TYPE only — there is no per-unit
 * tagging in this game (no "protect this specific unit"). Absent ⇒ all of the side's pieces. */
export interface PieceFilter {
  type?: PieceType;
}

/**
 * One predicate over a settled GameState — the "IF" vocabulary (ADR-0064). Pure + serializable.
 * - `eliminate`: `side` has no living piece matching `filter` ({type:'king'} = royal capture; no
 *   filter = full wipe).
 * - `reach`: a PAWN of `side` reaches the level's objective zone (pawn-only; a pawn that promotes
 *   on arrival still counts — see `evaluateVictory`).
 * - `turnLimit`: player-turns elapsed ≥ `turns`.
 */
export type VictoryCondition =
  | { kind: 'eliminate'; side: ConditionSide; filter?: PieceFilter }
  | { kind: 'reach'; side: ConditionSide }
  | { kind: 'turnLimit'; turns: number };

/** What a fired rule DOES — its "THEN". Today: declare a faction the winner or loser (from that
 * faction's view; in the 2-player game a win for one is a loss for the other). A rule holds an
 * ARRAY of actions, so effects (spawn a force / open a gate / go to a phase) become new action
 * kinds later without reshaping the rule — the extension point that plain win/lose lacked. */
export type VictoryActionKind = 'win' | 'lose';
export interface VictoryAction {
  kind: VictoryActionKind;
  side: ConditionSide;
}

/** One event: `IF <conditions> THEN <do actions>`. The `if` conditions are ANDed — ALL must hold
 * (an empty `if` always fires); order matters ACROSS rules (see VictoryRules). A future `when`
 * trigger ("each turn" today) is the reserved Event half for on-capture / on-turn-N. */
export interface VictoryRule {
  /** Stable editor identity. Optional for back-compat / hand-authored bodies. */
  id?: string;
  /** Author-facing name, shown in the editor's rule list and unique within a level. Optional for
   * back-compat / hand-authored bodies; the editor always assigns one. */
  name?: string;
  if: VictoryCondition[];
  do: VictoryAction[];
}

/**
 * A level's authored win/lose logic (ADR-0064): an ORDERED list of if-then rules, evaluated once
 * per settled turn top-to-bottom — the FIRST rule whose conditions all hold decides the game.
 * Absent on a Level ⇒ derived from the `objective` preset (`victoryRulesForObjective`), the same
 * opt-in back-compat pattern as the other rules fields. When present it OVERRIDES the preset (the
 * `objective` field still supplies the mode label + outcome copy).
 */
export type VictoryRules = VictoryRule[];

/** Piece counts per side for random placement — playable piece types only (no rocks). */
export type Roster = Partial<Record<PieceType, number>>;

export type LevelEventTrigger =
  | { kind: 'setup' }
  | {
      kind: 'unit-enters-zone';
      unit: { type: 'pawn'; side?: ConditionSide };
      zoneId: string;
    };

export interface SpawnEventAction {
  kind: 'spawn';
  side: ConditionSide;
  roster: Roster;
  /** One or more dumb zone ids whose tiles form the random placement pool. */
  zoneIds: string[];
}

export interface PromoteEventAction {
  kind: 'promote';
  target: { kind: 'triggering-unit' };
}

/**
 * One authored castling option (ADR-0072): a king-rook pair with explicit squares —
 * the game grants the castle while the side's king and a rook sit UNMOVED on `king` /
 * `rook`, landing them on `kingTo` / `rookTo` under chess castling legality
 * (core/rules.ts). Squares are explicit (not derived from geometry at play time) so
 * castling works on any authored board; the editor's Castling template computes the
 * chess-standard squares from the painted pieces. Rides a setup trigger: the option is
 * installed once at build (resolved into GameState.castleRules, like promotion rules).
 */
export interface CastleEventAction {
  kind: 'castle';
  side: ConditionSide;
  king: Vec;
  rook: Vec;
  kingTo: Vec;
  rookTo: Vec;
}

/**
 * Enables chess draw rules for the level (ADR-0072): the 50-move rule and/or threefold
 * repetition, enforced identically in live play, netplay, AI search, and self-play.
 * Absent flags read as off. Rides a setup trigger like `castle`.
 */
export interface ChessDrawsEventAction {
  kind: 'chess-draws';
  fiftyMove?: boolean;
  threefold?: boolean;
}

export type LevelEventAction = SpawnEventAction | PromoteEventAction | CastleEventAction | ChessDrawsEventAction;

/**
 * Generic authored level events: WHEN <trigger> THEN <do actions>. Zones stay dumb tile groups;
 * the action says what happens and the target says what object is affected.
 */
export interface LevelEvent {
  /** Stable editor identity. Optional for back-compat / hand-authored bodies. */
  id?: string;
  /** Author-facing name shown in the editor. */
  name?: string;
  trigger: LevelEventTrigger;
  do: LevelEventAction[];
}

export type LevelEvents = LevelEvent[];

/** @deprecated Legacy pre-trigger/action spawn event shape. Normalized by core/levelEvents.ts. */
export interface SpawnEvent {
  kind: 'spawn';
  /** Stable editor identity. Optional for back-compat / hand-authored bodies. */
  id?: string;
  /** Author-facing name shown in the editor. */
  name?: string;
  trigger: { kind: 'setup' };
  side: ConditionSide;
  roster: Roster;
  /** One or more dumb zone ids whose tiles form the random placement pool. */
  zoneIds: string[];
}

/** @deprecated Legacy pre-trigger/action pawn-promotion event shape. Normalized by core/levelEvents.ts. */
export interface PawnPromotionEvent {
  kind: 'pawn-promotion';
  /** Stable editor identity. Optional for back-compat / hand-authored bodies. */
  id?: string;
  /** Author-facing name shown in the editor. */
  name?: string;
  trigger: {
    kind: 'unit-enters-zone';
    unit: { type: 'pawn'; side?: ConditionSide };
    zoneId: string;
  };
  choices?: PromotionPieceType[];
  defaultPromotion?: PromotionPieceType;
}

/** The battle clock's authored time control — a standard chess clock for the PLAYER only
 * (the enemy is untimed): a starting bank plus a Fischer increment banked after every
 * completed player move. Whole seconds; the game converts to ms at clock start. */
export interface TimeControl {
  initialSeconds: number;
  incrementSeconds: number;
}

export interface Decal {
  x: number;
  y: number;
  type: string;
}

export interface Zone {
  id: string;
  /** Author-facing label. Gameplay behavior lives in events/rules, not in this name. */
  name?: string;
  /** Cosmetic editor/playtest tint only. Events/rules own all behavior. */
  color?: ZoneColor;
  type: ZoneType;
  tiles: Array<[number, number]>;
}

export interface LevelUnit {
  x: number;
  y: number;
  type: PieceType;
  side: Side;
  // The 8-direction sprite facing painted in the editor. Optional + back-compat: the
  // game falls back to the side's default facing when absent (see game/setup.ts).
  facing?: UnitFacing;
}

export interface LevelEconomy {
  startingFunds: number;
  incomePerTurn: number;
}

export interface Level {
  formatVersion: number;
  id: string;
  name: string;
  notes: string;
  board: BoardSize & { heightLevels: number };
  objective: ObjectiveType;
  difficulty: string;
  economy: LevelEconomy;
  theme: string;
  // The Level Editor's compact, lossless board encoding (see ui/boardCode.ts). Optional +
  // back-compat: the validator ignores unknown fields, so older bodies stay valid; when
  // present it is the source of truth for re-seeding the editor (round-trips doodads,
  // cover, roads/rivers and unit facing that `layers` alone can't fully express).
  boardCode?: string;
  // Legacy ADR-0050 placement axis. Absent ⇒ 'fixed' (authored `layers.units` positions).
  // 'random' is still read for old levels and editor convenience, but new behavior is authored
  // through setup spawn events in `events` so zones can stay dumb named tile groups.
  placement?: 'fixed' | 'random';
  // Legacy/random-placement force definition, mirrored by setup spawn events on new saves.
  // Only meaningful when placement === 'random' or when converted to explicit spawn events.
  roster?: { player: Roster; enemy: Roster };
  // `survive` mode's authored turn target (player-turns to outlast). Absent ⇒
  // DEFAULT_SURVIVE_TURNS (core/objectives.ts) so every existing survive level keeps
  // playing exactly as before.
  surviveTurns?: number;
  // The battle clock (see TimeControl). Absent ⇒ untimed — the back-compat default, same
  // optional-field pattern as placement/roster/surviveTurns.
  timeControl?: TimeControl;
  // Authored victory conditions (ADR-0064). Absent ⇒ the `objective` preset defines win/lose
  // (see victoryRulesForObjective); when present it OVERRIDES the preset — the two-list model
  // that lets one level combine several win and several lose conditions. Optional + back-compat
  // like the other rules fields; `objective` stays required (mode label + fallback outcome copy).
  victory?: VictoryRules;
  // Authored non-victory events. Zones are dumb named tile groups; these events say what happens
  // when setup or a unit interaction refers to one of those zone ids. Legacy placement/roster and
  // pawn-promotion zone labels are still read as compatibility inputs (see core/levelEvents.ts).
  events?: LevelEvents;
  layers: {
    terrain: TerrainCell[];
    decals: Decal[];
    zones: Zone[];
    units: LevelUnit[];
    // Multi-cell decorative props (trees/houses). Optional + back-compat: legacy bodies omit
    // it (validator only checks it WHEN PRESENT, never adds it to the required-array loop), and
    // a prop-free editor save leaves it `[]`. This is the durable channel the GAME reads
    // (createFromLevel reads `layers`, not `boardCode`); boardCode carries a parallel 'p' map
    // only to re-seed the editor losslessly.
    props?: PlacedProp[];
    // Edge fences: walls on an orthogonal tile edge, as canonical edge keys (roadEdgeKey
    // "x,y|x,y"). Boundary rails use one off-board endpoint. Optional + back-compat like `props`.
    // This is the durable GAMEPLAY channel (createFromLevel → GameState.fences → movement
    // blocking); boardCode carries a parallel `fe` map (edge → material) for editor rendering.
    fences?: string[];
  };
}

export interface CampaignLevelRef {
  levelId: string;
  ordinal: number;
  objective?: ObjectiveType;
  completed?: boolean;
}

export interface Campaign {
  formatVersion: number;
  id: string;
  name: string;
  difficulty: string;
  chapters: number;
  favorite?: boolean;
  locked?: boolean;
  unlockRequirement?: string;
  levels: CampaignLevelRef[];
  // Tier tag, set at hydrate time and STRIPPED before the per-user Save PUT (so the
  // persisted body stays identical to today). 'official' = global game content;
  // 'mine' = the signed-in user's own campaign. Absent ⇒ treated as 'mine'.
  origin?: 'official' | 'mine';
  // Official campaigns render read-only in the editor (set alongside origin).
  readOnly?: boolean;
}

export function createBlankLevel(id: string, name = 'Untitled', cols = 12, rows = 8): Level {
  const terrain: TerrainCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) terrain.push({ x, y, terrain: 'grass', elevation: 0 });
  }
  return {
    formatVersion: LEVEL_FORMAT_VERSION,
    id,
    name,
    notes: '',
    board: { cols, rows, heightLevels: 1 },
    objective: 'capture-all',
    difficulty: 'normal',
    economy: { startingFunds: 1200, incomePerTurn: 150 },
    theme: 'grassland',
    layers: { terrain, decals: [], zones: [], units: [], props: [], fences: [] },
  };
}

export type ValidateResult = { ok: true; level: Level } | { ok: false; errors: string[] };

const CONDITION_KINDS = ['eliminate', 'reach', 'turnLimit'] as const;
const LEGACY_EVENT_KINDS = ['spawn', 'pawn-promotion'] as const;
const LEVEL_EVENT_TRIGGER_KINDS = ['setup', 'unit-enters-zone'] as const;
const LEVEL_EVENT_ACTION_KINDS = ['spawn', 'promote', 'castle', 'chess-draws'] as const;

/** Structural errors for a single victory condition (ADR-0064). Shape/enum checks only. */
function conditionErrors(c: unknown, path: string): string[] {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${path} must be a condition object`];
  const cond = c as { kind?: unknown };
  if (typeof cond.kind !== 'string' || !(CONDITION_KINDS as readonly string[]).includes(cond.kind)) {
    return [`${path}.kind must be one of: ${CONDITION_KINDS.join(', ')}`];
  }
  const errs: string[] = [];
  switch (cond.kind) {
    case 'eliminate': {
      const e = cond as { side?: unknown; filter?: unknown };
      if (e.side !== 'player' && e.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
      if (e.filter !== undefined) {
        if (!e.filter || typeof e.filter !== 'object' || Array.isArray(e.filter)) {
          errs.push(`${path}.filter must be an object`);
        } else {
          const t = (e.filter as { type?: unknown }).type;
          if (t !== undefined && !isPlayablePieceType(t as PieceType)) errs.push(`${path}.filter.type is not a playable piece type`);
        }
      }
      break;
    }
    case 'reach': {
      const r = cond as { side?: unknown };
      if (r.side !== 'player' && r.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
      break;
    }
    case 'turnLimit': {
      const t = cond as { turns?: unknown };
      if (!Number.isInteger(t.turns) || (t.turns as number) < 1) errs.push(`${path}.turns must be a positive integer`);
      break;
    }
  }
  return errs;
}

/** Structural errors for one `do` action (ADR-0064): a win/lose declaration for a side. */
function actionErrors(a: unknown, path: string): string[] {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return [`${path} must be an action object`];
  const act = a as { kind?: unknown; side?: unknown };
  const errs: string[] = [];
  if (act.kind !== 'win' && act.kind !== 'lose') errs.push(`${path}.kind must be 'win' or 'lose'`);
  if (act.side !== 'player' && act.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
  return errs;
}

/** Structural errors for an authored `Level.victory` (ADR-0064) — an ORDERED array of `{ if, do }`
 * event rules. An empty list is legal SHAPE (validatePlayability P6 rejects a set that leaves a
 * faction unable to win/lose); this only checks each rule has conditions + actions arrays and every
 * condition / action is well-formed. */
function victoryRuleErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return ['victory must be an array of if-then rules'];
  const errs: string[] = [];
  value.forEach((r, i) => {
    const path = `victory[${i}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push(`${path} must be a rule object`); return; }
    const rule = r as { id?: unknown; name?: unknown; if?: unknown; do?: unknown };
    if (rule.id !== undefined && typeof rule.id !== 'string') errs.push(`${path}.id must be a string`);
    if (rule.name !== undefined && typeof rule.name !== 'string') errs.push(`${path}.name must be a string`);
    if (!Array.isArray(rule.if)) errs.push(`${path}.if must be an array of conditions`);
    else rule.if.forEach((c, j) => errs.push(...conditionErrors(c, `${path}.if[${j}]`)));
    if (!Array.isArray(rule.do)) errs.push(`${path}.do must be an array of actions`);
    else rule.do.forEach((a, j) => errs.push(...actionErrors(a, `${path}.do[${j}]`)));
  });
  return errs;
}

function rosterCountsErrors(value: unknown, path: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path} must be an object of piece counts`];
  const errs: string[] = [];
  for (const [type, count] of Object.entries(value)) {
    if (!isPlayablePieceType(type as PieceType)) {
      errs.push(`${path} has a non-playable piece type "${type}"`);
      break;
    }
    if (!Number.isInteger(count) || (count as number) < 1) {
      errs.push(`${path}.${type} must be a positive integer`);
      break;
    }
  }
  return errs;
}

function legacyEventErrors(ev: Record<string, unknown>, path: string): string[] {
  const event = ev as { kind?: unknown; id?: unknown; name?: unknown; trigger?: unknown };
  if (typeof event.kind !== 'string' || !(LEGACY_EVENT_KINDS as readonly string[]).includes(event.kind)) {
    return [`${path}.kind must be one of: ${LEGACY_EVENT_KINDS.join(', ')}, or omit kind and use trigger/do`];
  }
  const errs: string[] = [];
  if (event.id !== undefined && typeof event.id !== 'string') errs.push(`${path}.id must be a string`);
  if (event.name !== undefined && typeof event.name !== 'string') errs.push(`${path}.name must be a string`);
  if (!event.trigger || typeof event.trigger !== 'object' || Array.isArray(event.trigger)) {
    errs.push(`${path}.trigger must be an object`);
    return errs;
  }
  if (event.kind === 'spawn') {
    const spawn = ev as { side?: unknown; roster?: unknown; zoneIds?: unknown; trigger?: { kind?: unknown } };
    if (spawn.trigger?.kind !== 'setup') errs.push(`${path}.trigger.kind must be 'setup'`);
    if (spawn.side !== 'player' && spawn.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
    errs.push(...rosterCountsErrors(spawn.roster, `${path}.roster`));
    if (!Array.isArray(spawn.zoneIds) || spawn.zoneIds.length === 0 || spawn.zoneIds.some((id) => typeof id !== 'string' || !id.trim())) {
      errs.push(`${path}.zoneIds must be a non-empty array of zone ids`);
    }
  } else {
    const promo = ev as { trigger?: { kind?: unknown; unit?: unknown; zoneId?: unknown }; choices?: unknown; defaultPromotion?: unknown };
    if (promo.trigger?.kind !== 'unit-enters-zone') errs.push(`${path}.trigger.kind must be 'unit-enters-zone'`);
    if (typeof promo.trigger?.zoneId !== 'string' || !promo.trigger.zoneId.trim()) errs.push(`${path}.trigger.zoneId must be a zone id`);
    const unit = promo.trigger?.unit;
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
      errs.push(`${path}.trigger.unit must be an object`);
    } else {
      const u = unit as { type?: unknown; side?: unknown };
      if (u.type !== 'pawn') errs.push(`${path}.trigger.unit.type must be 'pawn'`);
      if (u.side !== undefined && u.side !== 'player' && u.side !== 'enemy') errs.push(`${path}.trigger.unit.side must be 'player' or 'enemy'`);
    }
    if (promo.choices !== undefined) {
      if (!Array.isArray(promo.choices) || promo.choices.length === 0 || promo.choices.some((choice) => !(PROMOTION_PIECE_TYPES as readonly unknown[]).includes(choice))) {
        errs.push(`${path}.choices must be a non-empty list of promotion piece types`);
      }
    }
    if (promo.defaultPromotion !== undefined && !(PROMOTION_PIECE_TYPES as readonly unknown[]).includes(promo.defaultPromotion)) {
      errs.push(`${path}.defaultPromotion must be a promotion piece type`);
    }
    if (promo.defaultPromotion !== undefined && Array.isArray(promo.choices) && !promo.choices.includes(promo.defaultPromotion)) {
      errs.push(`${path}.defaultPromotion must be included in choices`);
    }
  }
  return errs;
}

function levelEventTriggerErrors(trigger: unknown, path: string): string[] {
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) return [`${path} must be a trigger object`];
  const t = trigger as { kind?: unknown; unit?: unknown; zoneId?: unknown };
  if (typeof t.kind !== 'string' || !(LEVEL_EVENT_TRIGGER_KINDS as readonly string[]).includes(t.kind)) {
    return [`${path}.kind must be one of: ${LEVEL_EVENT_TRIGGER_KINDS.join(', ')}`];
  }
  const errs: string[] = [];
  if (t.kind === 'unit-enters-zone') {
    if (typeof t.zoneId !== 'string' || !t.zoneId.trim()) errs.push(`${path}.zoneId must be a zone id`);
    if (!t.unit || typeof t.unit !== 'object' || Array.isArray(t.unit)) {
      errs.push(`${path}.unit must be an object`);
    } else {
      const unit = t.unit as { type?: unknown; side?: unknown };
      if (unit.type !== 'pawn') errs.push(`${path}.unit.type must be 'pawn'`);
      if (unit.side !== undefined && unit.side !== 'player' && unit.side !== 'enemy') errs.push(`${path}.unit.side must be 'player' or 'enemy'`);
    }
  }
  return errs;
}

/** A castle square field must be an {x, y} integer cell, on the board when its size is known. */
function castleSquareErrors(value: unknown, path: string, board?: BoardSize): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path} must be an {x, y} square`];
  const cell = value as { x?: unknown; y?: unknown };
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return [`${path} must have integer x and y`];
  if (board && ((cell.x as number) < 0 || (cell.x as number) >= board.cols || (cell.y as number) < 0 || (cell.y as number) >= board.rows)) {
    return [`${path} is out of bounds at (${cell.x}, ${cell.y})`];
  }
  return [];
}

function levelEventActionErrors(action: unknown, trigger: unknown, path: string, board?: BoardSize): string[] {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return [`${path} must be an action object`];
  const a = action as { kind?: unknown; side?: unknown; roster?: unknown; zoneIds?: unknown; target?: unknown };
  if (typeof a.kind !== 'string' || !(LEVEL_EVENT_ACTION_KINDS as readonly string[]).includes(a.kind)) {
    return [`${path}.kind must be one of: ${LEVEL_EVENT_ACTION_KINDS.join(', ')}`];
  }
  const triggerKind = trigger && typeof trigger === 'object' && !Array.isArray(trigger) ? (trigger as { kind?: unknown }).kind : undefined;
  const errs: string[] = [];
  if (a.kind === 'spawn') {
    if (triggerKind !== 'setup') errs.push(`${path}.kind 'spawn' requires a setup trigger`);
    if (a.side !== 'player' && a.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
    errs.push(...rosterCountsErrors(a.roster, `${path}.roster`));
    if (!Array.isArray(a.zoneIds) || a.zoneIds.length === 0 || a.zoneIds.some((id) => typeof id !== 'string' || !id.trim())) {
      errs.push(`${path}.zoneIds must be a non-empty array of zone ids`);
    }
  } else if (a.kind === 'castle') {
    if (triggerKind !== 'setup') errs.push(`${path}.kind 'castle' requires a setup trigger`);
    if (a.side !== 'player' && a.side !== 'enemy') errs.push(`${path}.side must be 'player' or 'enemy'`);
    const c = action as { king?: unknown; rook?: unknown; kingTo?: unknown; rookTo?: unknown };
    const squareErrs = [
      ...castleSquareErrors(c.king, `${path}.king`, board),
      ...castleSquareErrors(c.rook, `${path}.rook`, board),
      ...castleSquareErrors(c.kingTo, `${path}.kingTo`, board),
      ...castleSquareErrors(c.rookTo, `${path}.rookTo`, board),
    ];
    errs.push(...squareErrs);
    if (!squareErrs.length) {
      // The engine walks straight sign-step lines, so all four squares must share the
      // king's rank or file, and the king must actually move somewhere else.
      const king = c.king as Vec; const rook = c.rook as Vec; const kingTo = c.kingTo as Vec; const rookTo = c.rookTo as Vec;
      const sameRow = rook.y === king.y && kingTo.y === king.y && rookTo.y === king.y;
      const sameCol = rook.x === king.x && kingTo.x === king.x && rookTo.x === king.x;
      if (king.x === rook.x && king.y === rook.y) errs.push(`${path} king and rook must be different squares`);
      else if (!sameRow && !sameCol) errs.push(`${path} castle squares must share one rank or file`);
      if (kingTo.x === king.x && kingTo.y === king.y) errs.push(`${path}.kingTo must differ from the king's square`);
      if (kingTo.x === rookTo.x && kingTo.y === rookTo.y) errs.push(`${path}.kingTo and rookTo must be different squares (two pieces cannot land on one square)`);
    }
  } else if (a.kind === 'chess-draws') {
    if (triggerKind !== 'setup') errs.push(`${path}.kind 'chess-draws' requires a setup trigger`);
    const d = action as { fiftyMove?: unknown; threefold?: unknown };
    if (d.fiftyMove !== undefined && typeof d.fiftyMove !== 'boolean') errs.push(`${path}.fiftyMove must be a boolean`);
    if (d.threefold !== undefined && typeof d.threefold !== 'boolean') errs.push(`${path}.threefold must be a boolean`);
  } else {
    if (triggerKind !== 'unit-enters-zone') errs.push(`${path}.kind 'promote' requires a unit-enters-zone trigger`);
    if (!a.target || typeof a.target !== 'object' || Array.isArray(a.target) || (a.target as { kind?: unknown }).kind !== 'triggering-unit') {
      errs.push(`${path}.target.kind must be 'triggering-unit'`);
    }
  }
  return errs;
}

function eventErrors(value: unknown, board?: BoardSize): string[] {
  if (!Array.isArray(value)) return ['events must be an array'];
  const errs: string[] = [];
  value.forEach((ev, i) => {
    const path = `events[${i}]`;
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) { errs.push(`${path} must be an event object`); return; }
    const event = ev as { kind?: unknown; id?: unknown; name?: unknown; trigger?: unknown; do?: unknown };
    if (event.kind !== undefined) { errs.push(...legacyEventErrors(ev as Record<string, unknown>, path)); return; }
    if (event.id !== undefined && typeof event.id !== 'string') errs.push(`${path}.id must be a string`);
    if (event.name !== undefined && typeof event.name !== 'string') errs.push(`${path}.name must be a string`);
    errs.push(...levelEventTriggerErrors(event.trigger, `${path}.trigger`));
    if (!Array.isArray(event.do) || event.do.length === 0) errs.push(`${path}.do must be a non-empty array of actions`);
    else event.do.forEach((action, j) => errs.push(...levelEventActionErrors(action, event.trigger, `${path}.do[${j}]`, board)));
  });
  return errs;
}

/** Structural validation at the trust boundary (editor save / DB read). */
export function validateLevel(value: unknown): ValidateResult {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['level is not an object'] };
  const v = value as Partial<Level>;

  if (v.formatVersion !== LEVEL_FORMAT_VERSION) errors.push(`formatVersion must be ${LEVEL_FORMAT_VERSION}`);
  if (typeof v.id !== 'string' || !v.id) errors.push('id is required');
  if (typeof v.name !== 'string') errors.push('name is required');
  if (v.notes !== undefined && typeof v.notes !== 'string') errors.push('notes must be a string');

  const b = v.board;
  if (!b || typeof b.cols !== 'number' || typeof b.rows !== 'number') {
    errors.push('board.cols and board.rows are required');
  } else {
    if (b.cols < BOARD_COLS.min || b.cols > BOARD_COLS.max) errors.push(`board.cols out of range (${BOARD_COLS.min}-${BOARD_COLS.max})`);
    if (b.rows < BOARD_ROWS.min || b.rows > BOARD_ROWS.max) errors.push(`board.rows out of range (${BOARD_ROWS.min}-${BOARD_ROWS.max})`);
  }

  // The objective is the game's win-rule mode; an unknown id would fall through
  // evaluateObjective's default case and silently play as capture-all, so reject it here.
  if (!(OBJECTIVE_TYPES as readonly unknown[]).includes(v.objective)) {
    errors.push(`objective must be one of: ${OBJECTIVE_TYPES.join(', ')}`);
  }

  // ADR-0050 optional fields — validated only WHEN PRESENT (back-compat: legacy bodies
  // omit all three and stay valid). These are STRUCTURAL checks (shape/enum/range); the
  // gameplay rules (roster vs zone capacity etc.) live in validatePlayability.
  if (v.placement !== undefined && v.placement !== 'fixed' && v.placement !== 'random') {
    errors.push("placement must be 'fixed' or 'random'");
  }
  if (v.surviveTurns !== undefined && (!Number.isInteger(v.surviveTurns) || v.surviveTurns < 1)) {
    errors.push('surviveTurns must be a positive integer');
  }
  if (v.timeControl !== undefined) {
    const tc = v.timeControl as Partial<TimeControl> | null;
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)
      || !Number.isInteger(tc.initialSeconds) || (tc.initialSeconds as number) < 1
      || !Number.isInteger(tc.incrementSeconds) || (tc.incrementSeconds as number) < 0) {
      errors.push('timeControl needs an integer initialSeconds of at least 1 and a non-negative integer incrementSeconds');
    }
  }
  if (v.victory !== undefined) errors.push(...victoryRuleErrors(v.victory));
  if (v.events !== undefined) errors.push(...eventErrors(v.events, b && typeof b.cols === 'number' && typeof b.rows === 'number' ? b : undefined));
  if (v.roster !== undefined) {
    if (!v.roster || typeof v.roster !== 'object' || Array.isArray(v.roster)) {
      errors.push('roster must be an object with player and enemy piece counts');
    } else {
      for (const side of ['player', 'enemy'] as const) {
        const counts = (v.roster as Record<string, unknown>)[side];
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
          errors.push(`roster.${side} must be an object of piece counts`);
          continue;
        }
        errors.push(...rosterCountsErrors(counts, `roster.${side}`));
      }
    }
  }

  const layers = v.layers;
  if (!layers || typeof layers !== 'object') {
    errors.push('layers is required');
  } else {
    for (const key of ['terrain', 'decals', 'zones', 'units'] as const) {
      if (!Array.isArray(layers[key])) errors.push(`layers.${key} must be an array`);
    }
    if (b && Array.isArray(layers.units)) {
      for (const u of layers.units) {
        if (u.x < 0 || u.x >= b.cols || u.y < 0 || u.y >= b.rows) {
          errors.push(`unit out of bounds at (${u.x}, ${u.y})`);
          break;
        }
      }
    }
    // Zones now have real consumers (random placement pools + reach targets read the tiles
    // directly), so their shape AND tile bounds are checked — an off-board spawn tile would
    // otherwise deal a piece off the board. Historically only "is an array" was verified
    // (zones were always saved as []).
    if (Array.isArray(layers.zones)) {
      for (const z of layers.zones) {
        if (!z || typeof z !== 'object' || typeof z.id !== 'string' || !(ZONE_TYPES as readonly unknown[]).includes(z.type) || !Array.isArray(z.tiles)) {
          errors.push('malformed zone entry (need a string id, a known type and a tiles array)');
          break;
        }
        if ((z as { name?: unknown }).name !== undefined && typeof (z as { name?: unknown }).name !== 'string') {
          errors.push(`zone "${z.id}" name must be a string`);
          break;
        }
        if ((z as { color?: unknown }).color !== undefined && !(ZONE_COLORS as readonly unknown[]).includes((z as { color?: unknown }).color)) {
          errors.push(`zone "${z.id}" color must be one of: ${ZONE_COLORS.join(', ')}`);
          break;
        }
        const badTile = z.tiles.find((t) => !Array.isArray(t) || t.length !== 2 || !Number.isInteger(t[0]) || !Number.isInteger(t[1]));
        if (badTile) {
          errors.push(`zone "${z.id}" has a malformed tile (tiles are [x, y] integer pairs)`);
          break;
        }
        if (b) {
          const oob = z.tiles.find(([x, y]) => x < 0 || x >= b.cols || y < 0 || y >= b.rows);
          if (oob) {
            errors.push(`zone "${z.id}" tile out of bounds at (${oob[0]}, ${oob[1]})`);
            break;
          }
        }
      }
    }
    // Props are an OPTIONAL layer (back-compat: legacy bodies omit it, so it is NOT in the
    // required-array loop above). Validate its shape only when present.
    if (layers.props !== undefined) {
      if (!Array.isArray(layers.props)) {
        errors.push('layers.props must be an array');
      } else {
        for (const p of layers.props) {
          if (!p || typeof p !== 'object' || typeof p.propId !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') {
            errors.push('malformed prop entry (need numeric x,y and string propId)');
            break;
          }
          // Bounds-check the anchor symmetrically with units: an off-board anchor would otherwise
          // stamp off-board rock colliders in createFromLevel (propCells does not clamp).
          if (b && (p.x < 0 || p.x >= b.cols || p.y < 0 || p.y >= b.rows)) {
            errors.push(`prop out of bounds at (${p.x}, ${p.y})`);
            break;
          }
        }
      }
    }
    // Fences are an OPTIONAL layer (back-compat like props). Each entry is a canonical edge key
    // "x,y|x,y" for an orthogonal edge. Interior fences block movement; boundary fences use one
    // off-board endpoint and are visual rails on the level edge.
    if (layers.fences !== undefined) {
      if (!Array.isArray(layers.fences)) {
        errors.push('layers.fences must be an array');
      } else {
        for (const edge of layers.fences) {
          const cells = typeof edge === 'string' ? parseEdgeKey(edge) : null;
          if (!cells || !isOrthogonalPair(cells.ax, cells.ay, cells.bx, cells.by)) {
            errors.push('malformed fence edge (need "x,y|x,y" between two orthogonally-adjacent cells)');
            break;
          }
          if (b && ![[cells.ax, cells.ay], [cells.bx, cells.by]].some(([x, y]) => x >= 0 && x < b.cols && y >= 0 && y < b.rows)) {
            errors.push(`fence edge "${edge}" does not touch the board`);
            break;
          }
        }
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, level: value as Level };
}
