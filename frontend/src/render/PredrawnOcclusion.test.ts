import { describe, expect, it } from 'vitest';
import { predrawnOcclusionSeedBoard } from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';

describe('predrawn occlusion seed board', () => {
  it('keeps authored raised geometry and removes unrelated scene families', () => {
    const board = {
      cols: 5,
      rows: 11,
      cells: { '0,0': 'sand-flat' },
      surface: { kind: 'predrawn', slot: 'boards/review/plate.png', frameWidth: 1680, frameHeight: 935 },
      macroTiles: [{ assetId: 'macro', x: 0, y: 0 }],
      units: { '1,1': { unitId: 'unit' } },
      doodads: { '2,2': { doodadId: 'grass' } },
      props: { '0,5': { propId: 'fieldstone' } },
      cover: { '3,3': 'dense' },
      coverTypes: { '3,3': 'grass' },
      features: { '1,3': { kind: 'road', material: 'stone', mask: 2 } },
      featureCuts: { cut: true },
      featureExits: { exit: true },
      fences: { '0,5|0,6': 'stone' },
      fencePosts: { '0,5': 'stone' },
      walls: { '0,0|0,-1': 'stone' },
      wallArt: {},
      zones: {},
    } as unknown as EditorBoard;

    const seed = predrawnOcclusionSeedBoard(board);
    expect(seed.surface).toBeUndefined();
    expect(seed.units).toEqual({});
    expect(seed.doodads).toEqual({});
    expect(seed.cover).toEqual({});
    expect(seed.features).toEqual({});
    expect(seed.props).toEqual(board.props);
    expect(seed.fences).toEqual(board.fences);
    expect(seed.fencePosts).toEqual(board.fencePosts);
    expect(seed.walls).toEqual(board.walls);
  });
});
