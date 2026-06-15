import { describe, it, expect } from 'vitest';
import { DEFAULT_ISO, depthKey, screenToTile, tileToScreen } from './iso';

describe('isometric projection', () => {
  it('round-trips tile -> screen -> tile on the ground plane', () => {
    for (const [x, y] of [[0, 0], [3, 5], [7, 11], [1, 9]] as const) {
      const s = tileToScreen(x, y, 0, DEFAULT_ISO);
      const t = screenToTile(s.x, s.y, DEFAULT_ISO);
      expect(t).toEqual({ x, y });
    }
  });
  it('lifts the screen y by elevation', () => {
    const ground = tileToScreen(4, 4, 0, DEFAULT_ISO);
    const raised = tileToScreen(4, 4, 2, DEFAULT_ISO);
    expect(raised.y).toBe(ground.y - 2 * DEFAULT_ISO.elevationStep);
    expect(raised.x).toBe(ground.x);
  });
  it('depthKey orders lower elevation before higher, then by row+col', () => {
    expect(depthKey(7, 7, 0)).toBeLessThan(depthKey(0, 0, 1)); // any ground tile draws before any raised one
    expect(depthKey(1, 1, 0)).toBeLessThan(depthKey(2, 2, 0)); // farther back draws first within a band
  });
});
