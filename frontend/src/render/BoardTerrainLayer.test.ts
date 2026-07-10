import { describe, expect, it } from 'vitest';
import { macroTileOwnedCellKeys, type TerrainCanvasMacroTile } from './BoardTerrainLayer';

describe('macroTileOwnedCellKeys', () => {
  it('marks every logical cell whose 1x1 top must be suppressed', () => {
    const macroTiles: TerrainCanvasMacroTile[] = [
      { key: 'grass:0', x: 2, y: 3, columns: 3, rows: 2, src: '/grass.png' },
    ];

    expect([...macroTileOwnedCellKeys(macroTiles)].sort()).toEqual([
      '2,3', '2,4', '3,3', '3,4', '4,3', '4,4',
    ]);
  });

  it('allows edge-adjacent macrotiles without inventing a gap or halo', () => {
    const macroTiles: TerrainCanvasMacroTile[] = [
      { key: 'left', x: 0, y: 0, columns: 2, rows: 2, src: '/left.png' },
      { key: 'right', x: 2, y: 0, columns: 2, rows: 2, src: '/right.png' },
    ];

    expect(macroTileOwnedCellKeys(macroTiles).size).toBe(8);
  });

  it('leaves explicitly broken cells owned by their normal 1x1 terrain top', () => {
    const macroTiles: TerrainCanvasMacroTile[] = [
      { key: 'broken', x: 2, y: 3, columns: 3, rows: 2, breaks: [1, 5], src: '/grass.png' },
    ];

    expect([...macroTileOwnedCellKeys(macroTiles)].sort()).toEqual(['2,3', '2,4', '3,4', '4,3']);
  });
});
