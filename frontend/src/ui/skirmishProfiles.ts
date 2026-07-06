import { useCampaigns } from '../campaign/store';
import { DEFAULT_TIME_CONTROL } from '../core/clock';
import { createBlankLevel, type Level } from '../core/level';

export const SKIRMISH_PROFILE_ID_PREFIX = 'skirmish-profile-';
export const DEFAULT_SKIRMISH_PROFILE_ID = `${SKIRMISH_PROFILE_ID_PREFIX}classic`;

const zoneTiles = (cols: number, rows: readonly number[]): Array<[number, number]> =>
  rows.flatMap((y) => Array.from({ length: cols }, (_, x) => [x, y] as [number, number]));

export function isSkirmishProfileLevel(levelOrId: Level | string | undefined): boolean {
  const id = typeof levelOrId === 'string' ? levelOrId : levelOrId?.id;
  return Boolean(id?.startsWith(SKIRMISH_PROFILE_ID_PREFIX));
}

export function createDefaultSkirmishProfileLevel(): Level {
  const cols = 8;
  const rows = 12;
  const level = createBlankLevel(DEFAULT_SKIRMISH_PROFILE_ID, 'Classic Skirmish', cols, rows);
  return {
    ...level,
    timeControl: DEFAULT_TIME_CONTROL,
    events: [
      {
        kind: 'spawn',
        name: 'Deploy player force',
        trigger: { kind: 'setup' },
        side: 'player',
        roster: { pawn: 1, knight: 1, bishop: 1 },
        zoneIds: ['player-deployment'],
      },
      {
        kind: 'spawn',
        name: 'Deploy enemy force',
        trigger: { kind: 'setup' },
        side: 'enemy',
        roster: { king: 1, knight: 1, rook: 1 },
        zoneIds: ['enemy-deployment'],
      },
    ],
    layers: {
      ...level.layers,
      zones: [
        { id: 'player-deployment', name: 'Player deployment', color: 'blue', type: 'region', tiles: zoneTiles(cols, [rows - 2, rows - 1]) },
        { id: 'enemy-deployment', name: 'Enemy deployment', color: 'red', type: 'region', tiles: zoneTiles(cols, [0, 1]) },
      ],
    },
  };
}

export function ensureDefaultSkirmishProfileLevel(): Level {
  const store = useCampaigns.getState();
  const existing = store.levels[DEFAULT_SKIRMISH_PROFILE_ID];
  if (existing) return existing;
  const level = createDefaultSkirmishProfileLevel();
  store.replaceLevel(level);
  return level;
}

export function skirmishProfileLevels(levels: Record<string, Level>): Level[] {
  return Object.values(levels)
    .filter(isSkirmishProfileLevel)
    .sort((a, b) => {
      if (a.id === DEFAULT_SKIRMISH_PROFILE_ID) return -1;
      if (b.id === DEFAULT_SKIRMISH_PROFILE_ID) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
    });
}

export function editSkirmishProfileHref(levelId: string, returnTo = '/skirmish'): string {
  return `/editor/level?levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(returnTo)}`;
}
