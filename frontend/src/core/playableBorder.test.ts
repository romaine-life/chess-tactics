import { describe, expect, it } from 'vitest';
import { playableBorderFenceEdges, playableBorderRoadKeys } from './playableBorder';

describe('playable-grid visual borders', () => {
  it('builds a complete one-cell road ring without playable cells', () => {
    const keys = playableBorderRoadKeys(4, 3);
    expect(new Set(keys).size).toBe(18);
    expect(keys).toContain('-1,-1');
    expect(keys).toContain('4,3');
    expect(keys.every((key) => {
      const [x, y] = key.split(',').map(Number);
      return x < 0 || y < 0 || x >= 4 || y >= 3;
    })).toBe(true);
  });

  it('builds one closed fence seam around all playable sides', () => {
    const edges = playableBorderFenceEdges(4, 3);
    expect(new Set(edges).size).toBe(14);
    expect(edges).toContain('-1,0|0,0');
    expect(edges).toContain('3,2|4,2');
    expect(edges).toContain('0,-1|0,0');
    expect(edges).toContain('0,2|0,3');
  });
});
