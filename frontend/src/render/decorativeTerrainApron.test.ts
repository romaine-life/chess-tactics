import { describe, expect, it } from 'vitest';
import { decorativeTerrainApronCells, withDecorativeTerrainFeatures } from './decorativeTerrainApron';

describe('decorativeTerrainApronCells', () => {
  it('attaches feature art to every synthesized scenic cell', () => {
    const cells = decorativeTerrainApronCells([
      { key: '0,0', x: 0, y: 0, topSrc: 'grass.png' },
      { key: '1,0', x: 1, y: 0, topSrc: 'grass.png' },
      { key: '0,1', x: 0, y: 1, topSrc: 'grass.png' },
      { key: '1,1', x: 1, y: 1, topSrc: 'grass.png' },
    ], 2, 2, { top: 1, right: 1, bottom: 1, left: 1 });
    const ring = Object.fromEntries(cells.map((cell) => [`${cell.x},${cell.y}`, 'road']));
    const decorated = withDecorativeTerrainFeatures(cells, ring, () => '/road.png');
    expect(decorated.every((cell) => cell.featureSrc === '/road.png')).toBe(true);
  });
  it('surrounds but never duplicates playable coordinates', () => {
    const apron = decorativeTerrainApronCells([
      { key: '0,0', x: 0, y: 0, topSrc: 'grass.png' },
      { key: '1,0', x: 1, y: 0, topSrc: 'stone.png' },
    ], 2, 1, { top: 1, right: 1, bottom: 1, left: 1 });
    expect(apron).toHaveLength(10);
    expect(apron.some((cell) => cell.x >= 0 && cell.x < 2 && cell.y === 0)).toBe(false);
    expect(apron.find((cell) => cell.x === -1 && cell.y === 0)?.topSrc).toBe('grass.png');
    expect(apron.find((cell) => cell.x === 2 && cell.y === 0)?.topSrc).toBe('stone.png');
  });

  it('carries terrain tops only and stays empty for a terrain-free board', () => {
    expect(decorativeTerrainApronCells([], 4, 4, { top: 2, right: 2, bottom: 2, left: 2 })).toEqual([]);
    const [cell] = decorativeTerrainApronCells([
      { key: '0,0', x: 0, y: 0, topSrc: 'water.png', topAnimFrames: 8, featureSrc: 'river.png' },
    ], 1, 1, { top: 1, right: 1, bottom: 1, left: 1 });
    expect(cell).toMatchObject({ topSrc: 'water.png', topAnimFrames: 8, animate: false });
    expect(cell.featureSrc).toBeUndefined();
    expect(cell.sideFaces).toBeUndefined();
  });

  it('uses generated decorative cells instead of stretching the nearest edge tile', () => {
    const authored = new Map([['-1,0', { key: 'authored', x: -1, y: 0, topSrc: 'sand.png' }]]);
    const apron = decorativeTerrainApronCells(
      [{ key: '0,0', x: 0, y: 0, topSrc: 'grass.png' }],
      1,
      1,
      { top: 0, right: 0, bottom: 0, left: 1 },
      authored,
    );
    expect(apron).toHaveLength(1);
    expect(apron[0].topSrc).toBe('sand.png');
  });
});
