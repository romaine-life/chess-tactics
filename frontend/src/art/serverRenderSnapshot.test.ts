import { afterEach, describe, expect, it } from 'vitest';
import {
  applyServerRenderSnapshot,
  resetLiveMediaCatalog,
  resetDrawableCatalog,
  resetLiveUnitCatalog,
  resetPropSeats,
  type LiveMediaCatalog,
  type PropSeatMap,
} from '@chess-tactics/board-render';
import {
  testGroundCoverCatalog,
  testInstalledChromeMediaSlots,
  testStructureMediaSlots,
} from '../test/liveMediaCatalog';
import { TEST_PROP_SEATS } from '../test/livePropSeats';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { testDrawableCatalog } from '../test/drawableCatalog';

function completeSnapshot() {
  return {
    drawableCatalog: testDrawableCatalog(),
    mediaCatalog: testGroundCoverCatalog([
      ...testStructureMediaSlots(),
      ...testInstalledChromeMediaSlots(),
    ]),
    propSeats: structuredClone(TEST_PROP_SEATS),
    unitCatalog: testLiveUnitCatalog(),
  };
}

afterEach(() => {
  resetLiveUnitCatalog();
  resetPropSeats();
  resetLiveMediaCatalog();
  resetDrawableCatalog();
});

describe('availability-critical server renderer snapshot', () => {
  it('accepts the same complete projections required by browser startup', () => {
    expect(() => applyServerRenderSnapshot(completeSnapshot())).not.toThrow();
  });

  it('accepts a DB-defined ground-cover inventory without requiring a compiled member roster', () => {
    const snapshot = completeSnapshot();
    snapshot.drawableCatalog.assets = snapshot.drawableCatalog.assets.filter((asset) => asset.id !== 'ground-cover-water');
    expect(() => applyServerRenderSnapshot(snapshot)).not.toThrow();
  });

  it('rejects a missing installed Chrome role', () => {
    const snapshot = completeSnapshot();
    const installedChrome = snapshot.drawableCatalog.assets.find((asset) => asset.id === 'installed-chrome')!;
    delete installedChrome.media['divider-joint'];
    expect(() => applyServerRenderSnapshot(snapshot)).toThrow(/installed Chrome|divider-joint/);
  });

  it('rejects a prop document whose authored source has no live raster slots', () => {
    const snapshot = completeSnapshot();
    snapshot.propSeats = {
      ...snapshot.propSeats,
      'invalid-live-source': {
        placement: 'prop',
        source: { kind: 'asset', id: 'missing-source' },
        anchorX: 1,
        anchorY: 1,
        scale: 1,
        label: 'Invalid live source',
        kind: 'house',
        w: 1,
        h: 1,
        blocking: false,
        terrains: ['grass'],
      },
    } satisfies PropSeatMap;
    expect(() => applyServerRenderSnapshot(snapshot)).toThrow(/source "missing-source" is unavailable/);
  });

  it('rejects incomplete accepted Unit Art', () => {
    const snapshot = completeSnapshot();
    snapshot.unitCatalog.assets[0].complete = false;
    expect(() => applyServerRenderSnapshot(snapshot)).toThrow(/accepted asset is incomplete/);
  });

  it('does not treat an empty catalog as ready', () => {
    const snapshot = completeSnapshot();
    snapshot.mediaCatalog = {
      schemaVersion: 1,
      revision: 0,
      updatedAt: null,
      slots: [],
    } satisfies LiveMediaCatalog;
    expect(() => applyServerRenderSnapshot(snapshot)).toThrow(/ground-cover|critical/);
  });
});
