import { describe, expect, it } from 'vitest';
import type { EditorBoard } from './boardCode';
import {
  fillScenicTerrainViewportTargets,
  scenicTerrainTargetsForViewport,
  type ScenicTerrainCoordinate,
} from './levelEditorViewportTerrain';

const key = ({ x, y }: ScenicTerrainCoordinate): string => `${x},${y}`;

const boardFixture = (overrides: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 2,
  rows: 2,
  cells: {
    '0,0': 'north-west',
    '1,0': 'north-east',
    '0,1': 'south-west',
    '1,1': 'south-east',
  },
  macroTiles: [],
  units: {},
  doodads: {},
  props: {},
  cover: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  ...overrides,
});

const viewportTargets = (overrides: Partial<Parameters<typeof scenicTerrainTargetsForViewport>[0]> = {}) =>
  scenicTerrainTargetsForViewport({
    cols: 1,
    rows: 1,
    viewport: { width: 96, height: 54 },
    zoom: 1,
    pan: { x: 0, y: 0 },
    maxTargets: 1_000,
    ...overrides,
  });

describe('scenicTerrainTargetsForViewport', () => {
  it('uses diamond intersection rather than filling the inverse-projected bounding box tips', () => {
    const result = viewportTargets();
    const keys = result.targets.map(key);

    expect(result.status).toBe('complete');
    expect(keys).toContain('1,-1');
    expect(keys).not.toContain('2,0');
    expect(keys).not.toContain('0,0');
    expect(result.targets).toEqual([...result.targets].sort((a, b) => a.y - b.y || a.x - b.x));
  });

  it('responds deterministically to both camera pan and zoom', () => {
    const base = viewportTargets({ viewport: { width: 300, height: 180 } });
    const panned = viewportTargets({ viewport: { width: 300, height: 180 }, pan: { x: 96, y: 0 } });
    const zoomed = viewportTargets({ viewport: { width: 300, height: 180 }, zoom: 2 });

    expect(panned.targets.map(key)).not.toEqual(base.targets.map(key));
    expect(zoomed.targets.length).toBeLessThan(base.targets.length);
    expect(viewportTargets({ viewport: { width: 300, height: 180 }, pan: { x: 96, y: 0 } })).toEqual(panned);
  });

  it('includes exact diamond-to-viewport boundary contact and excludes a subpixel gap', () => {
    const touching = viewportTargets({ viewport: { width: 2, height: 20 }, pan: { x: 1, y: 0 } });
    const separated = viewportTargets({ viewport: { width: 2, height: 20 }, pan: { x: 1.001, y: 0 } });

    expect(touching.targets.map(key)).toContain('1,0');
    expect(separated.targets.map(key)).not.toContain('1,0');
  });

  it('returns no targets for invalid viewport or camera inputs', () => {
    for (const result of [
      viewportTargets({ viewport: { width: 0, height: 100 } }),
      viewportTargets({ viewport: { width: 100, height: Number.NaN } }),
      viewportTargets({ zoom: 0 }),
      viewportTargets({ pan: { x: Number.POSITIVE_INFINITY, y: 0 } }),
      viewportTargets({ cols: 1.5 }),
    ]) {
      expect(result).toMatchObject({ targets: [], status: 'invalid-input', truncated: false });
    }
  });

  it('excludes playable cells and caller-supplied active scenic cells', () => {
    const result = viewportTargets({
      cols: 2,
      rows: 2,
      viewport: { width: 500, height: 300 },
      activeScenicCellKeys: ['-1,0', '2,1'],
    });
    const keys = result.targets.map(key);

    expect(keys).not.toContain('-1,0');
    expect(keys).not.toContain('2,1');
    expect(result.targets.every(({ x, y }) => x < 0 || x >= 2 || y < 0 || y >= 2)).toBe(true);
  });

  it('bounds large fills and explicitly reports a truncated result', () => {
    const result = viewportTargets({ viewport: { width: 1_000, height: 800 }, maxTargets: 3 });

    expect(result.targets).toHaveLength(3);
    expect(result).toMatchObject({ status: 'limit-reached', truncated: true, limit: 3 });
  });
});

describe('fillScenicTerrainViewportTargets', () => {
  it('fills grass exactly, preserves existing terrain, and does not mutate the source', () => {
    const source = boardFixture({ decorativeCells: { '-1,0': 'existing-scenic' } });
    const snapshot = structuredClone(source) as EditorBoard;
    const result = fillScenicTerrainViewportTargets(
      source,
      [{ x: -1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 1 }],
      { kind: 'grass', tileId: 'grass-surf-exact' },
    );

    expect(source).toEqual(snapshot);
    expect(result).not.toBe(source);
    expect(result.decorativeCells).toEqual({
      '-1,0': 'existing-scenic',
      '2,1': 'grass-surf-exact',
    });
    expect(result.decorativeFootprint).toEqual(['-1,0', '2,1']);
    expect(result.cells).toEqual(source.cells);
    expect(result.units).toEqual(source.units);
  });

  it('is idempotent and never replaces an existing scenic cell', () => {
    const source = boardFixture({ decorativeCells: { '2,0': 'hand-painted' } });
    const targets = [{ x: 2, y: 0 }, { x: 2, y: 1 }];
    const once = fillScenicTerrainViewportTargets(source, targets, { kind: 'grass', tileId: 'grass' });
    const twice = fillScenicTerrainViewportTargets(once, targets, { kind: 'grass', tileId: 'grass' });

    expect(once.decorativeCells).toEqual({ '2,0': 'hand-painted', '2,1': 'grass' });
    expect(once.decorativeFootprint).toEqual(['2,0', '2,1']);
    expect(twice).toEqual(once);
  });

  it('matches the exact clamped playable boundary reference in every direction', () => {
    const result = fillScenicTerrainViewportTargets(
      boardFixture(),
      [{ x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 2 }, { x: 2, y: 2 }],
      { kind: 'match-reference' },
    );

    expect(result.decorativeCells).toEqual({
      '-1,0': 'north-west',
      '2,0': 'north-east',
      '-1,2': 'south-west',
      '2,2': 'south-east',
    });
    expect(result.decorativeFootprint).toEqual(['-1,0', '2,0', '-1,2', '2,2']);
  });

  it('keeps an exact existing scenic value but does not borrow it for a void reference', () => {
    const source = boardFixture({
      cells: { '1,0': 'right-edge' },
      decorativeCells: { '-2,0': 'far-scenic', '2,0': 'exact-scenic' },
    });
    const result = fillScenicTerrainViewportTargets(
      source,
      [{ x: -2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }],
      { kind: 'match-reference' },
    );

    expect(result.decorativeCells).toEqual({ '-2,0': 'far-scenic', '2,0': 'exact-scenic' });
    expect(result.decorativeFootprint).toEqual(['-2,0', '-1,0', '2,0']);
    expect(result.decorativeCells).not.toHaveProperty('-1,0');
  });
});
