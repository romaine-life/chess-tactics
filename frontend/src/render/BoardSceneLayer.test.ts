import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDrawableCatalog } from '@chess-tactics/board-render';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';
import type { EditorBoard } from '../ui/boardCode';
import { boardSceneOcclusionMasks } from './BoardSceneLayer';

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
});
