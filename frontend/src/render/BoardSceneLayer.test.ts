import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDrawableCatalog, type BoardDrawOp } from '@chess-tactics/board-render';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';
import type { EditorBoard } from '../ui/boardCode';
import { boardSceneOcclusionMasks, stillBoardSceneOps } from './BoardSceneLayer';

beforeAll(() => applyTestDrawableCatalog());
afterAll(resetDrawableCatalog);

function sourceLessBoard(): EditorBoard {
  return {
    cols: 2,
    rows: 2,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    fences: {},
    fencePosts: {},
    walls: { '0,0|0,-1': 'stone' },
    wallArt: {},
  };
}

describe('BoardSceneLayer pre-drawn mode', () => {
  it('enables canonical occlusion for a temporary candidate without a persisted surface', () => {
    const board = sourceLessBoard();

    expect(boardSceneOcclusionMasks(board)).toEqual([]);
    expect(boardSceneOcclusionMasks(board, { predrawnBackgroundActive: true }))
      .toEqual([expect.objectContaining({ layer: 'scene' })]);
  });

  it('keeps the owner proof and hidden-background switches authoritative', () => {
    const board = sourceLessBoard();

    expect(boardSceneOcclusionMasks(board, {
      predrawnBackgroundActive: true,
      predrawnOcclusion: false,
    })).toEqual([]);
    expect(boardSceneOcclusionMasks(board, {
      predrawnBackgroundActive: true,
      tileHidden: true,
    })).toEqual([]);
  });

  it('does not reconstruct a legacy sprite mask for an immutable versioned surface', () => {
    const board: EditorBoard = {
      ...sourceLessBoard(),
      surface: {
        kind: 'predrawn',
        schemaVersion: 2,
        backgroundVersionId: '11111111-1111-4111-8111-111111111111',
        occlusionVersionId: '22222222-2222-4222-8222-222222222222',
        frameWidth: 1200,
        frameHeight: 800,
        worldBounds: { minX: -20, minY: -30, width: 600, height: 400 },
      },
    };

    expect(boardSceneOcclusionMasks(board)).toEqual([]);
  });

  it('does not apply persisted occlusion while a remembered AI surface is dormant', () => {
    const board: EditorBoard = {
      ...sourceLessBoard(),
      backgroundMode: 'legacy',
      surface: {
        kind: 'predrawn',
        schemaVersion: 2,
        backgroundVersionId: '11111111-1111-4111-8111-111111111111',
        occlusionVersionId: '22222222-2222-4222-8222-222222222222',
        frameWidth: 1200,
        frameHeight: 800,
        worldBounds: { minX: -20, minY: -30, width: 600, height: 400 },
      },
    };

    expect(boardSceneOcclusionMasks(board)).toEqual([]);
    expect(boardSceneOcclusionMasks(board, { predrawnBackgroundActive: true }))
      .toEqual([expect.objectContaining({ layer: 'scene' })]);
  });
});

describe('BoardSceneLayer still mode', () => {
  it('pins time-based sway ops to their rest frame so no repaint clock starts', () => {
    const ops = [
      {
        image: 'grass-sway.png',
        dx: 0,
        dy: 0,
        z: 0,
        sx: 0,
        sw: 24,
        animation: { kind: 'ground-cover-sway', frameCount: 6, durationMs: 900, phase: 2 },
      },
      { image: 'unit.png', dx: 12, dy: 8, z: 4 },
    ] as unknown as BoardDrawOp[];

    const still = stillBoardSceneOps(ops);

    expect(still.every((op) => op.animation === undefined)).toBe(true);
    // Ops with no animation keep their identity; only sway ops are re-created.
    expect(still[1]).toBe(ops[1]);
    expect(still[0]).not.toBe(ops[0]);
    expect(still[0]).toMatchObject({ image: 'grass-sway.png', sx: 0, sw: 24 });
  });
});
