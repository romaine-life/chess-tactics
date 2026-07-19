import { afterEach, describe, expect, it } from 'vitest';
import { useSkirmishView } from './skirmishView';

afterEach(() => {
  useSkirmishView.getState().setMinZoom(0.55);
  useSkirmishView.getState().setZoom(0.9);
  useSkirmishView.getState().setPan({ x: 0, y: -12 });
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
});
