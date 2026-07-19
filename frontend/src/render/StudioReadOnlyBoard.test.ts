import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  boardDrawOps,
  boardLabMetrics,
  resetLiveMediaCatalog,
  subterrainMaterialSrc,
} from '@chess-tactics/board-render';
import { roadEdgeKey } from '../core/featureAutotile';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import type { EditorBoard } from '../ui/boardCode';
import {
  boardForTopSurfaceArtExport,
  deriveFeatureOverlays,
  studioCoverCells,
  topSurfaceArtExportFrame,
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
    } as unknown as Parameters<typeof boardForTopSurfaceArtExport>[0];
    const exported = boardForTopSurfaceArtExport(board);
    expect(exported.surface).toBeUndefined();
    expect(exported.units).toEqual({});
    expect(exported.cover).toEqual({});
    expect(exported.coverTypes).toEqual({});
    expect(exported.fences).toBe(board.fences);
    expect(exported.props).toBe(board.props);
  });

  it('derives the capture frame from a rectangular board instead of a fixed viewport', () => {
    const filled = (cols: number, rows: number): EditorBoard => {
      const cells: Record<string, string> = {};
      for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells[`${x},${y}`] = 'grass-surf-0';
      return {
        cols,
        rows,
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
      };
    };
    const small = topSurfaceArtExportFrame(filled(3, 2), 37);
    const holdBridgeShape = filled(12, 8);
    const frame = topSurfaceArtExportFrame(holdBridgeShape, 37);
    const cells = Array.from({ length: holdBridgeShape.rows }, (_, y) => (
      Array.from({ length: holdBridgeShape.cols }, (__, x) => ({ x, y }))
    )).flat();
    const metrics = boardLabMetrics(cells);
    const renderedLeft = frame.width / 2 + frame.boardPan.x + metrics.originLeft + frame.paintBounds.minX;
    const renderedTop = frame.height / 2 + frame.boardPan.y + metrics.originTop + frame.paintBounds.minY;
    const renderedRight = renderedLeft + frame.paintBounds.width;
    const renderedBottom = renderedTop + frame.paintBounds.height;

    expect(frame.width).toBe(frame.paintBounds.width + 74);
    expect(frame.height).toBe(frame.paintBounds.height + 74);
    expect(frame.width).toBeGreaterThan(small.width);
    expect(frame.height).toBeGreaterThan(small.height);
    expect(renderedLeft).toBe(37);
    expect(renderedTop).toBe(37);
    expect(renderedRight).toBe(frame.width - 37);
    expect(renderedBottom).toBe(frame.height - 37);
  });

  it('omits terrain side-face draw operations from the measured top-only source', () => {
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
    expect(boardDrawOps(board, { topSurfacesOnly: true }).some((op) => sideSources.has(op.src))).toBe(false);
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
