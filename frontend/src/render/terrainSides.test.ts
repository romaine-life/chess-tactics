import { describe, expect, it } from 'vitest';
import {
  TERRAIN_SIDE_FACE_COLUMN,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  resolveTerrainSideMaterials,
} from '@chess-tactics/board-render';
import { terrainSideDrawSlices, type TerrainCanvasCell } from './BoardTerrainLayer';

describe('terrain side faces', () => {
  it('resolves each face from its override or the shared default source', () => {
    const base = { sideSrc: '/base.png' };
    const south = { sideSrc: '/south.png' };

    expect(resolveTerrainSideMaterials(
      base,
      { south },
      (source, face) => `${face}:${source.sideSrc}`,
    )).toEqual({
      south: 'south:/south.png',
      east: 'east:/base.png',
    });
  });

  it('resolves south and east exposure independently from logical occupancy', () => {
    const occupied = new Set(['0,0', '1,0']);
    const exposure = resolveTerrainSideExposure(
      { x: 0, y: 0 },
      (x, y) => occupied.has(`${x},${y}`),
    );

    expect(exposure).toEqual({ south: true, east: false });
    expect(resolveTerrainSideFaces(exposure, { south: '/south.png', east: '/east.png' })).toEqual({
      south: { exposed: true, material: '/south.png' },
      east: { exposed: false, material: '/east.png' },
    });
  });

  it('maps logical south to the left source half and east to the right source half', () => {
    expect(TERRAIN_SIDE_FACE_COLUMN).toEqual({ south: 0, east: 1 });
    const cell: TerrainCanvasCell = {
      key: 'corner',
      x: 0,
      y: 0,
      sideFaces: resolveTerrainSideFaces(
        { south: true, east: true },
        { south: '/earth-side.png', east: '/water-side.png' },
      ),
    };

    expect(terrainSideDrawSlices(cell)).toEqual([
      { face: 'south', src: '/earth-side.png', sourceX: 0, destinationX: 0, width: 48 },
      { face: 'east', src: '/water-side.png', sourceX: 48, destinationX: 48, width: 48 },
    ]);
  });

  it('does not draw a material assigned to a hidden face', () => {
    const cell: TerrainCanvasCell = {
      key: 'east-only',
      x: 0,
      y: 0,
      sideFaces: resolveTerrainSideFaces(
        { south: false, east: true },
        { south: '/hidden.png', east: '/visible.png' },
      ),
    };

    expect(terrainSideDrawSlices(cell).map((slice) => slice.src)).toEqual(['/visible.png']);
  });
});
