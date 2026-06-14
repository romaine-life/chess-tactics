import { describe, it, expect } from 'vitest';
import { createSkirmish } from './setup';
import { livingPieces } from '../core/rules';

describe('createSkirmish', () => {
  it('is deterministic for a given seed', () => {
    expect(createSkirmish({ seed: 42 })).toEqual(createSkirmish({ seed: 42 }));
  });
  it('differs across seeds', () => {
    const a = JSON.stringify(createSkirmish({ seed: 1 }).pieces.map((p) => [p.x, p.y]));
    const b = JSON.stringify(createSkirmish({ seed: 2 }).pieces.map((p) => [p.x, p.y]));
    expect(a).not.toBe(b);
  });
  it('fields the player party + a pawn, three enemies, and 3-6 rocks', () => {
    const s = createSkirmish({ seed: 7, party: ['knight', 'bishop'] });
    expect(livingPieces(s.pieces, 'player')).toHaveLength(3);
    expect(livingPieces(s.pieces, 'enemy')).toHaveLength(3);
    const rocks = s.pieces.filter((p) => p.type === 'rock');
    expect(rocks.length).toBeGreaterThanOrEqual(3);
    expect(rocks.length).toBeLessThanOrEqual(6);
    expect(s.turn).toBe('player');
    expect(s.winner).toBeNull();
  });
  it('places every piece in-bounds with no overlaps', () => {
    const s = createSkirmish({ seed: 99 });
    const seen = new Set<string>();
    for (const p of s.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(s.size.cols);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(s.size.rows);
      const key = `${p.x},${p.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
  it('spawns players near the bottom and enemies near the top', () => {
    const s = createSkirmish({ seed: 5 });
    for (const p of livingPieces(s.pieces, 'player')) expect(p.y).toBeGreaterThanOrEqual(s.size.rows - 2);
    for (const p of livingPieces(s.pieces, 'enemy')) expect(p.y).toBeLessThanOrEqual(1);
  });
});
