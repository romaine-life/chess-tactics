import { beforeEach, describe, expect, it } from 'vitest';
import { appSettingsSnapshot, updateAppSettings } from '../settings/appSettings';
import { createSkirmishViewStore, type SkirmishViewStore } from './skirmishView';

let viewStore: SkirmishViewStore;

beforeEach(() => {
  viewStore = createSkirmishViewStore();
});

describe('skirmish dynamic zoom floor', () => {
  it('loads with the device board-grid preference, which defaults on', () => {
    expect(viewStore.getState().showGrid).toBe(true);

    const previous = appSettingsSnapshot().showBoardGrid;
    try {
      updateAppSettings({ showBoardGrid: false });
      expect(createSkirmishViewStore().getState().showGrid).toBe(false);
    } finally {
      updateAppSettings({ showBoardGrid: previous });
    }
  });

  it('prevents HUD, keyboard, and reset paths from crossing the viewport floor', () => {
    viewStore.getState().setMinZoom(1.1);
    viewStore.getState().setZoom(0.6);
    expect(viewStore.getState().zoom).toBe(1.1);

    viewStore.getState().setMinZoom(1.8);
    expect(viewStore.getState().zoom).toBe(1.8);
    // The floor no longer has to be rescued from a ceiling. It used to be possible for a
    // derived floor to land on top of the cap and collapse the range onto one zoom, which is
    // what the proportional headroom existed to undo; an uncapped store cannot reach that state.
    expect(viewStore.getState().maxZoom).toBe(Number.POSITIVE_INFINITY);

    viewStore.getState().resetView();
    expect(viewStore.getState().zoom).toBe(1.8);
  });

  it('imposes no ceiling of its own, whatever the floor', () => {
    // How far in a player may go is the ladder's closest tier, measured where the viewport is
    // known. The store holding a second, smaller cap could only ever narrow that silently.
    viewStore.getState().setMinZoom(1.44);
    expect(viewStore.getState().maxZoom).toBe(Number.POSITIVE_INFINITY);
    viewStore.getState().setMinZoom(0.4);
    expect(viewStore.getState().maxZoom).toBe(Number.POSITIVE_INFINITY);
  });

  it('preserves an accepted-art floor between human-facing control increments', () => {
    viewStore.getState().setMinZoom(1.254244);
    viewStore.getState().setZoom(1.25);
    expect(viewStore.getState().minZoom).toBe(1.254244);
    expect(viewStore.getState().zoom).toBe(1.254244);
  });

  it('resets to the viewport-derived board opening rather than a global camera', () => {
    viewStore.getState().setOpeningView({ zoom: 0.73, pan: { x: 4, y: -8 } });
    viewStore.getState().setZoom(1.3);
    viewStore.getState().setPan({ x: 20, y: 30 });
    viewStore.getState().resetView();
    expect(viewStore.getState().zoom).toBe(0.73);
    expect(viewStore.getState().pan).toEqual({ x: 4, y: -8 });
  });

  it('holds an opening closer than any old cap, and does not clamp past it', () => {
    viewStore.getState().setOpeningView({ zoom: 1.92, pan: { x: 0, y: 14 } });
    viewStore.getState().setZoom(1.92);
    expect(viewStore.getState().zoom).toBe(1.92);

    // Previously clamped back to the opening because the ceiling was raised only far enough to
    // admit it. Nothing in the store stops a player going further in now.
    viewStore.getState().setZoom(2.5);
    expect(viewStore.getState().zoom).toBe(2.5);
  });

  it('isolates every mounted battlefield view from independently preparing scenes', () => {
    const outgoing = createSkirmishViewStore();
    const incoming = createSkirmishViewStore();
    outgoing.getState().setOpeningView({ zoom: 1.1, pan: { x: 4, y: 8 } });
    outgoing.getState().setZoom(1.1);
    outgoing.getState().setPan({ x: 4, y: 8 });

    incoming.getState().setMinZoom(2.2);
    incoming.getState().setOpeningView({ zoom: 2.4, pan: { x: -12, y: 30 } });
    incoming.getState().setZoom(2.4);
    incoming.getState().setPan({ x: -12, y: 30 });

    expect(outgoing.getState()).toMatchObject({
      zoom: 1.1,
      pan: { x: 4, y: 8 },
      openingZoom: 1.1,
      openingPan: { x: 4, y: 8 },
    });
    expect(incoming.getState()).toMatchObject({
      zoom: 2.4,
      minZoom: 2.2,
      pan: { x: -12, y: 30 },
    });
  });
});
