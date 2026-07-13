import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyLiveMediaCatalog, resetLiveMediaCatalog } from '@chess-tactics/board-render';
import { roadEdgeKey } from '../core/featureAutotile';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import { deriveFeatureOverlays, studioCoverCells } from './StudioReadOnlyBoard';

beforeAll(() => applyLiveMediaCatalog(testGroundCoverCatalog()));
afterAll(() => resetLiveMediaCatalog());

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
