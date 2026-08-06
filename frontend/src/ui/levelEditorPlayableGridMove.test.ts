import { describe, expect, it } from 'vitest';
import { projectBoardPoint, type EditorBoard } from '@chess-tactics/board-render';
import {
  movePlayableGrid,
  playableGridMoveAvailability,
} from './levelEditorPlayableGridMove';

const boardFixture = (overrides: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 3,
  rows: 3,
  decorativeApron: { top: 1, right: 1, bottom: 1, left: 1 },
  decorativeCells: {},
  decorativeFootprint: ['3,1'],
  decorativeFeatures: {},
  decorativeFences: {},
  decorativeFencePosts: {},
  decorativeWalls: {},
  cells: {
    '0,0': 'north-edge',
    '1,1': 'middle',
    '2,2': 'south-edge',
  },
  macroTiles: [],
  units: {
    '0,1': { unitId: 'pawn', direction: 'south', faction: 'red' },
    '2,2': { unitId: 'rook', direction: 'south', faction: 'blue' },
  },
  doodads: { '1,2': { doodadId: 'flowers' } },
  props: {},
  floatingArtwork: [{ id: 'art', sourceArtId: 'tree', pixelX: 100, pixelY: 200, direction: 'south', scale: 1 }],
  cover: { '1,1': 'filled' },
  coverTypes: { '1,1': 'grass' },
  coverSeeds: { '1,1': 99 },
  features: { '1,1': { kind: 'road', material: 'dirt' } },
  fences: { '0,1|1,1': 'wood' },
  fencePosts: { '0,1': 'wood' },
  walls: {},
  wallArt: {},
  subterrain: { '2,2:south': 'soil' },
  featureCuts: { '0,1|1,1': true },
  featureExits: { '2,2|2,3': true },
  zoneEntries: [{ id: 'zone', type: 'player-spawn', tiles: ['0,1', '2,2'] }],
  zones: { '0,1': 'player-spawn', '2,2': 'player-spawn' },
  generatedRegions: [{ id: 'region', name: 'Region', cells: ['1,1', '2,2'], sections: [], buffer: 0, wiggle: 0 }],
  towns: [{ id: 'town', name: 'Town', bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, sections: [], seed: 1 }],
  forests: [{ id: 'forest', name: 'Forest', bounds: { minX: 1, minY: 1, maxX: 2, maxY: 2 }, sections: [], seed: 2 }],
  predrawnGenerationFrame: { version: 1, x: -800, y: -450, width: 1600, height: 900 },
  cameraBounds: { minX: -1000, minY: -1000, width: 2000, height: 2000 },
  ...overrides,
});

describe('movePlayableGrid', () => {
  it('moves the playable projection north as one complete opposite scene rebase', () => {
    const source = boardFixture();
    const result = movePlayableGrid(source, 'north');
    expect(result).toBeDefined();
    const moved = result!.board;
    const projected = projectBoardPoint({ x: 0, y: 1 });

    expect(moved.cols).toBe(3);
    expect(moved.rows).toBe(3);
    expect(moved.decorativeApron).toEqual({ top: 0, right: 1, bottom: 2, left: 1 });
    expect(result!.contentDelta).toEqual({ x: 0, y: 1 });

    expect(moved.cells).toMatchObject({
      '0,0': 'north-edge',
      '0,1': 'north-edge',
      '1,2': 'middle',
    });
    expect(moved.decorativeCells).toMatchObject({ '2,3': 'south-edge' });
    expect(moved.decorativeFootprint).toEqual(['3,2']);

    expect(moved.features).toHaveProperty('1,2');
    expect(moved.fences).toHaveProperty('0,2|1,2');
    expect(moved.fencePosts).toHaveProperty('0,2');
    expect(moved.cover).toHaveProperty('1,2');
    expect(moved.coverTypes).toHaveProperty('1,2');
    expect(moved.coverSeeds).toHaveProperty('1,2');
    expect(moved.subterrain).toHaveProperty('2,3:south');
    expect(moved.featureCuts).toHaveProperty('0,2|1,2');
    expect(moved.featureExits).toHaveProperty('2,3|2,4');

    expect(moved.units).toEqual({
      '0,2': { unitId: 'pawn', direction: 'south', faction: 'red' },
    });
    expect(moved.doodads).toEqual({});
    expect(moved.zoneEntries?.[0].tiles).toEqual(['0,2']);
    expect(moved.zones).toEqual({ '0,2': 'player-spawn' });
    expect(result!.dropped).toEqual({ units: 1, doodads: 1, props: 0, zoneTiles: 1, total: 3 });

    expect(moved.generatedRegions?.[0].cells).toEqual(['1,2', '2,3']);
    expect(moved.towns?.[0].bounds).toEqual({ minX: 0, minY: 1, maxX: 1, maxY: 2 });
    expect(moved.forests?.[0].bounds).toEqual({ minX: 1, minY: 2, maxX: 2, maxY: 3 });
    expect(moved.floatingArtwork?.[0]).toMatchObject({
      pixelX: 100 + projected.left,
      pixelY: 200 + projected.top,
    });
    expect(moved.predrawnGenerationFrame).toMatchObject({
      x: -800 + projected.left,
      y: -450 + projected.top,
    });
    expect(moved.cameraBounds).toMatchObject({
      minX: -1000 + projected.left,
      minY: -1000 + projected.top,
    });
    expect(source).toEqual(boardFixture());
  });

  it('materializes a synthesized scenic edge when that row enters play', () => {
    const moved = movePlayableGrid(boardFixture({
      cells: { '0,0': 'grass', '1,0': 'stone', '2,0': 'water' },
      decorativeCells: {},
    }), 'north')!.board;

    expect(moved.cells['0,0']).toBe('grass');
    expect(moved.cells['1,0']).toBe('stone');
    expect(moved.cells['2,0']).toBe('water');
  });

  it('moves east, south, and west with the matching extent transfer', () => {
    const east = movePlayableGrid(boardFixture(), 'east')!;
    expect(east.contentDelta).toEqual({ x: -1, y: 0 });
    expect(east.board.decorativeApron).toEqual({ top: 1, right: 0, bottom: 1, left: 2 });

    const south = movePlayableGrid(boardFixture(), 'south')!;
    expect(south.contentDelta).toEqual({ x: 0, y: -1 });
    expect(south.board.decorativeApron).toEqual({ top: 2, right: 1, bottom: 0, left: 1 });

    const west = movePlayableGrid(boardFixture(), 'west')!;
    expect(west.contentDelta).toEqual({ x: 1, y: 0 });
    expect(west.board.decorativeApron).toEqual({ top: 1, right: 2, bottom: 1, left: 0 });
  });

  it('refuses a move without scenic terrain on that side or room on the opposite side', () => {
    const noNorth = boardFixture({ decorativeApron: { top: 0, right: 1, bottom: 1, left: 1 } });
    expect(playableGridMoveAvailability(noNorth, 'north')).toEqual({
      allowed: false,
      reason: 'Extend scenic terrain to the North first.',
    });
    expect(movePlayableGrid(noNorth, 'north')).toBeUndefined();

    const fullSouth = boardFixture({ decorativeApron: { top: 1, right: 1, bottom: 16, left: 1 } });
    expect(playableGridMoveAvailability(fullSouth, 'north')).toEqual({
      allowed: false,
      reason: 'The opposite scenic extent is already at 16 tiles.',
    });
  });
});
