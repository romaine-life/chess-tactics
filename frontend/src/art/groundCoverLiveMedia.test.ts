import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  assertCriticalLiveMediaAvailable,
  boardDrawOps,
  currentLiveMediaCatalog,
  groundCoverSet,
  resetLiveMediaCatalog,
  type LiveMediaCatalog,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';

afterEach(() => resetLiveMediaCatalog());

describe('ground-cover live metadata projection', () => {
  it('hydrates frame geometry and immutable sheet URLs from the applied catalog', () => {
    applyLiveMediaCatalog(testGroundCoverCatalog());
    assertCriticalLiveMediaAvailable();

    expect(groundCoverSet('grass')).toMatchObject({
      terrain: 'grass',
      frameCount: 6,
      variants: [{
        id: 0,
        frameWidth: 40,
        frameHeight: 37,
        baseX: 20,
        baseY: 28,
        contentWidth: 18,
        src: `/api/media/${'a'.repeat(64)}`,
      }],
    });
    expect(groundCoverSet('water')).toMatchObject({
      edgeOnly: true,
      count: { sparse: 2, filled: 3 },
    });
    expect(groundCoverSet('sand')).toMatchObject({ count: { sparse: 2, filled: 4 } });
  });

  it('drives the shared browser/server draw plan from that immutable catalog snapshot', () => {
    applyLiveMediaCatalog(testGroundCoverCatalog());
    const board: EditorBoard = {
      cols: 1,
      rows: 1,
      cells: { '0,0': 'grass-surf-0' },
      units: {},
      doodads: {},
      props: {},
      cover: { '0,0': 'filled' },
      features: {},
      featureCuts: {},
      featureExits: {},
    };

    const coverOps = boardDrawOps(board).filter((op) => op.src === `/api/media/${'a'.repeat(64)}`);
    expect(coverOps.length).toBeGreaterThan(0);
    expect(coverOps.every((op) => op.sw === 40 && op.sh === 37 && op.dw === 40 && op.dh === 37)).toBe(true);
    expect(coverOps.every((op) => op.animation?.kind === 'ground-cover-sway' && op.animation.frameCount === 6)).toBe(true);
    expect(coverOps.some((op) => op.src.startsWith('/assets/groundcover/'))).toBe(false);
  });

  it('rejects metadata that disagrees with its live slot or uploaded sheet', () => {
    const catalog = testGroundCoverCatalog() as LiveMediaCatalog;
    catalog.slots[0] = {
      ...catalog.slots[0],
      versionMetadata: {
        runtime: {
          groundCover: {
            terrain: 'grass', id: 9, frameWidth: 40, frameHeight: 37,
            frameCount: 6, baseX: 20, baseY: 28, contentWidth: 18,
          },
        },
      },
    };
    expect(() => applyLiveMediaCatalog(catalog)).toThrow(/metadata id must match its slot/);
  });

  it('rejects a missing required set atomically without publishing a split snapshot', () => {
    const complete = testGroundCoverCatalog();
    applyLiveMediaCatalog(complete);
    const catalog = testGroundCoverCatalog();
    catalog.revision = complete.revision + 1;
    catalog.slots = catalog.slots.filter((slot) => !slot.slot.startsWith('groundcover/water/'));
    expect(() => applyLiveMediaCatalog(catalog)).toThrow(/water/);
    expect(currentLiveMediaCatalog()?.revision).toBe(complete.revision);
    expect(groundCoverSet('water')?.variants).toHaveLength(1);
  });
});
