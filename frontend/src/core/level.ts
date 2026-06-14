// The level / campaign document schema — the durable, serializable format the
// editors write and the game reads. Custom (Tiled/LDtk can't express isometric +
// elevation + gameplay zones); LDtk-inspired structure (defs/instances spirit,
// world/levels model, typed fields). Persisted as a validated JSONB body.

import type { BoardSize, PieceType, Side } from './types';

export const LEVEL_FORMAT_VERSION = 1;
export const CAMPAIGN_FORMAT_VERSION = 1;

export const BOARD_COLS = { min: 4, max: 16 } as const;
export const BOARD_ROWS = { min: 4, max: 20 } as const;

export type TerrainType = 'grass' | 'water' | 'stone' | 'road' | 'bridge' | 'cliff' | 'rock';
export type ZoneType = 'player-spawn' | 'enemy-spawn' | 'enemy-threat' | 'objective' | 'falling-rock';
export type ObjectiveType = 'capture-all' | 'capture-king' | 'survive' | 'reach';

export interface TerrainCell {
  x: number;
  y: number;
  terrain: TerrainType;
  /** Elevation level (0 = ground). The isometric multi-height axis. */
  elevation: number;
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
}

export interface LevelEconomy {
  startingFunds: number;
  incomePerTurn: number;
}

export interface Level {
  formatVersion: number;
  id: string;
  name: string;
  board: BoardSize & { heightLevels: number };
  objective: ObjectiveType;
  difficulty: string;
  economy: LevelEconomy;
  theme: string;
  layers: {
    terrain: TerrainCell[];
    decals: Decal[];
    zones: Zone[];
    units: LevelUnit[];
  };
}

export interface CampaignLevelRef {
  levelId: string;
  ordinal: number;
  objective?: ObjectiveType;
  stars?: number;
}

export interface Campaign {
  formatVersion: number;
  id: string;
  name: string;
  difficulty: string;
  chapters: number;
  levels: CampaignLevelRef[];
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
    board: { cols, rows, heightLevels: 1 },
    objective: 'capture-all',
    difficulty: 'normal',
    economy: { startingFunds: 1200, incomePerTurn: 150 },
    theme: 'grassland',
    layers: { terrain, decals: [], zones: [], units: [] },
  };
}

export type ValidateResult = { ok: true; level: Level } | { ok: false; errors: string[] };

/** Structural validation at the trust boundary (editor save / DB read). */
export function validateLevel(value: unknown): ValidateResult {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['level is not an object'] };
  const v = value as Partial<Level>;

  if (v.formatVersion !== LEVEL_FORMAT_VERSION) errors.push(`formatVersion must be ${LEVEL_FORMAT_VERSION}`);
  if (typeof v.id !== 'string' || !v.id) errors.push('id is required');
  if (typeof v.name !== 'string') errors.push('name is required');

  const b = v.board;
  if (!b || typeof b.cols !== 'number' || typeof b.rows !== 'number') {
    errors.push('board.cols and board.rows are required');
  } else {
    if (b.cols < BOARD_COLS.min || b.cols > BOARD_COLS.max) errors.push(`board.cols out of range (${BOARD_COLS.min}-${BOARD_COLS.max})`);
    if (b.rows < BOARD_ROWS.min || b.rows > BOARD_ROWS.max) errors.push(`board.rows out of range (${BOARD_ROWS.min}-${BOARD_ROWS.max})`);
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
  }

  return errors.length ? { ok: false, errors } : { ok: true, level: value as Level };
}
