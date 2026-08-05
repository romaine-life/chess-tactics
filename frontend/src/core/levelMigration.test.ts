import { describe, expect, it } from 'vitest';
import {
  LEVEL_FORMAT_VERSION,
  UnsupportedLevelFormatError,
  createBlankLevel,
  migrateLevelDocument,
  validateLevel,
} from './level';

function encodeWire(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeWire(value: string): Record<string, unknown> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return JSON.parse(new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  )) as Record<string, unknown>;
}

describe('Level document migrations', () => {
  it('advances version 1 and losslessly folds retired Pawn deployment geometry', () => {
    const current = createBlankLevel('off-l-migration', 'Mêlée');
    const wire = {
      c: current.board.cols,
      r: current.board.rows,
      zn: [
        ['general', 'player-spawn', ['0,0'], 'General', 'blue', ['pawn', 'king']],
        ['pawns', 'player-pawn-spawn', ['1,0'], 'Piétons', 'green'],
      ],
      z: { '0,0': 'player-spawn', '1,0': 'player-pawn-spawn' },
    };
    const version1 = {
      ...current,
      formatVersion: 1,
      boardCode: encodeWire(wire),
      layers: {
        ...current.layers,
        zones: [
          { id: 'general', type: 'player-spawn', tiles: [[0, 0]], excludedPieceTypes: ['pawn', 'king'] },
          { id: 'pawns', type: 'player-pawn-spawn', tiles: [[1, 0]] },
        ],
      },
    };

    const migrated = migrateLevelDocument(version1);
    const general = migrated.layers.zones.find((zone) => zone.type === 'player-spawn');
    const migratedWire = decodeWire(migrated.boardCode!);
    const wireGeneral = (migratedWire.zn as unknown[][]).find((zone) => zone[1] === 'player-spawn');

    expect(migrated.formatVersion).toBe(LEVEL_FORMAT_VERSION);
    expect(validateLevel(migrated).ok).toBe(true);
    expect(general?.tiles).toEqual([[0, 0], [1, 0]]);
    expect(general?.excludedPieceTypes).toEqual(['king']);
    expect(migrated.layers.zones).not.toContainEqual(expect.objectContaining({ type: 'player-pawn-spawn' }));
    expect(wireGeneral?.[2]).toEqual(['0,0', '1,0']);
    expect(wireGeneral?.[5]).toEqual(['king']);
    expect((migratedWire.z as Record<string, unknown>)['1,0']).toBe('player-spawn');
  });

  it('accepts only current or declared predecessor versions', () => {
    const current = createBlankLevel('l-current');
    expect(migrateLevelDocument(current)).toBe(current);
    expect(() => migrateLevelDocument({ ...current, formatVersion: 3 }))
      .toThrow(UnsupportedLevelFormatError);
    expect(() => migrateLevelDocument({ ...current, formatVersion: 0 }))
      .toThrow(UnsupportedLevelFormatError);
  });

  it('stamps an already-retired version 1 Level without normalizing unrelated zone data', () => {
    const current = createBlankLevel('l-post-database-migration');
    const wire = {
      c: current.board.cols,
      r: current.board.rows,
      zn: [['general', 'player-spawn', ['0,0', '0,0'], 'General', 'blue', []]],
    };
    const version1 = {
      ...current,
      formatVersion: 1,
      boardCode: encodeWire(wire),
      layers: {
        ...current.layers,
        zones: [{
          id: 'general',
          type: 'player-spawn' as const,
          tiles: [[0, 0], [0, 0]] as [number, number][],
          excludedPieceTypes: [],
        }],
      },
    };

    const migrated = migrateLevelDocument(version1);
    const migratedWire = decodeWire(migrated.boardCode!);

    expect(migrated.layers.zones[0].tiles).toEqual([[0, 0], [0, 0]]);
    expect(migrated.layers.zones[0].excludedPieceTypes).toEqual([]);
    expect((migratedWire.zn as unknown[][])[0][2]).toEqual(['0,0', '0,0']);
    expect((migratedWire.zn as unknown[][])[0][5]).toEqual([]);
  });
});
