import { beforeEach, describe, expect, it } from 'vitest';
import { createSkirmishViewStore, type SkirmishViewStore } from './skirmishView';

let viewStore: SkirmishViewStore;

beforeEach(() => {
  viewStore = createSkirmishViewStore();
});

describe('skirmish dynamic zoom floor', () => {
  it('prevents HUD, keyboard, and reset paths from crossing the viewport floor', () => {
    viewStore.getState().setMinZoom(1.1);
    viewStore.getState().setZoom(0.6);
    expect(viewStore.getState().zoom).toBe(1.1);
    expect(viewStore.getState().maxZoom).toBe(1.45);

    viewStore.getState().setMinZoom(1.8);
    expect(viewStore.getState().zoom).toBe(1.8);
    expect(viewStore.getState().maxZoom).toBe(1.8);

    viewStore.getState().resetView();
    expect(viewStore.getState().zoom).toBe(1.8);
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

  it('raises the interactive ceiling when the canonical opening fit needs it', () => {
    viewStore.getState().setOpeningView({ zoom: 1.92, pan: { x: 0, y: 14 } });
    viewStore.getState().setZoom(1.92);
    expect(viewStore.getState().maxZoom).toBe(1.92);
    expect(viewStore.getState().zoom).toBe(1.92);

    viewStore.getState().setZoom(2.5);
    expect(viewStore.getState().zoom).toBe(1.92);
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
