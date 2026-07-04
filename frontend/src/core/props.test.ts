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

  it('seeds oak (tree), cottage (house), and rock (rock 1×1), all blocking with a valid footprint', () => {
    const ids = PROP_DEFS.map((d) => d.id);
    expect(ids).toContain('oak');
    expect(ids).toContain('cottage');
    expect(ids).toContain('rock');
    expect(propDef('oak')!.kind).toBe('tree');
    expect(propDef('cottage')!.kind).toBe('house');
    expect(propDef('rock')!).toMatchObject({ kind: 'rock', w: 1, h: 1 });
    for (const d of PROP_DEFS) {
      expect(d.blocking).toBe(true);
      // Footprint is editable (propSeats w/h); the seed set is 2×2 (rocks 1×1), only assert valid.
      expect(Number.isInteger(d.w) && d.w >= 1, `${d.id} w`).toBe(true);
      expect(Number.isInteger(d.h) && d.h >= 1, `${d.id} h`).toBe(true);
    }
  });

  it('footprint is data-driven: a base defaults to 2×2 absent a w/h; a copy follows its own w/h or inherits the base', () => {
    // Assert the RULE for every def (robust to whatever copies are authored in propSeats.json —
    // they can now be created/renamed/deleted and given their own footprint in /prop-lab).
    const seats = propSeats as Record<string, { w?: number; h?: number; base?: string }>;
    for (const d of PROP_DEFS) {
      const s = seats[d.id] ?? {};
      if (s.base) {
        const base = propDef(s.base)!;
        expect(d.w, `${d.id} w (copy: own w or base)`).toBe(s.w ?? base.w);
        expect(d.h, `${d.id} h (copy: own h or base)`).toBe(s.h ?? base.h);
      } else {
        expect(d.w, `${d.id} w (base: own w or default 2)`).toBe(s.w ?? 2);
        expect(d.h, `${d.id} h (base: own h or default 2)`).toBe(s.h ?? 2);
      }
    }
  });

  it('a copy shares its base sprite (asset + frame + family + kind + terrains), with its own seat', () => {
    // Pick any authored copy — don't hard-code an id, since copies come and go via the editor.
    const seats = propSeats as Record<string, { base?: string }>;
    const copyId = Object.keys(seats).find((id) => seats[id].base);
    if (!copyId) return; // no copies authored — nothing to assert
    const copy = propDef(copyId)!;
    const base = propDef(seats[copyId].base!)!;
    // SHARES the base's PNG asset (spriteId points at the base), frame dims, family, kind, terrains.
    expect(copy.spriteId).toBe(base.id);
    expect(copy.family).toBe(base.family);
    expect(copy.kind).toBe(base.kind);
    expect(copy.terrains).toEqual(base.terrains);
    expect(copy.sprite.w).toBe(base.sprite.w);
    expect(copy.sprite.h).toBe(base.sprite.h);
    // Its seat (anchor + scale) and footprint are its own — may match the base or differ.
    expect(Number.isFinite(copy.sprite.scale)).toBe(true);
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
