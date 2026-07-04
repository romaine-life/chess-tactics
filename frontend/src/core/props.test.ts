import { describe, it, expect } from 'vitest';
import { propCells, propDef, PROP_DEFS, type PropDef } from './props';
import propSeats from './propSeats.json';

const sortCells = (cells: Array<{ x: number; y: number }>) =>
  [...cells].sort((a, b) => a.y - b.y || a.x - b.x);

describe('props core', () => {
  it('propCells(0,0,oak) is exactly the 2×2 block (order-insensitive)', () => {
    const oak = propDef('oak')!;
    expect(oak.w).toBe(2);
    expect(oak.h).toBe(2);
    expect(sortCells(propCells(0, 0, oak))).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 },
    ]);
  });

  it('propCells respects the anchor offset', () => {
    const oak = propDef('oak')!;
    expect(sortCells(propCells(3, 5, oak))).toEqual([
      { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 },
    ]);
  });

  it('a 2×1 def returns exactly 2 cells', () => {
    const def: PropDef = { id: 'x', label: 'X', kind: 'tree', w: 2, h: 1, blocking: true, terrains: ['grass'], spriteId: 'x', family: 'x', sprite: { w: 96, h: 96, anchorX: 48, anchorY: 80, scale: 1 } };
    expect(propCells(0, 0, def)).toHaveLength(2);
    expect(sortCells(propCells(0, 0, def))).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });

  it('propDef returns undefined for an unknown id (no fallback to [0])', () => {
    expect(propDef('not-a-real-prop')).toBeUndefined();
  });

  it('every def composes a full seat from propSeats.json, and the file has no orphans', () => {
    for (const d of PROP_DEFS) {
      expect(Number.isFinite(d.sprite.anchorX), `${d.id} anchorX`).toBe(true);
      expect(Number.isFinite(d.sprite.anchorY), `${d.id} anchorY`).toBe(true);
      expect(d.sprite.scale, `${d.id} scale`).toBeGreaterThan(0);
    }
    const defIds = new Set(PROP_DEFS.map((d) => d.id));
    for (const seatId of Object.keys(propSeats)) {
      expect(defIds.has(seatId), `propSeats.json entry "${seatId}" has no PROP_DEFS def`).toBe(true);
    }
  });

  it('seeds an oak (tree) and a cottage (house), all blocking with a valid footprint', () => {
    const ids = PROP_DEFS.map((d) => d.id);
    expect(ids).toContain('oak');
    expect(ids).toContain('cottage');
    expect(propDef('oak')!.kind).toBe('tree');
    expect(propDef('cottage')!.kind).toBe('house');
    for (const d of PROP_DEFS) {
      expect(d.blocking).toBe(true);
      // Footprint is editable (propSeats w/h); the seed set is 2×2, but only assert it's valid.
      expect(Number.isInteger(d.w) && d.w >= 1, `${d.id} w`).toBe(true);
      expect(Number.isInteger(d.h) && d.h >= 1, `${d.id} h`).toBe(true);
    }
  });

  it('footprint comes from propSeats (default 2×2); a variant inherits the base cells', () => {
    // No footprint override in the seed → the default 2×2.
    expect(propDef('cottage')!.w).toBe(2);
    expect(propDef('cottage')!.h).toBe(2);
    // The variant has no w/h in its entry, so it inherits the base's footprint.
    expect(propDef('cottage-small')!.w).toBe(propDef('cottage')!.w);
    expect(propDef('cottage-small')!.h).toBe(propDef('cottage')!.h);
  });

  it('a size variant shares the base sprite + footprint, differing only by seat', () => {
    const variant = propDef('cottage-small');
    const base = propDef('cottage')!;
    expect(variant, 'cottage-small variant present').toBeDefined();
    // SHARES the base's PNG asset + gameplay footprint + frame dims + family.
    expect(variant!.spriteId).toBe('cottage');
    expect(variant!.family).toBe(base.family);
    expect(variant!.kind).toBe(base.kind);
    expect(variant!.w).toBe(base.w);
    expect(variant!.h).toBe(base.h);
    expect(variant!.terrains).toEqual(base.terrains);
    expect(variant!.sprite.w).toBe(base.sprite.w);
    expect(variant!.sprite.h).toBe(base.sprite.h);
    // DIFFERS only by its own seat (a smaller scale).
    expect(variant!.sprite.scale).toBeLessThan(base.sprite.scale);
  });

  it('every def has a spriteId/family, and every variant base resolves', () => {
    const ids = new Set(PROP_DEFS.map((d) => d.id));
    for (const d of PROP_DEFS) {
      expect(typeof d.spriteId, `${d.id} spriteId`).toBe('string');
      expect(typeof d.family, `${d.id} family`).toBe('string');
      // a variant's spriteId is another (base) prop that exists; a base points at itself.
      expect(ids.has(d.spriteId), `${d.id} spriteId "${d.spriteId}" resolves`).toBe(true);
    }
  });
});
