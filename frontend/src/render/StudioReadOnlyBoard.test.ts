import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  boardDrawOps,
  resetLiveMediaCatalog,
  subterrainMaterialSrc,
} from '@chess-tactics/board-render';
import { roadEdgeKey } from '../core/featureAutotile';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import type { EditorBoard } from '../ui/boardCode';
import { scenicTerrainTargetsForViewport } from '../ui/levelEditorViewportTerrain';
import {
  boardForTopSurfaceArtExport,
  deriveFeatureOverlays,
  studioCoverCells,
  studioVisualTerrainPlan,
} from './StudioReadOnlyBoard';

beforeAll(() => applyLiveMediaCatalog(testGroundCoverCatalog()));
afterAll(() => resetLiveMediaCatalog());

describe('boardForTopSurfaceArtExport', () => {
  it('removes units, additive cover, and an old plate without changing baked obstacles or fences', () => {
    const board = {
      surface: { kind: 'predrawn', slot: 'boards/existing/plate.png', frameWidth: 1024, frameHeight: 768 },
      units: { '0,0': { unitId: 'pawn', direction: 'south', faction: 'navy-blue' } },
      cover: { '1,2': 'filled' },
      coverTypes: { '1,2': 'grass' },
      fences: { '1,2|1,3': 'stone' },
      props: { '2,3': 'fieldstone' },
      subterrain: { '0,0:south': 'earth' },
    } as unknown as Parameters<typeof boardForTopSurfaceArtExport>[0];
    const exported = boardForTopSurfaceArtExport(board);
    expect(exported.surface).toBeUndefined();
    expect(exported.units).toEqual({});
    expect(exported.cover).toEqual({});
    expect(exported.coverTypes).toEqual({});
    expect(exported.fences).toBe(board.fences);
    expect(exported.props).toBe(board.props);
    expect(exported.subterrain).toBe(board.subterrain);
  });

  it('retains explicitly authored Subterrain but does not synthesize unauthored skirts', () => {
    const board = {
      cols: 1,
      rows: 1,
      cells: { '0,0': 'grass-surf-0' },
      units: {},
      doodads: {},
      props: {},
      cover: {},
      features: {},
      fences: {},
      fencePosts: {},
      walls: {},
      wallArt: {},
      subterrain: { '0,0:south': 'earth', '0,0:east': 'bedrock' },
      featureCuts: {},
      featureExits: {},
    } satisfies EditorBoard;
    const sideSources = new Set([
      subterrainMaterialSrc('earth'),
      subterrainMaterialSrc('bedrock'),
    ]);

    expect(boardDrawOps(board).filter((op) => sideSources.has(op.src))).toHaveLength(2);
    expect(boardDrawOps(board, { topSurfacesOnly: true }).filter((op) => sideSources.has(op.src))).toHaveLength(2);
    expect(studioVisualTerrainPlan({ board, topSurfacesOnly: true }).terrainCells[0].sideFaces).toEqual({
      south: { exposed: true, material: subterrainMaterialSrc('earth') },
      east: { exposed: true, material: subterrainMaterialSrc('bedrock') },
    });

    expect(boardDrawOps(
      { ...board, subterrain: {} },
      { topSurfacesOnly: true },
    ).filter((op) => sideSources.has(op.src))).toHaveLength(0);
  });

  it('keeps the exact Hold Bridge scenic footprint in the frozen combined terrain pass', () => {
    const cells = Object.fromEntries(
      Array.from({ length: 8 }, (_, y) => (
        Array.from({ length: 12 }, (__, x) => [`${x},${y}`, 'grass-surf-0'])
      )).flat(),
    );
    const scenic = scenicTerrainTargetsForViewport({
      cols: 12,
      rows: 8,
      viewport: { width: 672, height: 400 },
      zoom: 0.4,
      pan: { x: 0, y: 0 },
      maxTargets: 10_000,
    });
    const decorativeFootprint = scenic.targets.map(({ x, y }) => `${x},${y}`);
    const board = {
      cols: 12,
      rows: 8,
      decorativeApron: { top: 0, right: 0, bottom: 0, left: 0 },
      decorativeFootprint,
      decorativeCells: Object.fromEntries(decorativeFootprint.map((key) => [key, 'grass-surf-0'])),
      cells,
      units: {},
      doodads: {},
      props: {},
      cover: {},
      features: {},
      fences: {},
      fencePosts: {},
      walls: {},
      wallArt: {},
      featureCuts: {},
      featureExits: {},
    } satisfies EditorBoard;

    expect(scenic.status).toBe('complete');
    expect(scenic.targets).toHaveLength(625);
    expect(Math.min(...scenic.targets.map(({ x }) => x))).toBe(-12);
    expect(Math.max(...scenic.targets.map(({ x }) => x))).toBe(24);
    expect(Math.min(...scenic.targets.map(({ y }) => y))).toBe(-14);
    expect(Math.max(...scenic.targets.map(({ y }) => y))).toBe(22);

    const plan = studioVisualTerrainPlan({ board, animationFrame: 7, topSurfacesOnly: true });
    expect(plan.playableGridCells).toHaveLength(96);
    expect(plan.gridCells).toHaveLength(721);
    expect(plan.terrainCells.every((cell) => cell.animate === false)).toBe(true);
  });
});

describe('deriveFeatureOverlays', () => {
  it('honors forced feature exits like the editor and thumbnail bake', () => {
    const overlays = deriveFeatureOverlays(
      { '1,1': { kind: 'road', material: 'cobble' } },
      {},
      { [roadEdgeKey(1, 1, 2, 1)]: true },
    );

    expect(overlays['1,1']).toMatchObject({ kind: 'road', material: 'cobble', mask: 2 });
  });

  it('uses ground-cover type overrides instead of the tile family', () => {
    const cells = studioCoverCells(
      { '0,0': 'stone-surf-0' },
      { '0,0': 'filled' },
      1234,
      { '0,0': 'grass' },
    );

    expect(cells).toHaveLength(1);
    expect(cells[0].terrain).toBe('grass');
  });
});
