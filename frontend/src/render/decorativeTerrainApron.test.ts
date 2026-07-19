import { describe, expect, it } from 'vitest';
import {
  decorativeTerrainApronCells,
  decorativeTerrainApronCoordinates,
  extendDecorativeTerrainApron,
  scenicTerrainRenderCells,
  scenicTerrainValueAt,
  withDecorativeTerrainFeatures,
} from './decorativeTerrainApron';

const holdBridgeTerrain = () => Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 12 }, (_, x) => ({
    key: `${x},${y}`,
    x,
    y,
    ...((y === 7 && (x === 5 || x === 6)) ? {} : { topSrc: 'grass.png' }),
  })),
).flat();

describe('extendDecorativeTerrainApron', () => {
  const extents = { top: 1, right: 1, bottom: 1, left: 1 };

  it('copies the exact authored whole-canvas edge in all four cardinal directions', () => {
    const authored = {
      '0,-1': 'north',
      '2,0': 'east',
      '1,2': 'south',
      '-1,1': 'west',
    };

    expect(extendDecorativeTerrainApron(2, 2, extents, authored, 'top').authored['0,-2']).toBe('north');
    expect(extendDecorativeTerrainApron(2, 2, extents, authored, 'right').authored['3,0']).toBe('east');
    expect(extendDecorativeTerrainApron(2, 2, extents, authored, 'bottom').authored['1,3']).toBe('south');
    expect(extendDecorativeTerrainApron(2, 2, extents, authored, 'left').authored['-2,1']).toBe('west');
  });

  it('chains the copied edge across repeated extensions', () => {
    const first = extendDecorativeTerrainApron(2, 1, { top: 0, right: 1, bottom: 0, left: 0 }, { '2,0': 'sand' }, 'right');
    const second = extendDecorativeTerrainApron(2, 1, first.extents, first.authored, 'right');

    expect(first.authored['3,0']).toBe('sand');
    expect(second.authored['4,0']).toBe('sand');
  });

  it('copies the exact old canvas corner when perpendicular scenic extents are present', () => {
    const extended = extendDecorativeTerrainApron(
      2,
      2,
      extents,
      { '2,-1': 'north-east-corner' },
      'right',
    );

    expect(extended.authored['3,-1']).toBe('north-east-corner');
    expect(extended.authored['3,0']).toBeUndefined();
  });

  it('does not skip an unpainted current edge to copy an older inner scenic cell', () => {
    const extended = extendDecorativeTerrainApron(
      2,
      1,
      { top: 0, right: 2, bottom: 0, left: 0 },
      { '2,0': 'sand' },
      'right',
    );

    expect(extended.authored['4,0']).toBeUndefined();
  });

  it('preserves an existing destination and leaves playable-edge fallback unmaterialized', () => {
    const preserved = extendDecorativeTerrainApron(
      2,
      1,
      { top: 0, right: 1, bottom: 0, left: 0 },
      { '2,0': 'sand', '3,0': 'stone' },
      'right',
    );
    const firstRow = extendDecorativeTerrainApron(2, 1, { top: 0, right: 0, bottom: 0, left: 0 }, {}, 'right');

    expect(preserved.authored['3,0']).toBe('stone');
    expect(firstRow.authored).toEqual({});
  });

  it('fills every otherwise-unauthored destination with an explicit selected value', () => {
    const filled = extendDecorativeTerrainApron(
      2,
      2,
      { top: 0, right: 0, bottom: 0, left: 0 },
      {},
      'bottom',
      { kind: 'fill', value: 'grass' },
    );

    expect(filled.extents).toEqual({ top: 0, right: 0, bottom: 1, left: 0 });
    expect(filled.authored).toEqual({ '0,2': 'grass', '1,2': 'grass' });
  });

  it('uses fill mode instead of copying a non-grass reference and preserves hidden authored work', () => {
    const filled = extendDecorativeTerrainApron(
      2,
      2,
      { top: 0, right: 1, bottom: 0, left: 0 },
      { '2,0': 'stone', '2,1': 'stone', '3,1': 'water' },
      'right',
      { kind: 'fill', value: 'grass' },
    );

    expect(filled.authored['2,0']).toBe('stone');
    expect(filled.authored['3,0']).toBe('grass');
    expect(filled.authored['3,1']).toBe('water');
  });

  it('chains explicit fill values across repeated growth', () => {
    const first = extendDecorativeTerrainApron(
      1,
      1,
      { top: 0, right: 0, bottom: 0, left: 0 },
      {},
      'right',
      { kind: 'fill', value: 'grass' },
    );
    const second = extendDecorativeTerrainApron(
      1,
      1,
      first.extents,
      first.authored,
      'right',
      { kind: 'fill', value: 'grass' },
    );

    expect(second.authored).toMatchObject({ '1,0': 'grass', '2,0': 'grass' });
  });
});

describe('decorativeTerrainApronCells', () => {
  it('unions the rectangular apron with explicitly authored sparse scenic cells in stable order', () => {
    const coordinates = decorativeTerrainApronCoordinates(
      2,
      1,
      { top: 1, right: 0, bottom: 0, left: 0 },
      ['7,3', '-2,0', '0,-1', '3,-2'],
    );

    expect(coordinates).toEqual([
      { x: 3, y: -2 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -2, y: 0 },
      { x: 7, y: 3 },
    ]);
  });

  it('ignores malformed, non-integer, unsafe, and playable authored coordinate keys', () => {
    const coordinates = decorativeTerrainApronCoordinates(
      2,
      2,
      { top: 0, right: 0, bottom: 0, left: 0 },
      ['1,1', '0,0', '2,1.5', '2,', ' 2,1', '2,1 ', '9007199254740992,0', '2,1'],
    );

    expect(coordinates).toEqual([{ x: 2, y: 1 }]);
  });

  it('deduplicates explicit cells already included by the rectangular apron', () => {
    const coordinates = decorativeTerrainApronCoordinates(
      1,
      1,
      { top: 0, right: 1, bottom: 0, left: 0 },
      ['1,0', '1,0'],
    );

    expect(coordinates).toEqual([{ x: 1, y: 0 }]);
  });

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

  it('continues Hold Bridge bottom-edge voids through one scenic row', () => {
    const apron = decorativeTerrainApronCells(
      holdBridgeTerrain(),
      12,
      8,
      { top: 0, right: 0, bottom: 1, left: 0 },
    );
    const byCoordinate = new Map(apron.map((cell) => [`${cell.x},${cell.y}`, cell]));

    expect(byCoordinate.has('4,8')).toBe(true);
    expect(byCoordinate.has('5,8')).toBe(false);
    expect(byCoordinate.has('6,8')).toBe(false);
    expect(byCoordinate.has('7,8')).toBe(true);
    expect(apron).toHaveLength(10);
  });

  it('continues Hold Bridge bottom-edge voids through every scenic row', () => {
    const apron = decorativeTerrainApronCells(
      holdBridgeTerrain(),
      12,
      8,
      { top: 0, right: 0, bottom: 3, left: 0 },
    );
    const coordinates = new Set(apron.map((cell) => `${cell.x},${cell.y}`));

    for (const y of [8, 9, 10]) {
      expect(coordinates.has(`4,${y}`)).toBe(true);
      expect(coordinates.has(`5,${y}`)).toBe(false);
      expect(coordinates.has(`6,${y}`)).toBe(false);
      expect(coordinates.has(`7,${y}`)).toBe(true);
    }
    expect(apron).toHaveLength(30);
  });

  it('lets one authored scenic cell fill only its own projected boundary void', () => {
    const authored = new Map([
      ['5,8', { key: 'authored:5,8', x: 5, y: 8, topSrc: 'stone.png' }],
    ]);
    const apron = decorativeTerrainApronCells(
      holdBridgeTerrain(),
      12,
      8,
      { top: 0, right: 0, bottom: 2, left: 0 },
      authored,
    );
    const byCoordinate = new Map(apron.map((cell) => [`${cell.x},${cell.y}`, cell]));

    expect(byCoordinate.get('5,8')?.topSrc).toBe('stone.png');
    expect(byCoordinate.has('5,9')).toBe(false);
    expect(byCoordinate.has('6,8')).toBe(false);
    expect(byCoordinate.has('6,9')).toBe(false);
  });

  it('does not project a central interior void through a terrain boundary', () => {
    const playable = Array.from({ length: 3 }, (_, y) =>
      Array.from({ length: 3 }, (_, x) => ({
        key: `${x},${y}`,
        x,
        y,
        ...((x === 1 && y === 1) ? {} : { topSrc: 'grass.png' }),
      })),
    ).flat();
    const apron = decorativeTerrainApronCells(
      playable,
      3,
      3,
      { top: 1, right: 1, bottom: 1, left: 1 },
    );

    expect(apron).toHaveLength(16);
    expect(apron.find((cell) => cell.x === 1 && cell.y === -1)?.topSrc).toBe('grass.png');
    expect(apron.find((cell) => cell.x === 1 && cell.y === 3)?.topSrc).toBe('grass.png');
  });

  it('renders explicitly authored scenic terrain around a terrain-free board', () => {
    const authored = new Map([
      ['0,2', { key: 'authored:0,2', x: 0, y: 2, topSrc: 'stone.png' }],
    ]);
    const apron = decorativeTerrainApronCells(
      [],
      2,
      2,
      { top: 0, right: 0, bottom: 1, left: 0 },
      authored,
    );

    expect(apron).toHaveLength(1);
    expect(`${apron[0].x},${apron[0].y}`).toBe('0,2');
    expect(apron[0]).toMatchObject({ topSrc: 'stone.png', animate: false });
  });

  it('renders an explicitly authored cell outside the rectangular apron', () => {
    const authored = new Map([
      ['5,-3', { key: 'authored:5,-3', x: 5, y: -3, topSrc: 'stone.png' }],
    ]);
    expect(decorativeTerrainApronCells(
      [{ key: '0,0', x: 0, y: 0, topSrc: 'grass.png' }],
      1,
      1,
      { top: 0, right: 0, bottom: 0, left: 0 },
      authored,
    )).toEqual([]);
    const apron = decorativeTerrainApronCells(
      [{ key: '0,0', x: 0, y: 0, topSrc: 'grass.png' }],
      1,
      1,
      { top: 0, right: 0, bottom: 0, left: 0 },
      authored,
      authored.keys(),
    );

    expect(apron).toEqual([
      expect.objectContaining({ key: 'decorative-apron:5,-3', x: 5, y: -3, topSrc: 'stone.png' }),
    ]);
  });

  it('does not extend the footprint for malformed or playable authored keys', () => {
    const authored = new Map([
      ['bad-key', { key: 'malformed', x: 5, y: 5, topSrc: 'stone.png' }],
      ['0,0', { key: 'playable', x: 0, y: 0, topSrc: 'stone.png' }],
    ]);
    const apron = decorativeTerrainApronCells(
      [{ key: '0,0', x: 0, y: 0, topSrc: 'grass.png' }],
      1,
      1,
      { top: 0, right: 0, bottom: 0, left: 0 },
      authored,
      authored.keys(),
    );

    expect(apron).toEqual([]);
  });
});

describe('scenicTerrainValueAt', () => {
  it('uses exact boundary projection, preserves voids, and gives authored scenic cells precedence', () => {
    const playable = new Map<string, string>([
      ['0,0', 'top-left'],
      ['1,0', 'top-right'],
      ['0,1', 'bottom-left'],
    ]);
    const authored = new Map<string, string>([
      ['0,0', 'ignored-inside'],
      ['1,2', 'authored-bottom'],
    ]);
    const resolve = (x: number, y: number) => scenicTerrainValueAt(
      x,
      y,
      2,
      2,
      (sourceX, sourceY) => playable.get(`${sourceX},${sourceY}`),
      (authoredX, authoredY) => authored.get(`${authoredX},${authoredY}`),
    );

    expect(resolve(0, 0)).toBe('top-left');
    expect(resolve(0, 2)).toBe('bottom-left');
    expect(resolve(1, 2)).toBe('authored-bottom');
    expect(resolve(1, 3)).toBeUndefined();
  });
});

describe('scenicTerrainRenderCells', () => {
  it('freezes the combined terrain pass only when scenic cells exist', () => {
    const playable = [
      { key: '0,0', x: 0, y: 0, topSrc: 'water.png', animate: true },
      { key: '1,0', x: 1, y: 0, topSrc: 'grass.png' },
    ];
    const apron = [
      { key: 'decorative-apron:2,0', x: 2, y: 0, topSrc: 'water.png', animate: true },
    ];

    const withoutApron = scenicTerrainRenderCells(playable, []);
    expect(withoutApron).toEqual(playable);
    expect(withoutApron[0].animate).toBe(true);

    const withApron = scenicTerrainRenderCells(playable, apron);
    expect(withApron).toHaveLength(3);
    expect(withApron.every((cell) => cell.animate === false)).toBe(true);
    expect(playable[0].animate).toBe(true);
    expect(apron[0].animate).toBe(true);
  });
});
