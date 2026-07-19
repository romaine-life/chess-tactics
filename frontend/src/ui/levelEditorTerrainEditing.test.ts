import { describe, expect, it } from 'vitest';
import { macroTileBreakIndices } from '../core/macroTiles';
import type { EditorBoard } from './boardCode';
import { paintTerrainArea } from './levelEditorTerrainEditing';

const boardFixture = (overrides: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 3,
  rows: 3,
  decorativeApron: { top: 1, right: 1, bottom: 1, left: 1 },
  decorativeCells: { '-1,1': 'existing-scenic' },
  cells: { '0,0': 'existing-playable', '2,2': 'unrelated-playable' },
  macroTiles: [],
  units: { '1,1': { unitId: 'pawn', direction: 'south', faction: 'red' } },
  doodads: {},
  props: {},
  cover: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  ...overrides,
});

describe('paintTerrainArea', () => {
  it('writes playable and scenic selections to their separate terrain channels', () => {
    const result = paintTerrainArea(
      boardFixture(),
      new Set(['0,0', '-1,1', '3,2', '3,3']),
      'grass-surf-17',
    );

    expect(result.cells).toMatchObject({
      '0,0': 'grass-surf-17',
      '2,2': 'unrelated-playable',
    });
    expect(result.decorativeCells).toMatchObject({
      '-1,1': 'grass-surf-17',
      '3,2': 'grass-surf-17',
      '3,3': 'grass-surf-17',
    });
    expect(result.units).toEqual({ '1,1': { unitId: 'pawn', direction: 'south', faction: 'red' } });
  });

  it('ignores malformed, noncanonical, and out-of-rectangle coordinate keys', () => {
    const source = boardFixture({ decorativeApron: { top: 1, right: 0, bottom: 0, left: 0 } });
    const result = paintTerrainArea(
      source,
      ['bad', '1', '1,2,3', '1.5,0', '01,0', ' 1,0', '-1,0', '3,0', '0,-2', '0,3'],
      'ignored-tile',
    );

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.cells).not.toBe(source.cells);
  });

  it('breaks every overlapping macrotile at a painted playable cell', () => {
    const source = boardFixture({
      macroTiles: [
        { assetId: 'grass-soft-bands-3x3', x: 0, y: 0 },
        { assetId: 'stone-moss-field-2x2', x: 1, y: 1 },
      ],
    });
    const result = paintTerrainArea(source, ['1,1'], 'painted-over-macrotile');

    expect(result.macroTiles).toHaveLength(2);
    expect(macroTileBreakIndices(result.macroTiles![0])).toEqual([4]);
    expect(macroTileBreakIndices(result.macroTiles![1])).toEqual([0]);
    expect(result.cells['1,1']).toBe('painted-over-macrotile');
  });

  it('stores the exact supplied tile id without resolving or replacing it', () => {
    const exactTileId = 'custom/reference-tile@variant+raw';
    const result = paintTerrainArea(boardFixture(), ['1,2', '-1,2'], exactTileId);

    expect(result.cells['1,2']).toBe(exactTileId);
    expect(result.decorativeCells?.['-1,2']).toBe(exactTileId);
  });

  it('does not mutate any source-board content', () => {
    const source = boardFixture({
      macroTiles: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0 }],
      decorativeCells: { '-1,0': 'old-scenic' },
    });
    const snapshot = structuredClone(source) as EditorBoard;

    const result = paintTerrainArea(source, ['1,1', '-1,0'], 'new-tile');

    expect(source).toEqual(snapshot);
    expect(result).not.toBe(source);
    expect(result.cells).not.toBe(source.cells);
    expect(result.decorativeCells).not.toBe(source.decorativeCells);
    expect(result.macroTiles).not.toBe(source.macroTiles);
    expect(result.units).not.toBe(source.units);
  });
});
