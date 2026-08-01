import { afterEach, describe, expect, it } from 'vitest';
import { useSkirmishView } from './skirmishView';

afterEach(() => {
  useSkirmishView.setState({
    zoom: 0.9,
    minZoom: 0.05,
    maxZoom: 1.45,
    pan: { x: 0, y: -12 },
    openingZoom: 0.9,
    openingPan: { x: 0, y: -12 },
    cameraResetRevision: 0,
  });
});

describe('skirmish dynamic zoom floor', () => {
  it('prevents HUD, keyboard, and reset paths from crossing the viewport floor', () => {
    useSkirmishView.getState().setMinZoom(1.1);
    useSkirmishView.getState().setZoom(0.6);
    expect(useSkirmishView.getState().zoom).toBe(1.1);
    expect(useSkirmishView.getState().maxZoom).toBe(1.45);

    useSkirmishView.getState().setMinZoom(1.8);
    expect(useSkirmishView.getState().zoom).toBe(1.8);
    expect(useSkirmishView.getState().maxZoom).toBe(1.8);

    useSkirmishView.getState().resetView();
    expect(useSkirmishView.getState().zoom).toBe(1.8);
  });

  it('preserves an accepted-art floor between human-facing control increments', () => {
    useSkirmishView.getState().setMinZoom(1.254244);
    useSkirmishView.getState().setZoom(1.25);
    expect(useSkirmishView.getState().minZoom).toBe(1.254244);
    expect(useSkirmishView.getState().zoom).toBe(1.254244);
  });

  it('resets to the viewport-derived board opening rather than a global camera', () => {
    useSkirmishView.getState().setOpeningView({ zoom: 0.73, pan: { x: 4, y: -8 } });
    useSkirmishView.getState().setZoom(1.3);
    useSkirmishView.getState().setPan({ x: 20, y: 30 });
    useSkirmishView.getState().resetView();
    expect(useSkirmishView.getState().zoom).toBe(0.73);
    expect(useSkirmishView.getState().pan).toEqual({ x: 4, y: -8 });
  });

  it('raises the interactive ceiling when the canonical opening fit needs it', () => {
    useSkirmishView.getState().setOpeningView({ zoom: 1.92, pan: { x: 0, y: 14 } });
    useSkirmishView.getState().setZoom(1.92);
    expect(useSkirmishView.getState().maxZoom).toBe(1.92);
    expect(useSkirmishView.getState().zoom).toBe(1.92);

    useSkirmishView.getState().setZoom(2.5);
    expect(useSkirmishView.getState().zoom).toBe(1.92);
  });
});
