// The level / campaign document schema — the durable, serializable format the
// editors write and the game reads. Custom (Tiled/LDtk can't express isometric +
// elevation + gameplay zones); LDtk-inspired structure (defs/instances spirit,
// world/levels model, typed fields). Persisted as a validated JSONB body.

import type { BoardSize, PieceType, Side, TerrainCell, TerrainType, UnitFacing } from './types';
import type { PlacedProp } from './props';
import { isPlayablePieceType } from './pieces';

// Terrain vocabulary now lives in the foundational type module so the editor's
// `Level` and the live `GameState` share one definition; re-exported here so
// existing `from './level'` importers are unaffected.
export type { TerrainType, TerrainCell };

export const LEVEL_FORMAT_VERSION = 1;
export const CAMPAIGN_FORMAT_VERSION = 1;

// Structural bounds only. The old 4×4 floor was an arbitrary guardrail with no technical
// basis (ADR-0050); tiny boards (1×2) are legitimate for several modes. What actually makes
// a board saveable is `validatePlayability` (core/playability.ts) — the editor's save gate.
export const BOARD_COLS = { min: 1, max: 16 } as const;
export const BOARD_ROWS = { min: 1, max: 20 } as const;

export type ZoneType = 'player-spawn' | 'enemy-spawn' | 'enemy-threat' | 'objective' | 'falling-rock';
export const ZONE_TYPES = ['player-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock'] as const satisfies readonly ZoneType[];

// The win-rule MODE ids (ADR-0050). Stored ids stay the legacy objective ids deliberately —
// they exist in the live DB and the baked official.json, and `capture-all` ≡ Last Man
// Standing / `capture-king` ≡ King Assault semantically, so a rename would buy nothing but
// a prod data migration. Players only ever see the display names (MODE_NAME in objectives.ts).
export type ObjectiveType = 'capture-all' | 'capture-king' | 'rival-kings' | 'survive' | 'reach';
export const OBJECTIVE_TYPES = ['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach'] as const satisfies readonly ObjectiveType[];

// ---- Victory conditions (ADR-0055) -----------------------------------------------------------
// The two-list model that generalises the single `objective` enum: a level can win by ANY of
// several conditions and lose by ANY of several others, evaluated once per settled turn with the
// LOSE list checked first (defeat-first). The 5 modes above become PRESETS that expand into these
// lists (see `victoryRulesForObjective` in core/objectives.ts); `Level.victory` overrides them.

/** The side a victory/defeat condition refers to (neutral pieces never own an outcome). */
export type ConditionSide = 'player' | 'enemy';

/** Narrows which of a side's pieces a condition counts. Piece TYPE only — there is no per-unit
 * tagging in this game (no "protect this specific unit"). Absent ⇒ all of the side's pieces. */
export interface PieceFilter {
  type?: PieceType;
}

/**
 * One win/lose predicate over a settled GameState (ADR-0055). Pure + serializable.
 * - `eliminate`: `side` has no living piece matching `filter` — filter `{type:'king'}` is a
 *   royal capture, an absent filter is a full wipe.
 * - `reach`: a PAWN of `side` reaches the level's objective zone (pawn-only by game rule; a pawn
 *   that promotes on arrival still counts — see `evaluateVictory`).
 * - `turnLimit`: player-turns elapsed ≥ `turns`. In the WIN list this reads "outlast N turns"; in
 *   the LOSE list it is a deadline. The condition is perspective-free — the LIST assigns valence.
 * - `all`: every sub-condition holds (AND). Top-level win/lose lists are OR; `all` is the single
 *   nesting level for compound goals ("reach the zone AND survive N turns").
 */
export type VictoryCondition =
  | { kind: 'eliminate'; side: ConditionSide; filter?: PieceFilter }
  | { kind: 'reach'; side: ConditionSide }
  | { kind: 'turnLimit'; turns: number }
  | { kind: 'all'; of: VictoryCondition[] };

/**
 * A level's authored win/lose logic (ADR-0055). The player WINS the instant any `win` condition
 * holds and LOSES the instant any `lose` condition holds, checked lose-list-first (defeat-first,
 * MTG rule 104.3f). Absent on a Level ⇒ derived from the `objective` preset — the same opt-in
 * back-compat pattern as placement/roster/surviveTurns/timeControl, so every legacy body is
 * unchanged. When present it OVERRIDES the preset (the `objective` field still supplies the mode
 * label and outcome copy).
 */
export interface VictoryRules {
  win: VictoryCondition[];
  lose: VictoryCondition[];
}

/** Piece counts per side for random placement — playable piece types only (no rocks). */
export type Roster = Partial<Record<PieceType, number>>;

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
  // The ADR-0050 placement axis — an orthogonal toggle on any mode. Absent ⇒ 'fixed'
  // (authored `layers.units` positions, today's behavior), same back-compat pattern as
  // `boardCode`. 'random' means `layers.units` is EMPTY and the game instead deals
  // `roster` onto seeded-random free cells of the pooled player-spawn / enemy-spawn zone
  // tiles at game start (see game/setup.ts). Restart reshuffles — that's the point.
  placement?: 'fixed' | 'random';
  // Random placement's force definition: how many of each playable piece type each side
  // fields. Only meaningful when placement === 'random'.
  roster?: { player: Roster; enemy: Roster };
  // `survive` mode's authored turn target (player-turns to outlast). Absent ⇒
  // DEFAULT_SURVIVE_TURNS (core/objectives.ts) so every existing survive level keeps
  // playing exactly as before.
  surviveTurns?: number;
  // The battle clock (see TimeControl). Absent ⇒ untimed — the back-compat default, same
  // optional-field pattern as placement/roster/surviveTurns.
  timeControl?: TimeControl;
  // Authored victory conditions (ADR-0055). Absent ⇒ the `objective` preset defines win/lose
  // (see victoryRulesForObjective); when present it OVERRIDES the preset — the two-list model
  // that lets one level combine several win and several lose conditions. Optional + back-compat
  // like the other rules fields; `objective` stays required (mode label + fallback outcome copy).
  victory?: VictoryRules;
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
  };
}

export interface CampaignLevelRef {
  levelId: string;
  ordinal: number;
  objective?: ObjectiveType;
  stars?: number;
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
    layers: { terrain, decals: [], zones: [], units: [], props: [] },
  };
}

export type ValidateResult = { ok: true; level: Level } | { ok: false; errors: string[] };

const CONDITION_KINDS = ['eliminate', 'reach', 'turnLimit', 'all'] as const;

/** Structural errors for a single victory condition (ADR-0055). Recurses into `all`. Shape/enum
 * checks only — the win/lose-non-empty gameplay gate is validatePlayability's P6. */
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
    case 'all': {
      const a = cond as { of?: unknown };
      if (!Array.isArray(a.of) || a.of.length === 0) {
        errs.push(`${path}.of must be a non-empty array of conditions`);
      } else {
        a.of.forEach((sub, i) => errs.push(...conditionErrors(sub, `${path}.of[${i}]`)));
      }
      break;
    }
  }
  return errs;
}

/** Structural errors for an authored `Level.victory` (ADR-0055). Empty win/lose lists are legal
 * SHAPE (validatePlayability P6 rejects them as unplayable); this only checks the two lists exist
 * and every condition is well-formed. */
function victoryRuleErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['victory must be an object with win and lose arrays'];
  const v = value as { win?: unknown; lose?: unknown };
  const errs: string[] = [];
  for (const listName of ['win', 'lose'] as const) {
    const list = v[listName];
    if (!Array.isArray(list)) errs.push(`victory.${listName} must be an array`);
    else list.forEach((c, i) => errs.push(...conditionErrors(c, `victory.${listName}[${i}]`)));
  }
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
        for (const [type, count] of Object.entries(counts)) {
          // Playable piece types only — a roster of rocks (or a typo'd type) is meaningless
          // to deal onto spawn tiles.
          if (!isPlayablePieceType(type as PieceType)) {
            errors.push(`roster.${side} has a non-playable piece type "${type}"`);
            break;
          }
          if (!Number.isInteger(count) || (count as number) < 1) {
            errors.push(`roster.${side}.${type} must be a positive integer`);
            break;
          }
        }
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
  }

  return errors.length ? { ok: false, errors } : { ok: true, level: value as Level };
}
