import { describe, it, expect } from 'vitest';
import { createBlankLevel, validateLevel, LEVEL_FORMAT_VERSION } from './level';

describe('level schema', () => {
  it('creates a full-size, valid blank level', () => {
    const lvl = createBlankLevel('l1', 'Test', 12, 8);
    expect(lvl.formatVersion).toBe(LEVEL_FORMAT_VERSION);
    expect(lvl.layers.terrain).toHaveLength(96); // 12 * 8
    const res = validateLevel(lvl);
    expect(res.ok).toBe(true);
  });
  it('rejects a bad formatVersion and out-of-range board', () => {
    const bad = { ...createBlankLevel('l1'), formatVersion: 99, board: { cols: 2, rows: 8, heightLevels: 1 } };
    const res = validateLevel(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes('formatVersion'))).toBe(true);
      expect(res.errors.some((e) => e.includes('board.cols'))).toBe(true);
    }
  });
  it('rejects an out-of-bounds unit', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.units.push({ x: 99, y: 0, type: 'knight', side: 'player' });
    expect(validateLevel(lvl).ok).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(validateLevel(null).ok).toBe(false);
    expect(validateLevel('nope').ok).toBe(false);
  });
});
